"""列の値からリクエストを組み立てる（移植元 RequestSchemaFactory・FileProcessorService）。

列の index の意味（Waha! のロール）:
0=ユーザー、1=システム、2=アシスタント、3=ファイルパス（旧 RAG）、4=会話履歴Json、
5=コンテクスト（旧 RAG）、6=RAG Context JSONパス。
"""

import json
import logging
from collections.abc import Sequence
from pathlib import Path

from generative_ai_core.media.runtime import CoreMediaPreprocessingRuntime

from generative_ai_adapter.constants import ImageExplanationMode
from generative_ai_adapter.core_mappers import (
    AdapterCoreMediaPreprocessingMapper,
    ChatRuntimeFactory,
    to_file_data,
)
from generative_ai_adapter.domain import (
    AccessCredential,
    ChatGPTParameter,
    FileData,
    ImageExplanation,
    Message,
    ProxySetting,
    RagInputDeficiency,
    RagInputDeficiencyBuilder,
    RequestSchema,
    RetrievalContext,
)
from generative_ai_adapter.rag_prompt import rag_system_message
from generative_ai_adapter.waha import (
    SKIPPED_FILE_PATH,
    ColumnData,
    ColumnInformation,
    ColumnType,
)

logger = logging.getLogger(__name__)

INDEX_USER = 0
INDEX_SYSTEM = 1
INDEX_ASSISTANT = 2
INDEX_CONTEXT_PATH = 3
INDEX_HISTORY = 4
INDEX_CONTEXT = 5
MESSAGE_INDEXES = (INDEX_USER, INDEX_SYSTEM, INDEX_ASSISTANT)
WINDOWS_SKIPPED_SUFFIX = "\\null"
FILE_NOT_FOUND_MESSAGE = "ファイルが見つかりませんでした。"
FILE_READ_FAILED_MESSAGE = "ファイルの読み込みに失敗しました。"
UNEXPECTED_MESSAGE = "予期せぬ例外が発生しました。"


class FileProcessorService:
    """ファイルの前処理を core へ任せる（移植元 FileProcessorService）。"""

    def __init__(
        self,
        access_credential: AccessCredential,
        proxy_setting: ProxySetting,
        chat_runtime_factory: ChatRuntimeFactory | None = None,
        media_runtime: CoreMediaPreprocessingRuntime | None = None,
    ) -> None:
        """資格情報・プロキシ設定を受け取る。

        Parameters
        ----------
        access_credential : AccessCredential
            資格情報（画像説明のプロバイダ）。
        proxy_setting : ProxySetting
            プロキシ設定。
        chat_runtime_factory : ChatRuntimeFactory | None
            画像説明に使う core の chat を作る処理（テスト用）。
        media_runtime : CoreMediaPreprocessingRuntime | None
            core の前処理（テスト用）。
        """
        self._mapper = AdapterCoreMediaPreprocessingMapper(
            access_credential, proxy_setting, chat_runtime_factory
        )
        self._media_runtime = media_runtime or CoreMediaPreprocessingRuntime()

    def extract_content(
        self, file_path: str, image_explanation_mode: ImageExplanationMode
    ) -> FileData:
        """ファイルからテキスト・画像・画像説明を取り出す。

        Parameters
        ----------
        file_path : str
            ファイルのパス。
        image_explanation_mode : ImageExplanationMode
            画像説明モード。

        Returns
        -------
        FileData
            取り出した内容。

        Raises
        ------
        FileNotFoundError
            ファイルがないとき。
        RuntimeError
            core の前処理が失敗したとき。
        """
        if not Path(file_path).exists():
            logger.error("指定されたファイルが存在しません: %s", file_path)
            raise FileNotFoundError(f"指定されたファイルが存在しません: {file_path}")
        request = self._mapper.to_request(file_path, image_explanation_mode)
        return to_file_data(self._media_runtime.preprocess(request))


def _is_blank(value: str | None) -> bool:
    """None・空白だけかを返す。

    Parameters
    ----------
    value : str | None
        値。

    Returns
    -------
    bool
        None・空白だけなら True。
    """
    return value is None or not value.strip()


def _is_skipped_file_path(file_path: str | None) -> bool:
    """Waha! のファイルなしの印（空・`null`・`…\\null`）かを返す。

    Parameters
    ----------
    file_path : str | None
        FILE 列の値。

    Returns
    -------
    bool
        ファイルなしなら True。
    """
    return (
        _is_blank(file_path)
        or file_path == SKIPPED_FILE_PATH
        or (file_path is not None and file_path.endswith(WINDOWS_SKIPPED_SUFFIX))
    )


