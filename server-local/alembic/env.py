import asyncio
import os
from logging.config import fileConfig

from sqlalchemy.engine import Connection
from sqlmodel import SQLModel

import app.models  # noqa: F401 — モデルを読み込んでメタデータに登録する
from alembic import context
from app.core.config import Settings
from app.core.database import create_engine

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = SQLModel.metadata


def _database_url() -> str:
    # テストから一時 DB を指定できるよう、alembic.ini（Config）の値を優先する
    url = config.get_main_option("sqlalchemy.url")
    if url:
        return url
    # Settings() を作ると認証キーが必須になるため、マイグレーションでは URL だけを読む
    default = Settings.model_fields["database_url"].default
    return os.environ.get("DATABASE_URL", default)


def do_run_migrations(connection: Connection) -> None:
    # SQLite は ALTER TABLE の制約変更ができないため、将来の変更に備えて batch モードにする
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        render_as_batch=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    engine = create_engine(_database_url())
    async with engine.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await engine.dispose()


def run_migrations_offline() -> None:
    context.configure(
        url=_database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,
    )
    with context.begin_transaction():
        context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_async_migrations())
