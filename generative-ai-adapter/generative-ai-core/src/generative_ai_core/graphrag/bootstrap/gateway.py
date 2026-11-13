"""GraphRAG ランタイムの確認・作成と、それを呼ぶサービス（移植元 JdbcGraphRagRuntimeResourceGateway ほか）。

JDBC の `Connection` の代わりに psycopg 3 の接続を受け取る。移植元の JDBC は既定が
自動コミットのため、`psycopg.connect(..., autocommit=True)` で作った接続を渡す
（自動コミットでない接続なら、作成した後にコミットする）。
"""

import logging
from collections.abc import Callable
from typing import Any, Protocol

import psycopg

from generative_ai_core.graphrag.bootstrap.models import (
    GraphRagRuntimeBootstrapException,
    GraphRagRuntimeBootstrapMode,
    GraphRagRuntimeBootstrapRequest,
    GraphRagRuntimeGatewayResult,
    GraphRagRuntimeReadinessResult,
    GraphRagRuntimeTargetDescriptor,
)
from generative_ai_core.graphrag.bootstrap.resource_set import (
    FOUNDATION_SCHEMA,
    SCHEMA,
    GraphRagRuntimeResourceSet,
)

logger = logging.getLogger(__name__)

REQUIRED_EXTENSIONS = ("vector", "pgroonga", "age")
EXPECTED_EMBEDDING_TYPE = "vector(1536)"
INSUFFICIENT_PRIVILEGE_SQLSTATE = "42501"
TABLE_EXISTS_SQL = "select 1 from information_schema.tables where table_schema = %s and table_name = %s"
FOUNDATION_RLS_SQL = (
    "select case when c.relrowsecurity then 't' else 'f' end || ':' || "
    "case when c.relforcerowsecurity then 't' else 'f' end "
    "from pg_class c "
    "join pg_namespace n on n.oid = c.relnamespace "
    "where n.nspname = %s and c.relname = %s and c.relkind = 'r'"
)
PGVECTOR_COLUMN_SQL = (
    "select format_type(a.atttypid, a.atttypmod) "
    "from pg_attribute a "
    "join pg_class c on c.oid = a.attrelid "
    "join pg_namespace n on n.oid = c.relnamespace "
    "where n.nspname = %s and c.relname = %s and a.attname = %s "
    "and not a.attisdropped"
)


class GraphRagRuntimeResourceGateway(Protocol):
    """ランタイムのリソースを確認・作成するもの。"""

    def ensure(
        self,
        request: GraphRagRuntimeBootstrapRequest,
        resource_set: GraphRagRuntimeResourceSet,
    ) -> GraphRagRuntimeGatewayResult:
        """リソースを確認し、要求に応じて作る。

        Parameters
        ----------
        request : GraphRagRuntimeBootstrapRequest
            準備の要求。
        resource_set : GraphRagRuntimeResourceSet
            必要なリソース一式。

        Returns
        -------
        GraphRagRuntimeGatewayResult
            確認・作成したリソース。
        """
        ...


GraphRagRuntimeBootstrapper = Callable[
    [GraphRagRuntimeBootstrapRequest], GraphRagRuntimeReadinessResult
]
"""要求から準備の結果を返す関数（移植元 GraphRagRuntimeBootstrapper）。"""


def map_sql_exception(exception: psycopg.Error) -> GraphRagRuntimeBootstrapException:
    """SQL の例外を、失敗コード付きの準備の例外にする。

    Parameters
    ----------
    exception : psycopg.Error
        psycopg の例外。

    Returns
    -------
    GraphRagRuntimeBootstrapException
        権限不足・拡張なし・AGE 不可・スキーマ不一致のいずれかの例外。
    """
    state = exception.sqlstate or ""
    message = str(exception)
    normalized = message.lower()
    if state == INSUFFICIENT_PRIVILEGE_SQLSTATE or "permission denied" in normalized:
        return GraphRagRuntimeBootstrapException.insufficient_privilege(message)
    if (
        "extension" in normalized
        or "control file" in normalized
        or "could not access file" in normalized
    ):
        return GraphRagRuntimeBootstrapException.missing_extension(message)
    if "ag_catalog" in normalized or "age" in normalized:
        return GraphRagRuntimeBootstrapException.age_graph_unavailable(message)
    return GraphRagRuntimeBootstrapException.from_sql("incompatible_schema", exception)