def _read_utf8(data: ColumnData | None) -> str:
    """FILE 列の値（パス）を読む。

    Parameters
    ----------
    data : ColumnData | None
        列の値。

    Returns
    -------
    str
        パス。値がなければ空文字列。
    """
    if data is None or data.b_ary is None:
        return ""
    return data.b_ary.decode("utf-8")


def _derive_file_name(path: str | None) -> str:
    """パスの最後の要素（`\\` と `/` の両方を区切りとみなす）。

    Parameters
    ----------
    path : str | None
        パス。

    Returns
    -------
    str
        ファイル名。区切りで終わる・空なら空文字列。
    """
    if _is_blank(path) or path is None:
        return ""
    trimmed = path.strip()
    last = max(trimmed.rfind("\\"), trimmed.rfind("/"))
    if last == len(trimmed) - 1:
        return ""
    return trimmed[last + 1 :]


def _is_context_filled(context: RetrievalContext) -> bool:
    """コンテキストの本文・パス・ファイル名がそろったかを返す。

    Parameters
    ----------
    context : RetrievalContext
        コンテキスト。

    Returns
    -------
    bool
        そろっていれば True。
    """
    return not (
        _is_blank(context.context)
        or _is_blank(context.path)
        or _is_blank(context.file_name)
    )


def read_history_json(file_path: str | None) -> list[Message] | None:
    """会話履歴 JSON（`[{"role", "content"}]`）を読む。

    Parameters
    ----------
    file_path : str | None
        履歴のファイルのパス。

    Returns
    -------
    list[Message] | None
        メッセージの一覧。パスがない・`null` で終わる・JSON が null なら None。

    Raises
    ------
    RuntimeError
        ファイルがない・読めない・形が違うとき（移植元の固定メッセージ）。
    """
    if file_path is None or file_path.endswith(SKIPPED_FILE_PATH):
        return None
    try:
        with Path(file_path).open(encoding="utf-8") as f:
            items = json.load(f)
    except FileNotFoundError as e:
        raise RuntimeError(FILE_NOT_FOUND_MESSAGE) from e
    except OSError as e:
        raise RuntimeError(FILE_READ_FAILED_MESSAGE) from e
    except ValueError as e:
        raise RuntimeError(UNEXPECTED_MESSAGE) from e
    if items is None:
        return None
    if not isinstance(items, list):
        # 移植元と同じく固定メッセージの RuntimeException にする
        raise RuntimeError(UNEXPECTED_MESSAGE)  # noqa: TRY004
    messages: list[Message] = []
    for item in items:
        # 移植元（Gson）は null の要素を null のメッセージにし、core へ渡すときに
        # 空の user のメッセージになる。役割も本文もないメッセージで同じ結果にする
        if item is None:
            messages.append(Message(None, None))
            continue
        if not isinstance(item, dict):
            # 移植元と同じく固定メッセージの RuntimeException にする
            raise RuntimeError(UNEXPECTED_MESSAGE)  # noqa: TRY004
        messages.append(
            Message(_json_text(item.get("role")), _json_text(item.get("content")))
        )
    return messages


def _json_text(value: object) -> str | None:
    """履歴の role・content を文字列にする（Gson と同じく数値・真偽値も文字列にする）。

    Parameters
    ----------
    value : object
        JSON の値。

    Returns
    -------
    str | None
        文字列。null なら None。

    Raises
    ------
    RuntimeError
        オブジェクト・配列のとき。
    """
    if value is None:
        return None
    if isinstance(value, (dict, list)):
        # 移植元と同じく固定メッセージの RuntimeException にする
        raise RuntimeError(UNEXPECTED_MESSAGE)  # noqa: TRY004
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


