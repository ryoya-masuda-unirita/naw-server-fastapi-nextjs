"""GraphRAG ランタイムに必要なリソース一式とマイグレーション SQL（移植元 GraphRagRuntimeResourceSet）。

マイグレーションの SQL は移植元の `graphrag/v0/runtime/migrations/*.sql` と同じ内容を
パッケージの `migrations/` に置いている。破壊的な文（drop・truncate・delete・update・
on conflict など）と、承認済みでない insert・policy・do ブロックは実行しない。
"""

import re
from functools import cache
from pathlib import Path

FOUNDATION_SCHEMA = "graphrag_s01"
SCHEMA = "graphrag_s02"
DEFAULT_GRAPH_NAME = "secuaigent_core_graph"

_SAFE_IDENTIFIER = re.compile(r"[A-Za-z_][A-Za-z0-9_]{0,62}")
_MIGRATION_DIR = Path(__file__).parent / "migrations"
_MIGRATION_RESOURCES = (
    "001-s01-foundation.sql",
    "002-s02-full-core-schema.sql",
    "003-s03-ingestion-overlay.sql",
    "010-s08-runtime-readiness.sql",
)
_FOUNDATION_TABLES = (
    "tenants",
    "users",
    "principals",
    "protected_visibility_fixture",
    "s01_protected_table_inventory",
)
_FOUNDATION_RLS_PROTECTED_TABLES = ("protected_visibility_fixture",)
_FOUNDATION_FUNCTIONS = ("set_request_context", "clear_request_context")
_FOUNDATION_ROLES = ("graphrag_s01_app",)
_FOUNDATION_POLICY_NAMES = (
    "tenants_default_context_policy",
    "users_default_context_policy",
    "principals_default_context_policy",
    "protected_visibility_fixture_default_context_policy",
)
_APPROVED_POLICY_PREFIXES = (
    "create policy tenants_default_context_policy ",
    "create policy users_default_context_policy ",
    "create policy principals_default_context_policy ",
    "create policy protected_visibility_fixture_default_context_policy ",
    "create policy documents_s02_tenant_acl_policy ",
    "create policy document_versions_s02_tenant_acl_policy ",
    "create policy chunks_s02_tenant_acl_policy ",
    "create policy evidence_items_s02_tenant_acl_policy ",
    "create policy entities_s02_tenant_acl_policy ",
    "create policy kg_edges_s02_tenant_acl_policy ",
    "create policy document_acl_grants_s03_tenant_policy ",
    "create policy embedding_queue_s03_tenant_policy ",
    "create policy acl_propagation_outbox_s03_tenant_policy ",
    "create policy acl_drift_checks_s03_tenant_policy ",
    "create policy llm_candidate_origins_s03_tenant_policy ",
)
_RUNTIME_TABLES = (
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
_PGROONGA_INDEXES = (
    "chunks_s08_pgroonga_content_idx",
    "evidence_items_s08_pgroonga_source_idx",
)
_BTREE_INDEXES = (
    "document_versions_s03_current_idx",
    "chunks_s03_current_idx",
)
_LINE_BREAK = re.compile(r"\r\n|\r|\n|\u0085| | |\x0b|\x0c")
_WHITESPACE = re.compile(r"\s+")


def _read_migration(resource: str) -> str:
    """マイグレーション SQL を読む。

    Parameters
    ----------
    resource : str
        ファイル名。

    Returns
    -------
    str
        SQL の内容。

    Raises
    ------
    RuntimeError
        ファイルがないとき。
    """
    path = _MIGRATION_DIR / resource
    if not path.is_file():
        raise RuntimeError(f"Missing GraphRAG runtime resource: {resource}")
    return path.read_text(encoding="utf-8")


def _strip_line_comments(sql: str) -> str:
    """`--` で始まる行を除く。

    Parameters
    ----------
    sql : str
        SQL。

    Returns
    -------
    str
        コメント行を除いた SQL。
    """
    return "".join(
        f"{line}\n"
        for line in _LINE_BREAK.split(sql)
        if not line.strip().startswith("--")
    )


def _normalize_statement(statement: str) -> str:
    """文を小文字・空白 1 つに正規化する（承認済みの文との比較用）。

    Parameters
    ----------
    statement : str
        SQL の文。

    Returns
    -------
    str
        正規化した文。
    """
    return _WHITESPACE.sub(" ", statement.lower()).strip()


def _split_sql_statements(sql: str) -> list[str]:
    """SQL を文に分ける（`$$` ブロック内の `;` では分けない）。

    Parameters
    ----------
    sql : str
        SQL。

    Returns
    -------
    list[str]
        文の一覧（末尾の `;` は含まない）。
    """
    statements: list[str] = []
    current = ""
    in_dollar_block = False
    for line in _LINE_BREAK.split(sql):
        current += line + "\n"
        if "$$" in line:
            in_dollar_block = not in_dollar_block
        if not in_dollar_block and line.strip().endswith(";"):
            statements.append(current[: current.rindex(";")])
            current = ""
    if current.strip():
        statements.append(current)
    return statements


@cache
def _approved_statements(prefixes: tuple[str, ...]) -> frozenset[str]:
    """マイグレーションの中で、指定した接頭辞で始まる文を承認済みとして集める。

    Parameters
    ----------
    prefixes : tuple[str, ...]
        接頭辞（小文字）。

    Returns
    -------
    frozenset[str]
        正規化した承認済みの文。
    """
    approved: set[str] = set()
    for resource in _MIGRATION_RESOURCES:
        sql = _strip_line_comments(_read_migration(resource))
        for statement in _split_sql_statements(sql):
            normalized = _normalize_statement(statement)
            if normalized.startswith(prefixes):
                approved.add(normalized)
    return frozenset(approved)


def _is_bootstrap_safe_statement(statement: str) -> bool:
    """bootstrap で実行してよい文か。

    Parameters
    ----------
    statement : str
        SQL の文。

    Returns
    -------
    bool
        実行してよければ True。
    """
    normalized = _normalize_statement(statement)
    if normalized.startswith("insert into "):
        return normalized in _approved_statements(("insert into ",))
    if normalized.startswith("create policy "):
        return normalized in _approved_statements(_APPROVED_POLICY_PREFIXES)
    if normalized.startswith("do $$"):
        return normalized in _approved_statements(("do $$",))
    if normalized.startswith("create or replace function "):
        return normalized.startswith(
            (
                "create or replace function graphrag_s01.set_request_context(",
                "create or replace function graphrag_s01.clear_request_context()",
            )
        )
    return not (
        normalized.startswith(("drop ", "truncate ", "delete from ", "update "))
        or " on conflict " in normalized
        or " do update " in normalized
    )


def _runtime_safe_statements(sql: str) -> list[str]:
    """SQL から、実行してよい文だけを正規化して取り出す。

    Parameters
    ----------
    sql : str
        SQL。

    Returns
    -------
    list[str]
        実行してよい文。
    """
    safe: list[str] = []
    for statement in _split_sql_statements(sql):
        trimmed = _normalize_statement(statement)
        if trimmed and _is_bootstrap_safe_statement(trimmed):
            safe.append(trimmed)
    return safe


class GraphRagRuntimeResourceSet:
    """GraphRAG ランタイムに必要なスキーマ・テーブル・インデックス・グラフの一式。"""

    FOUNDATION_SCHEMA = FOUNDATION_SCHEMA
    SCHEMA = SCHEMA

    def __init__(self, graph_name: str | None) -> None:
        """グラフ名を検査して作る。

        Parameters
        ----------
        graph_name : str | None
            AGE のグラフ名。省略時は既定。
        """
        self._graph_name = self.normalize_graph_name(graph_name)

    @classmethod
    def canonical(cls, graph_name: str | None = None) -> "GraphRagRuntimeResourceSet":
        """標準のリソース一式を返す。

        Parameters
        ----------
        graph_name : str | None
            AGE のグラフ名。省略時は `secuaigent_core_graph`。

        Returns
        -------
        GraphRagRuntimeResourceSet
            リソース一式。
        """
        return cls(graph_name)

    @staticmethod
    def normalize_graph_name(graph_name: str | None) -> str:
        """グラフ名を検査して返す（空なら既定）。

        Parameters
        ----------
        graph_name : str | None
            グラフ名。

        Returns
        -------
        str
            安全なグラフ名。

        Raises
        ------
        ValueError
            PostgreSQL の識別子として安全でないとき。
        """
        normalized = (
            DEFAULT_GRAPH_NAME
            if graph_name is None or not graph_name.strip()
            else graph_name.strip()
        )
        if not _SAFE_IDENTIFIER.fullmatch(normalized):
            raise ValueError("graphName must be a safe PostgreSQL identifier")
        return normalized

    def graph_name(self) -> str:
        """グラフ名を返す。

        Returns
        -------
        str
            グラフ名。
        """
        return self._graph_name

    def ingestion_tables(self) -> tuple[str, ...]:
        """取り込みで使うテーブル名を返す。

        Returns
        -------
        tuple[str, ...]
            テーブル名。
        """
        return _RUNTIME_TABLES

    def foundation_tables(self) -> tuple[str, ...]:
        """基盤スキーマのテーブル名を返す。

        Returns
        -------
        tuple[str, ...]
            テーブル名。
        """
        return _FOUNDATION_TABLES

    def foundation_rls_protected_tables(self) -> tuple[str, ...]:
        """行レベルセキュリティで守る基盤のテーブル名を返す。

        Returns
        -------
        tuple[str, ...]
            テーブル名。
        """
        return _FOUNDATION_RLS_PROTECTED_TABLES

    def foundation_functions(self) -> tuple[str, ...]:
        """基盤スキーマの関数名を返す。

        Returns
        -------
        tuple[str, ...]
            関数名。
        """
        return _FOUNDATION_FUNCTIONS

    def foundation_roles(self) -> tuple[str, ...]:
        """基盤のロール名を返す。

        Returns
        -------
        tuple[str, ...]
            ロール名。
        """
        return _FOUNDATION_ROLES

    def foundation_policy_names(self) -> tuple[str, ...]:
        """基盤のポリシー名を返す。

        Returns
        -------
        tuple[str, ...]
            ポリシー名。
        """
        return _FOUNDATION_POLICY_NAMES

    def runtime_tables(self) -> tuple[str, ...]:
        """ランタイムのテーブル名を返す。

        Returns
        -------
        tuple[str, ...]
            テーブル名。
        """
        return _RUNTIME_TABLES

    def pgroonga_indexes(self) -> tuple[str, ...]:
        """PGroonga のインデックス名を返す。

        Returns
        -------
        tuple[str, ...]
            インデックス名。
        """
        return _PGROONGA_INDEXES

    def btree_indexes(self) -> tuple[str, ...]:
        """B-tree のインデックス名を返す。

        Returns
        -------
        tuple[str, ...]
            インデックス名。
        """
        return _BTREE_INDEXES

    def runtime_indexes(self) -> tuple[str, ...]:
        """ランタイムのインデックス名（PGroonga → B-tree）を返す。

        Returns
        -------
        tuple[str, ...]
            インデックス名。
        """
        return _PGROONGA_INDEXES + _BTREE_INDEXES

    def resource_names(self) -> tuple[str, ...]:
        """確認対象のリソース名の一覧を返す（`種類:名前` 形式）。

        Returns
        -------
        tuple[str, ...]
            リソース名。
        """
        resources = ["extension:vector", "extension:pgroonga", "extension:age"]
        resources.append(f"schema:{FOUNDATION_SCHEMA}")
        resources.append(f"schema:{SCHEMA}")
        resources += [f"table:{FOUNDATION_SCHEMA}.{t}" for t in _FOUNDATION_TABLES]
        resources += [f"table:{SCHEMA}.{t}" for t in _RUNTIME_TABLES]
        resources += [
            f"function:{FOUNDATION_SCHEMA}.{f}" for f in _FOUNDATION_FUNCTIONS
        ]
        resources += [f"role:{r}" for r in _FOUNDATION_ROLES]
        resources += [
            f"policy:{FOUNDATION_SCHEMA}.{p}" for p in _FOUNDATION_POLICY_NAMES
        ]
        resources.append(f"pgvector:{SCHEMA}.chunk_embeddings.embedding")
        resources += [f"pgroonga:index:{SCHEMA}.{i}" for i in _PGROONGA_INDEXES]
        resources += [f"index:{SCHEMA}.{i}" for i in _BTREE_INDEXES]
        resources.append(f"age-graph:{self._graph_name}")
        return tuple(resources)

    def canonical_sql(self) -> str:
        """実行する SQL を 1 つの文字列にして返す。

        Returns
        -------
        str
            各文の末尾に `;` と改行を付けた SQL。
        """
        return "".join(f"{statement};\n" for statement in self.canonical_statements())

    def canonical_statements(self) -> tuple[str, ...]:
        """実行してよい SQL の文を、マイグレーション順に返す。

        Returns
        -------
        tuple[str, ...]
            正規化した文の一覧。
        """
        statements: list[str] = []
        for resource in _MIGRATION_RESOURCES:
            statements += _runtime_safe_statements(
                _strip_line_comments(_read_migration(resource))
            )
        return tuple(statements)
