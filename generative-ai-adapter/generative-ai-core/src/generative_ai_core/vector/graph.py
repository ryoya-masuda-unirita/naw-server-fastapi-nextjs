"""Apache AGE への Graph 書き込み（移植元 CoreAgeGraphWriteService ほか）。"""

import json
import re
from collections.abc import Callable, Sequence
from datetime import UTC, datetime
from typing import Any

from generative_ai_core.vector.compensating_constants import (
    REASON_GRAPH_NODE_UNWRITTEN,
)
from generative_ai_core.vector.jdbc import Connection, JdbcTemplate
from generative_ai_core.vector.model import (
    CoreGraphChunkWritePayload,
    CoreGraphWriteResult,
    CoreGraphWriteStatus,
    CoreVectorDbOperation,
    validate_graph_name,
)

LOAD_AGE_SQL = "LOAD 'age'"
SEARCH_PATH_SQL = 'SET search_path = ag_catalog, "$user", public'
CREATE_EXTENSION_SQL = "CREATE EXTENSION IF NOT EXISTS age"

_EXTENSION_UNAVAILABLE = re.compile(r"age|extension|ag_catalog|load", re.IGNORECASE)
_GRAPH_UNAVAILABLE = re.compile(
    r"graph.*(missing|unavailable|does not exist|not found)|create_graph|graph.*permission",
    re.IGNORECASE,
)
_PERMISSION_DENIED = re.compile(
    r"denied|permission|not authorized|privilege", re.IGNORECASE
)
_MALFORMED_RESULT = re.compile(
    r"malformed|invalid result|unexpected result|serialization", re.IGNORECASE
)


def ensure_age_session(connection: Connection) -> None:
    """接続で AGE を読み込み、search_path を設定する（移植元 ensureAgeSession）。

    Parameters
    ----------
    connection : Connection
        接続。
    """
    connection.execute(LOAD_AGE_SQL)
    connection.execute(SEARCH_PATH_SQL)


def with_age_session[T](
    template: JdbcTemplate, callback: Callable[[Connection], T]
) -> T:
    """AGE を使える状態にした接続で処理を呼ぶ（移植元 withAgeSession）。

    Parameters
    ----------
    template : JdbcTemplate
        接続元。
    callback : Callable[[Connection], T]
        AGE 用に準備した接続を受け取る処理。

    Returns
    -------
    T
        処理の戻り値。
    """

    def run(connection: Connection) -> T:
        """AGE を準備して処理を呼ぶ。

        Parameters
        ----------
        connection : Connection
            接続。

        Returns
        -------
        T
            処理の戻り値。
        """
        ensure_age_session(connection)
        return callback(connection)

    result: T = template.with_connection(run)
    return result


class CoreGraphFailureClassifier:
    """Graph 書き込みの例外を結果に分類する（移植元 CoreGraphFailureClassifier）。"""

    def classify(
        self,
        operation: CoreVectorDbOperation,
        file_id: str,
        vector_row_id: str | None,
        error: BaseException | None,
    ) -> CoreGraphWriteResult:
        """例外のメッセージから失敗の種類を決める。

        Parameters
        ----------
        operation : CoreVectorDbOperation
            実行していた操作。
        file_id : str
            ファイル ID。
        vector_row_id : str | None
            ベクトル行 ID。
        error : BaseException | None
            発生した例外。

        Returns
        -------
        CoreGraphWriteResult
            失敗の結果。
        """
        message = "Graph write failed." if error is None else (str(error) or None)
        normalized = (message or "").lower()
        category = self._category(normalized, operation)
        if category == "GRAPH_CONFIGURATION_FAILURE":
            status = CoreGraphWriteStatus.FAILED_CONFIGURATION
        elif category in (
            "GRAPH_PERMISSION_DENIED",
            "GRAPH_UNAVAILABLE",
            "GRAPH_AGE_UNAVAILABLE",
        ):
            status = CoreGraphWriteStatus.FAILED_EXTENSION_UNAVAILABLE
        else:
            status = CoreGraphWriteStatus.FAILED_WRITE
        chunk_ids = [vector_row_id] if vector_row_id and vector_row_id.strip() else []
        return CoreGraphWriteResult.failure(
            status, file_id, chunk_ids, message, category
        )

    def _category(self, message: str, operation: CoreVectorDbOperation) -> str:
        """メッセージから原因分類を決める。

        Parameters
        ----------
        message : str
            小文字にしたメッセージ。
        operation : CoreVectorDbOperation
            操作。

        Returns
        -------
        str
            原因分類。
        """
        if _MALFORMED_RESULT.search(message):
            return "GRAPH_MALFORMED_RESULT"
        if _PERMISSION_DENIED.search(message):
            return "GRAPH_PERMISSION_DENIED"
        if _GRAPH_UNAVAILABLE.search(message):
            return "GRAPH_UNAVAILABLE"
        if _EXTENSION_UNAVAILABLE.search(message):
            return "GRAPH_AGE_UNAVAILABLE"
        if operation in (
            CoreVectorDbOperation.GRAPH_DELETE,
            CoreVectorDbOperation.DELETE,
        ):
            return "GRAPH_DELETE_FAILURE"
        return "GRAPH_WRITE_FAILURE"


