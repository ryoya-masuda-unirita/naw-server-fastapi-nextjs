"""PostgreSQL への取り込み保存と AGE への投影のテスト。DB には接続せず、偽の接続で SQL を検証する。

移植元の次のテストを移したもの。

- `graphrag/ingestion/JdbcIngestionPersistenceAdapterBoundaryTest`
- `graphrag/ingestion/JdbcBusinessGraphProjectionServiceTest`
- `graphrag/ingestion/JdbcIngestionRuntimeBootstrapWiringTest`
- `graphrag/ingestion/CoreIngestionBranchCoverageTest`（JDBC 側の検査）
"""

import json
from collections.abc import Callable
from types import TracebackType
from typing import Any, Self

import pytest
from generative_ai_core.graphrag.bootstrap import (
    GraphRagRuntimeBootstrapRequest,
    GraphRagRuntimeReadinessResult,
    GraphRagRuntimeTargetDescriptor,
)
from generative_ai_core.graphrag.ingestion import (
    IngestionDeterministicExtractor,
    IngestionRequest,
    IngestionRuntime,
    JdbcBusinessGraphProjectionService,
    JdbcIngestionPersistenceAdapter,
    SourceLifecycleRequest,
    stable_id,
)
from generative_ai_core.graphrag.ingestion.business_graph import (
    BusinessGraphProjectionCommand,
    BusinessGraphProjectionRow,
    _text_list,
)
from generative_ai_core.graphrag.ingestion.llm import LlmCandidateOrigin

Responder = Callable[[str, tuple[Any, ...]], list[tuple[Any, ...]] | None]


class FakeCursor:
    """実行した SQL を記録し、決めた行を返す偽のカーソル。"""

    def __init__(self, connection: "FakeConnection") -> None:
        """接続を受け取る。

        Parameters
        ----------
        connection : FakeConnection
            親の接続。
        """
        self._connection = connection
        self._rows: list[tuple[Any, ...]] = []
        self.rowcount = 1

    def __enter__(self) -> Self:
        """with の開始。

        Returns
        -------
        FakeCursor
            自分自身。
        """
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        """with の終了（何もしない）。

        Parameters
        ----------
        exc_type : type[BaseException] | None
            例外の型。
        exc : BaseException | None
            例外。
        tb : TracebackType | None
            トレースバック。
        """

    def execute(self, sql: str, params: tuple[Any, ...] = ()) -> None:
        """SQL を記録し、応答関数から行を得る。

        Parameters
        ----------
        sql : str
            SQL。
        params : tuple[Any, ...]
            バインドする値。
        """
        self._connection.executed.append((sql, tuple(params)))
        rows = self._connection.responder(sql, tuple(params))
        if rows is None and "information_schema" in sql:
            # 応答関数が決めていなければ、スキーマ確認は「ある」とする
            rows = [(1,)]
        self._rows = list(rows or [])

    def fetchone(self) -> tuple[Any, ...] | None:
        """先頭の行を返す。

        Returns
        -------
        tuple[Any, ...] | None
            行。なければ None。
        """
        return self._rows[0] if self._rows else None

    def fetchall(self) -> list[tuple[Any, ...]]:
        """すべての行を返す。

        Returns
        -------
        list[tuple[Any, ...]]
            行の一覧。
        """
        return self._rows


class FakeConnection:
    """psycopg の接続の代わりの偽物。"""

    def __init__(
        self, responder: Responder | None = None, autocommit: bool = True
    ) -> None:
        """応答関数と自動コミットの状態を受け取る。

        Parameters
        ----------
        responder : Responder | None
            SQL とバインド値から返す行を決める関数。None は何も返さない。
        autocommit : bool
            自動コミットの初期値。
        """
        self.responder: Responder = responder or (lambda sql, params: None)
        self.executed: list[tuple[str, tuple[Any, ...]]] = []
        self.autocommit = autocommit
        self.closed = False
        self.events: list[str] = []

    def cursor(self) -> FakeCursor:
        """カーソルを作る。

        Returns
        -------
        FakeCursor
            偽のカーソル。
        """
        return FakeCursor(self)

    def commit(self) -> None:
        """コミットを記録する。"""
        self.events.append("commit")

    def rollback(self) -> None:
        """ロールバックを記録する。"""
        self.events.append("rollback")

    def statements(self, prefix: str) -> list[tuple[str, tuple[Any, ...]]]:
        """指定した接頭辞で始まる SQL を返す。

        Parameters
        ----------
        prefix : str
            SQL の先頭。

        Returns
        -------
        list[tuple[str, tuple[Any, ...]]]
            該当する SQL とバインド値。
        """
        return [(s, p) for s, p in self.executed if s.startswith(prefix)]


