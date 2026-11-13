"""Graph RAG の実行環境の確認（移植元 `graphrag.bootstrap` の VERIFY_ONLY 経路）。

検索は、拡張（vector・pgroonga・age）、`graphrag_s01`・`graphrag_s02` スキーマの表・関数・
RLS・ポリシー・ロール、`chunk_embeddings.embedding` の型（`vector(1536)`）、PGroonga・B-tree
のインデックス、AGE の graph が揃っているかを読み取りだけで確かめる。リソースを作る
CREATE_IF_MISSING 経路（canonical SQL の実行）は embedding-adapter 側の担当のため移植しない。
"""

import re
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from typing import Any

import psycopg

from generative_ai_core.failure import sanitize
from generative_ai_core.retrieval.models import DEFAULT_GRAPH_NAME

FOUNDATION_SCHEMA = "graphrag_s01"
SCHEMA = "graphrag_s02"
REQUIRED_EXTENSIONS = ("vector", "pgroonga", "age")
FOUNDATION_TABLES = (
    "tenants",
    "users",
    "principals",
    "protected_visibility_fixture",
    "s01_protected_table_inventory",
)
FOUNDATION_RLS_PROTECTED_TABLES = ("protected_visibility_fixture",)
FOUNDATION_FUNCTIONS = ("set_request_context", "clear_request_context")
FOUNDATION_ROLES = ("graphrag_s01_app",)
FOUNDATION_POLICY_NAMES = (
    "tenants_default_context_policy",
    "users_default_context_policy",
    "principals_default_context_policy",
    "protected_visibility_fixture_default_context_policy",
)
RUNTIME_TABLES = (
    "embedding_profiles",
    "documents",
    "document_versions",
    "chunks",
    "chunk_embeddings",
    "chunk_identifiers",
    "evidence_items",
    "retrieval_traces",
    "answers",
    "answer_claims",
    "answer_claim_evidence",
    "entities",
    "entity_aliases",
    "kg_edges",
    "kg_edge_evidence",
    "graph_projection_events",
    "graph_projection_runs",
    "graph_drift_checks",
    "document_acl_grants",
    "embedding_queue",
    "acl_propagation_outbox",
    "acl_drift_checks",
    "llm_candidate_origins",
)
PGROONGA_INDEXES = (
    "chunks_s08_pgroonga_content_idx",
    "evidence_items_s08_pgroonga_source_idx",
)
BTREE_INDEXES = ("document_versions_s03_current_idx", "chunks_s03_current_idx")
EXPECTED_EMBEDDING_TYPE = "vector(1536)"
_SAFE_IDENTIFIER = re.compile(r"[A-Za-z_][A-Za-z0-9_]{0,62}")
_SQL_REDACTIONS = (
    re.compile(r"(?i)create\s+extension[^\n;]*"),
    re.compile(r"(?i)select\s+[^\n;]*"),
    re.compile(r"(?i)insert\s+into\s+[^\n;]*"),
    re.compile(r"(?i)update\s+[^\n;]*"),
    re.compile(r"(?i)delete\s+from\s+[^\n;]*"),
)
PERMISSION_DENIED_STATE = "42501"


