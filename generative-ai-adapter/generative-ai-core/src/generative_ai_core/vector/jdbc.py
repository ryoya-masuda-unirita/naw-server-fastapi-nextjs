"""PostgreSQL への接続（移植元の Spring `JdbcTemplate`・`PGSimpleDataSource` の代わり）。

移植元の SQL は `?` のプレースホルダーを使う。SQL を移植元のまま保つため、
このモジュールが psycopg の `%s` に変換して実行する。

テストで DB に接続しないよう、接続の作成は `ConnectionFactory` として差し替えられる。
接続オブジェクトは psycopg の `Connection` と同じ次のメソッドだけを使う。

- `execute(sql, params)` : カーソル（`rowcount`・`fetchall()` を持つ）を返す
- `close()`

接続は操作ごとに開いて閉じる（移植元の `PGSimpleDataSource` と同じく接続を使い回さない）。
"""

from collections.abc import Callable, Sequence
from typing import Any, Protocol

from generative_ai_core.vector.target import (
    CoreVectorDbTarget,
    parse_endpoint,
)

DEFAULT_PORT = 5432
MIN_PORT = 1
MAX_PORT = 65535


class Cursor(Protocol):
    """カーソル（psycopg の `Cursor` のうち使う部分）。"""

    rowcount: int

    def fetchall(self) -> list[Any]:
        """残りの行をすべて返す。

        Returns
        -------
        list[Any]
            行（タプル）の一覧。
        """
        ...


class Connection(Protocol):
    """接続（psycopg の `Connection` のうち使う部分）。"""

    def execute(self, query: str, params: Sequence[Any] | None = None) -> Cursor:
        """SQL を実行する。

        Parameters
        ----------
        query : str
            SQL（psycopg の `%s` 形式）。
        params : Sequence[Any] | None
            パラメーター。

        Returns
        -------
        Cursor
            カーソル。
        """
        ...

    def close(self) -> None:
        """接続を閉じる。"""
        ...


ConnectionFactory = Callable[[CoreVectorDbTarget], Connection]


def default_connection_factory(target: CoreVectorDbTarget) -> Connection:
    """psycopg で PostgreSQL に接続する（自動コミット）。

    Parameters
    ----------
    target : CoreVectorDbTarget
        接続先。

    Returns
    -------
    Connection
        接続。

    Raises
    ------
    ValueError
        接続先の必須項目が空・ポートが不正なとき。
    """
    import psycopg

    endpoint = parse_endpoint(target.required_endpoint())
    return psycopg.connect(  # type: ignore[return-value]
        host=endpoint.host,
        port=endpoint.port_or_default(DEFAULT_PORT),
        user=target.required_user_name(),
        password=target.password,
        dbname=target.required_database_name(),
        autocommit=True,
    )


def to_psycopg(sql: str) -> str:
    """移植元の `?` を psycopg の `%s` に変換する（元の `%` は `%%` にする）。

    Parameters
    ----------
    sql : str
        `?` 形式の SQL。

    Returns
    -------
    str
        `%s` 形式の SQL。
    """
    return sql.replace("%", "%%").replace("?", "%s")


class JdbcTemplate:
    """移植元の `JdbcTemplate` に当たる薄い実行器。"""

    def __init__(self, target: CoreVectorDbTarget, factory: ConnectionFactory) -> None:
        """接続先と接続の作り方を受け取る。

        Parameters
        ----------
        target : CoreVectorDbTarget
            接続先。
        factory : ConnectionFactory
            接続を作る関数。
        """
        self._target = target
        self._factory = factory

    def with_connection(self, callback: Callable[[Connection], Any]) -> Any:
        """接続を開いて処理を呼び、閉じる。

        Parameters
        ----------
        callback : Callable[[Connection], Any]
            接続を受け取る処理。

        Returns
        -------
        Any
            処理の戻り値。
        """
        connection = self._factory(self._target)
        try:
            return callback(connection)
        finally:
            connection.close()

    def execute(self, sql: str, *params: Any) -> None:
        """SQL を 1 回実行する。

        Parameters
        ----------
        sql : str
            `?` 形式の SQL。
        *params : Any
            パラメーター。
        """
        self.update(sql, *params)

    def update(self, sql: str, *params: Any) -> int:
        """更新系の SQL を実行し、影響した行数を返す。

        Parameters
        ----------
        sql : str
            `?` 形式の SQL。
        *params : Any
            パラメーター。

        Returns
        -------
        int
            影響した行数。
        """

        def run(connection: Connection) -> int:
            """1 件実行する。

            Parameters
            ----------
            connection : Connection
                接続。

            Returns
            -------
            int
                影響した行数。
            """
            return connection.execute(to_psycopg(sql), list(params)).rowcount

        return int(self.with_connection(run))

    def query(self, sql: str, *params: Any) -> list[Any]:
        """SELECT を実行して全行を返す。

        Parameters
        ----------
        sql : str
            `?` 形式の SQL。
        *params : Any
            パラメーター。

        Returns
        -------
        list[Any]
            行（タプル）の一覧。
        """

        def run(connection: Connection) -> list[Any]:
            """1 件実行する。

            Parameters
            ----------
            connection : Connection
                接続。

            Returns
            -------
            list[Any]
                行の一覧。
            """
            return connection.execute(to_psycopg(sql), list(params)).fetchall()

        result: list[Any] = self.with_connection(run)
        return result

    def query_for_object(self, sql: str, *params: Any) -> Any:
        """SELECT の 1 行目 1 列目を返す（行がなければ None）。

        Parameters
        ----------
        sql : str
            `?` 形式の SQL。
        *params : Any
            パラメーター。

        Returns
        -------
        Any
            値。
        """
        rows = self.query(sql, *params)
        return rows[0][0] if rows else None
