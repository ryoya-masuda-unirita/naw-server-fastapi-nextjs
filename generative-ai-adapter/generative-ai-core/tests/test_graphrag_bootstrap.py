"""GraphRAG ランタイムの準備（bootstrap）のテスト。DB には接続せず、偽の接続で SQL を検証する。

移植元の次のテストを移したもの。

- `graphrag/bootstrap/GraphRagRuntimeResourceSetTest`
- `graphrag/bootstrap/GraphRagRuntimeBootstrapServiceTest`
- `graphrag/bootstrap/JdbcGraphRagRuntimeResourceGatewayTest`（代表的な流れ）
"""

from collections.abc import Callable
from types import TracebackType
from typing import Any, Self

import psycopg
import psycopg.errors
import pytest
from generative_ai_core.graphrag.bootstrap import (
    GraphRagRuntimeBootstrapException,
    GraphRagRuntimeBootstrapRequest,
    GraphRagRuntimeBootstrapService,
    GraphRagRuntimeGatewayResult,
    GraphRagRuntimeResourceSet,
    GraphRagRuntimeTargetDescriptor,
    JdbcGraphRagRuntimeResourceGateway,
    ready_noop,
)
from generative_ai_core.graphrag.bootstrap import resource_set as resource_set_module

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
        self._rows = list(self._connection.responder(sql, tuple(params)) or [])

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
            SQL とバインド値から返す行を決める関数。None は常に 1 行返す。
        autocommit : bool
            自動コミットの初期値。
        """
        self.responder: Responder = responder or (lambda sql, params: [(1,)])
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


def _ready_responder(sql: str, params: tuple[Any, ...]) -> list[tuple[Any, ...]] | None:
    """すべてのリソースが揃っている DB の応答。

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
    if "format_type" in sql:
        return [("vector(1536)",)]
    if "relrowsecurity" in sql:
        return [("t:t",)]
    return [(1,)]


def _gateway(connection: FakeConnection) -> JdbcGraphRagRuntimeResourceGateway:
    """偽の接続でゲートウェイを作る。

    Parameters
    ----------
    connection : FakeConnection
        偽の接続。

    Returns
    -------
    JdbcGraphRagRuntimeResourceGateway
        ゲートウェイ。
    """
    return JdbcGraphRagRuntimeResourceGateway(connection)  # type: ignore[arg-type]


def _target() -> GraphRagRuntimeTargetDescriptor:
    """テスト用の準備先を返す。

    Returns
    -------
    GraphRagRuntimeTargetDescriptor
        準備先。
    """
    return GraphRagRuntimeTargetDescriptor.sanitized(
        "PostgreSQL", "provider=PostgreSQL"
    )


def _safe_statements(sql: str) -> list[str]:
    """実行してよい文だけを取り出す（内部関数を直接検査する）。

    Parameters
    ----------
    sql : str
        SQL。

    Returns
    -------
    list[str]
        実行してよい文。
    """
    return resource_set_module._runtime_safe_statements(sql)


def test_canonical_graph_name_defaults_and_validation() -> None:
    """グラフ名は既定が production のグラフで、安全でない識別子は拒否されること"""
    assert (
        GraphRagRuntimeResourceSet.canonical().graph_name() == "secuaigent_core_graph"
    )
    assert (
        GraphRagRuntimeResourceSet.canonical("").graph_name() == "secuaigent_core_graph"
    )
    assert GraphRagRuntimeResourceSet.canonical("embedding_graph").graph_name() == (
        "embedding_graph"
    )
    for unsafe in ("bad-name", "1abc", "a;drop", "x" * 64):
        with pytest.raises(ValueError, match="safe PostgreSQL identifier"):
            GraphRagRuntimeResourceSet.canonical(unsafe)


def test_canonical_sql_applies_foundation_before_runtime_schema() -> None:
    """標準の SQL が基盤スキーマ → ランタイムスキーマの順で、拡張機能も作ること"""
    sql = GraphRagRuntimeResourceSet.canonical().canonical_sql()
    assert "create schema if not exists graphrag_s01" in sql
    assert sql.index("create schema if not exists graphrag_s01") < sql.index(
        "create schema if not exists graphrag_s02"
    )
    assert "create extension if not exists pgroonga" in sql
    assert "create extension if not exists age" in sql
    assert "create role graphrag_s01_app login nobypassrls" in sql
    assert "create or replace function graphrag_s01.set_request_context" in sql
    assert "create policy tenants_default_context_policy" in sql


