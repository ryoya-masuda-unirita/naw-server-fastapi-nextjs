"""PostgreSQL（pgvector + AGE）プロバイダのテスト。実 DB には接続せず、偽の接続で SQL を検証する。

移植元の次のテストを移した（Spring の JdbcTemplate を偽の接続に置き換えている）。
- vector/PgVectorCoreVectorDbProviderTest（保存・更新・検索・スキーマ初期化・Graph）
- vector/PgVectorSchemaInitializerTest
- vector/PgVectorFileUniqueIdDeleteContractTest, PgVectorGraphRagCleanupSqlContractTest
- vector/PgVectorCoreGraphWriteDeleteTest, CoreAgeGraphWriteServiceTest, AgeJdbcSessionSupportTest
"""

import json
import uuid
from collections.abc import Callable, Sequence
from typing import Any

import pytest
from generative_ai_core.vector import (
    CoreGraphChunkWritePayload,
    CoreGraphWriteSetting,
    CoreGraphWriteStatus,
    CoreVectorDbOperation,
    CoreVectorDbPayload,
    CoreVectorDbRequest,
    CoreVectorDbTarget,
    JdbcTemplate,
    PgVectorCoreVectorDbProvider,
    PgVectorSchemaInitializer,
    pgroonga_content_index_name,
)
from generative_ai_core.vector.compensating_constants import (
    LAYER_GRAPH_RAG,
    LAYER_VECTOR,
    METADATA_COMPENSATING_LAYER,
)

ROW_ID = "00000000-0000-0000-0000-000000000001"
ROW_ID_2 = "00000000-0000-0000-0000-000000000002"
TARGET = CoreVectorDbTarget.pg_vector(
    "db.example:6543", "user", "pw", "db", "Vector_Store", False
)

Responder = Callable[[str, Sequence[Any]], tuple[list[Any], int] | None]


class FakeCursor:
    """偽のカーソル。"""

    def __init__(self, rows: list[Any], rowcount: int) -> None:
        """行と影響行数を保持する。

        Parameters
        ----------
        rows : list[Any]
            返す行。
        rowcount : int
            影響した行数。
        """
        self._rows = rows
        self.rowcount = rowcount

    def fetchall(self) -> list[Any]:
        """行を返す。

        Returns
        -------
        list[Any]
            行。
        """
        return self._rows


class FakeDb:
    """実行した SQL とパラメーターを記録する偽の DB。"""

    def __init__(self, responder: Responder | None = None) -> None:
        """応答の決め方を受け取る。

        Parameters
        ----------
        responder : Responder | None
            SQL とパラメーターから (行, 影響行数) を返す関数。None を返すと既定の応答。
        """
        self.calls: list[tuple[str, list[Any]]] = []
        self.targets: list[CoreVectorDbTarget] = []
        self.closed = 0
        self._responder = responder

    def factory(self, target: CoreVectorDbTarget) -> "FakeConnection":
        """接続を作る（ConnectionFactory）。

        Parameters
        ----------
        target : CoreVectorDbTarget
            接続先。

        Returns
        -------
        FakeConnection
            偽の接続。
        """
        self.targets.append(target)
        return FakeConnection(self)

    def sqls(self) -> list[str]:
        """実行した SQL の一覧を返す。

        Returns
        -------
        list[str]
            SQL。
        """
        return [sql for sql, _ in self.calls]

    def find(self, fragment: str) -> list[tuple[str, list[Any]]]:
        """SQL に文字列を含む呼び出しを探す。

        Parameters
        ----------
        fragment : str
            探す文字列。

        Returns
        -------
        list[tuple[str, list[Any]]]
            該当する (SQL, パラメーター)。
        """
        return [c for c in self.calls if fragment in c[0]]