def _ready(request: GraphRagRuntimeBootstrapRequest) -> GraphRagRuntimeReadinessResult:
    """常に準備完了を返すブートストラッパー。

    Parameters
    ----------
    request : GraphRagRuntimeBootstrapRequest
        要求。

    Returns
    -------
    GraphRagRuntimeReadinessResult
        準備完了の結果。
    """
    assert request.target is not None
    return GraphRagRuntimeReadinessResult.make_ready(request.target, ["x"], [])


def _request(**overrides: object) -> IngestionRequest:
    """受け入れられる要求を作る。

    Parameters
    ----------
    **overrides : object
        上書きする項目。

    Returns
    -------
    IngestionRequest
        要求。
    """
    builder = (
        IngestionRequest.builder()
        .tenant_id("tenant")
        .source_ref("source")
        .normalized_body(
            "body [[ENTITY:Feature:a]] [[ENTITY:Team:b]] [[EDGE:a->b:OWNS]] DOC-2024-0001"
        )
    )
    for name, value in overrides.items():
        getattr(builder, name)(value)
    return builder.build()


def _adapter(
    connection: FakeConnection, projections: list[str] | None = None
) -> JdbcIngestionPersistenceAdapter:
    """偽の接続で保存先を作る（投影は記録だけ行う）。

    Parameters
    ----------
    connection : FakeConnection
        偽の接続。
    projections : list[str] | None
        投影したチャンク ID の記録先。

    Returns
    -------
    JdbcIngestionPersistenceAdapter
        保存先。
    """

    class Recorder:
        """投影の呼び出しを記録する。"""

        def project_accepted_chunk(
            self, request: IngestionRequest, chunk_id: str
        ) -> int:
            """チャンク ID を記録する。

            Parameters
            ----------
            request : IngestionRequest
                要求。
            chunk_id : str
                チャンク ID。

            Returns
            -------
            int
                常に 0。
            """
            if projections is not None:
                projections.append(chunk_id)
            return 0

    return JdbcIngestionPersistenceAdapter(
        connection,  # type: ignore[arg-type]
        "g1",
        _ready,
        Recorder(),
    )


def test_persist_inserts_in_one_transaction_and_counts_actual_rows() -> None:
    """保存は 1 つのトランザクションで、実際に挿入した件数を結果に入れること"""
    connection = FakeConnection()
    projections: list[str] = []
    runtime = IngestionRuntime(_adapter(connection, projections))
    result = runtime.ingest(_request())
    assert result.accepted
    assert (
        result.documents_created,
        result.versions_created,
        result.chunks_created,
    ) == (1, 1, 1)
    assert (
        result.identifiers_created,
        result.entities_created,
        result.edges_created,
    ) == (1, 2, 1)
    assert result.evidence_created == 1
    assert result.embedding_queue_rows_created == 1
    assert result.outbox_rows_created == 1
    assert result.acl_materialization_rows_created == 1
    assert connection.events == ["commit"]
    assert connection.autocommit is True
    assert projections == [result.chunk_id]
    tenant_context = connection.statements("select set_config")[0]
    assert tenant_context[1] == ("tenant", "tenant")
    assert "set_config('app.tenant_id'" in tenant_context[0]
    inserts = [
        s.split("(")[0].strip()
        for s, _ in connection.executed
        if s.startswith("insert")
    ]
    assert inserts[:3] == [
        "insert into graphrag_s02.documents",
        "insert into graphrag_s02.document_versions",
        "insert into graphrag_s02.chunks",
    ]
    doc_params = connection.statements("insert into graphrag_s02.documents")[0][1]
    assert doc_params[:2] == ("tenant", stable_id("doc", "tenant:source"))
    assert doc_params[7] == []  # acl_principal_ids