class GraphRagRuntimeBootstrapException(RuntimeError):
    """Graph RAG の実行環境が揃っていないこと。`failure_code` に分類が入る。"""

    def __init__(self, failure_code: str, message: str) -> None:
        """分類とメッセージで作る。

        Parameters
        ----------
        failure_code : str
            分類（`missing_extension`・`insufficient_privilege`・`incompatible_schema`・
            `age_graph_unavailable`）。
        message : str
            メッセージ。
        """
        super().__init__(message)
        self.failure_code = failure_code.strip() or "unknown_sanitized"

    @classmethod
    def missing_extension(cls, message: str) -> "GraphRagRuntimeBootstrapException":
        """拡張がない失敗を作る。

        Parameters
        ----------
        message : str
            メッセージ。

        Returns
        -------
        GraphRagRuntimeBootstrapException
            失敗。
        """
        return cls("missing_extension", message)

    @classmethod
    def insufficient_privilege(
        cls, message: str
    ) -> "GraphRagRuntimeBootstrapException":
        """権限が足りない失敗を作る。

        Parameters
        ----------
        message : str
            メッセージ。

        Returns
        -------
        GraphRagRuntimeBootstrapException
            失敗。
        """
        return cls("insufficient_privilege", message)

    @classmethod
    def incompatible_schema(cls, message: str) -> "GraphRagRuntimeBootstrapException":
        """スキーマが合わない失敗を作る。

        Parameters
        ----------
        message : str
            メッセージ。

        Returns
        -------
        GraphRagRuntimeBootstrapException
            失敗。
        """
        return cls("incompatible_schema", message)

    @classmethod
    def age_graph_unavailable(cls, message: str) -> "GraphRagRuntimeBootstrapException":
        """AGE の graph が使えない失敗を作る。

        Parameters
        ----------
        message : str
            メッセージ。

        Returns
        -------
        GraphRagRuntimeBootstrapException
            失敗。
        """
        return cls("age_graph_unavailable", message)


def normalize_graph_name(graph_name: str | None) -> str:
    """graph 名を検証する（空なら既定の名前）。

    Parameters
    ----------
    graph_name : str | None
        graph 名。

    Returns
    -------
    str
        graph 名。

    Raises
    ------
    ValueError
        安全な識別子でないとき。
    """
    normalized = (
        DEFAULT_GRAPH_NAME
        if not graph_name or not graph_name.strip()
        else graph_name.strip()
    )
    if _SAFE_IDENTIFIER.fullmatch(normalized) is None:
        raise ValueError("graphName must be a safe PostgreSQL identifier")
    return normalized


def resource_names(graph_name: str) -> list[str]:
    """確かめるリソースの名前を並べる（結果の表示用）。

    Parameters
    ----------
    graph_name : str
        AGE graph 名。

    Returns
    -------
    list[str]
        リソース名。
    """
    names = [f"extension:{e}" for e in REQUIRED_EXTENSIONS]
    names += [f"schema:{FOUNDATION_SCHEMA}", f"schema:{SCHEMA}"]
    names += [f"table:{FOUNDATION_SCHEMA}.{t}" for t in FOUNDATION_TABLES]
    names += [f"table:{SCHEMA}.{t}" for t in RUNTIME_TABLES]
    names += [f"function:{FOUNDATION_SCHEMA}.{f}" for f in FOUNDATION_FUNCTIONS]
    names += [f"role:{r}" for r in FOUNDATION_ROLES]
    names += [f"policy:{FOUNDATION_SCHEMA}.{p}" for p in FOUNDATION_POLICY_NAMES]
    names.append(f"pgvector:{SCHEMA}.chunk_embeddings.embedding")
    names += [f"pgroonga:index:{SCHEMA}.{i}" for i in PGROONGA_INDEXES]
    names += [f"index:{SCHEMA}.{i}" for i in BTREE_INDEXES]
    names.append(f"age-graph:{graph_name}")
    return names


@dataclass(frozen=True)
class GraphRagRuntimeTargetDescriptor:
    """確認対象の説明（サニタイズ済み）。

    Attributes
    ----------
    provider : str
        プロバイダ（既定は PostgreSQL）。
    sanitized_descriptor : str
        サニタイズした説明。
    """

    provider: str = "PostgreSQL"
    sanitized_descriptor: str = ""

    def __post_init__(self) -> None:
        """項目を整える。"""
        provider = (self.provider or "").strip() or "PostgreSQL"
        descriptor = (
            self.sanitized_descriptor or ""
        ).strip() or f"{provider}:sanitized-target"
        object.__setattr__(self, "provider", provider)
        object.__setattr__(self, "sanitized_descriptor", sanitize(descriptor))