class FakeConnection:
    """偽の接続。"""

    def __init__(self, db: FakeDb) -> None:
        """記録先の DB を保持する。

        Parameters
        ----------
        db : FakeDb
            偽の DB。
        """
        self._db = db

    def execute(self, query: str, params: Sequence[Any] | None = None) -> FakeCursor:
        """SQL を記録して応答を返す。

        Parameters
        ----------
        query : str
            SQL。
        params : Sequence[Any] | None
            パラメーター。

        Returns
        -------
        FakeCursor
            カーソル。
        """
        listed = list(params or [])
        self._db.calls.append((query, listed))
        if self._db._responder is not None:
            answer = self._db._responder(query, listed)
            if answer is not None:
                return FakeCursor(*answer)
        return FakeCursor([], 1)

    def close(self) -> None:
        """閉じた回数を数える。"""
        self._db.closed += 1


def _request(
    operation: CoreVectorDbOperation,
    target: CoreVectorDbTarget = TARGET,
    payload: CoreVectorDbPayload | None = None,
    graph: CoreGraphWriteSetting | None = None,
    chunk: CoreGraphChunkWritePayload | None = None,
    meta: dict[str, str] | None = None,
    **metadata: str,
) -> CoreVectorDbRequest:
    """テスト用の要求を作る。

    Parameters
    ----------
    operation : CoreVectorDbOperation
        操作。
    target : CoreVectorDbTarget
        接続先。
    payload : CoreVectorDbPayload | None
        内容。
    graph : CoreGraphWriteSetting | None
        Graph 設定。
    chunk : CoreGraphChunkWritePayload | None
        Graph のチャンク内容。
    meta : dict[str, str] | None
        キーに識別子以外を含むメタデータ。
    **metadata : str
        メタデータ。

    Returns
    -------
    CoreVectorDbRequest
        要求。
    """
    builder = (
        CoreVectorDbRequest.builder("PostgreSQL", operation)
        .target(target)
        .payload(
            payload
            or CoreVectorDbPayload(ROW_ID, "本文", (0.1, 0.25), "file-1", "/in/a.txt")
        )
        .graph_write_setting(graph)
        .graph_chunk_payload(chunk)
    )
    for key, value in {**(meta or {}), **metadata}.items():
        builder.metadata(key, value)
    return builder.build()


def test_save_upserts_with_filepath_when_column_exists() -> None:
    """filepath 列があるテーブルへは filepath 付きで upsert すること"""
    db = FakeDb(lambda sql, _p: ([(True,)], 1) if "information_schema" in sql else None)
    result = PgVectorCoreVectorDbProvider(db.factory).execute(
        _request(CoreVectorDbOperation.SAVE)
    )
    assert result.success
    assert result.id == ROW_ID
    (sql, params) = db.find("INSERT INTO")[0]
    assert sql == (
        "INSERT INTO public.vector_store (id, fileid, filepath, content, embedding) "
        "VALUES (%s, %s, %s, %s, %s::vector) ON CONFLICT (id) DO UPDATE SET "
        "fileid = %s, filepath = %s, content = %s, embedding = %s::vector"
    )
    assert params == [
        uuid.UUID(ROW_ID), "file-1", "/in/a.txt", "本文", "[0.1,0.25]",
        "file-1", "/in/a.txt", "本文", "[0.1,0.25]",
    ]  # fmt: skip
    assert db.targets[0] is TARGET
    assert db.closed == len(db.calls)


def test_save_without_filepath_column_omits_filepath() -> None:
    """filepath 列がないテーブルへは filepath なしで upsert すること"""
    db = FakeDb(
        lambda sql, _p: ([(False,)], 1) if "information_schema" in sql else None
    )
    PgVectorCoreVectorDbProvider(db.factory).execute(
        _request(CoreVectorDbOperation.UPDATE)
    )
    (sql, params) = db.find("INSERT INTO")[0]
    assert "filepath" not in sql
    assert params == [
        uuid.UUID(ROW_ID),
        "file-1",
        "本文",
        "[0.1,0.25]",
        "file-1",
        "本文",
        "[0.1,0.25]",
    ]


def test_save_blank_source_path_is_stored_as_null() -> None:
    """元ファイルパスが空なら NULL で保存すること"""
    db = FakeDb(lambda sql, _p: ([(True,)], 1) if "information_schema" in sql else None)
    payload = CoreVectorDbPayload(ROW_ID, "本文", (0.5,), "file-1", "  ")
    PgVectorCoreVectorDbProvider(db.factory).execute(
        _request(CoreVectorDbOperation.SAVE, payload=payload)
    )
    assert db.find("INSERT INTO")[0][1][2] is None


