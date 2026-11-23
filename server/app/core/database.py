from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlmodel import SQLModel

from app.core.config import get_settings

# SQLModel.metadata を Base として export
Base = SQLModel


def _create_session_maker() -> async_sessionmaker[AsyncSession]:
    """設定のDB URLからエンジンを作り、セッションファクトリを生成する。

    Returns
    -------
    async_sessionmaker[AsyncSession]
        非同期セッションのファクトリ。
    """
    settings = get_settings()
    engine = create_async_engine(settings.database_url, echo=False)
    return async_sessionmaker(engine, expire_on_commit=False)


_session_maker: async_sessionmaker[AsyncSession] | None = None


def get_session_maker() -> async_sessionmaker[AsyncSession]:
    """セッションファクトリを返す。初回呼び出し時に生成し、以降は使い回す。

    Returns
    -------
    async_sessionmaker[AsyncSession]
        非同期セッションのファクトリ。
    """
    global _session_maker
    if _session_maker is None:
        _session_maker = _create_session_maker()
    return _session_maker


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """リクエストごとのDBセッションを提供するFastAPIの依存関数。

    Yields
    ------
    AsyncSession
        リクエストの処理中に使うDBセッション。
    """
    async with get_session_maker()() as session:
        yield session