def test_canonical_statements_exclude_destructive_statements() -> None:
    """標準の文に、破壊的な文や承認されていない policy が含まれないこと"""
    statements = GraphRagRuntimeResourceSet.canonical().canonical_statements()
    assert statements
    for statement in statements:
        assert not statement.startswith(
            ("drop ", "truncate ", "delete from ", "update ")
        )
        assert not statement.startswith(
            "create policy documents_s02_tenant_acl_policy "
        )


def test_runtime_safety_allows_only_canonical_seeds_and_policies() -> None:
    """承認済みのシード・policy・DO ブロックだけが通り、それ以外は落ちること"""
    assert (
        _safe_statements("insert into public.not_canonical (id) values ('leak');") == []
    )
    assert (
        _safe_statements(
            "create policy not_canonical on public.not_canonical using (true);"
        )
        == []
    )
    assert _safe_statements("do $$\nbegin\n  execute 'grant x to y';\nend\n$$;") == []
    assert _safe_statements(
        "update graphrag_s02.documents set status = 'x';\nselect 1;"
    ) == ["select 1"]
    non_canonical_policy = (
        "create policy users_default_context_policy on graphrag_s01.users "
        "using (tenant_id = current_setting('graphrag.tenant_id', true) and true);"
    )
    assert _safe_statements(non_canonical_policy) == []


def test_bootstrap_safe_statement_branches() -> None:
    """関数の作成は承認済みの 2 つだけ、破壊的な文・未承認の insert は不可であること"""
    safe = resource_set_module._is_bootstrap_safe_statement
    assert safe(
        "create or replace function graphrag_s01.set_request_context() returns void"
    )
    assert safe(
        "create or replace function graphrag_s01.clear_request_context() returns void"
    )
    assert not safe("create or replace function public.unsafe() returns void")
    for statement in (
        "drop table graphrag_s02.documents",
        "truncate graphrag_s02.documents",
        "delete from graphrag_s02.documents",
        "insert into public.unsafe values ('x')",
    ):
        assert not safe(statement)


def test_resource_names_are_unique_and_cover_the_graph() -> None:
    """確認対象のリソース名が重複せず、AGE グラフを含むこと"""
    resources = GraphRagRuntimeResourceSet.canonical("g1").resource_names()
    assert len(resources) == len(set(resources))
    assert resources[-1] == "age-graph:g1"
    assert "pgvector:graphrag_s02.chunk_embeddings.embedding" in resources


def test_gateway_verify_only_checks_without_running_ddl() -> None:
    """VERIFY_ONLY は確認だけを行い、DDL を実行しないこと"""
    connection = FakeConnection(_ready_responder)
    result = _gateway(connection).ensure(
        GraphRagRuntimeBootstrapRequest.verify_only(_target(), "g1"),
        GraphRagRuntimeResourceSet.canonical("g1"),
    )
    assert isinstance(result, GraphRagRuntimeGatewayResult)
    assert result.created_resources == ()
    sqls = " ".join(sql for sql, _ in connection.executed)
    assert "create extension" not in sqls and "create_graph" not in sqls
    assert (
        "select 1 from pg_extension where extname = %s",
        ("age",),
    ) in connection.executed