def test_persist_is_idempotent_when_the_current_version_has_the_same_content() -> None:
    """現行バージョンと同じ内容なら何も挿入せず、冪等の結果になること"""
    request = _request()
    content_hash = stable_id("content", request.normalized_body)

    def responder(sql: str, params: tuple[Any, ...]) -> list[tuple[Any, ...]] | None:
        """現行バージョンがある DB。

        Parameters
        ----------
        sql : str
            SQL。
        params : tuple[Any, ...]
            バインドする値。

        Returns
        -------
        list[tuple[Any, ...]] | None
            行。
        """
        if sql.startswith("select v.version_id"):
            return [("v-current", content_hash, "c-current")]
        return None

    connection = FakeConnection(responder)
    result = IngestionRuntime(_adapter(connection)).ingest(request)
    assert result.accepted and result.idempotent
    assert result.document_version_id == "v-current" and result.chunk_id == "c-current"
    assert result.zero_state()
    assert not connection.statements("insert")
    assert not connection.statements("update")


def test_persist_replacement_marks_old_rows_stale_first() -> None:
    """内容が変わったときは、古い現行の行を先に古い扱いにしてから挿入すること"""

    def responder(sql: str, params: tuple[Any, ...]) -> list[tuple[Any, ...]] | None:
        """内容の違う現行バージョンがある DB。

        Parameters
        ----------
        sql : str
            SQL。
        params : tuple[Any, ...]
            バインドする値。

        Returns
        -------
        list[tuple[Any, ...]] | None
            行。
        """
        if sql.startswith("select v.version_id"):
            return [("v-old", "content-old", "c-old")]
        return None

    connection = FakeConnection(responder)
    result = IngestionRuntime(_adapter(connection)).ingest(_request())
    assert result.accepted and result.stale_versions == 1 and result.stale_chunks == 1
    assert result.chunk_diff_summary is not None
    assert result.chunk_diff_summary.previous_content_hash == "content-old"
    kinds = [
        s.split(" set ")[0] if s.startswith("update") else "insert"
        for s, _ in connection.executed
        if s.startswith(("update", "insert"))
    ]
    assert kinds[:2] == [
        "update graphrag_s02.document_versions",
        "update graphrag_s02.chunks",
    ]


def test_persist_rolls_back_and_restores_autocommit_on_failure() -> None:
    """保存で例外が起きたらロールバックし、自動コミットを元に戻して PERSISTENCE_FAILURE にすること"""

    def responder(sql: str, params: tuple[Any, ...]) -> list[tuple[Any, ...]] | None:
        """チャンクの挿入で失敗する DB。

        Parameters
        ----------
        sql : str
            SQL。
        params : tuple[Any, ...]
            バインドする値。

        Raises
        ------
        RuntimeError
            チャンクの挿入のとき。
        """
        if sql.startswith("insert into graphrag_s02.chunks "):
            raise RuntimeError("insert failed password=hunter2")
        return None

    connection = FakeConnection(responder)
    result = IngestionRuntime(_adapter(connection)).ingest(_request())
    assert not result.accepted and result.failure_code == "PERSISTENCE_FAILURE"
    assert (
        result.failure_summary is not None and "hunter2" not in result.failure_summary
    )
    assert connection.events == ["rollback"]
    assert connection.autocommit is True


def test_persist_keeps_a_non_autocommit_connection_non_autocommit() -> None:
    """自動コミットでない接続は、そのまま使ってコミットすること"""
    connection = FakeConnection(autocommit=False)
    IngestionRuntime(_adapter(connection)).ingest(_request())
    assert connection.autocommit is False and connection.events == ["commit"]


def test_llm_origins_are_inserted_with_the_request_acl() -> None:
    """LLM 候補の由来が、要求の ACL 付きで llm_candidate_origins に入ること"""
    connection = FakeConnection()
    adapter = _adapter(connection)
    request = _request()
    from generative_ai_core.graphrag.ingestion import IngestionExtraction

    origin = LlmCandidateOrigin(
        "entity", "llm-entity", "chunk-1", "run-1", "candidate", "llm_suggested", "ev-1"
    )
    adapter.persist(request, IngestionExtraction((), (), (), (origin,)))
    rows = connection.statements("insert into graphrag_s02.llm_candidate_origins")
    assert len(rows) == 1
    assert rows[0][1][:4] == ("tenant", "llm-entity", "entity", "chunk-1")
    assert rows[0][1][8:] == (1, "tenant_wide", [], 1)