@dataclass(frozen=True)
class GraphRagRuntimeBootstrapRequest:
    """確認の依頼（VERIFY_ONLY）。

    Attributes
    ----------
    target : GraphRagRuntimeTargetDescriptor
        確認対象の説明。
    graph_name : str
        AGE graph 名。
    """

    target: GraphRagRuntimeTargetDescriptor = field(
        default_factory=GraphRagRuntimeTargetDescriptor
    )
    graph_name: str = DEFAULT_GRAPH_NAME

    def __post_init__(self) -> None:
        """graph 名を検証する。"""
        object.__setattr__(self, "graph_name", normalize_graph_name(self.graph_name))


def _sanitize_evidence(evidence: str | None) -> str:
    """証拠の文字列から SQL・カタログ名を伏せる。

    Parameters
    ----------
    evidence : str | None
        証拠の文字列。

    Returns
    -------
    str
        伏せた文字列。
    """
    sanitized = sanitize(
        "GraphRAG runtime evidence."
        if not evidence or not evidence.strip()
        else evidence
    )
    for pattern in _SQL_REDACTIONS:
        sanitized = pattern.sub("[SQL_REDACTED]", sanitized)
    return sanitized.replace("ag_catalog", "[DB_CATALOG]")


@dataclass(frozen=True)
class GraphRagRuntimeReadinessResult:
    """Graph RAG の実行環境の確認結果。

    Attributes
    ----------
    ready : bool
        揃っているか。
    status : str
        `ready` か `failed`。
    failure_code : str | None
        失敗の分類。
    target : GraphRagRuntimeTargetDescriptor
        確認対象。
    resources_checked : tuple[str, ...]
        確認したリソース。
    sanitized_evidence : str
        サニタイズした説明。
    """

    ready: bool
    status: str
    failure_code: str | None
    target: GraphRagRuntimeTargetDescriptor
    resources_checked: Sequence[str]
    sanitized_evidence: str

    @classmethod
    def ok(
        cls, target: GraphRagRuntimeTargetDescriptor, resources_checked: Sequence[str]
    ) -> "GraphRagRuntimeReadinessResult":
        """揃っている結果を作る。

        Parameters
        ----------
        target : GraphRagRuntimeTargetDescriptor
            確認対象。
        resources_checked : Sequence[str]
            確認したリソース。

        Returns
        -------
        GraphRagRuntimeReadinessResult
            結果。
        """
        return cls(
            True,
            "ready",
            None,
            target,
            tuple(resources_checked),
            _sanitize_evidence(
                f"GraphRAG runtime ready for {target.sanitized_descriptor}"
            ),
        )

    @classmethod
    def failed(
        cls,
        target: GraphRagRuntimeTargetDescriptor,
        failure_code: str | None,
        resources_checked: Sequence[str],
        evidence: str | None,
    ) -> "GraphRagRuntimeReadinessResult":
        """揃っていない結果を作る。

        Parameters
        ----------
        target : GraphRagRuntimeTargetDescriptor
            確認対象。
        failure_code : str | None
            失敗の分類。
        resources_checked : Sequence[str]
            確認したリソース。
        evidence : str | None
            説明。

        Returns
        -------
        GraphRagRuntimeReadinessResult
            結果。
        """
        return cls(
            False,
            "failed",
            failure_code,
            target,
            tuple(resources_checked),
            _sanitize_evidence(f"GraphRAG runtime failed: {failure_code}. {evidence}"),
        )


GraphRagRuntimeBootstrapper = Callable[
    [GraphRagRuntimeBootstrapRequest], GraphRagRuntimeReadinessResult
]


def ready_noop(
    request: GraphRagRuntimeBootstrapRequest,
) -> GraphRagRuntimeReadinessResult:
    """何も確かめず揃っているとする（テスト用。移植元 readyNoop）。

    Parameters
    ----------
    request : GraphRagRuntimeBootstrapRequest
        依頼。

    Returns
    -------
    GraphRagRuntimeReadinessResult
        常に揃っている結果。
    """
    return GraphRagRuntimeReadinessResult.ok(
        request.target, resource_names(request.graph_name)
    )