def test_gateway_create_if_missing_runs_ddl_and_creates_the_graph() -> None:
    """CREATE_IF_MISSING は、テーブルがなければ DDL を実行し、グラフがなければ作ること"""
    state = {"created": False, "ddl": False}

    def responder(sql: str, params: tuple[Any, ...]) -> list[tuple[Any, ...]] | None:
        """DDL を実行するまでテーブルがなく、グラフ作成までグラフがない DB。

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
        if sql.startswith(("create ", "do $$")):
            state["ddl"] = True
        if "create_graph" in sql:
            state["created"] = True
        if "information_schema.tables" in sql and not state["ddl"]:
            return []
        if "ag_catalog.ag_graph" in sql:
            return [(1,)] if state["created"] else []
        return _ready_responder(sql, params)

    connection = FakeConnection(responder, autocommit=False)
    _gateway(connection).ensure(
        GraphRagRuntimeBootstrapRequest.create_if_missing(_target(), "g1"),
        GraphRagRuntimeResourceSet.canonical("g1"),
    )
    assert state["ddl"] and state["created"]
    assert "commit" in connection.events
    executed = [sql for sql, _ in connection.executed]
    assert "load 'age'" in executed
    assert "select create_graph('g1')" in executed


@pytest.mark.parametrize(
    ("missing", "code"),
    [
        ("pg_extension", "missing_extension"),
        ("information_schema.tables", "incompatible_schema"),
        ("pg_policies", "incompatible_schema"),
        ("pg_roles", "incompatible_schema"),
        ("pg_indexes", "incompatible_schema"),
        ("ag_catalog.ag_graph", "age_graph_unavailable"),
    ],
)
def test_gateway_reports_missing_resources_with_failure_codes(
    missing: str, code: str
) -> None:
    """足りないリソースごとに、対応する失敗コードの例外になること"""

    def responder(sql: str, params: tuple[Any, ...]) -> list[tuple[Any, ...]] | None:
        """指定したカタログだけ空を返す DB。

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
        return [] if missing in sql else _ready_responder(sql, params)

    with pytest.raises(GraphRagRuntimeBootstrapException) as info:
        _gateway(FakeConnection(responder)).ensure(
            GraphRagRuntimeBootstrapRequest.verify_only(_target(), "g1"),
            GraphRagRuntimeResourceSet.canonical("g1"),
        )
    assert info.value.failure_code == code


def test_gateway_rejects_wrong_vector_dimension_missing_rls_and_closed_connection() -> (
    None
):
    """vector の次元違い・RLS 無効・閉じた接続は incompatible_schema になること"""
    request = GraphRagRuntimeBootstrapRequest.verify_only(_target(), "g1")
    resource_set = GraphRagRuntimeResourceSet.canonical("g1")

    def wrong_dimension(
        sql: str, params: tuple[Any, ...]
    ) -> list[tuple[Any, ...]] | None:
        """次元が違う DB。

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
        return (
            [("vector(3)",)] if "format_type" in sql else _ready_responder(sql, params)
        )

    def rls_off(sql: str, params: tuple[Any, ...]) -> list[tuple[Any, ...]] | None:
        """RLS が無効な DB。

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
        return [("t:f",)] if "relrowsecurity" in sql else _ready_responder(sql, params)

    for responder in (wrong_dimension, rls_off):
        with pytest.raises(
            GraphRagRuntimeBootstrapException, match="incompatible|RLS"
        ) as info:
            _gateway(FakeConnection(responder)).ensure(request, resource_set)
        assert info.value.failure_code == "incompatible_schema"
    closed = FakeConnection(_ready_responder)
    closed.closed = True
    with pytest.raises(GraphRagRuntimeBootstrapException, match="connection is closed"):
        _gateway(closed).ensure(request, resource_set)


def test_gateway_maps_sql_errors() -> None:
    """権限不足・拡張なしの SQL エラーが、対応する失敗コードに変換されること"""

    def denied(sql: str, params: tuple[Any, ...]) -> list[tuple[Any, ...]] | None:
        """権限エラーを起こす DB。

        Parameters
        ----------
        sql : str
            SQL。
        params : tuple[Any, ...]
            バインドする値。

        Raises
        ------
        psycopg.errors.InsufficientPrivilege
            常に送出する。
        """
        raise psycopg.errors.InsufficientPrivilege("permission denied for table x")

    def no_extension(sql: str, params: tuple[Any, ...]) -> list[tuple[Any, ...]] | None:
        """拡張機能がないエラーを起こす DB。

        Parameters
        ----------
        sql : str
            SQL。
        params : tuple[Any, ...]
            バインドする値。

        Raises
        ------
        psycopg.errors.UndefinedFile
            常に送出する。
        """
        raise psycopg.errors.UndefinedFile('could not access file "$libdir/vector"')

    request = GraphRagRuntimeBootstrapRequest.verify_only(_target(), "g1")
    resource_set = GraphRagRuntimeResourceSet.canonical("g1")
    for responder, code in (
        (denied, "insufficient_privilege"),
        (no_extension, "missing_extension"),
    ):
        with pytest.raises(GraphRagRuntimeBootstrapException) as info:
            _gateway(FakeConnection(responder)).ensure(request, resource_set)
        assert info.value.failure_code == code