def test_schema_readiness_checks_bootstrap_tables_and_columns() -> None:
    """スキーマ確認が、準備・テーブル・列の順に調べ、足りなければ理由を返すこと"""
    assert _adapter(FakeConnection(lambda s, p: [(1,)])).schema_readiness().ready

    def no_table(sql: str, params: tuple[Any, ...]) -> list[tuple[Any, ...]] | None:
        """テーブルがない DB。

        Parameters
        ----------
        sql : str
            SQL。
        params : tuple[Any, ...]
            バインドする値。

        Returns
        -------
        list[tuple[Any, ...]] | None
            行。
        """
        return [] if "information_schema.tables" in sql else [(1,)]

    missing = _adapter(FakeConnection(no_table)).schema_readiness()
    assert (missing.ready, missing.status, missing.failure_code) == (
        False,
        "missing",
        "SCHEMA_TABLE_MISSING",
    )

    def no_column(sql: str, params: tuple[Any, ...]) -> list[tuple[Any, ...]] | None:
        """is_current 列がない DB。

        Parameters
        ----------
        sql : str
            SQL。
        params : tuple[Any, ...]
            バインドする値。

        Returns
        -------
        list[tuple[Any, ...]] | None
            行。
        """
        return [] if "information_schema.columns" in sql else [(1,)]

    incompatible = _adapter(FakeConnection(no_column)).schema_readiness()
    assert incompatible.status == "incompatible"
    assert incompatible.failure_code == "SCHEMA_S03_OVERLAY_MISSING"


def test_schema_readiness_reports_bootstrap_failure_and_missing_connection() -> None:
    """準備の失敗はその失敗コードで、接続なし・閉じた接続は SCHEMA_CONNECTION_MISSING になること"""
    seen: list[GraphRagRuntimeBootstrapRequest] = []

    def failing(
        request: GraphRagRuntimeBootstrapRequest,
    ) -> GraphRagRuntimeReadinessResult:
        """準備に失敗するブートストラッパー。

        Parameters
        ----------
        request : GraphRagRuntimeBootstrapRequest
            要求。

        Returns
        -------
        GraphRagRuntimeReadinessResult
            失敗の結果。
        """
        seen.append(request)
        assert request.target is not None
        return GraphRagRuntimeReadinessResult.failed(
            request.target, "missing_extension", [], "no age"
        )

    adapter = JdbcIngestionPersistenceAdapter(FakeConnection(), "g1", failing)  # type: ignore[arg-type]
    readiness = adapter.schema_readiness()
    assert (readiness.status, readiness.failure_code) == ("failed", "missing_extension")
    assert seen[0].mode is not None and seen[0].mode.name == "CREATE_IF_MISSING"
    assert seen[0].graph_name == "g1"
    assert seen[0].target == GraphRagRuntimeTargetDescriptor.sanitized(
        "PostgreSQL", "provider=PostgreSQL;schema=graphrag_s02"
    )
    assert JdbcIngestionPersistenceAdapter(None).schema_readiness().failure_code == (
        "SCHEMA_CONNECTION_MISSING"
    )
    closed = FakeConnection()
    closed.closed = True
    assert (
        _adapter(closed).schema_readiness().failure_code == "SCHEMA_CONNECTION_MISSING"
    )
    with pytest.raises(ValueError, match="safe PostgreSQL identifier"):
        JdbcIngestionPersistenceAdapter(FakeConnection(), "bad-name")  # type: ignore[arg-type]


def _lifecycle_responder(
    version: str, content_hash: str, duplicate: bool = False
) -> Responder:
    """現行バージョンを返す DB の応答関数を作る。

    Parameters
    ----------
    version : str
        現行のバージョン ID。
    content_hash : str
        現行の内容ハッシュ。
    duplicate : bool
        別の文書に同じ内容があるか。

    Returns
    -------
    Responder
        応答関数。
    """

    def responder(sql: str, params: tuple[Any, ...]) -> list[tuple[Any, ...]] | None:
        """現行バージョンと重複を返す。

        Parameters
        ----------
        sql : str
            SQL。
        params : tuple[Any, ...]
            バインドする値。

        Returns
        -------
        list[tuple[Any, ...]] | None
            行。
        """
        if sql.startswith("select v.version_id"):
            return [(version, content_hash, "c-1")]
        if "document_id <> %s" in sql:
            return [(1,)] if duplicate else []
        return None

    return responder


