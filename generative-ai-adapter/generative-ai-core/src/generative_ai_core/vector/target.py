"""ベクトルDB の接続先（移植元 CoreVectorDbTarget）と PostgreSQL への接続。"""

import re
from dataclasses import dataclass, field
from typing import Any

import psycopg

MIN_PORT = 1
MAX_PORT = 65535
DEFAULT_POSTGRES_PORT = 5432
IDENTIFIER_PATTERN = re.compile(r"[a-z_][a-z0-9_]{0,62}")
PGROONGA_CONTENT_INDEX_SUFFIX = "_pgroonga_content_idx"
MAX_IDENTIFIER_LENGTH = 63
LOAD_AGE_SQL = "LOAD 'age'"
SEARCH_PATH_SQL = 'SET search_path = ag_catalog, "$user", public'


def _normalize(value: str | None) -> str:
    """前後の空白を除く（None は空文字）。

    Parameters
    ----------
    value : str | None
        文字列。

    Returns
    -------
    str
        正規化した文字列。
    """
    return "" if value is None else value.strip()


def _require(value: str, field_name: str) -> str:
    """空でない値を返す。

    Parameters
    ----------
    value : str
        値。
    field_name : str
        エラーメッセージに使う項目名。

    Returns
    -------
    str
        前後の空白を除いた値。

    Raises
    ------
    ValueError
        空のとき。
    """
    if not value.strip():
        raise ValueError(f"{field_name} must not be blank")
    return value.strip()


@dataclass(frozen=True)
class CoreVectorDbTarget:
    """ベクトルDB（Azure AI Search または PostgreSQL）の接続先。

    Attributes
    ----------
    endpoint : str
        Azure AI Search の URL、または PostgreSQL の `host[:port]`。
    api_key : str
        Azure AI Search の API キー。
    index_name : str
        Azure AI Search のインデックス名。
    user_name : str
        PostgreSQL のユーザー。
    password : str
        PostgreSQL のパスワード（空白を除かない）。
    database_name : str
        PostgreSQL のデータベース名。
    table_name : str
        PostgreSQL のテーブル名。
    initialize_schema : bool
        スキーマを作るか（検索では使わない）。
    """

    endpoint: str = ""
    api_key: str = field(default="", repr=False)
    index_name: str = ""
    user_name: str = ""
    password: str = field(default="", repr=False)
    database_name: str = ""
    table_name: str = ""
    initialize_schema: bool = False

    def __post_init__(self) -> None:
        """各項目を正規化する（パスワードだけは空白を保つ）。"""
        for name in (
            "endpoint",
            "api_key",
            "index_name",
            "user_name",
            "database_name",
            "table_name",
        ):
            object.__setattr__(self, name, _normalize(getattr(self, name)))
        object.__setattr__(self, "password", self.password or "")

    @classmethod
    def azure_ai_search(
        cls, endpoint: str | None, api_key: str | None, index_name: str | None
    ) -> "CoreVectorDbTarget":
        """Azure AI Search の接続先を作る。

        Parameters
        ----------
        endpoint : str | None
            サービスの URL。
        api_key : str | None
            API キー。
        index_name : str | None
            インデックス名。

        Returns
        -------
        CoreVectorDbTarget
            接続先。
        """
        return cls(
            endpoint=endpoint or "", api_key=api_key or "", index_name=index_name or ""
        )

    @classmethod
    def pg_vector(
        cls,
        host: str | None,
        user_name: str | None,
        password: str | None,
        database_name: str | None,
        table_name: str | None,
        initialize_schema: bool,
    ) -> "CoreVectorDbTarget":
        """PostgreSQL（pgvector）の接続先を作る。

        Parameters
        ----------
        host : str | None
            `host[:port]`。
        user_name : str | None
            ユーザー。
        password : str | None
            パスワード。
        database_name : str | None
            データベース名。
        table_name : str | None
            テーブル名。
        initialize_schema : bool
            スキーマを作るか。

        Returns
        -------
        CoreVectorDbTarget
            接続先。
        """
        return cls(
            endpoint=host or "",
            user_name=user_name or "",
            password=password or "",
            database_name=database_name or "",
            table_name=table_name or "",
            initialize_schema=initialize_schema,
        )

    def required_endpoint(self) -> str:
        """空でないエンドポイントを返す。

        Returns
        -------
        str
            エンドポイント。

        Raises
        ------
        ValueError
            空のとき。
        """
        return _require(self.endpoint, "endpoint")

    def required_api_key(self) -> str:
        """空でない API キーを返す。

        Returns
        -------
        str
            API キー。

        Raises
        ------
        ValueError
            空のとき。
        """
        return _require(self.api_key, "apiKey")

    def required_index_name(self) -> str:
        """空でないインデックス名を返す。

        Returns
        -------
        str
            インデックス名。

        Raises
        ------
        ValueError
            空のとき。
        """
        return _require(self.index_name, "indexName")

    def required_user_name(self) -> str:
        """空でないユーザー名を返す。

        Returns
        -------
        str
            ユーザー名。

        Raises
        ------
        ValueError
            空のとき。
        """
        return _require(self.user_name, "userName")

    def required_database_name(self) -> str:
        """空でないデータベース名を返す。

        Returns
        -------
        str
            データベース名。

        Raises
        ------
        ValueError
            空のとき。
        """
        return _require(self.database_name, "databaseName")

    def required_table_name(self) -> str:
        """空でないテーブル名を返す。

        Returns
        -------
        str
            テーブル名。

        Raises
        ------
        ValueError
            空のとき。
        """
        return _require(self.table_name, "tableName")

    def __str__(self) -> str:
        """秘密を伏せた文字列表現にする。

        Returns
        -------
        str
            API キー・パスワードを伏せた表現。
        """
        return (
            f"CoreVectorDbTarget[endpoint={self.endpoint}, apiKey=[REDACTED], "
            f"indexName={self.index_name}, userName={self.user_name}, "
            f"password=[REDACTED], databaseName={self.database_name}, "
            f"tableName={self.table_name}, initializeSchema={self.initialize_schema}]"
        )