def _exists(connection: Any, sql: str, params: tuple[object, ...]) -> bool:
    """1 行でも返る問い合わせかを調べる。

    Parameters
    ----------
    connection : Any
        psycopg の接続。
    sql : str
        SQL（`%s` のパラメータ）。
    params : tuple[object, ...]
        パラメータ。

    Returns
    -------
    bool
        1 行以上あれば True。
    """
    return connection.execute(sql, params).fetchone() is not None


def _verify_all(connection: Any, graph_name: str) -> None:
    """揃っているかを読み取りだけで順に確かめる。

    Parameters
    ----------
    connection : Any
        psycopg の接続。
    graph_name : str
        AGE graph 名。

    Raises
    ------
    GraphRagRuntimeBootstrapException
        足りないものがあるとき。
    """
    for extension in REQUIRED_EXTENSIONS:
        if not _exists(
            connection, "select 1 from pg_extension where extname = %s", (extension,)
        ):
            raise GraphRagRuntimeBootstrapException.missing_extension(
                f"required extension unavailable: {extension}"
            )
    table_sql = "select 1 from information_schema.tables where table_schema = %s and table_name = %s"
    for table in FOUNDATION_TABLES:
        if not _exists(connection, table_sql, (FOUNDATION_SCHEMA, table)):
            raise GraphRagRuntimeBootstrapException.incompatible_schema(
                f"required foundation table unavailable: {table}"
            )
    for table in FOUNDATION_RLS_PROTECTED_TABLES:
        row = connection.execute(
            "select case when c.relrowsecurity then 't' else 'f' end || ':' || "
            "case when c.relforcerowsecurity then 't' else 'f' end "
            "from pg_class c join pg_namespace n on n.oid = c.relnamespace "
            "where n.nspname = %s and c.relname = %s and c.relkind = 'r'",
            (FOUNDATION_SCHEMA, table),
        ).fetchone()
        if row is None:
            raise GraphRagRuntimeBootstrapException.incompatible_schema(
                f"required foundation table unavailable for RLS verification: {table}"
            )
        if row[0] != "t:t":
            raise GraphRagRuntimeBootstrapException.incompatible_schema(
                f"required foundation RLS unavailable: {table}"
            )
    routine_sql = (
        "select 1 from information_schema.routines "
        "where routine_schema = %s and routine_name = %s"
    )
    for function in FOUNDATION_FUNCTIONS:
        if not _exists(connection, routine_sql, (FOUNDATION_SCHEMA, function)):
            raise GraphRagRuntimeBootstrapException.incompatible_schema(
                f"required foundation function unavailable: {function}"
            )
    for policy in FOUNDATION_POLICY_NAMES:
        if not _exists(
            connection,
            "select 1 from pg_policies where schemaname = %s and policyname = %s",
            (FOUNDATION_SCHEMA, policy),
        ):
            raise GraphRagRuntimeBootstrapException.incompatible_schema(
                f"required foundation policy unavailable: {policy}"
            )
    for role in FOUNDATION_ROLES:
        if not _exists(
            connection, "select 1 from pg_roles where rolname = %s", (role,)
        ):
            raise GraphRagRuntimeBootstrapException.incompatible_schema(
                f"required foundation role unavailable: {role}"
            )
    for table in RUNTIME_TABLES:
        if not _exists(connection, table_sql, (SCHEMA, table)):
            raise GraphRagRuntimeBootstrapException.incompatible_schema(
                f"required table unavailable: {table}"
            )
    _verify_pgvector_column(connection)
    index_sql = "select 1 from pg_indexes where schemaname = %s and indexname = %s"
    for index in PGROONGA_INDEXES:
        if not _exists(connection, index_sql, (SCHEMA, index)):
            raise GraphRagRuntimeBootstrapException.incompatible_schema(
                f"required pgroonga index unavailable: {index}"
            )
    for index in BTREE_INDEXES:
        if not _exists(connection, index_sql, (SCHEMA, index)):
            raise GraphRagRuntimeBootstrapException.incompatible_schema(
                f"required runtime index unavailable: {index}"
            )
    _verify_age_graph(connection, graph_name)


