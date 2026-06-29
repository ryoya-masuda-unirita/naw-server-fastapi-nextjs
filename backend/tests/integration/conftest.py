import os
import subprocess

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://root:root@localhost:5433/postgres",
)


def pytest_configure(config):
    # テスト前に alembic upgrade head を実行してスキーマを最新にする
    subprocess.run(["uv", "run", "alembic", "upgrade", "head"], check=True)


@pytest.fixture(scope="session")
async def engine():
    _engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    # テスト開始時に前回の残存データを削除（FK の CASCADE 順）
    async with _engine.begin() as conn:
        await conn.execute(text("TRUNCATE TABLE users, tenants RESTART IDENTITY CASCADE"))
    yield _engine
    await _engine.dispose()


@pytest.fixture
async def session(engine):
    async_session = async_sessionmaker(engine, expire_on_commit=False)
    async with async_session() as s:
        yield s
        await s.rollback()
