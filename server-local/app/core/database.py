from pathlib import Path
from typing import Any

from sqlalchemy import event
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

# 書き込みが重なったときにロックの解放を待つ時間
SQLITE_BUSY_TIMEOUT_MS = 5000


def _ensure_sqlite_dir(database_url: str) -> None:
    """SQLite ファイルを置くディレクトリを作る。

    SQLite ファイルの置き場所がないと接続時に失敗するため、先に作っておく。
    SQLite 以外の URL とインメモリ DB では何もしない。

    Parameters
    ----------
    database_url : str
        SQLAlchemy の接続 URL。
    """
    url = make_url(database_url)
    if not url.drivername.startswith("sqlite") or not url.database:
        return
    if url.database == ":memory:":
        return
    Path(url.database).expanduser().resolve().parent.mkdir(parents=True, exist_ok=True)


def create_engine(database_url: str) -> AsyncEngine:
    """非同期エンジンを作り、SQLite なら接続ごとの PRAGMA を設定する。

    アプリと alembic の両方がこの関数でエンジンを作り、外部キー・WAL・ロック待ちの
    設定をそろえる。

    Parameters
    ----------
    database_url : str
        SQLAlchemy の非同期接続 URL（例: ``sqlite+aiosqlite:///...``）。

    Returns
    -------
    AsyncEngine
        作成した非同期エンジン。
    """
    _ensure_sqlite_dir(database_url)
    engine = create_async_engine(database_url)
    if engine.dialect.name == "sqlite":

        @event.listens_for(engine.sync_engine, "connect")
        def _set_sqlite_pragma(dbapi_connection: Any, _record: Any) -> None:
            """新しい SQLite 接続に外部キー・WAL・ロック待ち時間を設定する。

            Parameters
            ----------
            dbapi_connection : Any
                SQLAlchemy の ``connect`` イベントで渡される DBAPI の接続。
            _record : Any
                接続プールの記録（使わない）。
            """
            # SQLite は外部キー制約が既定で無効のため、移植元（H2）の
            # ON DELETE CASCADE を効かせるには接続ごとに有効化が必要。
            # WAL は SSE のバックグラウンド書き込みと API の読み取りを並行させるため。
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute(f"PRAGMA busy_timeout={SQLITE_BUSY_TIMEOUT_MS}")
            cursor.close()

    return engine


def create_session_factory(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    """エンジンに結びついたセッションのファクトリを作る。

    コミット後もモデルの属性を読めるよう ``expire_on_commit=False`` にする
    （非同期セッションでは、期限切れの属性を読むと暗黙の再読み込みができずに失敗するため）。

    Parameters
    ----------
    engine : AsyncEngine
        セッションが使うエンジン。

    Returns
    -------
    async_sessionmaker[AsyncSession]
        非同期セッションのファクトリ。
    """
    return async_sessionmaker(engine, expire_on_commit=False)