class CoreAgeGraphWriteService:
    """Apache AGE のグラフへ File・Chunk・VectorRow を書く。"""

    def __init__(self, template: JdbcTemplate, graph_name: str) -> None:
        """接続元とグラフ名を受け取る。

        Parameters
        ----------
        template : JdbcTemplate
            接続元。
        graph_name : str
            グラフ名。

        Raises
        ------
        ValueError
            グラフ名が不正なとき。
        """
        self._template = template
        self._graph_name = validate_graph_name(graph_name)
        self._initialized = False

    def write_chunk(self, payload: CoreGraphChunkWritePayload) -> CoreGraphWriteResult:
        """チャンクを書く（File・Chunk・VectorRow と各関係）。

        Parameters
        ----------
        payload : CoreGraphChunkWritePayload
            チャンクの内容。

        Returns
        -------
        CoreGraphWriteResult
            成功の結果。

        Raises
        ------
        ValueError
            チャンクの内容に file_id か vector_row_id がないとき。
        """
        if payload is None or not payload.has_chunk():
            raise ValueError("Graph chunk payload requires fileId and vectorRowId")
        self._initialize(True)
        self._upsert_file(payload)
        self._upsert_chunk(payload)
        self._upsert_vector_row(payload)
        self._upsert_has_chunk(payload)
        self._upsert_has_vector(payload)
        self._upsert_next_chunk(payload)
        return CoreGraphWriteResult.success(payload.file_id, [payload.vector_row_id])

    def delete_by_ids(
        self, vector_row_ids: Sequence[str] | None
    ) -> CoreGraphWriteResult:
        """ベクトル行 ID に対応する Chunk・VectorRow と関係を消す。

        Parameters
        ----------
        vector_row_ids : Sequence[str] | None
            ベクトル行 ID。

        Returns
        -------
        CoreGraphWriteResult
            成功の結果。何も消えなければ「不在でスキップ」の結果。
        """
        ids = [i.strip() for i in (vector_row_ids or []) if i and i.strip()]
        if not ids:
            return CoreGraphWriteResult.success("", [])
        self._initialize(False)
        any_deleted = False
        for vector_row_id in ids:
            params: dict[str, Any] = {"vectorRowId": vector_row_id}
            any_deleted |= (
                self._cypher_allowing_no_rows(
                    "MATCH (c:Chunk {id: $vectorRowId})-[r:HAS_VECTOR]->"
                    "(v:VectorRow {id: $vectorRowId}) DELETE r RETURN c",
                    params,
                )
                > 0
            )
            self._cypher_allowing_no_rows(
                "MATCH (previous:Chunk)-[r:NEXT_CHUNK]->(c:Chunk {id: $vectorRowId}) "
                "DELETE r RETURN previous",
                params,
            )
            self._cypher_allowing_no_rows(
                "MATCH (c:Chunk {id: $vectorRowId})-[r:NEXT_CHUNK]->(next:Chunk) "
                "DELETE r RETURN next",
                params,
            )
            any_deleted |= (
                self._cypher_allowing_no_rows(
                    "MATCH (f:File)-[r:HAS_CHUNK]->(c:Chunk {id: $vectorRowId}) "
                    "DELETE r RETURN f",
                    params,
                )
                > 0
            )
            self._cypher_allowing_no_rows(
                "MATCH (c:Chunk {id: $vectorRowId}), (f:File) "
                "WHERE f.id = c.fileId OPTIONAL MATCH (f)-[remaining:HAS_CHUNK]->(:Chunk) "
                "WITH f, count(remaining) AS remainingCount WHERE remainingCount = 0 "
                "DELETE f RETURN 1",
                params,
            )
            any_deleted |= (
                self._cypher_allowing_no_rows(
                    "MATCH (c:Chunk {id: $vectorRowId}) DELETE c RETURN 1", params
                )
                > 0
            )
            any_deleted |= (
                self._cypher_allowing_no_rows(
                    "MATCH (v:VectorRow {id: $vectorRowId}) DELETE v RETURN 1", params
                )
                > 0
            )
        if not any_deleted:
            return CoreGraphWriteResult.absent_skipped(ids, REASON_GRAPH_NODE_UNWRITTEN)
        return CoreGraphWriteResult.success("", ids)

    def _initialize(self, create_if_missing: bool) -> None:
        """AGE 拡張とグラフの存在を確かめる（初回だけ）。

        Parameters
        ----------
        create_if_missing : bool
            グラフがなければ作るか（削除では作らない）。

        Raises
        ------
        RuntimeError
            グラフがないまま使えないとき。
        """
        if self._initialized:
            return
        self._template.execute(CREATE_EXTENSION_SQL)

        def check(connection: Connection) -> None:
            """グラフの有無を確かめ、必要なら作る。

            Parameters
            ----------
            connection : Connection
                AGE 用に準備した接続。

            Raises
            ------
            RuntimeError
                グラフがないとき。
            """
            count = self._graph_count(connection)
            if count == 0 and create_if_missing:
                connection.execute("SELECT create_graph(%s)", [self._graph_name])
                count = self._graph_count(connection)
            if count == 0:
                raise RuntimeError("AGE graph is unavailable or missing.")

        with_age_session(self._template, check)
        self._initialized = True

    def _graph_count(self, connection: Connection) -> int:
        """同名のグラフの数を数える。

        Parameters
        ----------
        connection : Connection
            接続。

        Returns
        -------
        int
            グラフの数。
        """
        rows = connection.execute(
            "SELECT COUNT(*) FROM ag_catalog.ag_graph WHERE name = %s",
            [self._graph_name],
        ).fetchall()
        return int(rows[0][0]) if rows else 0

    def _upsert_file(self, payload: CoreGraphChunkWritePayload) -> None:
        """File ノードを作成・更新する。

        Parameters
        ----------
        payload : CoreGraphChunkWritePayload
            チャンクの内容。
        """
        params = {
            "fileId": payload.file_id,
            "filePath": payload.file_path,
            "updatedAt": datetime.now(UTC)
            .isoformat(timespec="microseconds")
            .replace("+00:00", "Z"),
        }
        self._cypher(
            "MERGE (f:File {id: $fileId}) "
            "SET f.path = $filePath, f.updatedAt = $updatedAt RETURN 1",
            params,
        )

    def _upsert_chunk(self, payload: CoreGraphChunkWritePayload) -> None:
        """Chunk ノードを作成・更新する。

        Parameters
        ----------
        payload : CoreGraphChunkWritePayload
            チャンクの内容。
        """
        self._cypher(
            "MERGE (c:Chunk {id: $vectorRowId}) "
            "SET c.fileId = $fileId, c.sequence = $chunkSequence, c.content = $content "
            "RETURN 1",
            self._base_params(payload),
        )

    def _upsert_vector_row(self, payload: CoreGraphChunkWritePayload) -> None:
        """VectorRow ノードを作成・更新する。

        Parameters
        ----------
        payload : CoreGraphChunkWritePayload
            チャンクの内容。
        """
        self._cypher(
            "MERGE (v:VectorRow {id: $vectorRowId}) SET v.fileId = $fileId RETURN 1",
            self._base_params(payload),
        )

    def _upsert_has_chunk(self, payload: CoreGraphChunkWritePayload) -> None:
        """File から Chunk への HAS_CHUNK を作る。

        Parameters
        ----------
        payload : CoreGraphChunkWritePayload
            チャンクの内容。
        """
        self._cypher(
            "MATCH (f:File {id: $fileId}), (c:Chunk {id: $vectorRowId}) "
            "MERGE (f)-[:HAS_CHUNK]->(c) RETURN 1",
            self._base_params(payload),
        )

    def _upsert_has_vector(self, payload: CoreGraphChunkWritePayload) -> None:
        """Chunk から VectorRow への HAS_VECTOR を作る。

        Parameters
        ----------
        payload : CoreGraphChunkWritePayload
            チャンクの内容。
        """
        self._cypher(
            "MATCH (c:Chunk {id: $vectorRowId}), (v:VectorRow {id: $vectorRowId}) "
            "MERGE (c)-[:HAS_VECTOR]->(v) RETURN 1",
            self._base_params(payload),
        )

    def _upsert_next_chunk(self, payload: CoreGraphChunkWritePayload) -> None:
        """直前の Chunk から NEXT_CHUNK を作る（直前がなければ何もしない）。

        Parameters
        ----------
        payload : CoreGraphChunkWritePayload
            チャンクの内容。
        """
        if not payload.previous_vector_row_id.strip():
            return
        params = self._base_params(payload)
        params["previousVectorRowId"] = payload.previous_vector_row_id
        self._cypher(
            "MATCH (p:Chunk {id: $previousVectorRowId}), (c:Chunk {id: $vectorRowId}) "
            "MERGE (p)-[:NEXT_CHUNK]->(c) RETURN 1",
            params,
        )

    def _cypher(self, cypher: str, params: dict[str, Any]) -> int:
        """Cypher を実行し、行がなければ失敗にする。

        Parameters
        ----------
        cypher : str
            Cypher。
        params : dict[str, Any]
            パラメーター。

        Returns
        -------
        int
            返った行数。
        """
        return self._execute_cypher(cypher, params, True)

    def _cypher_allowing_no_rows(self, cypher: str, params: dict[str, Any]) -> int:
        """Cypher を実行し、行がなくても失敗にしない。

        Parameters
        ----------
        cypher : str
            Cypher。
        params : dict[str, Any]
            パラメーター。

        Returns
        -------
        int
            返った行数。
        """
        return self._execute_cypher(cypher, params, False)

    def _execute_cypher(
        self, cypher: str, params: dict[str, Any], require_rows: bool
    ) -> int:
        """AGE の `cypher()` を実行して返った行数を数える。

        Parameters
        ----------
        cypher : str
            Cypher。
        params : dict[str, Any]
            パラメーター（JSON にして agtype として渡す）。
        require_rows : bool
            行がなければ失敗にするか。

        Returns
        -------
        int
            返った行数。

        Raises
        ------
        RuntimeError
            行が必要なのに返らなかったとき。
        """
        sql = (
            f"SELECT * FROM cypher('{self._graph_name}', $$ {cypher} $$, %s) "
            "AS (result agtype)"
        )
        parameter = json.dumps(params, ensure_ascii=False)

        def run(connection: Connection) -> int:
            """実行して行数を数える。

            Parameters
            ----------
            connection : Connection
                AGE 用に準備した接続。

            Returns
            -------
            int
                行数。
            """
            return len(connection.execute(sql, [parameter]).fetchall())

        rows = with_age_session(self._template, run)
        if require_rows and rows == 0:
            raise RuntimeError("Malformed graph operation result.")
        return rows

    @staticmethod
    def _base_params(payload: CoreGraphChunkWritePayload) -> dict[str, Any]:
        """チャンク共通の Cypher パラメーターを作る。

        Parameters
        ----------
        payload : CoreGraphChunkWritePayload
            チャンクの内容。

        Returns
        -------
        dict[str, Any]
            パラメーター。
        """
        return {
            "fileId": payload.file_id,
            "vectorRowId": payload.vector_row_id,
            "chunkSequence": payload.chunk_sequence,
            "content": payload.content,
        }
