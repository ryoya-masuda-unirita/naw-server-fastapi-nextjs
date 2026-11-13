"""埋め込みの実行（移植元 EmbeddingController）。

入力ファイルを core のファイル前処理でテキストにし、分割文字数ごとに区切って、
ベクトルDB に追加（出力モード 1・3）し、結果を TSV で出力ファイルに追記する。
削除（出力モード 2）はファイル ID でベクトルDB から消す。
"""

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import TextIO

from generative_ai_core.media import (
    CoreMediaPreprocessingMode,
    CoreMediaPreprocessingRequest,
    CoreMediaPreprocessingRuntime,
)
from generative_ai_core.provider.factory import CoreProviderRuntimeFactory

from embedding_adapter.audit import RejectAuditTsvSession
from embedding_adapter.constants import OUTPUT_TYPE_VDB_ADD, OUTPUT_TYPE_VDB_NEW
from embedding_adapter.domain import (
    Embedding,
    EmbeddingNetworkProperties,
    EmbeddingProviderProperties,
    GraphChunkWriteRequest,
    VectorDBConfig,
)
from embedding_adapter.model import (
    AbstractEmbeddingModel,
    AbstractVectorStoreService,
    GraphWritableVectorStoreService,
)
from embedding_adapter.output import JobOutputRunContext
from embedding_adapter.service.core.configuration import (
    EmbeddingCoreConfigurationMapper,
)
from embedding_adapter.service.core.vector_store import (
    CoreDelegatingVectorStoreService,
)
from embedding_adapter.service.embedding import EmbeddingSelectorService
from embedding_adapter.service.vector_db_selector import VectorDBSelectorService
from embedding_adapter.util import create_unique_id

logger = logging.getLogger(__name__)

# 例外メッセージの長さの上限（移植元 makeExceptionMessage）
MAX_EXCEPTION_MESSAGE_LENGTH = 512
LINE_SEPARATOR = "\n"
EMPTY_FILE_PATH_MESSAGE = "ファイルパスが取得できませんでした。"
FILE_NOT_FOUND_MESSAGE = "ファイルが存在しません: "
FILE_UNIQUE_ID_BLANK_MESSAGE = "fileUniqueId must not be blank"


@dataclass
class _ChunkState:
    """チャンクを順に書くときの途中の状態。

    Attributes
    ----------
    response : str
        直前に書いたチャンクのベクトルDB の行 ID。
    chunk_sequence : int
        Graph に書いたチャンクの連番。
    previous_vector_row_id : str | None
        Graph に書いた直前のチャンクの行 ID。
    """

    response: str = ""
    chunk_sequence: int = 0
    previous_vector_row_id: str | None = None


def java_split_lines(text: str) -> list[str]:
    """Java の `String.split("\\n")` と同じ規則で行に分ける。

    区切りが 1 つもなければ元の文字列 1 つ、あれば末尾の空要素を捨てる。

    Parameters
    ----------
    text : str
        分ける文字列。

    Returns
    -------
    list[str]
        行の一覧。
    """
    if LINE_SEPARATOR not in text:
        return [text]
    parts = text.split(LINE_SEPARATOR)
    while parts and parts[-1] == "":
        parts.pop()
    return parts