@dataclass(frozen=True)
class Endpoint:
    """`host[:port]` を分けたもの。

    Attributes
    ----------
    host : str
        ホスト名。
    port : int | None
        ポート番号。指定がなければ None。
    """

    host: str
    port: int | None = None

    def port_or_default(self, default_port: int) -> int:
        """ポートを返す。指定がなければ既定のポート。

        Parameters
        ----------
        default_port : int
            既定のポート。

        Returns
        -------
        int
            ポート番号。
        """
        return default_port if self.port is None else self.port


def _parse_port(value: str) -> int:
    """ポート番号を読む。

    Parameters
    ----------
    value : str
        数字の文字列。

    Returns
    -------
    int
        ポート番号。

    Raises
    ------
    ValueError
        1〜65535 でないとき。
    """
    port = int(value)
    if port < MIN_PORT or port > MAX_PORT:
        raise ValueError("endpoint port must be between 1 and 65535")
    return port


def parse_endpoint(value: str) -> Endpoint:
    """`host`・`host:port`・`[ipv6]:port` を分ける（移植元 endpoint）。

    Parameters
    ----------
    value : str
        エンドポイントの文字列。

    Returns
    -------
    Endpoint
        ホストとポート。

    Raises
    ------
    ValueError
        ポートが範囲外のとき。
    """
    if value.startswith("["):
        closing = value.find("]")
        if closing > 0 and len(value) > closing + 1 and value[closing + 1] == ":":
            return Endpoint(value[1:closing], _parse_port(value[closing + 2 :]))
        return Endpoint(value, None)
    separator = value.rfind(":")
    if separator > 0 and separator == value.find(":") and separator < len(value) - 1:
        port_value = value[separator + 1 :]
        if port_value.isascii() and port_value.isdigit():
            return Endpoint(value[:separator], _parse_port(port_value))
    return Endpoint(value, None)


def connect(target: CoreVectorDbTarget) -> psycopg.Connection[Any]:
    """PostgreSQL へ接続する（移植元 PGSimpleDataSource 相当。プールなし）。

    Parameters
    ----------
    target : CoreVectorDbTarget
        接続先。

    Returns
    -------
    psycopg.Connection[Any]
        接続。呼び出し側で閉じる。

    Raises
    ------
    ValueError
        エンドポイント・ユーザー・データベース名が空、またはポートが範囲外のとき。
    psycopg.Error
        接続に失敗したとき。
    """
    endpoint = parse_endpoint(target.required_endpoint())
    return psycopg.connect(
        host=endpoint.host,
        port=endpoint.port_or_default(DEFAULT_POSTGRES_PORT),
        dbname=target.required_database_name(),
        user=target.required_user_name(),
        password=target.password,
    )


def safe_identifier(identifier: str | None, field_name: str = "tableName") -> str:
    """識別子を小文字にして安全か確かめる（移植元 PgVectorSchemaInitializer.safeIdentifier）。

    Parameters
    ----------
    identifier : str | None
        識別子。
    field_name : str
        エラーメッセージに使う項目名。

    Returns
    -------
    str
        小文字にした識別子。

    Raises
    ------
    ValueError
        `[A-Za-z_][A-Za-z0-9_]{0,62}` に合わないとき。
    """
    normalized = "" if identifier is None else identifier.strip().lower()
    if IDENTIFIER_PATTERN.fullmatch(normalized) is None:
        raise ValueError(f"{field_name} must match [A-Za-z_][A-Za-z0-9_]{{0,62}}")
    return normalized


def pgroonga_content_index_name(table_name: str | None) -> str:
    """PGroonga の content インデックス名（移植元 PgVectorPgroongaReadinessResources）。

    Parameters
    ----------
    table_name : str | None
        テーブル名。

    Returns
    -------
    str
        インデックス名。63 文字を超える分は、テーブル名側を削る。
    """
    table = safe_identifier(table_name, "tableName")
    if len(table) + len(PGROONGA_CONTENT_INDEX_SUFFIX) <= MAX_IDENTIFIER_LENGTH:
        return table + PGROONGA_CONTENT_INDEX_SUFFIX
    keep = MAX_IDENTIFIER_LENGTH - len(PGROONGA_CONTENT_INDEX_SUFFIX)
    return table[:keep] + PGROONGA_CONTENT_INDEX_SUFFIX


def ensure_age_session(connection: psycopg.Connection[Any]) -> None:
    """接続で Apache AGE を使えるようにする（移植元 AgeJdbcSessionSupport）。

    Parameters
    ----------
    connection : psycopg.Connection[Any]
        接続。
    """
    with connection.cursor() as cursor:
        cursor.execute(LOAD_AGE_SQL)
        cursor.execute(SEARCH_PATH_SQL)