class JdbcGraphRagRuntimeResourceGateway:
    """PostgreSQL の接続で、拡張機能・スキーマ・テーブル・インデックス・AGE グラフを確認・作成する。"""

    def __init__(self, connection: "psycopg.Connection[Any]") -> None:
        """接続を受け取る。

        Parameters
        ----------
        connection : psycopg.Connection
            PostgreSQL の接続。

        Raises
        ------
        ValueError
            接続が None のとき。
        """
        if connection is None:
            raise ValueError("connection")
        self._connection = connection

    def ensure(
        self,
        request: GraphRagRuntimeBootstrapRequest,
        resource_set: GraphRagRuntimeResourceSet,
    ) -> GraphRagRuntimeGatewayResult:
        """リソースを確認し、`CREATE_IF_MISSING` なら足りないものを作る。

        Parameters
        ----------
        request : GraphRagRuntimeBootstrapRequest
            準備の要求。
        resource_set : GraphRagRuntimeResourceSet
            必要なリソース一式。

        Returns
        -------
        GraphRagRuntimeGatewayResult
            確認したリソース。

        Raises
        ------
        GraphRagRuntimeBootstrapException
            リソースが足りない・合わないとき、または SQL が失敗したとき。
        """
        try:
            if self._connection.closed:
                raise GraphRagRuntimeBootstrapException.incompatible_schema(
                    "connection is closed"
                )
            if request.mode == GraphRagRuntimeBootstrapMode.CREATE_IF_MISSING:
                if not self._non_graph_resources_ready():
                    self._execute_canonical_sql(resource_set)
                self._ensure_age_graph(resource_set.graph_name())
            self._verify_extensions()
            self._verify_foundation_resources(resource_set)
            self._verify_tables(resource_set)
            self._verify_pgvector_column()
            for index in resource_set.pgroonga_indexes():
                self._verify_index(index, "required pgroonga index unavailable: ")
            for index in resource_set.btree_indexes():
                self._verify_index(index, "required runtime index unavailable: ")
            self._verify_age_graph(resource_set.graph_name())
            return GraphRagRuntimeGatewayResult.ready(resource_set.resource_names(), ())
        except GraphRagRuntimeBootstrapException:
            raise
        except psycopg.Error as exception:
            self._rollback_quietly()
            raise map_sql_exception(exception) from exception

    def _exists(self, sql: str, params: tuple[object, ...]) -> bool:
        """問い合わせが 1 行以上返すか。

        Parameters
        ----------
        sql : str
            SQL。
        params : tuple[object, ...]
            バインドする値。

        Returns
        -------
        bool
            1 行以上あれば True。
        """
        with self._connection.cursor() as cursor:
            cursor.execute(sql, params)
            return cursor.fetchone() is not None

    def _rollback_quietly(self) -> None:
        """失敗したトランザクションを取り消す（できなくても無視する）。"""
        try:
            if not self._connection.closed and not self._connection.autocommit:
                self._connection.rollback()
        except psycopg.Error:
            logger.debug("rollback after bootstrap failure failed", exc_info=True)

    def _non_graph_resources_ready(self) -> bool:
        """グラフ以外の主要テーブルが揃っているか。

        Returns
        -------
        bool
            揃っていれば True。確認で SQL が失敗したら False。
        """
        try:
            return (
                self._exists(TABLE_EXISTS_SQL, (FOUNDATION_SCHEMA, "tenants"))
                and self._exists(TABLE_EXISTS_SQL, (SCHEMA, "documents"))
                and self._exists(TABLE_EXISTS_SQL, (SCHEMA, "chunk_embeddings"))
            )
        except psycopg.Error:
            self._rollback_quietly()
            return False

    def _execute_canonical_sql(self, resource_set: GraphRagRuntimeResourceSet) -> None:
        """実行してよいマイグレーションの文を順に実行する。

        Parameters
        ----------
        resource_set : GraphRagRuntimeResourceSet
            必要なリソース一式。
        """
        with self._connection.cursor() as cursor:
            for sql in resource_set.canonical_statements():
                cursor.execute(sql)
        self._commit_if_needed()

    def _commit_if_needed(self) -> None:
        """自動コミットでない接続ならコミットする。"""
        if not self._connection.autocommit:
            self._connection.commit()

    def _verify_extensions(self) -> None:
        """必要な拡張機能が入っているか確認する。

        Raises
        ------
        GraphRagRuntimeBootstrapException
            入っていないとき。
        """
        for extension in REQUIRED_EXTENSIONS:
            if not self._exists(
                "select 1 from pg_extension where extname = %s", (extension,)
            ):
                raise GraphRagRuntimeBootstrapException.missing_extension(
                    f"required extension unavailable: {extension}"
                )

    def _verify_foundation_resources(
        self, resource_set: GraphRagRuntimeResourceSet
    ) -> None:
        """基盤のテーブル・RLS・関数・ポリシー・ロールを確認する。

        Parameters
        ----------
        resource_set : GraphRagRuntimeResourceSet
            必要なリソース一式。

        Raises
        ------
        GraphRagRuntimeBootstrapException
            足りない・合わないとき。
        """
        for table in resource_set.foundation_tables():
            if not self._exists(TABLE_EXISTS_SQL, (FOUNDATION_SCHEMA, table)):
                raise GraphRagRuntimeBootstrapException.incompatible_schema(
                    f"required foundation table unavailable: {table}"
                )
        for table in resource_set.foundation_rls_protected_tables():
            with self._connection.cursor() as cursor:
                cursor.execute(FOUNDATION_RLS_SQL, (FOUNDATION_SCHEMA, table))
                row = cursor.fetchone()
            if row is None:
                raise GraphRagRuntimeBootstrapException.incompatible_schema(
                    f"required foundation table unavailable for RLS verification: {table}"
                )
            if row[0] != "t:t":
                raise GraphRagRuntimeBootstrapException.incompatible_schema(
                    f"required foundation RLS unavailable: {table}"
                )
        for function in resource_set.foundation_functions():
            if not self._exists(
                "select 1 from information_schema.routines "
                "where routine_schema = %s and routine_name = %s",
                (FOUNDATION_SCHEMA, function),
            ):
                raise GraphRagRuntimeBootstrapException.incompatible_schema(
                    f"required foundation function unavailable: {function}"
                )
        for policy in resource_set.foundation_policy_names():
            if not self._exists(
                "select 1 from pg_policies where schemaname = %s and policyname = %s",
                (FOUNDATION_SCHEMA, policy),
            ):
                raise GraphRagRuntimeBootstrapException.incompatible_schema(
                    f"required foundation policy unavailable: {policy}"
                )
        for role in resource_set.foundation_roles():
            if not self._exists("select 1 from pg_roles where rolname = %s", (role,)):
                raise GraphRagRuntimeBootstrapException.incompatible_schema(
                    f"required foundation role unavailable: {role}"
                )

    def _verify_tables(self, resource_set: GraphRagRuntimeResourceSet) -> None:
        """ランタイムのテーブルが揃っているか確認する。

        Parameters
        ----------
        resource_set : GraphRagRuntimeResourceSet
            必要なリソース一式。

        Raises
        ------
        GraphRagRuntimeBootstrapException
            足りないとき。
        """
        for table in resource_set.runtime_tables():
            if not self._exists(TABLE_EXISTS_SQL, (SCHEMA, table)):
                raise GraphRagRuntimeBootstrapException.incompatible_schema(
                    f"required table unavailable: {table}"
                )

    def _verify_pgvector_column(self) -> None:
        """`chunk_embeddings.embedding` が vector(1536) か確認する。

        Raises
        ------
        GraphRagRuntimeBootstrapException
            列がない・型が違うとき。
        """
        with self._connection.cursor() as cursor:
            cursor.execute(
                PGVECTOR_COLUMN_SQL, (SCHEMA, "chunk_embeddings", "embedding")
            )
            row = cursor.fetchone()
        if row is None:
            raise GraphRagRuntimeBootstrapException.incompatible_schema(
                "required pgvector column unavailable: chunk_embeddings.embedding"
            )
        normalized = (row[0] or "").replace('"', "").lower()
        if normalized != EXPECTED_EMBEDDING_TYPE and not normalized.endswith(
            f".{EXPECTED_EMBEDDING_TYPE}"
        ):
            raise GraphRagRuntimeBootstrapException.incompatible_schema(
                "required pgvector column incompatible: chunk_embeddings.embedding"
            )

    def _verify_index(self, index: str, failure_prefix: str) -> None:
        """インデックスがあるか確認する。

        Parameters
        ----------
        index : str
            インデックス名。
        failure_prefix : str
            失敗メッセージの前半。

        Raises
        ------
        GraphRagRuntimeBootstrapException
            ないとき。
        """
        if not self._exists(
            "select 1 from pg_indexes where schemaname = %s and indexname = %s",
            (SCHEMA, index),
        ):
            raise GraphRagRuntimeBootstrapException.incompatible_schema(
                f"{failure_prefix}{index}"
            )

    def _ensure_age_graph(self, graph_name: str) -> None:
        """AGE のグラフがなければ作る。

        Parameters
        ----------
        graph_name : str
            グラフ名（`GraphRagRuntimeResourceSet` で検査済み）。

        Raises
        ------
        GraphRagRuntimeBootstrapException
            グラフを作れないとき。
        """
        if self._age_graph_exists(graph_name):
            return
        try:
            with self._connection.cursor() as cursor:
                cursor.execute("load 'age'")
                cursor.execute('set search_path = ag_catalog, "$user", public')
                cursor.execute(f"select create_graph('{graph_name}')")
            self._commit_if_needed()
        except psycopg.Error as exception:
            self._rollback_quietly()
            raise GraphRagRuntimeBootstrapException.age_graph_unavailable(
                str(exception)
            ) from exception

    def _verify_age_graph(self, graph_name: str) -> None:
        """AGE のグラフがあるか確認する。

        Parameters
        ----------
        graph_name : str
            グラフ名。

        Raises
        ------
        GraphRagRuntimeBootstrapException
            ないとき。
        """
        if not self._age_graph_exists(graph_name):
            raise GraphRagRuntimeBootstrapException.age_graph_unavailable(
                f"required AGE graph unavailable: {graph_name}"
            )

    def _age_graph_exists(self, graph_name: str) -> bool:
        """AGE のグラフが登録されているか。

        Parameters
        ----------
        graph_name : str
            グラフ名。

        Returns
        -------
        bool
            あれば True。

        Raises
        ------
        GraphRagRuntimeBootstrapException
            AGE のカタログを引けないとき。
        """
        try:
            return self._exists(
                "select 1 from ag_catalog.ag_graph where name = %s", (graph_name,)
            )
        except psycopg.Error as exception:
            self._rollback_quietly()
            raise GraphRagRuntimeBootstrapException.age_graph_unavailable(
                str(exception)
            ) from exception