def test_replace_source_registers_a_new_version_in_one_transaction() -> None:
    """置き換えは古い版を古くして、新しい版・チャンク・キューを入れ、コミットすること"""
    connection = FakeConnection(_lifecycle_responder("v-1", "hash-old"))
    result = _adapter(connection).replace_source(
        SourceLifecycleRequest.replace("tenant", "source", "v-1", "hash-new")
    )
    assert result.succeeded and result.previous_version_id == "v-1"
    new_version = stable_id("version", "tenant:source:hash-new")
    assert result.current_version_id == new_version
    assert connection.events == ["commit"]
    assert len(connection.statements("update graphrag_s02.")) == 2
    assert connection.statements("insert into graphrag_s02.embedding_queue")
    chunk_insert = connection.statements("insert into graphrag_s02.chunks ")[0][1]
    assert chunk_insert[3] == stable_id("chunk", f"{new_version}:0:hash-new")


@pytest.mark.parametrize(
    ("responder", "request_hash", "code"),
    [
        (
            _lifecycle_responder("v-1", "hash-old", duplicate=True),
            "hash-new",
            "LIFECYCLE_CONTENT_HASH_COLLISION",
        ),
        (
            _lifecycle_responder("v-1", "hash-old"),
            "hash-old",
            "LIFECYCLE_CONTENT_HASH_UNCHANGED",
        ),
        (
            _lifecycle_responder("v-9", "hash-old"),
            "hash-new",
            "LIFECYCLE_STALE_VERSION",
        ),
        (lambda sql, params: [], "hash-new", "LIFECYCLE_SOURCE_NOT_CURRENT"),
    ],
)
def test_replace_source_fails_closed_and_rolls_back(
    responder: Responder, request_hash: str, code: str
) -> None:
    """置き換えが不可の場合は、失敗コードを返して何も書き込まずロールバックすること"""
    connection = FakeConnection(responder)
    result = _adapter(connection).replace_source(
        SourceLifecycleRequest.replace("tenant", "source", "v-1", request_hash)
    )
    assert result.failure_code == code
    assert "rollback" in connection.events
    assert not connection.statements("insert")
    assert not connection.statements("update")


def test_delete_source_marks_current_rows_stale() -> None:
    """削除は現行のバージョンとチャンクを古い扱いにしてコミットすること"""
    connection = FakeConnection(_lifecycle_responder("v-1", "hash-old"))
    result = _adapter(connection).delete_source(
        SourceLifecycleRequest.delete("tenant", "source", "v-1", "no longer needed")
    )
    assert result.succeeded and result.previous_version_id == "v-1"
    assert len(connection.statements("update graphrag_s02.")) == 2
    assert connection.events == ["commit"]


def test_lifecycle_validation_happens_before_any_sql() -> None:
    """曖昧な対象・不正な理由・不正なハッシュは、SQL を実行する前に失敗すること"""
    connection = FakeConnection()
    adapter = _adapter(connection)
    assert adapter.delete_source(None).failure_code == "LIFECYCLE_TARGET_REQUIRED"  # type: ignore[arg-type]
    assert (
        adapter.delete_source(
            SourceLifecycleRequest.delete("tenant", "C:\\docs\\a.txt", "v1", "reason")
        ).failure_code
        == "LIFECYCLE_PATH_ONLY_SOURCE_REF"
    )
    assert (
        adapter.delete_source(
            SourceLifecycleRequest.delete("tenant", "source:x", "v1", "reason")
        ).failure_code
        == "LIFECYCLE_AMBIGUOUS_SOURCE_REF"
    )
    assert (
        adapter.delete_source(
            SourceLifecycleRequest.delete("tenant", "source", "v1", "password=1")
        ).failure_code
        == "LIFECYCLE_DELETE_REASON_REQUIRED"
    )
    assert (
        adapter.replace_source(
            SourceLifecycleRequest.replace("tenant", "source", "v1", None)
        ).failure_code
        == "LIFECYCLE_CONTENT_HASH_REQUIRED"
    )
    assert (
        adapter.replace_source(
            SourceLifecycleRequest.replace("tenant", "source", "v1", "a/b")
        ).failure_code
        == "LIFECYCLE_CONTENT_HASH_UNSAFE"
    )
    assert connection.executed == []


def _row(**overrides: object) -> BusinessGraphProjectionRow:
    """投影する行を作る。

    Parameters
    ----------
    **overrides : object
        上書きする項目。

    Returns
    -------
    BusinessGraphProjectionRow
        行。
    """
    values: dict[str, Any] = {
        "tenant_id": " tenant ",
        "edge_id": "edge-1",
        "source_entity_id": "e1",
        "source_entity_type": None,
        "source_label_hash": "h1",
        "target_entity_id": "e2",
        "target_entity_type": "Team",
        "target_label_hash": "h2",
        "edge_type": None,
        "edge_status": "candidate",
        "evidence_id": "ev-1",
        "source_chunk_id": "chunk-1",
        "trust_level": None,
        "verification_status": None,
        "classification_rank": 1,
        "acl_mode": None,
        "acl_principal_ids": None,
        "acl_revision": 1,
    }
    values.update(overrides)
    return BusinessGraphProjectionRow(**values)


