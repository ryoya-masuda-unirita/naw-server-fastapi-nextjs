"""埋め込みアダプタ（embedding-adapter の App）を動かすワークフロー。

server-local の学習・削除・同期の 3 つの呼び出しを、サービス ID の `operation` で受ける。
本物の Waha! の定義はどちらのリポジトリにもないため、server-local が読む出力の形から
決めている（docs/issue-300/03_詳細設計.md）。

| operation | server-local の呼び出し | アダプタの出力モード | outputfile（TSV） |
|---|---|---|---|
| learn | `file` に学習するファイル（なければ `filepath` のパス）+ `splitLength` | 1（追加登録）または 3（新規登録） | `ファイル ID<TAB>パート ID`（チャンクごと） |
| delete | `file` にパート ID を 1 行ずつ書いたテキスト | 2（削除） | 空 |
| sync | `start`・`end` | なし（ベクトルDB の行を読むだけ） | `パス<TAB>パート ID<TAB>ファイル ID` |

アダプタは同期処理（移植元と同じ）のため、別スレッドで動かす。
"""

import asyncio
import logging
import re
import tempfile
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path, PurePath
from typing import Any

from embedding_adapter.app import App
from embedding_adapter.constants import (
    OUTPUT_TYPE_VDB_DELETE,
    PropertyIds,
)
from embedding_adapter.domain import VectorDBConfig
from embedding_adapter.service.core.jdbc_persistence import open_connection
from embedding_adapter.waha import ColumnData
from generative_ai_core.graphrag.bootstrap import (
    GraphRagRuntimeBootstrapRequest,
    GraphRagRuntimeBootstrapService,
    GraphRagRuntimeTargetDescriptor,
)

from waha_emulator.sessions import SLOT_FILE, SlotFile
from waha_emulator.workflow_config import (
    OPERATION_DELETE,
    OPERATION_LEARN,
    OPERATION_SYNC,
    WorkflowDefinition,
)
from waha_emulator.workflows.base import WorkflowError, WorkflowRequest

logger = logging.getLogger(__name__)

SPLIT_LENGTH_PARAM = "splitLength"
FILE_PATH_PARAM = "filepath"
START_PARAM = "start"
END_PARAM = "end"
OUTPUT_VIEW_NAME = "result.tsv"
JOB_DIR_PREFIX = "waha-embedding-job-"
UPLOAD_FALLBACK_FILENAME = "upload"
TABLE_NAME_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$")
ADAPTER_FAILED_PREFIX = "埋め込みアダプタの実行に失敗しました"
FILE_MISSING_MESSAGE = (
    "学習するファイルがありません（file スロットも filepath もありません）"
)
FILE_NOT_ALLOWED_MESSAGE = (
    "filepath が許可されたディレクトリの外、またはファイルではありません: "
)
SOURCE_DIR_NOT_SET_MESSAGE = (
    "filepath による学習は SOURCE_ALLOWED_DIR が設定されているときだけ使えます"
)
NO_ROWS_MESSAGE = (
    "ベクトルDB に登録された行がありません（取り込みが拒否された可能性があります）"
)
IDS_MISSING_MESSAGE = "削除するパート ID（file スロット）がありません"
VDB_NOT_POSTGRESQL_MESSAGE = (
    "削除・同期は PostgreSQL(PGVector) のときだけ対応しています"
)
DEFAULT_SYNC_LIMIT = 100
# server-local は結果 TSV を CRLF で行に分ける（移植元が Windows 上の Waha! の出力を読むため）
OUTPUT_LINE_SEPARATOR = "\r\n"


@dataclass(frozen=True)
class RawChunk:
    """アダプタが書いた TSV の 1 行（パス・本文・パート ID・ファイル ID）。

    Attributes
    ----------
    path : str
        入力ファイルのパス。
    part_id : str
        ベクトルDB の行 ID。
    file_id : str
        ファイル ID（アダプタが採番した fileUniqueId）。
    """

    path: str
    part_id: str
    file_id: str


_ANY_PATH = r'[^"\t]*'