def _verify_pgvector_column(connection: Any) -> None:
    """`chunk_embeddings.embedding` が `vector(1536)` かを確かめる。

    Parameters
    ----------
    connection : Any
        psycopg の接続。

    Raises
    ------
    GraphRagRuntimeBootstrapException
        列がない、または型が違うとき。
    """
    row = connection.execute(
        "select format_type(a.atttypid, a.atttypmod) from pg_attribute a "
        "join pg_class c on c.oid = a.attrelid "
        "join pg_namespace n on n.oid = c.relnamespace "
        "where n.nspname = %s and c.relname = %s and a.attname = %s "
        "and not a.attisdropped",
        (SCHEMA, "chunk_embeddings", "embedding"),
    ).fetchone()
    if row is None:
        raise GraphRagRuntimeBootstrapException.incompatible_schema(
            "required pgvector column unavailable: chunk_embeddings.embedding"
        )
    normalized = ("" if row[0] is None else str(row[0])).replace('"', "").lower()
    if normalized != EXPECTED_EMBEDDING_TYPE and not normalized.endswith(
        "." + EXPECTED_EMBEDDING_TYPE
    ):
        raise GraphRagRuntimeBootstrapException.incompatible_schema(
            "required pgvector column incompatible: chunk_embeddings.embedding"
        )


def _verify_age_graph(connection: Any, graph_name: str) -> None:
    """AGE の graph があるかを確かめる。

    Parameters
    ----------
    connection : Any
        psycopg の接続。
    graph_name : str
        AGE graph 名。

    Raises
    ------
    GraphRagRuntimeBootstrapException
        graph がない、または確認できないとき。
    """
    try:
        found = _exists(
            connection,
            "select 1 from ag_catalog.ag_graph where name = %s",
            (graph_name,),
        )
    except psycopg.Error as e:
        raise GraphRagRuntimeBootstrapException.age_graph_unavailable(str(e)) from e
    if not found:
        raise GraphRagRuntimeBootstrapException.age_graph_unavailable(
            f"required AGE graph unavailable: {graph_name}"
        )


def _map_sql_error(error: psycopg.Error) -> GraphRagRuntimeBootstrapException:
    """SQL のエラーを失敗の分類に変える。

    Parameters
    ----------
    error : psycopg.Error
        SQL のエラー。

    Returns
    -------
    GraphRagRuntimeBootstrapException
        分類した失敗。
    """
    state = error.sqlstate or ""
    message = str(error)
    normalized = message.lower()
    if state == PERMISSION_DENIED_STATE or "permission denied" in normalized:
        return GraphRagRuntimeBootstrapException.insufficient_privilege(message)
    if (
        "extension" in normalized
        or "control file" in normalized
        or "could not access file" in normalized
    ):
        return GraphRagRuntimeBootstrapException.missing_extension(message)
    if "ag_catalog" in normalized or "age" in normalized:
        return GraphRagRuntimeBootstrapException.age_graph_unavailable(message)
    return GraphRagRuntimeBootstrapException("incompatible_schema", message)


def verify_with_connection(
    connection: Any, request: GraphRagRuntimeBootstrapRequest
) -> GraphRagRuntimeReadinessResult:
    """接続を使って揃っているかを確かめ、結果にする（例外は失敗の結果にする）。

    Parameters
    ----------
    connection : Any
        psycopg の接続。
    request : GraphRagRuntimeBootstrapRequest
        依頼。

    Returns
    -------
    GraphRagRuntimeReadinessResult
        結果。
    """
    names = resource_names(request.graph_name)
    try:
        try:
            _verify_all(connection, request.graph_name)
        except psycopg.Error as e:
            raise _map_sql_error(e) from e
        return GraphRagRuntimeReadinessResult.ok(request.target, names)
    except GraphRagRuntimeBootstrapException as e:
        return GraphRagRuntimeReadinessResult.failed(
            request.target, e.failure_code, names, str(e)
        )
    except RuntimeError as e:
        return GraphRagRuntimeReadinessResult.failed(
            request.target, "unknown_sanitized", names, str(e)
        )