def test_save_with_initialize_schema_runs_ddl_before_insert() -> None:
    """スキーマ初期化ありの保存は DDL を実行してから filepath 付きで挿入すること"""
    target = CoreVectorDbTarget.pg_vector(
        "db", "user", "pw", "db", "vector_store", True
    )
    db = FakeDb(lambda sql, _p: ([(True,)], 1) if "pg_constraint" in sql else None)
    result = PgVectorCoreVectorDbProvider(db.factory).execute(
        _request(CoreVectorDbOperation.SAVE, target=target)
    )
    assert result.success
    sqls = db.sqls()
    assert sqls[0] == "CREATE EXTENSION IF NOT EXISTS vector"
    assert "CREATE EXTENSION IF NOT EXISTS pgroonga" in sqls
    assert not any("information_schema" in s for s in sqls)
    assert sqls.index("CREATE EXTENSION IF NOT EXISTS vector") < sqls.index(
        db.find("INSERT INTO")[0][0]
    )


def test_schema_initialization_failure_becomes_result_failure() -> None:
    """スキーマ初期化の失敗は専用コードの失敗の結果になること"""

    def boom(sql: str, _p: Sequence[Any]) -> tuple[list[Any], int] | None:
        """CREATE EXTENSION で失敗させる。

        Parameters
        ----------
        sql : str
            SQL。
        _p : Sequence[Any]
            パラメーター。

        Returns
        -------
        tuple[list[Any], int] | None
            返らない。

        Raises
        ------
        RuntimeError
            常に送出する。
        """
        if "CREATE EXTENSION" in sql:
            raise RuntimeError("permission denied")
        return None

    target = CoreVectorDbTarget.pg_vector(
        "db", "user", "pw", "db", "vector_store", True
    )
    result = PgVectorCoreVectorDbProvider(FakeDb(boom).factory).execute(
        _request(CoreVectorDbOperation.SAVE, target=target)
    )
    assert not result.success
    assert result.failure is not None
    assert result.failure.code == "PGVECTOR_SCHEMA_INITIALIZATION_FAILED"


def test_save_rejects_non_uuid_id_and_unsafe_table_name() -> None:
    """UUID でない ID・不正なテーブル名は ValueError になること"""
    provider = PgVectorCoreVectorDbProvider(FakeDb().factory)
    with pytest.raises(ValueError, match="badly formed"):
        provider.execute(
            _request(
                CoreVectorDbOperation.SAVE,
                payload=CoreVectorDbPayload("not-uuid", "c", (0.1,), "f"),
            )
        )
    bad = CoreVectorDbTarget.pg_vector("db", "u", "p", "d", "vector-store", False)
    with pytest.raises(ValueError, match="tableName must match"):
        provider.execute(_request(CoreVectorDbOperation.SAVE, target=bad))


def test_search_orders_by_cosine_distance_and_parses_rows() -> None:
    """検索はコサイン距離順に取得し、ベクトル文字列を数値にすること"""
    db = FakeDb(
        lambda sql, _p: (
            ([(ROW_ID, "本文", "[0.1,0.25]", "file-1")], 1)
            if "ORDER BY" in sql
            else None
        )
    )
    request = _request(
        CoreVectorDbOperation.SEARCH,
        payload=CoreVectorDbPayload("q", "q", (0.3, 0.4), ""),
        limit="5",
    )
    result = PgVectorCoreVectorDbProvider(db.factory).execute(request)
    (sql, params) = db.calls[0]
    assert sql == (
        "SELECT id::text AS id, COALESCE(content, '') AS content, embedding::text AS embedding, "
        "COALESCE(fileid::text, '') AS fileid FROM public.vector_store "
        "ORDER BY embedding <=> %s::vector LIMIT %s"
    )
    assert params == ["[0.3,0.4]", 5]
    assert result.matches[0].id == ROW_ID
    assert result.matches[0].vector == (0.1, 0.25)
    assert result.matches[0].file_unique_id == "file-1"