def parse_adapter_tsv(text: str, source_path: str | None = None) -> list[RawChunk]:
    """アダプタの出力 TSV（本文に改行を含む）を行に分ける。

    Parameters
    ----------
    text : str
        アダプタが書いた TSV。
    source_path : str | None
        アダプタに渡した入力ファイルのパス。指定すると、行の先頭をこのパスで固定する
        （アダプタはパスをエスケープせずに書くため、`"` やタブを含むパスでも読める）。

    Returns
    -------
    list[RawChunk]
        パート ID が空でないチャンク（取り込まれなかった行は除く）。
    """
    path_pattern = re.escape(source_path) if source_path is not None else _ANY_PATH
    record = re.compile(
        rf'"({path_pattern})"\t"(.*?)"\t"([^"\t]*)"\t"([^"\t]*)"\n', re.DOTALL
    )
    chunks = []
    for match in record.finditer(text):
        path, _body, part_id, file_id = match.groups()
        if part_id:
            chunks.append(RawChunk(path, part_id, file_id))
    return chunks


def learn_output(chunks: list[RawChunk]) -> str:
    """server-local の学習結果 TSV（ファイル ID・パート ID）にする。

    Parameters
    ----------
    chunks : list[RawChunk]
        取り込まれたチャンク。

    Returns
    -------
    str
        `"ファイル ID"<TAB>"パート ID"` を 1 行ずつ並べたもの。
    """
    return "".join(
        f'"{c.file_id}"\t"{c.part_id}"{OUTPUT_LINE_SEPARATOR}' for c in chunks
    )


def _safe_filename(filename: str) -> str:
    """アップロードされたファイル名から、ジョブのディレクトリに置く名前を作る。

    Parameters
    ----------
    filename : str
        アップロード時のファイル名。

    Returns
    -------
    str
        ディレクトリの区切りを含まない名前。
    """
    name = PurePath(filename.replace("\\", "/")).name
    return name if name not in ("", ".", "..") else UPLOAD_FALLBACK_FILENAME


def _logical_path(reference: str, filename: str) -> str:
    """アップロードされたファイルの論理的なパス（`参照元/ファイル名`）を作る。

    Parameters
    ----------
    reference : str
        execute の filepath（server-local の参照元）。空なら参照元なし。
    filename : str
        アップロード時のファイル名。

    Returns
    -------
    str
        パス。参照元がなければファイル名だけ。
    """
    name = _safe_filename(filename)
    base = reference.strip().rstrip("/")
    return f"{base}/{name}" if base else name


def _quote_table(config: VectorDBConfig) -> str:
    """テーブル名を SQL に埋め込めるか確かめて返す。

    Parameters
    ----------
    config : VectorDBConfig
        ベクトルDB の設定。

    Returns
    -------
    str
        テーブル名。

    Raises
    ------
    WorkflowError
        PostgreSQL でない・テーブル名が識別子として不正なとき。
    """
    if not config.is_postgre_sql_provider():
        raise WorkflowError(VDB_NOT_POSTGRESQL_MESSAGE)
    table = (config.table_name or "").strip()
    if not TABLE_NAME_PATTERN.match(table):
        raise WorkflowError(f"VDB_TABLE_NAME が不正です: {table}")
    return table


