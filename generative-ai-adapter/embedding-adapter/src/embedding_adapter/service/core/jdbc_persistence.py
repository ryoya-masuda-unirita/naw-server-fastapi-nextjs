"""呼び出しごとに PostgreSQL へ接続する取り込みの保存先（移植元 JdbcBackedIngestionPersistenceAdapter）。"""

from collections.abc import Callable
from typing import Any

from generative_ai_core.graphrag.ingestion import (
    IngestionExtraction,
    IngestionPersistenceAdapter,
    IngestionRequest,
    IngestionResult,
    IngestionSchemaReadiness,
    JdbcIngestionPersistenceAdapter,
    SourceLifecycleRequest,
    SourceLifecycleResult,
)

from embedding_adapter.domain import VectorDBConfig

JDBC_POSTGRESQL_PREFIX = "jdbc:postgresql://"
DEFAULT_PORT = 5432

ConnectionOpener = Callable[[VectorDBConfig], Any]
"""設定から PostgreSQL の接続（自動コミット）を開く関数。テストで差し替える。"""


def _value(value: str | None) -> str:
    """None を空にして trim する。

    Parameters
    ----------
    value : str | None
        文字列。

    Returns
    -------
    str
        trim した文字列。
    """
    return "" if value is None else value.strip()


def split_endpoint(url: str) -> tuple[str, int | None, str | None]:
    """URL を host・port・（URL に含まれる）データベース名に分ける。

    `jdbc:postgresql://host:port/db` 形式と `host[:port]` 形式の両方を受ける。

    Parameters
    ----------
    url : str
        設定の URL。

    Returns
    -------
    tuple[str, int | None, str | None]
        ホスト、ポート（なければ None）、データベース名（なければ None）。
    """
    rest = url.removeprefix(JDBC_POSTGRESQL_PREFIX)
    database: str | None = None
    if "/" in rest:
        rest, _, database_part = rest.partition("/")
        database = database_part.split("?", 1)[0] or None
    host, separator, port_text = rest.rpartition(":")
    if separator and port_text.isdigit():
        return host, int(port_text), database
    return rest, None, database


def jdbc_url(config: VectorDBConfig) -> str:
    """設定から JDBC 形式の URL を作る（移植元の jdbcUrl）。

    `jdbc:postgresql://` で始まる URL はそのまま、そうでなければ `host[:port]` として
    データベース名をつなげる。

    Parameters
    ----------
    config : VectorDBConfig
        ベクトルDB の設定。

    Returns
    -------
    str
        `jdbc:postgresql://host:port/database` 形式の URL。

    Raises
    ------
    RuntimeError
        ホスト形式の URL でデータベース名がないとき。
    """
    url = _value(config.url)
    if url.startswith(JDBC_POSTGRESQL_PREFIX):
        return url
    database = _value(config.database_name)
    if database == "":
        raise RuntimeError(
            "PostgreSQL databaseName is required for GraphRAG ingestion."
        )
    return f"{JDBC_POSTGRESQL_PREFIX}{url}/{database}"


def open_connection(config: VectorDBConfig) -> Any:
    """設定のホスト・資格情報で PostgreSQL に接続する（自動コミット）。

    Parameters
    ----------
    config : VectorDBConfig
        ベクトルDB の設定。

    Returns
    -------
    Any
        psycopg の接続。

    Raises
    ------
    RuntimeError
        データベース名を決められないとき。
    """
    import psycopg

    host, port, database = split_endpoint(jdbc_url(config))
    if database is None:
        raise RuntimeError(
            "PostgreSQL databaseName is required for GraphRAG ingestion."
        )
    return psycopg.connect(
        host=host,
        port=port or DEFAULT_PORT,
        user=config.user_name,
        password=config.password,
        dbname=database,
        autocommit=True,
    )


class JdbcBackedIngestionPersistenceAdapter:
    """呼び出しごとに接続を開き、core の JDBC 保存先に処理を任せて閉じる。"""

    def __init__(
        self,
        config: VectorDBConfig,
        connection_opener: ConnectionOpener = open_connection,
    ) -> None:
        """設定と、接続を開く関数を受け取る。

        Parameters
        ----------
        config : VectorDBConfig
            ベクトルDB の設定。
        connection_opener : ConnectionOpener
            接続を開く関数。テストでは偽の接続を返すものに差し替える。
        """
        self._config = config
        self._connection_opener = connection_opener

    def schema_readiness(self) -> IngestionSchemaReadiness:
        """スキーマの準備状況を返す。

        Returns
        -------
        IngestionSchemaReadiness
            準備状況。
        """
        connection = self._connection_opener(self._config)
        try:
            return self.core_adapter(connection).schema_readiness()
        finally:
            connection.close()

    def persist(
        self, request: IngestionRequest, extraction: IngestionExtraction
    ) -> IngestionResult:
        """取り込み結果を保存する。

        Parameters
        ----------
        request : IngestionRequest
            取り込み要求。
        extraction : IngestionExtraction
            抽出結果。

        Returns
        -------
        IngestionResult
            取り込み結果。
        """
        connection = self._connection_opener(self._config)
        try:
            return self.core_adapter(connection).persist(request, extraction)
        finally:
            connection.close()

    def replace_source(self, request: SourceLifecycleRequest) -> SourceLifecycleResult:
        """参照元を置き換える。

        Parameters
        ----------
        request : SourceLifecycleRequest
            置き換えの要求。

        Returns
        -------
        SourceLifecycleResult
            置き換えの結果。
        """
        connection = self._connection_opener(self._config)
        try:
            return self.core_adapter(connection).replace_source(request)
        finally:
            connection.close()

    def delete_source(self, request: SourceLifecycleRequest) -> SourceLifecycleResult:
        """参照元を削除する。

        Parameters
        ----------
        request : SourceLifecycleRequest
            削除の要求。

        Returns
        -------
        SourceLifecycleResult
            削除の結果。
        """
        connection = self._connection_opener(self._config)
        try:
            return self.core_adapter(connection).delete_source(request)
        finally:
            connection.close()

    def jdbc_url(self) -> str:
        """設定から JDBC 形式の URL を作る。

        Returns
        -------
        str
            `jdbc:postgresql://host:port/database` 形式の URL。
        """
        return jdbc_url(self._config)

    def core_adapter(self, connection: Any) -> IngestionPersistenceAdapter:
        """接続を使う core の JDBC 保存先を作る。

        Parameters
        ----------
        connection : Any
            PostgreSQL の接続。

        Returns
        -------
        IngestionPersistenceAdapter
            実効 graph 名つきの core の保存先。
        """
        return JdbcIngestionPersistenceAdapter(
            connection, self._config.get_effective_graph_name()
        )