def test_search_limit_defaults_to_three_and_rejects_non_numeric() -> None:
    """検索件数は既定 3 で、数値でなければ ValueError になること"""
    db = FakeDb()
    provider = PgVectorCoreVectorDbProvider(db.factory)
    payload = CoreVectorDbPayload("q", "q", (0.3,), "")
    provider.execute(_request(CoreVectorDbOperation.SEARCH, payload=payload))
    assert db.calls[0][1][1] == 3
    with pytest.raises(ValueError, match="Search limit must be numeric"):
        provider.execute(
            _request(CoreVectorDbOperation.SEARCH, payload=payload, limit="x")
        )


def test_delete_by_file_unique_id_without_graph_deletes_fileid_rows() -> None:
    """Graph なしの削除はテナントがなければ GraphRAG 層を失敗にすること"""
    db = FakeDb()
    payload = CoreVectorDbPayload("", "", (), "file-1")
    result = PgVectorCoreVectorDbProvider(db.factory).execute(
        _request(CoreVectorDbOperation.DELETE, payload=payload)
    )
    assert not result.success
    assert result.failure is not None
    assert result.failure.code == "GRAPH_RAG_CHUNK_DELETE_MISSING_TENANT"
    assert db.calls == []


def test_delete_vector_layer_only_deletes_by_fileid() -> None:
    """ベクトル層だけの削除は fileid で行を消すこと"""
    db = FakeDb()
    payload = CoreVectorDbPayload(ROW_ID, "", (), "")
    result = PgVectorCoreVectorDbProvider(db.factory).execute(
        _request(
            CoreVectorDbOperation.DELETE,
            payload=payload,
            meta={METADATA_COMPENSATING_LAYER: LAYER_VECTOR},
        )
    )
    assert result.success
    assert result.id == "fileUniqueId-delete"
    assert result.graph_result is None
    assert db.calls == [("DELETE FROM public.vector_store WHERE fileid = %s", [ROW_ID])]


def test_delete_with_graph_enabled_resolves_ids_and_deletes_by_id() -> None:
    """Graph 有効の削除は ID を引いて Graph とベクトル行を消すこと"""

    def responder(sql: str, _p: Sequence[Any]) -> tuple[list[Any], int] | None:
        """ID の解決・グラフ有無に応答する。

        Parameters
        ----------
        sql : str
            SQL。
        _p : Sequence[Any]
            パラメーター。

        Returns
        -------
        tuple[list[Any], int] | None
            応答。
        """
        if "SELECT id AS id" in sql:
            return [(uuid.UUID(ROW_ID),), (uuid.UUID(ROW_ID_2),)], 2
        if "ag_graph" in sql:
            return [(1,)], 1
        if "cypher(" in sql:
            return [(1,)], 1
        return None

    db = FakeDb(responder)
    payload = CoreVectorDbPayload("", "", (), "file-1")
    result = PgVectorCoreVectorDbProvider(db.factory).execute(
        _request(
            CoreVectorDbOperation.DELETE,
            payload=payload,
            graph=CoreGraphWriteSetting.enabled_with("my_graph"),
            tenantId="t1",
            graphRagSourceRef="file-1",
        )
    )
    assert result.success
    assert result.graph_result is not None
    delete = db.find("DELETE FROM public.vector_store WHERE id IN")[0]
    assert delete[0].endswith("IN (%s, %s)")
    assert delete[1] == [uuid.UUID(ROW_ID), uuid.UUID(ROW_ID_2)]
    cypher_sql = db.find("cypher('my_graph'")
    assert cypher_sql
    assert json.loads(cypher_sql[0][1][0]) == {"vectorRowId": ROW_ID}