class EmbeddingWorkflow:
    """埋め込みアダプタで学習・削除・同期を行うワークフロー。"""

    def __init__(
        self,
        definition: WorkflowDefinition,
        source_allowed_dir: Path | None = None,
        connection_opener: Callable[[VectorDBConfig], Any] = open_connection,
    ) -> None:
        """定義を受け取る。

        Parameters
        ----------
        definition : WorkflowDefinition
            サービスの定義（adapter=embedding）。
        source_allowed_dir : Path | None
            `filepath` で渡されたパスを読んでよいディレクトリ（SOURCE_ALLOWED_DIR）。
        connection_opener : Callable[[VectorDBConfig], Any]
            PostgreSQL への接続を開く関数（テストで差し替える）。
        """
        self.definition = definition
        self._source_allowed_dir = source_allowed_dir
        self._open_connection = connection_opener

    async def run(self, request: WorkflowRequest) -> str:
        """operation に応じてアダプタを別スレッドで動かし、outputfile の中身を返す。

        Parameters
        ----------
        request : WorkflowRequest
            入力。

        Returns
        -------
        str
            outputfile の中身。
        """
        return await asyncio.to_thread(self._run_sync, request)

    def _run_sync(self, request: WorkflowRequest) -> str:
        """operation ごとの処理を呼ぶ。

        Parameters
        ----------
        request : WorkflowRequest
            入力。

        Returns
        -------
        str
            outputfile の中身。

        Raises
        ------
        WorkflowError
            入力が不正・アダプタが失敗したとき。
        """
        logger.info(
            "workflow embedding: serviceId=%s, operation=%s, %s, params=%s",
            request.service_id,
            self.definition.operation,
            self.definition.describe(),
            sorted(request.params),
        )
        if self.definition.operation == OPERATION_LEARN:
            return self._learn(request)
        if self.definition.operation == OPERATION_DELETE:
            return self._delete(request)
        if self.definition.operation == OPERATION_SYNC:
            return self._sync(request)
        raise WorkflowError(f"未知の operation です: {self.definition.operation}")

    # ---- アダプタの呼び出し ----

    def _new_app(self, job_dir: Path, output_type: int) -> App:
        """プロパティを渡して接続した App を作る（Waha! のジョブと同じ順序）。

        Parameters
        ----------
        job_dir : Path
            ジョブのディレクトリ（アダプタの出力先）。
        output_type : int
            アダプタの出力モード。

        Returns
        -------
        App
            `connect` まで済ませたアダプタ。
        """
        app = App()
        for prop_id, value in self.definition.properties.items():
            app.set_property(prop_id, value)
        app.set_property(PropertyIds.OUTPUT_DIR, str(job_dir))
        app.connect(output_type)
        return app

    def _write_records(
        self, app: App, records: list[list[ColumnData]], request: WorkflowRequest
    ) -> None:
        """列の定義と実行前の準備を済ませ、レコードを 1 つずつ書く。

        Parameters
        ----------
        app : App
            アダプタ。
        records : list[list[ColumnData]]
            列の値（ID・入力ファイル・分割文字数の順）。
        request : WorkflowRequest
            入力（ログ用）。

        Raises
        ------
        WorkflowError
            アダプタが失敗したとき。
        """
        try:
            app.set_column_information(app.get_column_information(OUTPUT_VIEW_NAME))
            app.set_view_name(OUTPUT_VIEW_NAME)
            app.before_execute()
            for record in records:
                app.write(record)
            app.after_execute()
        except Exception as e:
            logger.warning(
                "embedding adapter failed: serviceId=%s, error=%s",
                request.service_id,
                type(e).__name__,
            )
            raise WorkflowError(f"{ADAPTER_FAILED_PREFIX}: {e}") from e

    # ---- learn ----

    def _learn(self, request: WorkflowRequest) -> str:
        """ファイルを分割してベクトルDB に登録し、ファイル ID とパート ID の TSV を返す。

        Parameters
        ----------
        request : WorkflowRequest
            入力。

        Returns
        -------
        str
            `"ファイル ID"<TAB>"パート ID"` の TSV。

        Raises
        ------
        WorkflowError
            ファイルがない・splitLength が不正・登録された行がないとき。
        """
        split_length = self._split_length(request)
        with tempfile.TemporaryDirectory(prefix=JOB_DIR_PREFIX) as directory:
            job_dir = Path(directory)
            source = self._source_file(request, job_dir)
            app = self._new_app(job_dir, self.definition.output_type)
            output = job_dir / OUTPUT_VIEW_NAME
            try:
                self._write_records(
                    app,
                    [
                        [
                            ColumnData.char(""),
                            ColumnData.file(str(source)),
                            ColumnData.char(str(split_length)),
                        ]
                    ],
                    request,
                )
            except WorkflowError:
                # 途中まで登録された行を残すと、再試行のたびに重複する
                partial = output.read_text(encoding="utf-8") if output.exists() else ""
                self._remove_partial_rows(
                    {c.file_id for c in parse_adapter_tsv(partial, str(source))},
                    request,
                )
                raise
            text = output.read_text(encoding="utf-8") if output.exists() else ""
        chunks = parse_adapter_tsv(text, str(source))
        if not chunks:
            raise WorkflowError(NO_ROWS_MESSAGE)
        upload = request.inputs.get(SLOT_FILE)
        if upload is not None:
            self._relabel_source_path(
                {c.file_id for c in chunks},
                _logical_path(request.params.get(FILE_PATH_PARAM, ""), upload.filename),
            )
        logger.info(
            "learn finished: serviceId=%s, fileIds=%d, parts=%d",
            request.service_id,
            len({c.file_id for c in chunks}),
            len(chunks),
        )
        return learn_output(chunks)

    def _relabel_source_path(self, file_ids: set[str], logical_path: str) -> None:
        """アップロードされたファイルの行のパスを、一時ディレクトリから論理的なパスに直す。

        アダプタは読んだファイルのパスをそのままベクトルDB に書くため、アップロードの
        場合は一時ディレクトリのパスが入ってしまう。同期（server-local がパスから
        ファイル名と参照元を求める）で意味のある値になるよう、`参照元/ファイル名` に直す。

        Parameters
        ----------
        file_ids : set[str]
            直すファイル ID。
        logical_path : str
            書き込むパス。

        パスは見た目の情報で、`filepath` 列がない既存テーブルなどでは更新できない。
        学習した行はすでに登録済みのため、更新に失敗しても学習は成功のままにする。
        """
        config = self._vector_db_config()
        if not config.is_postgre_sql_provider():
            return
        try:
            table = _quote_table(config)
            connection = self._open_connection(config)
            try:
                connection.execute(
                    f"UPDATE {table} SET filepath = %s WHERE fileid = ANY(%s)",
                    (logical_path, sorted(file_ids)),
                )
            finally:
                connection.close()
        except Exception as e:  # noqa: BLE001 - 見た目の補正なので何が起きても学習は成功にする
            logger.warning("failed to relabel source path: %s", type(e).__name__)

    def _split_length(self, request: WorkflowRequest) -> int:
        """execute の splitLength（空なら定義の既定）を数値にする。

        Parameters
        ----------
        request : WorkflowRequest
            入力。

        Returns
        -------
        int
            分割文字数。

        Raises
        ------
        WorkflowError
            数値でない・0 以下のとき。
        """
        raw = request.params.get(SPLIT_LENGTH_PARAM, "").strip()
        if not raw:
            return self.definition.default_split_length
        try:
            value = int(raw)
        except ValueError as e:
            raise WorkflowError(f"splitLength が数値ではありません: {raw}") from e
        if value <= 0:
            raise WorkflowError(f"splitLength は 1 以上にしてください: {raw}")
        return value

    def _source_file(self, request: WorkflowRequest, job_dir: Path) -> Path:
        """学習するファイルを決める（file スロット、なければ filepath のパス）。

        Parameters
        ----------
        request : WorkflowRequest
            入力。
        job_dir : Path
            ジョブのディレクトリ（アップロードされたファイルを置く）。

        Returns
        -------
        Path
            アダプタに渡すファイルのパス。

        Raises
        ------
        WorkflowError
            ファイルがない・filepath が許可の外のとき。
        """
        upload: SlotFile | None = request.inputs.get(SLOT_FILE)
        if upload is not None:
            path = job_dir / _safe_filename(upload.filename)
            path.write_bytes(upload.data)
            return path
        raw = request.params.get(FILE_PATH_PARAM, "").strip()
        if not raw:
            raise WorkflowError(FILE_MISSING_MESSAGE)
        if self._source_allowed_dir is None:
            raise WorkflowError(SOURCE_DIR_NOT_SET_MESSAGE)
        resolved = Path(raw).resolve()
        if not resolved.is_relative_to(self._source_allowed_dir.resolve()) or (
            not resolved.is_file()
        ):
            raise WorkflowError(f"{FILE_NOT_ALLOWED_MESSAGE}{raw}")
        return resolved

    # ---- delete ----

    def _vector_db_config(self) -> VectorDBConfig:
        """定義のプロパティから、ベクトルDB の設定を作る。

        Returns
        -------
        VectorDBConfig
            ベクトルDB の設定。
        """
        app = App()
        for prop_id, value in self.definition.properties.items():
            app.set_property(prop_id, value)
        return app.vector_db_config

    def _delete(self, request: WorkflowRequest) -> str:
        """パート ID に対応するファイルを、アダプタ（出力モード 2）で削除する。

        server-local が渡すのはパート ID（ベクトルDB の行 ID）だが、アダプタの削除は
        ファイル ID 単位のため、行 ID からファイル ID を引いてから削除する。行 ID に
        当たらない行は、ファイル ID として扱う。

        Parameters
        ----------
        request : WorkflowRequest
            入力。

        Returns
        -------
        str
            空文字列（server-local は削除の出力を読まない）。

        Raises
        ------
        WorkflowError
            削除する ID がない・アダプタが失敗したとき。
        """
        upload: SlotFile | None = request.inputs.get(SLOT_FILE)
        if upload is None:
            raise WorkflowError(IDS_MISSING_MESSAGE)
        ids = [
            line.strip()
            for line in upload.data.decode("utf-8", errors="replace").splitlines()
            if line.strip()
        ]
        if not ids:
            raise WorkflowError(IDS_MISSING_MESSAGE)
        config = self._vector_db_config()
        file_ids = self._resolve_file_ids(config, ids)
        logger.info(
            "delete: serviceId=%s, ids=%d, fileIds=%d",
            request.service_id,
            len(ids),
            len(file_ids),
        )
        self._remove_files(config, file_ids, request)
        return ""

    def _remove_files(
        self, config: VectorDBConfig, file_ids: list[str], request: WorkflowRequest
    ) -> None:
        """ファイル ID の行を、アダプタ（出力モード 2）で削除する。

        Parameters
        ----------
        config : VectorDBConfig
            ベクトルDB の設定。
        file_ids : list[str]
            削除するファイル ID。
        request : WorkflowRequest
            入力（ログ用）。

        Raises
        ------
        WorkflowError
            アダプタが失敗したとき。
        """
        if not file_ids:
            return
        with tempfile.TemporaryDirectory(prefix=JOB_DIR_PREFIX) as directory:
            job_dir = Path(directory)
            app = self._new_app(job_dir, OUTPUT_TYPE_VDB_DELETE)
            self._ensure_graphrag_schema(config)
            records = [
                [ColumnData.char(fid), ColumnData.file("null"), ColumnData.char("0")]
                for fid in file_ids
            ]
            self._write_records(app, records, request)

    def _remove_partial_rows(
        self, file_ids: set[str], request: WorkflowRequest
    ) -> None:
        """学習が途中で失敗したとき、登録済みの行を片付ける（できなくても続ける）。

        Parameters
        ----------
        file_ids : set[str]
            出力 TSV に残っていた、登録済みのファイル ID。
        request : WorkflowRequest
            入力（ログ用）。
        """
        if not file_ids:
            return
        try:
            self._remove_files(self._vector_db_config(), sorted(file_ids), request)
            logger.info("removed partial rows after failure: fileIds=%d", len(file_ids))
        except WorkflowError:
            logger.warning(
                "failed to remove partial rows: serviceId=%s, fileIds=%d",
                request.service_id,
                len(file_ids),
            )

    def _resolve_file_ids(self, config: VectorDBConfig, ids: list[str]) -> list[str]:
        """パート ID（行 ID）またはファイル ID から、ファイル ID の一覧を引く。

        Parameters
        ----------
        config : VectorDBConfig
            ベクトルDB の設定。
        ids : list[str]
            行 ID（またはファイル ID）。

        Returns
        -------
        list[str]
            重複を除いたファイル ID。行 ID にもファイル ID にも当たらない ID
            （削除済みなど）は飛ばす。

        Raises
        ------
        WorkflowError
            PostgreSQL でない・DB に接続できないとき。
        """
        table = _quote_table(config)
        try:
            connection = self._open_connection(config)
            try:
                rows = connection.execute(
                    f"SELECT id::text, fileid FROM {table} "
                    "WHERE id::text = ANY(%s) OR fileid = ANY(%s)",
                    (ids, ids),
                ).fetchall()
            finally:
                connection.close()
        except Exception as e:
            raise WorkflowError(f"{ADAPTER_FAILED_PREFIX}: {e}") from e
        file_ids = list(dict.fromkeys(file_id for _row_id, file_id in rows))
        known = {row_id for row_id, _file_id in rows} | set(file_ids)
        skipped = [i for i in ids if i not in known]
        if skipped:
            # 削除済みのパート ID が再び来ても失敗にしない（server-local は DB 側を消す）
            logger.warning("delete: ids not found in vector db: %d", len(skipped))
        return file_ids

    def _ensure_graphrag_schema(self, config: VectorDBConfig) -> None:
        """削除が参照する GraphRAG のスキーマがなければ作る（エミュレーターの補い）。

        移植元のアダプタは削除のたびに GraphRAG のスキーマ（graphrag_s02）を参照するが、
        スキーマは Graph 書き込みが有効な取り込みでしか作られない。本物の Waha! では
        管理者が事前に用意する前提のため、エミュレーターが作る。

        Parameters
        ----------
        config : VectorDBConfig
            ベクトルDB の設定。

        Raises
        ------
        WorkflowError
            DB に接続できない・スキーマを作れないとき。
        """
        try:
            connection = self._open_connection(config)
            try:
                result = GraphRagRuntimeBootstrapService.jdbc(connection).bootstrap(
                    GraphRagRuntimeBootstrapRequest.create_if_missing(
                        GraphRagRuntimeTargetDescriptor.sanitized(
                            "PostgreSQL", "emulator-delete"
                        ),
                        config.get_effective_graph_name()
                        if config.graph_write_enabled
                        else None,
                    )
                )
            finally:
                connection.close()
        except Exception as e:
            raise WorkflowError(f"{ADAPTER_FAILED_PREFIX}: {e}") from e
        logger.info(
            "graphrag schema ready: ready=%s, created=%d",
            result.ready,
            len(result.created_resources),
        )

    # ---- sync ----

    def _sync(self, request: WorkflowRequest) -> str:
        """ベクトルDB に登録済みの行を、パス・パート ID・ファイル ID の TSV にする。

        取り込み元は、アダプタがベクトルDB に書いた行（学習時に `filepath` や
        アップロードで渡されたパスが入っている）だけ。ファイルサーバーなどの外部は
        探索しない。

        Parameters
        ----------
        request : WorkflowRequest
            入力（start・end）。

        Returns
        -------
        str
            `"パス"<TAB>"パート ID"<TAB>"ファイル ID"` を 1 行ずつ並べた TSV。

        Raises
        ------
        WorkflowError
            start・end が不正・DB に接続できないとき。
        """
        start = self._int_param(request, START_PARAM, 0)
        end = self._int_param(request, END_PARAM, start + DEFAULT_SYNC_LIMIT)
        if start < 0 or end < start:
            raise WorkflowError(f"start・end が不正です: {start}, {end}")
        config = self._vector_db_config()
        table = _quote_table(config)
        try:
            connection = self._open_connection(config)
            try:
                rows = connection.execute(
                    f"SELECT COALESCE(filepath, ''), id::text, fileid FROM {table} "
                    "ORDER BY fileid, id OFFSET %s LIMIT %s",
                    (start, end - start),
                ).fetchall()
            finally:
                connection.close()
        except Exception as e:
            raise WorkflowError(f"{ADAPTER_FAILED_PREFIX}: {e}") from e
        logger.info("sync: serviceId=%s, rows=%d", request.service_id, len(rows))
        return "".join(
            f'"{path}"\t"{part_id}"\t"{file_id}"{OUTPUT_LINE_SEPARATOR}'
            for path, part_id, file_id in rows
        )

    @staticmethod
    def _int_param(request: WorkflowRequest, name: str, default: int) -> int:
        """execute のクエリパラメータを整数で読む。

        Parameters
        ----------
        request : WorkflowRequest
            入力。
        name : str
            パラメータ名。
        default : int
            指定がないときの値。

        Returns
        -------
        int
            値。

        Raises
        ------
        WorkflowError
            整数でないとき。
        """
        raw = request.params.get(name, "").strip()
        if not raw:
            return default
        try:
            return int(raw)
        except ValueError as e:
            raise WorkflowError(f"{name} が数値ではありません: {raw}") from e