def test_service_returns_ready_result_with_resources() -> None:
    """準備に成功したら、確認したリソース付きの ready の結果を返すこと"""
    service = GraphRagRuntimeBootstrapService.jdbc(FakeConnection(_ready_responder))  # type: ignore[arg-type]
    result = service.bootstrap(
        GraphRagRuntimeBootstrapRequest.verify_only(_target(), "g1")
    )
    assert result.ready and result.status == "ready" and result.failure_code is None
    assert "age-graph:g1" in result.resources_checked
    assert "GraphRAG runtime ready" in (result.sanitized_evidence or "")


def test_service_turns_failures_into_sanitized_failed_results() -> None:
    """失敗は例外にせず、SQL・カタログ名を伏せた failed の結果にすること"""

    class Failing:
        """SQL 付きのメッセージで失敗するゲートウェイ。"""

        def ensure(
            self,
            request: GraphRagRuntimeBootstrapRequest,
            resource_set: GraphRagRuntimeResourceSet,
        ) -> GraphRagRuntimeGatewayResult:
            """常に失敗する。

            Parameters
            ----------
            request : GraphRagRuntimeBootstrapRequest
                要求。
            resource_set : GraphRagRuntimeResourceSet
                リソース一式。

            Raises
            ------
            GraphRagRuntimeBootstrapException
                常に送出する。
            """
            raise GraphRagRuntimeBootstrapException.incompatible_schema(
                "failed: select * from ag_catalog.ag_graph; password=hunter2"
            )

    result = GraphRagRuntimeBootstrapService(Failing()).bootstrap(None)
    assert not result.ready and result.status == "failed"
    assert result.failure_code == "incompatible_schema"
    evidence = result.sanitized_evidence or ""
    assert "[SQL_REDACTED]" in evidence
    assert "hunter2" not in evidence and "ag_catalog" not in evidence
    assert result.forbidden_content_scan_status == "PASS"


def test_service_maps_unexpected_runtime_errors_to_unknown_sanitized() -> None:
    """想定外の RuntimeError は unknown_sanitized の failed になること"""

    class Failing:
        """想定外のエラーを起こすゲートウェイ。"""

        def ensure(
            self,
            request: GraphRagRuntimeBootstrapRequest,
            resource_set: GraphRagRuntimeResourceSet,
        ) -> GraphRagRuntimeGatewayResult:
            """常に失敗する。

            Parameters
            ----------
            request : GraphRagRuntimeBootstrapRequest
                要求。
            resource_set : GraphRagRuntimeResourceSet
                リソース一式。

            Raises
            ------
            RuntimeError
                常に送出する。
            """
            raise RuntimeError("boom")

    result = GraphRagRuntimeBootstrapService(Failing()).bootstrap(
        GraphRagRuntimeBootstrapRequest.verify_only(_target(), "g1")
    )
    assert result.failure_code == "unknown_sanitized"


def test_ready_noop_reports_ready_without_touching_a_database() -> None:
    """ready_noop は DB に触れず、リソース一式を確認済みとして準備完了を返すこと"""
    request = GraphRagRuntimeBootstrapRequest.verify_only(_target(), "g1")
    result = ready_noop(request)
    assert result.ready and result.created_resources == ()
    assert (
        result.resources_checked
        == GraphRagRuntimeResourceSet.canonical("g1").resource_names()
    )


def test_bootstrap_request_defaults() -> None:
    """要求の省略した項目に、移植元と同じ既定値が入ること"""
    request = GraphRagRuntimeBootstrapRequest(None, None, None, None)
    assert request.mode is not None and request.mode.name == "VERIFY_ONLY"
    assert request.graph_name == "secuaigent_core_graph"
    assert request.target is not None and request.target.provider == "PostgreSQL"
    assert request.resource_set is not None