def test_graph_rag_layer_delete_without_chunk_id_uses_file_unique_id_predicate() -> (
    None
):
    """GraphRAG 層の削除はチャンク ID がなければファイル ID の副問い合わせで消すこと"""
    db = FakeDb(lambda _s, _p: ([], 1))
    payload = CoreVectorDbPayload("", "", (), "file-1")
    result = PgVectorCoreVectorDbProvider(db.factory).execute(
        _request(
            CoreVectorDbOperation.DELETE,
            payload=payload,
            meta={METADATA_COMPENSATING_LAYER: LAYER_GRAPH_RAG, "tenantId": "t1"},
        )
    )
    assert result.success
    first_sql, first_params = db.calls[0]
    assert first_sql.startswith(
        "delete from graphrag_s02.answer_claim_evidence where tenant_id = %s"
    )
    assert (
        "join public.vector_store v on v.fileid = d.source_label_sanitized" in first_sql
    )
    assert first_params == ["t1", "t1", "t1", "file-1"]
    tables = [s.split("graphrag_s02.")[1].split(" ")[0] for s, _ in db.calls]
    assert tables == [
        "answer_claim_evidence", "kg_edge_evidence", "embedding_queue", "llm_candidate_origins",
        "chunk_embeddings", "chunk_identifiers", "evidence_items", "chunks",
        "acl_propagation_outbox", "document_acl_grants", "document_versions", "documents",
    ]  # fmt: skip


def test_graph_rag_layer_delete_by_chunk_id_and_absent_when_nothing_affected() -> None:
    """チャンク ID 指定の GraphRAG 削除で何も消えなければ「すでにない」結果になること"""
    db = FakeDb(lambda _s, _p: ([], 0))
    result = PgVectorCoreVectorDbProvider(db.factory).execute(
        _request(
            CoreVectorDbOperation.DELETE,
            payload=CoreVectorDbPayload(ROW_ID, "", (), ""),
            meta={
                METADATA_COMPENSATING_LAYER: LAYER_GRAPH_RAG,
                "tenantId": "t1",
                "graphRagChunkId": "c1",
            },
        )
    )
    assert result.success
    assert result.graph_result is not None
    assert result.graph_result.is_absent_skipped()
    assert db.calls[0][1] == ["t1", "t1", "c1"]


def test_graph_write_disabled_returns_disabled_result() -> None:
    """Graph 無効の GRAPH_WRITE は無効の結果を返すこと"""
    db = FakeDb()
    result = PgVectorCoreVectorDbProvider(db.factory).execute(
        _request(CoreVectorDbOperation.GRAPH_WRITE)
    )
    assert result.success
    assert result.graph_result is not None
    assert result.graph_result.status == CoreGraphWriteStatus.DISABLED
    assert db.calls == []


def test_save_with_graph_chunk_writes_graph_after_vector_row() -> None:
    """Graph 有効でチャンクがあれば、ベクトル行の保存後に Graph を書くこと"""

    def responder(sql: str, _p: Sequence[Any]) -> tuple[list[Any], int] | None:
        """情報スキーマ・グラフ・Cypher に応答する。

        Parameters
        ----------
        sql : str
            SQL。
        _p : Sequence[Any]
            パラメーター。

        Returns
        -------
        tuple[list[Any], int] | None
            応答。
        """
        if "information_schema" in sql or "ag_graph" in sql or "cypher(" in sql:
            return [(1,)], 1
        return None

    db = FakeDb(responder)
    chunk = CoreGraphChunkWritePayload.chunk(
        "file-1", "/in/a.txt", ROW_ID, 1, "本文", ROW_ID_2
    )
    result = PgVectorCoreVectorDbProvider(db.factory).execute(
        _request(
            CoreVectorDbOperation.SAVE,
            graph=CoreGraphWriteSetting.enabled_with("g1"),
            chunk=chunk,
        )
    )
    assert result.success
    assert result.graph_result is not None
    assert result.graph_result.status == CoreGraphWriteStatus.SUCCESS
    sqls = db.sqls()
    assert sqls.index(db.find("INSERT INTO")[0][0]) < sqls.index(
        "CREATE EXTENSION IF NOT EXISTS age"
    )
    assert "LOAD 'age'" in sqls
    assert 'SET search_path = ag_catalog, "$user", public' in sqls
    cypher = db.find("cypher('g1'")
    assert len(cypher) == 6  # File, Chunk, VectorRow, HAS_CHUNK, HAS_VECTOR, NEXT_CHUNK
    assert "MERGE (f:File {id: $fileId})" in cypher[0][0]
    assert json.loads(cypher[1][1][0]) == {
        "fileId": "file-1", "vectorRowId": ROW_ID, "chunkSequence": 1, "content": "本文",
    }  # fmt: skip
    assert "NEXT_CHUNK" in cypher[5][0]
    assert json.loads(cypher[5][1][0])["previousVectorRowId"] == ROW_ID_2