def test_projection_runs_one_cypher_per_row_with_evidence_linkage() -> None:
    """根拠の連鎖がある行ごとに Cypher を 1 回ずつ実行し、欠けた行は飛ばすこと"""
    commands: list[BusinessGraphProjectionCommand] = []
    service = JdbcBusinessGraphProjectionService(
        lambda tenant, chunk: [_row(), _row(evidence_id=""), _row(edge_id="edge-2")],
        commands.append,
        "g1",
    )
    projected = service.project_accepted_chunk(_request(), "chunk-1")
    assert projected == 2
    first = commands[0]
    assert first.graph_name == "g1"
    assert first.age_cypher_sql().startswith(
        "SELECT * FROM ag_catalog.cypher('g1', $$ MERGE"
    )
    assert first.age_cypher_sql().endswith("$$, %s) AS (edgeId ag_catalog.agtype)")
    assert first.parameters["tenantId"] == "tenant"
    assert first.parameters["sourceEntityType"] == "UNKNOWN"
    assert first.parameters["edgeType"] == "RELATED_TO"
    assert first.parameters["trustLevel"] == "deterministic_extracted"
    assert first.parameters["verificationStatus"] == "candidate"
    assert first.parameters["aclMode"] == "tenant_wide"
    assert first.parameters["aclPrincipalIds"] == []
    assert first.parameters["candidateOnly"] is True
    assert service.project_accepted_chunk(_request(), " ") == 0


def test_projection_executor_sends_agtype_json_parameter() -> None:
    """AGE の実行は LOAD・search_path の後、JSON のパラメーター 1 つで Cypher を呼ぶこと"""
    connection = FakeConnection()
    service = JdbcBusinessGraphProjectionService.from_connection(
        connection,  # type: ignore[arg-type]
        "g1",
    )
    service._reader = lambda tenant, chunk: [_row()]
    assert service.project_accepted_chunk(_request(), "chunk-1") == 1
    statements = [s for s, _ in connection.executed]
    assert statements[0] == "LOAD 'age'"
    assert statements[1].startswith("SET search_path = ag_catalog")
    cypher_sql, params = connection.executed[2]
    assert "ag_catalog.cypher('g1'" in cypher_sql
    assert len(params) == 1 and json.loads(params[0])["edgeId"] == "edge-1"


def test_projection_reader_maps_rows_from_the_join_query() -> None:
    """DB の行を投影する行に変換し、配列は空要素を除いた文字列にすること"""
    connection = FakeConnection(
        lambda sql, params: [
            (
                "tenant",
                "edge-1",
                "e1",
                "Feature",
                "h1",
                "e2",
                "Team",
                "h2",
                "OWNS",
                "candidate",
                "ev-1",
                "chunk-1",
                "llm_suggested",
                "candidate",
                1,
                "tenant_wide",
                ["a", None, " ", 3],
                7,
            )
        ]
    )
    service = JdbcBusinessGraphProjectionService.from_connection(connection)  # type: ignore[arg-type]
    commands: list[BusinessGraphProjectionCommand] = []
    service._executor = commands.append
    assert service.project_accepted_chunk(_request(), "chunk-1") == 1
    assert connection.executed[0][1] == ("tenant", "chunk-1")
    assert commands[0].parameters["aclPrincipalIds"] == ["a", "3"]
    assert commands[0].parameters["aclRevision"] == 7
    assert commands[0].parameters["trustLevel"] == "llm_suggested"
    assert _text_list(None) == () and _text_list("not-array") == ()


def test_default_projection_and_bootstrap_without_connection_are_noops() -> None:
    """接続なしの保存先は、準備と投影が何もしない既定になること"""
    adapter = JdbcIngestionPersistenceAdapter(None)
    assert adapter.schema_readiness().failure_code == "SCHEMA_CONNECTION_MISSING"
    extraction = IngestionDeterministicExtractor().extract("body")
    with pytest.raises(RuntimeError, match="connection is missing"):
        adapter.persist(_request(), extraction)