class GraphRagRuntimeBootstrapService:
    """ゲートウェイを呼んで、準備の結果（成功・失敗）にまとめる。"""

    def __init__(self, gateway: GraphRagRuntimeResourceGateway) -> None:
        """ゲートウェイを受け取る。

        Parameters
        ----------
        gateway : GraphRagRuntimeResourceGateway
            リソースの確認・作成を行うもの。

        Raises
        ------
        ValueError
            ゲートウェイが None のとき。
        """
        if gateway is None:
            raise ValueError("gateway")
        self._gateway = gateway

    @classmethod
    def jdbc(
        cls, connection: "psycopg.Connection[Any]"
    ) -> "GraphRagRuntimeBootstrapService":
        """PostgreSQL の接続を使うサービスを作る。

        Parameters
        ----------
        connection : psycopg.Connection
            PostgreSQL の接続。

        Returns
        -------
        GraphRagRuntimeBootstrapService
            サービス。
        """
        return cls(JdbcGraphRagRuntimeResourceGateway(connection))

    def bootstrap(
        self, request: GraphRagRuntimeBootstrapRequest | None
    ) -> GraphRagRuntimeReadinessResult:
        """準備を行い、結果を返す。失敗は例外にせず失敗の結果にする。

        Parameters
        ----------
        request : GraphRagRuntimeBootstrapRequest | None
            準備の要求。None は既定の確認だけの要求。

        Returns
        -------
        GraphRagRuntimeReadinessResult
            準備の結果。
        """
        normalized = request or GraphRagRuntimeBootstrapRequest.verify_only(
            GraphRagRuntimeTargetDescriptor.sanitized("PostgreSQL", "sanitized-target"),
            "secuaigent_core_graph",
        )
        resource_set = normalized.resource_set
        target = normalized.target
        assert resource_set is not None and target is not None
        try:
            result = self._gateway.ensure(normalized, resource_set)
            return GraphRagRuntimeReadinessResult.make_ready(
                target, result.resources_checked, result.created_resources
            )
        except GraphRagRuntimeBootstrapException as exception:
            return GraphRagRuntimeReadinessResult.failed(
                target,
                exception.failure_code,
                resource_set.resource_names(),
                str(exception),
            )
        except RuntimeError as exception:
            return GraphRagRuntimeReadinessResult.failed(
                target,
                "unknown_sanitized",
                resource_set.resource_names(),
                str(exception),
            )

    def __call__(
        self, request: GraphRagRuntimeBootstrapRequest
    ) -> GraphRagRuntimeReadinessResult:
        """`bootstrap` を呼ぶ（ブートストラッパーを関数として渡せるようにする）。

        Parameters
        ----------
        request : GraphRagRuntimeBootstrapRequest
            準備の要求。

        Returns
        -------
        GraphRagRuntimeReadinessResult
            準備の結果。
        """
        return self.bootstrap(request)


def ready_noop(
    request: GraphRagRuntimeBootstrapRequest,
) -> GraphRagRuntimeReadinessResult:
    """何もせず常に準備完了を返すブートストラッパー（接続のない構成・テスト用）。

    Parameters
    ----------
    request : GraphRagRuntimeBootstrapRequest
        準備の要求。

    Returns
    -------
    GraphRagRuntimeReadinessResult
        準備完了の結果。
    """
    resource_set = request.resource_set
    target = request.target
    assert resource_set is not None and target is not None
    return GraphRagRuntimeReadinessResult.make_ready(
        target, resource_set.resource_names(), ()
    )