def test_graph_write_creates_missing_graph() -> None:
    """グラフがなければ create_graph で作ること"""
    counts = iter([0, 1])

    def responder(sql: str, _p: Sequence[Any]) -> tuple[list[Any], int] | None:
        """グラフの有無を 0 件→1 件の順に返す。

        Parameters
        ----------
        sql : str
            SQL。
        _p : Sequence[Any]
            パラメーター。

        Returns
        -------
        tuple[list[Any], int] | None
            応答。
        """
        if "ag_graph" in sql:
            return [(next(counts),)], 1
        if "cypher(" in sql:
            return [(1,)], 1
        return None

    db = FakeDb(responder)
    chunk = CoreGraphChunkWritePayload.chunk("f", "p", ROW_ID, 0, "c", "")
    request = _request(
        CoreVectorDbOperation.GRAPH_WRITE,
        graph=CoreGraphWriteSetting.enabled_with("g1"),
        chunk=chunk,
    )
    assert PgVectorCoreVectorDbProvider(db.factory).execute(request).success
    assert db.find("SELECT create_graph")[0][1] == ["g1"]


def test_graph_delete_does_not_create_missing_graph_and_classifies_failure() -> None:
    """Graph 削除はグラフがなくても作らず、分類した失敗の結果にすること"""
    db = FakeDb(lambda sql, _p: ([(0,)], 1) if "ag_graph" in sql else None)
    request = _request(
        CoreVectorDbOperation.GRAPH_DELETE,
        graph=CoreGraphWriteSetting.enabled_with("g1"),
        chunk=CoreGraphChunkWritePayload.delete_ids([ROW_ID]),
    )
    result = PgVectorCoreVectorDbProvider(db.factory).execute(request)
    assert not result.success
    assert db.find("create_graph") == []
    assert result.failure is not None
    assert result.failure.code == "GRAPH_UNAVAILABLE"
    assert result.graph_result is not None
    assert (
        result.graph_result.status == CoreGraphWriteStatus.FAILED_EXTENSION_UNAVAILABLE
    )


def test_graph_delete_when_nothing_deleted_is_absent_skipped() -> None:
    """Graph 削除で何も消えなければ graph_node_unwritten でスキップすること"""

    def responder(sql: str, _p: Sequence[Any]) -> tuple[list[Any], int] | None:
        """グラフはあり、Cypher は 0 行を返す。

        Parameters
        ----------
        sql : str
            SQL。
        _p : Sequence[Any]
            パラメーター。

        Returns
        -------
        tuple[list[Any], int] | None
            応答。
        """
        if "ag_graph" in sql:
            return [(1,)], 1
        if "cypher(" in sql:
            return [], 0
        return None

    result = PgVectorCoreVectorDbProvider(FakeDb(responder).factory).execute(
        _request(
            CoreVectorDbOperation.GRAPH_DELETE,
            graph=CoreGraphWriteSetting.enabled_with("g1"),
            chunk=CoreGraphChunkWritePayload.delete_ids([ROW_ID]),
        )
    )
    assert result.success
    assert result.graph_result is not None
    assert result.graph_result.cause_category == "graph_node_unwritten"