class RequestSchemaFactory:
    """列の値からリクエストを組み立てる（移植元 RequestSchemaFactory）。"""

    def __init__(
        self,
        access_credential: AccessCredential,
        proxy_setting: ProxySetting,
        image_explanation_mode: ImageExplanationMode,
        file_processor: FileProcessorService | None = None,
    ) -> None:
        """資格情報・プロキシ設定・画像説明モードを受け取る。

        Parameters
        ----------
        access_credential : AccessCredential
            資格情報。
        proxy_setting : ProxySetting
            プロキシ設定。
        image_explanation_mode : ImageExplanationMode
            画像説明モード（プロパティ 31）。
        file_processor : FileProcessorService | None
            ファイルの前処理（テスト用）。
        """
        self._image_explanation_mode = image_explanation_mode
        self._file_processor = file_processor or FileProcessorService(
            access_credential, proxy_setting
        )

    def create_request_schema(
        self,
        model: str | None,
        column_data: Sequence[ColumnData],
        column_information: Sequence[ColumnInformation],
        parameter: ChatGPTParameter,
    ) -> RequestSchema:
        """通常 chat のリクエストを組み立てる。

        Parameters
        ----------
        model : str | None
            モデル名。
        column_data : Sequence[ColumnData]
            1 レコードの列の値。
        column_information : Sequence[ColumnInformation]
            列の定義。
        parameter : ChatGPTParameter
            生成パラメータ。

        Returns
        -------
        RequestSchema
            メッセージと画像説明を入れたリクエスト。
        """
        schema = RequestSchema.with_parameter(model, parameter)
        self._process_column_data(schema, column_data, column_information)
        schema.set_chat_gpt_parameter(parameter)
        return schema

    def _extract(self, file_path: str) -> FileData:
        """ファイルを前処理する。失敗は移植元の固定メッセージの例外にする。

        Parameters
        ----------
        file_path : str
            ファイルのパス。

        Returns
        -------
        FileData
            取り出した内容。

        Raises
        ------
        RuntimeError
            ファイルがない・前処理が失敗したとき。
        """
        try:
            return self._file_processor.extract_content(
                file_path, self._image_explanation_mode
            )
        except FileNotFoundError as e:
            logger.exception("ファイルが見つかりませんでした。")
            raise RuntimeError(FILE_NOT_FOUND_MESSAGE) from e
        except OSError as e:
            logger.exception("ファイルの読み込みに失敗しました。")
            raise RuntimeError(FILE_READ_FAILED_MESSAGE) from e

    def _process_column_data(
        self,
        schema: RequestSchema,
        column_data: Sequence[ColumnData],
        column_information: Sequence[ColumnInformation],
    ) -> None:
        """列を順にメッセージにし、最後に会話履歴を先頭へ足す。

        - FILE の列（index 4 以外）: ファイルを前処理し、画像なら画像の添付、
          それ以外はテキストのメッセージにする。画像説明があれば説明のメッセージも足す
        - 文字の列（index 0・1・2）: そのままメッセージにする
        - index 4（会話履歴）: 読んだメッセージを先頭に置く

        Parameters
        ----------
        schema : RequestSchema
            組み立て中のリクエスト。
        column_data : Sequence[ColumnData]
            1 レコードの列の値。
        column_information : Sequence[ColumnInformation]
            列の定義。
        """
        messages: list[Message] = []
        image_explanations: list[ImageExplanation] = []
        for data, info in zip(column_data, column_information, strict=False):
            if info.col_type == ColumnType.FILE and info.index != INDEX_HISTORY:
                file_path = _read_utf8(data)
                logger.info("filePath: %s", file_path)
                if file_path == SKIPPED_FILE_PATH or file_path.endswith(
                    WINDOWS_SKIPPED_SUFFIX
                ):
                    logger.info("filePath is null")
                    continue
                file_data = self._extract(file_path)
                logger.info("fileData: %s", file_data.text)
                if file_data.image_resource is not None:
                    messages.append(
                        Message.of_index(
                            info.index,
                            "",
                            file_data.image_resource,
                            file_data.mime_type,
                        )
                    )
                else:
                    messages.append(Message.of_index(info.index, file_data.text))
                if file_data.image_explanations:
                    image_explanations.extend(file_data.image_explanations)
                    if self._image_explanation_mode != ImageExplanationMode.DISABLED:
                        for explanation in file_data.image_explanations:
                            text = (
                                f"画像説明 ({explanation.source_hint}): "
                                f"{explanation.caption}"
                            )
                            messages.append(Message.of_index(info.index, text))
            elif info.index in MESSAGE_INDEXES:
                messages.append(Message.of_index(info.index, data.s))
        for data, info in zip(column_data, column_information, strict=False):
            if info.col_type == ColumnType.FILE and info.index == INDEX_HISTORY:
                file_path = _read_utf8(data)
                logger.info("履歴ファイルのfilePath: %s", file_path)
                if file_path == SKIPPED_FILE_PATH or file_path.endswith(
                    WINDOWS_SKIPPED_SUFFIX
                ):
                    logger.info("履歴ファイルの無し")
                    continue
                history = read_history_json(file_path)
                if history is not None:
                    messages = [*history, *messages]
        schema.messages = messages
        schema.image_explanations = image_explanations

    def create_request_schema_with_context(
        self,
        model: str | None,
        column_data: Sequence[ColumnData],
        column_information: Sequence[ColumnInformation],
        parameter: ChatGPTParameter,
    ) -> RequestSchema:
        """旧 RAG（index 3・5）のリクエストを組み立てる。

        質問（index 0）・system（index 1）・コンテキストのパス（index 3）と本文
        （index 5）を読み、そろったコンテキストを順にためる。足りないものは
        `rag_input_deficiency` に入れる（例外にしない）。

        Parameters
        ----------
        model : str | None
            モデル名。
        column_data : Sequence[ColumnData]
            1 レコードの列の値。
        column_information : Sequence[ColumnInformation]
            列の定義。
        parameter : ChatGPTParameter
            生成パラメータ。

        Returns
        -------
        RequestSchema
            組み立てたリクエスト。
        """
        schema = RequestSchema.with_parameter(model, parameter)
        schema.set_chat_gpt_parameter(parameter)
        for data, info in zip(column_data, column_information, strict=False):
            if info.index == INDEX_HISTORY:
                schema.messages = read_history_json(_read_utf8(data))
        user_question: str | None = ""
        contexts: list[RetrievalContext] = []
        pending = RetrievalContext()
        for data, info in zip(column_data, column_information, strict=False):
            if info.index == INDEX_USER:
                if info.col_type == ColumnType.FILE:
                    question = self._read_question_file(_read_utf8(data))
                    if question is None:
                        continue
                    user_question = question
                else:
                    user_question = data.s
            elif info.index == INDEX_SYSTEM:
                schema.add_message(Message.of_index(INDEX_SYSTEM, data.s))
            elif info.index == INDEX_CONTEXT:
                if info.col_type == ColumnType.FILE:
                    file_path = _read_utf8(data)
                    logger.info("context filePath: %s", file_path)
                    if _is_skipped_file_path(file_path):
                        logger.info("context filePath is null")
                        continue
                    pending.context = self._extract(file_path).text
                else:
                    pending.context = data.s
            elif info.index == INDEX_CONTEXT_PATH:
                pending.path = data.s
                pending.file_name = _derive_file_name(data.s)
            if _is_context_filled(pending):
                contexts.append(pending)
                pending = RetrievalContext()
        schema.add_message(rag_system_message())
        schema.retrieval_contexts = contexts
        schema.user_question = user_question
        schema.rag_input_deficiency = _input_deficiency(
            user_question, contexts, pending
        )
        return schema

    def _read_question_file(self, file_path: str) -> str | None:
        """質問のファイルを読み、画像説明があれば質問の後ろに足す。

        Parameters
        ----------
        file_path : str
            質問のファイルのパス。

        Returns
        -------
        str | None
            質問。ファイルなしの印なら None。
        """
        logger.info("filePath: %s", file_path)
        if _is_skipped_file_path(file_path):
            logger.info("filePath is null")
            return None
        file_data = self._extract(file_path)
        logger.info("fileData: %s", file_data.text)
        question = file_data.text
        if (
            self._image_explanation_mode != ImageExplanationMode.DISABLED
            and file_data.image_explanations
        ):
            lines = [question or ""]
            lines.extend(
                f"\n画像説明 ({e.source_hint}): {e.caption}"
                for e in file_data.image_explanations
            )
            question = "".join(lines)
        return question


def _input_deficiency(
    user_question: str | None,
    contexts: list[RetrievalContext],
    pending: RetrievalContext,
) -> RagInputDeficiency | None:
    """旧 RAG の入力不足を調べる。

    Parameters
    ----------
    user_question : str | None
        質問。
    contexts : list[RetrievalContext]
        そろったコンテキスト。
    pending : RetrievalContext
        そろわなかった最後のコンテキスト。

    Returns
    -------
    RagInputDeficiency | None
        入力不足。足りていれば None。
    """
    builder = RagInputDeficiencyBuilder()
    if _is_blank(user_question):
        builder.missing_user_question()
    if not contexts:
        if _is_blank(pending.context):
            builder.missing_context_body()
        if _is_blank(pending.path):
            builder.missing_context_path()
        elif _is_blank(pending.file_name):
            builder.missing_context_file_name()
    return builder.build_or_none()
