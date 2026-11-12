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


def _ensure_sqlite_dir(database_url: str) -> None:
    """SQLite ファイルの置き場所がないと接続時に失敗するため、先に作っておく。"""
    url = make_url(database_url)
    if not url.drivername.startswith("sqlite") or not url.database:
        return
    if url.database == ":memory:":
        return
    Path(url.database).expanduser().resolve().parent.mkdir(parents=True, exist_ok=True)


def create_engine(database_url: str) -> AsyncEngine:
    _ensure_sqlite_dir(database_url)
    engine = create_async_engine(database_url)
    if engine.dialect.name == "sqlite":

        @event.listens_for(engine.sync_engine, "connect")
        def _set_sqlite_pragma(dbapi_connection: Any, _record: Any) -> None:
            # SQLite は外部キー制約が既定で無効のため、移植元（H2）の
            # ON DELETE CASCADE を効かせるには接続ごとに有効化が必要。
            # WAL は SSE のバックグラウンド書き込みと API の読み取りを並行させるため。
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA busy_timeout=5000")
            cursor.close()

    return engine


def create_session_factory(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(engine, expire_on_commit=False)