def test_graph_write_with_no_rows_is_malformed_failure() -> None:
    """Graph 書き込みで Cypher が行を返さなければ形式エラーの失敗になること"""

    def responder(sql: str, _p: Sequence[Any]) -> tuple[list[Any], int] | None:
        """グラフはあり、Cypher は 0 行を返す。

        Parameters
        ----------
        sql : str
            SQL。
        _p : Sequence[Any]
            パラメーター。

        Returns
        -------
        tuple[list[Any], int] | None
            応答。
        """
        if "ag_graph" in sql:
            return [(1,)], 1
        if "cypher(" in sql:
            return [], 0
        return None

    result = PgVectorCoreVectorDbProvider(FakeDb(responder).factory).execute(
        _request(
            CoreVectorDbOperation.GRAPH_WRITE,
            graph=CoreGraphWriteSetting.enabled_with("g1"),
            chunk=CoreGraphChunkWritePayload.chunk("f", "p", ROW_ID, 0, "c", ""),
        )
    )
    assert not result.success
    assert result.failure is not None
    assert result.failure.code == "GRAPH_MALFORMED_RESULT"


def test_schema_initializer_runs_idempotent_ddl() -> None:
    """スキーマ初期化は冪等な DDL と索引を作ること"""
    db = FakeDb(lambda sql, _p: ([(False,)], 1) if "pg_constraint" in sql else None)
    PgVectorSchemaInitializer(JdbcTemplate(TARGET, db.factory)).initialize(
        "Vector_Store"
    )
    sqls = db.sqls()
    assert "CREATE EXTENSION IF NOT EXISTS vector" in sqls
    assert any(
        "CREATE TABLE IF NOT EXISTS public.vector_store" in s
        and "filepath text" in s
        and "embedding vector(1536) NOT NULL" in s
        for s in sqls
    )
    assert (
        "ALTER TABLE public.vector_store ADD COLUMN IF NOT EXISTS filepath text" in sqls
    )
    assert (
        "ALTER TABLE public.vector_store ADD COLUMN IF NOT EXISTS embedding vector(1536)"
        in sqls
    )
    assert "ALTER TABLE public.vector_store ADD PRIMARY KEY (id)" in sqls
    assert (
        "CREATE INDEX IF NOT EXISTS vector_store_hnsw_idx ON public.vector_store "
        "USING hnsw (embedding vector_cosine_ops)"
    ) in sqls
    assert "CREATE EXTENSION IF NOT EXISTS pgroonga" in sqls
    assert (
        "CREATE INDEX IF NOT EXISTS vector_store_pgroonga_content_idx ON public.vector_store "
        "USING pgroonga (content)"
    ) in sqls


def test_schema_initializer_keeps_existing_primary_key() -> None:
    """主キーが既にあれば追加しないこと"""
    db = FakeDb(lambda sql, _p: ([(True,)], 1) if "pg_constraint" in sql else None)
    PgVectorSchemaInitializer(JdbcTemplate(TARGET, db.factory)).initialize(
        "vector_store"
    )
    assert "ALTER TABLE public.vector_store ADD PRIMARY KEY (id)" not in db.sqls()


def test_schema_initializer_rejects_unsafe_table_name_before_ddl() -> None:
    """不正なテーブル名は DDL の前に拒否すること"""
    db = FakeDb()
    with pytest.raises(ValueError, match="tableName must match"):
        PgVectorSchemaInitializer(JdbcTemplate(TARGET, db.factory)).initialize(
            "vector-store"
        )
    assert db.calls == []


def test_pgroonga_index_name_is_truncated_to_identifier_limit() -> None:
    """PGroonga の索引名は識別子の上限 63 文字に収まること"""
    long_name = "vector_table_name_that_reaches_postgresql_identifier_limit_123"
    name = pgroonga_content_index_name(long_name)
    assert len(name) <= 63
    assert name.endswith("_pgroonga_content_idx")
    assert (
        pgroonga_content_index_name("vector_store")
        == "vector_store_pgroonga_content_idx"
    )


def test_jdbc_template_escapes_percent_and_converts_placeholders() -> None:
    """実行器は `?` を `%s` にし、元の `%` をエスケープすること"""
    db = FakeDb()
    JdbcTemplate(TARGET, db.factory).update("SELECT 'a%' WHERE x = ?", 1)
    assert db.calls == [("SELECT 'a%%' WHERE x = %s", [1])]