class EmbeddingController:
    """埋め込みモデル・ベクトルDB・ファイル前処理をまとめて動かす。"""

    def __init__(
        self,
        base_url: str,
        proxy_setting: EmbeddingNetworkProperties,
        access_credential: EmbeddingProviderProperties,
        vector_db_config: VectorDBConfig,
        image_explanation_mode: CoreMediaPreprocessingMode,
        graph_candidate_embedding_provider_properties: (
            EmbeddingProviderProperties | None
        ) = None,
        reject_audit_output_dir: str | None = None,
        *,
        embedding_model: AbstractEmbeddingModel | None = None,
        vector_db_model: AbstractVectorStoreService | None = None,
        media_runtime: CoreMediaPreprocessingRuntime | None = None,
    ) -> None:
        """埋め込みモデルとベクトルストアを作る。

        Parameters
        ----------
        base_url : str
            移植元でも使われない引数（空文字）。
        proxy_setting : EmbeddingNetworkProperties
            プロキシ・SSL の設定。
        access_credential : EmbeddingProviderProperties
            埋め込みの接続設定。
        vector_db_config : VectorDBConfig
            ベクトルDB の設定。
        image_explanation_mode : CoreMediaPreprocessingMode
            画像説明のモード。
        graph_candidate_embedding_provider_properties : EmbeddingProviderProperties | None
            Graph candidate の LLM の接続設定。Graph 書き込みが無効なら None。
        reject_audit_output_dir : str | None
            Graph Candidate の拒否の監査 TSV の出力先。
        embedding_model : AbstractEmbeddingModel | None
            埋め込みモデル（テストで差し替える）。None なら設定から作る。
        vector_db_model : AbstractVectorStoreService | None
            ベクトルストア（テストで差し替える）。None なら設定から作る。
        media_runtime : CoreMediaPreprocessingRuntime | None
            ファイル前処理（テストで差し替える）。

        Raises
        ------
        RuntimeError
            モデルやストアの作成に失敗したとき。
        """
        self._media_runtime = media_runtime or CoreMediaPreprocessingRuntime()
        self._job_output_run_context = JobOutputRunContext.disabled()
        try:
            self.access_credential = access_credential
            self._network_input = proxy_setting
            self.embedding_model = embedding_model or (
                EmbeddingSelectorService.create_embedding_model(
                    proxy_setting, access_credential
                )
            )
            self.vector_db_model = vector_db_model or (
                VectorDBSelectorService.create_vector_db_model(
                    proxy_setting,
                    self.embedding_model,
                    vector_db_config,
                    graph_candidate_embedding_provider_properties,
                    reject_audit_output_dir,
                )
            )
            if isinstance(self.vector_db_model, CoreDelegatingVectorStoreService):
                self.vector_db_model.use_tenant_id_if_unset(access_credential.tenant_id)
            self._image_explanation_mode = image_explanation_mode
        except Exception as e:
            raise RuntimeError(self._make_exception_message(e)) from e

    def test_connect(self) -> bool:
        """テスト接続（移植元は何もせず true を返す）。

        Returns
        -------
        bool
            常に True。
        """
        return True

    def execute_embedding(
        self,
        split_length: int,
        input_file_path: str,
        output_path: str,
        output_type: int,
        id: str | None,
    ) -> None:
        """入力ファイルを分割し、出力モードに応じてベクトルDB へ追加して TSV に追記する。

        Parameters
        ----------
        split_length : int
            分割文字数。
        input_file_path : str
            入力ファイルパス。
        output_path : str
            TSV の出力先（追記）。
        output_type : int
            出力モード（0=テキスト出力、1=VDB追加登録、3=VDB新規登録）。
        id : str | None
            ベクトルDB の行 ID の元（空なら採番する）。

        Raises
        ------
        RuntimeError
            ファイルパスが空・ファイルがない・前処理やベクトルDB の書き込みに失敗したとき。
        """
        if input_file_path == "":
            raise RuntimeError(EMPTY_FILE_PATH_MESSAGE)
        try:
            self._execute_embedding(
                split_length, input_file_path, output_path, output_type, id
            )
        except Exception as e:
            raise RuntimeError(self._make_exception_message(e)) from e

    def _execute_embedding(
        self,
        split_length: int,
        input_file_path: str,
        output_path: str,
        output_type: int,
        id: str | None,
    ) -> None:
        """`execute_embedding` の本体（例外の包みは呼び出し側）。

        Parameters
        ----------
        split_length : int
            分割文字数。
        input_file_path : str
            入力ファイルパス。
        output_path : str
            TSV の出力先。
        output_type : int
            出力モード。
        id : str | None
            ベクトルDB の行 ID の元。

        Raises
        ------
        RuntimeError
            ファイルがない・前処理が失敗したとき。
        """
        path = Path(input_file_path)
        if not path.exists():
            raise RuntimeError(FILE_NOT_FOUND_MESSAGE + input_file_path)

        file_unique_id = create_unique_id()
        media_text = self._preprocess(path)
        lines = java_split_lines(media_text)
        header = f'"{path}"\t"'
        state = _ChunkState()
        buffer_success_tsv = self._should_buffer_success_tsv(output_type)
        buffered: list[str] = []
        to_vdb = output_type in (OUTPUT_TYPE_VDB_ADD, OUTPUT_TYPE_VDB_NEW)

        with open(output_path, "a", encoding="utf-8", newline="") as writer:

            def write_chunk(sentence: str, message: str) -> None:
                """1 チャンクをベクトルDB（と Graph）に書き、成功 TSV に出す。

                本文が空のチャンクは書かない（移植元は先頭の行が分割文字数より長いと
                空のチャンクを作り、埋め込み API やグラフ書き込みが失敗する）。

                Parameters
                ----------
                sentence : str
                    チャンクの本文。
                message : str
                    ログに出す説明。
                """
                if sentence == "":
                    return
                if to_vdb:
                    state.response = self.import_embedding(
                        sentence, id, file_unique_id, input_file_path
                    )
                    if self._write_graph_chunk_if_needed(
                        output_type,
                        file_unique_id,
                        str(path),
                        state.response,
                        state.chunk_sequence,
                        sentence,
                        state.previous_vector_row_id,
                    ):
                        state.previous_vector_row_id = state.response
                        state.chunk_sequence += 1
                line = _success_line(header, sentence, state.response, file_unique_id)
                if buffer_success_tsv:
                    buffered.append(line)
                else:
                    writer.write(line + "\n")
                logger.info("%s: %s", message, sentence)

            sentence = ""
            for str_line in lines:
                if len(sentence + str_line) > split_length:
                    write_chunk(sentence, "分割された文を出力しました")
                    sentence = ""
                sentence += str_line + "\n"
            write_chunk(sentence, "最後の文を出力しました")
            self._flush_buffered_success_tsv(
                buffer_success_tsv, buffered, writer, input_file_path
            )

    def _preprocess(self, path: Path) -> str:
        """core のファイル前処理で入力ファイルをテキストにする。

        Parameters
        ----------
        path : Path
            入力ファイル。

        Returns
        -------
        str
            前処理後のテキスト。

        Raises
        ------
        RuntimeError
            前処理が失敗したとき。
        """
        provider_id = "OpenAI"
        network_setting = None
        runtime = None
        if self._image_explanation_mode != CoreMediaPreprocessingMode.DISABLED:
            configuration = EmbeddingCoreConfigurationMapper().map(
                self.access_credential, self._network_input
            )
            provider_id = configuration.provider_id.canonical_name
            network_setting = configuration.network_setting
            runtime = CoreProviderRuntimeFactory.create_chat_runtime(configuration)
        kwargs: dict[str, object] = {
            "file_path": path,
            "mode": self._image_explanation_mode,
            "provider_id": provider_id,
        }
        if network_setting is not None:
            kwargs["network_setting"] = network_setting
        if runtime is not None:
            kwargs["image_explanation_runtime"] = runtime
        request = CoreMediaPreprocessingRequest(**kwargs)  # type: ignore[arg-type]
        media = self._media_runtime.preprocess(request)
        if media.failure is not None:
            raise RuntimeError(
                f"Core media preprocessing failed [{media.failure.code}]: "
                f"{media.failure.summary}"
            )
        return media.text

    def request_embedding_api(self, input_str: str) -> list[float]:
        """埋め込みモデルでベクトルを作る。

        Parameters
        ----------
        input_str : str
            入力文字列。

        Returns
        -------
        list[float]
            ベクトル。
        """
        return self.embedding_model.create_embedding(input_str)

    def import_embedding(
        self,
        meta_string: str,
        id: str | None,
        file_unique_id: str,
        source_file_path: str,
    ) -> str:
        """1 チャンクをベクトルDB に追加する。

        Parameters
        ----------
        meta_string : str
            チャンクの本文。
        id : str | None
            行 ID の元。
        file_unique_id : str
            ファイルごとの一意な ID。
        source_file_path : str
            取り込み元のファイルパス。

        Returns
        -------
        str
            ベクトルDB の行 ID（取り込みで止められたときは空文字）。

        Raises
        ------
        RuntimeError
            ベクトルDB への追加が失敗したとき。
        """
        try:
            embedding = Embedding(
                id=id,
                content=meta_string,
                vector=None,
                file_unique_id=file_unique_id,
            )
            embedding.source_file_path = source_file_path
            return self.vector_db_model.add(embedding)
        except Exception as e:
            raise RuntimeError(self._make_exception_message(e)) from e

    def _write_graph_chunk_if_needed(
        self,
        output_type: int,
        file_unique_id: str,
        file_path: str,
        vector_row_id: str,
        chunk_sequence: int,
        content: str,
        previous_vector_row_id: str | None,
    ) -> bool:
        """Graph 書き込みが有効なら 1 チャンクをグラフに書く。

        Parameters
        ----------
        output_type : int
            出力モード。
        file_unique_id : str
            ファイルごとの一意な ID。
        file_path : str
            入力ファイルパス。
        vector_row_id : str
            ベクトルDB の行 ID。
        chunk_sequence : int
            チャンクの連番。
        content : str
            チャンクの本文。
        previous_vector_row_id : str | None
            直前のチャンクの行 ID。

        Returns
        -------
        bool
            グラフに書いたら True。

        Raises
        ------
        RuntimeError
            グラフ書き込みが失敗したとき。
        """
        store = self.vector_db_model
        if (
            output_type not in (OUTPUT_TYPE_VDB_ADD, OUTPUT_TYPE_VDB_NEW)
            or not isinstance(store, GraphWritableVectorStoreService)
            or not _has_text(vector_row_id)
            or not _has_text(content)
        ):
            return False
        request = GraphChunkWriteRequest(
            file_unique_id,
            file_path,
            vector_row_id,
            chunk_sequence,
            content,
            previous_vector_row_id,
        )
        result = store.write_graph_chunk(request)
        if result.is_failed():
            raise RuntimeError(result.message)
        return True

    def wire_reject_audit_session(self, session: RejectAuditTsvSession) -> None:
        """拒否の監査セッションをベクトルストアへ渡す。

        Parameters
        ----------
        session : RejectAuditTsvSession
            監査セッション。
        """
        if isinstance(self.vector_db_model, CoreDelegatingVectorStoreService):
            self.vector_db_model.set_reject_audit_session(session)

    def wire_job_output_context(self, context: JobOutputRunContext | None) -> None:
        """ジョブ出力の実行コンテキストを設定し、ベクトルストアへ渡す。

        Parameters
        ----------
        context : JobOutputRunContext | None
            実行コンテキスト。None なら無効。
        """
        self._job_output_run_context = (
            context if context is not None else JobOutputRunContext.disabled()
        )
        if isinstance(self.vector_db_model, CoreDelegatingVectorStoreService):
            self.vector_db_model.set_job_output_run_context(
                self._job_output_run_context
            )

    def _should_buffer_success_tsv(self, output_type: int) -> bool:
        """成功 TSV を最後まで溜めるか判定する（Graph Candidate のジョブ出力が有効なとき）。

        Parameters
        ----------
        output_type : int
            出力モード。

        Returns
        -------
        bool
            溜めるなら True。
        """
        return self._job_output_run_context.is_enabled() and output_type in (
            OUTPUT_TYPE_VDB_ADD,
            OUTPUT_TYPE_VDB_NEW,
        )

    def _flush_buffered_success_tsv(
        self,
        buffer_success_tsv: bool,
        buffered: list[str],
        writer: TextIO,
        input_file_path: str,
    ) -> None:
        """溜めた成功 TSV を出力する。拒否されたファイルは出力しない。

        Parameters
        ----------
        buffer_success_tsv : bool
            溜めていたか。
        buffered : list[str]
            溜めた行。
        writer : TextIO
            出力先。
        input_file_path : str
            入力ファイルパス。
        """
        if not buffer_success_tsv or self._job_output_run_context.is_rejected(
            input_file_path
        ):
            return
        writer.writelines(line + "\n" for line in buffered)

    @staticmethod
    def _make_exception_message(e: BaseException) -> str:
        """例外のメッセージを 512 文字までにする（移植元 makeExceptionMessage）。

        Parameters
        ----------
        e : BaseException
            例外。

        Returns
        -------
        str
            メッセージ。
        """
        log = str(e)
        return log[:MAX_EXCEPTION_MESSAGE_LENGTH]

    def delete_embedding(self, id: str | None) -> None:
        """ファイル ID に紐づくベクトルを削除する。

        Parameters
        ----------
        id : str | None
            ファイル ID（取り込み時の fileUniqueId）。

        Raises
        ------
        RuntimeError
            ID が空・削除に失敗したとき。
        """
        if id is None or id.strip() == "":
            raise RuntimeError(FILE_UNIQUE_ID_BLANK_MESSAGE)
        try:
            self.vector_db_model.delete(id.strip())
        except Exception as e:
            raise RuntimeError(self._make_exception_message(e)) from e


def _success_line(
    header: str, sentence: str, response: str, file_unique_id: str
) -> str:
    """成功 TSV の 1 行を作る（本文の二重引用符は一重引用符に置き換える）。

    Parameters
    ----------
    header : str
        `"入力ファイルパス"<TAB>"` までの先頭部分。
    sentence : str
        チャンクの本文。
    response : str
        ベクトルDB の行 ID。
    file_unique_id : str
        ファイルごとの一意な ID。

    Returns
    -------
    str
        TSV の 1 行（改行なし）。
    """
    text = sentence.replace('"', "'")
    return f'{header}{text}"\t"{response}"\t"{file_unique_id}"'


def _has_text(value: str | None) -> bool:
    """空白以外の文字があるか。

    Parameters
    ----------
    value : str | None
        文字列。

    Returns
    -------
    bool
        あれば True。
    """
    return value is not None and value.strip() != ""
