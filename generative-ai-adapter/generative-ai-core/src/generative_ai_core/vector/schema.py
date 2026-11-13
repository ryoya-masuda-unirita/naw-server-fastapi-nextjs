"""pgvector のテーブル・索引の初期化（移植元 PgVectorSchemaInitializer）。"""

import re

from generative_ai_core.vector.jdbc import JdbcTemplate

EMBEDDING_DIMENSIONS = 1536
MAX_IDENTIFIER_LENGTH = 63
_IDENTIFIER_PATTERN = re.compile(r"[a-z_][a-z0-9_]{0,62}")
INDEX_SUFFIX = "_hnsw_idx"
CONTENT_INDEX_SUFFIX = "_pgroonga_content_idx"


def safe_identifier(identifier: str | None, field_name: str = "tableName") -> str:
    """SQL に埋め込んでよい識別子か検証し、小文字にして返す。

    Parameters
    ----------
    identifier : str | None
        識別子。
    field_name : str
        エラーメッセージに出す項目名。

    Returns
    -------
    str
        小文字にした識別子。

    Raises
    ------
    ValueError
        `[a-z_][a-z0-9_]{0,62}` に一致しないとき。
    """
    normalized = "" if identifier is None else identifier.strip().lower()
    if _IDENTIFIER_PATTERN.fullmatch(normalized) is None:
        raise ValueError(f"{field_name} must match [A-Za-z_][A-Za-z0-9_]{{0,62}}")
    return normalized


def qualified_table_name(identifier: str | None) -> str:
    """`public.` を付けたテーブル名を返す。

    Parameters
    ----------
    identifier : str | None
        テーブル名。

    Returns
    -------
    str
        `public.<テーブル名>`。
    """
    return "public." + safe_identifier(identifier, "tableName")


def _suffixed_name(table_name: str, suffix: str) -> str:
    """63 文字に収まるよう、末尾に接尾辞を付けた名前を作る。

    Parameters
    ----------
    table_name : str
        テーブル名。
    suffix : str
        接尾辞。

    Returns
    -------
    str
        索引名。
    """
    if len(table_name) + len(suffix) <= MAX_IDENTIFIER_LENGTH:
        return table_name + suffix
    return table_name[: MAX_IDENTIFIER_LENGTH - len(suffix)] + suffix


def pgroonga_content_index_name(table_name: str | None) -> str:
    """PGroonga の本文索引名を返す（移植元 PgVectorPgroongaReadinessResources）。

    Parameters
    ----------
    table_name : str | None
        テーブル名。

    Returns
    -------
    str
        索引名。
    """
    return _suffixed_name(
        safe_identifier(table_name, "tableName"), CONTENT_INDEX_SUFFIX
    )


def embedding_index_name(table_name: str) -> str:
    """HNSW 索引名を返す。

    Parameters
    ----------
    table_name : str
        検証済みのテーブル名。

    Returns
    -------
    str
        索引名。
    """
    return _suffixed_name(table_name, INDEX_SUFFIX)


class PgVectorSchemaInitializer:
    """pgvector のテーブルと索引を用意する。"""

    def __init__(self, template: JdbcTemplate) -> None:
        """実行器を受け取る。

        Parameters
        ----------
        template : JdbcTemplate
            実行器。
        """
        self._template = template

    def initialize(self, table_name: str) -> None:
        """拡張・テーブル・列・主キー・索引を（なければ）作る。

        Parameters
        ----------
        table_name : str
            テーブル名。
        """
        table = safe_identifier(table_name, "tableName")
        qualified = qualified_table_name(table)
        t = self._template
        t.execute("CREATE EXTENSION IF NOT EXISTS vector")
        t.execute("CREATE EXTENSION IF NOT EXISTS pgroonga")
        t.execute(
            f"CREATE TABLE IF NOT EXISTS {qualified}"
            " (id uuid PRIMARY KEY, fileid text NOT NULL, filepath text, "
            f"content text NOT NULL, embedding vector({EMBEDDING_DIMENSIONS}) NOT NULL)"
        )
        self._ensure_columns(qualified)
        self._ensure_primary_key(qualified)
        t.execute(
            f"CREATE INDEX IF NOT EXISTS {embedding_index_name(table)} "
            f"ON {qualified} USING hnsw (embedding vector_cosine_ops)"
        )
        t.execute(
            f"CREATE INDEX IF NOT EXISTS {pgroonga_content_index_name(table)} "
            f"ON {qualified} USING pgroonga (content)"
        )

    def _ensure_columns(self, table: str) -> None:
        """列を足し、必須列に NOT NULL を付ける。

        Parameters
        ----------
        table : str
            修飾済みのテーブル名。
        """
        t = self._template
        t.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS id uuid")
        t.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS fileid text")
        t.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS filepath text")
        t.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS content text")
        t.execute(
            f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS embedding "
            f"vector({EMBEDDING_DIMENSIONS})"
        )
        t.execute(f"ALTER TABLE {table} ALTER COLUMN id SET NOT NULL")
        t.execute(f"ALTER TABLE {table} ALTER COLUMN fileid SET NOT NULL")
        t.execute(f"ALTER TABLE {table} ALTER COLUMN content SET NOT NULL")
        t.execute(f"ALTER TABLE {table} ALTER COLUMN embedding SET NOT NULL")

    def _ensure_primary_key(self, table: str) -> None:
        """主キーがなければ id に付ける。

        Parameters
        ----------
        table : str
            修飾済みのテーブル名。
        """
        exists = self._template.query_for_object(
            "SELECT EXISTS (SELECT 1 FROM pg_constraint "
            "WHERE conrelid = ?::regclass AND contype = 'p')",
            table,
        )
        if exists is not True:
            self._template.execute(f"ALTER TABLE {table} ADD PRIMARY KEY (id)")
