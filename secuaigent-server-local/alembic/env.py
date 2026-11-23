import asyncio
from logging.config import fileConfig

from sqlalchemy.engine import Connection
from sqlmodel import SQLModel

import app.models  # noqa: F401 — モデルを読み込んでメタデータに登録する
from alembic import context
from app.core.config import DatabaseSettings
from app.core.database import create_engine

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = SQLModel.metadata


def _database_url() -> str:
    """マイグレーション対象の DB 接続 URL を決める。

    テストが一時 DB を指定できるよう alembic.ini（Config）の ``sqlalchemy.url`` を
    優先し、未指定ならアプリと同じく環境変数と .env から読む。

    Returns
    -------
    str
        SQLAlchemy の非同期接続 URL。
    """
    # テストから一時 DB を指定できるよう、alembic.ini（Config）の値を優先する
    url = config.get_main_option("sqlalchemy.url")
    if url:
        return url
    # アプリと同じく環境変数と .env から読む（認証キーなど DB 以外は読まない）
    return DatabaseSettings().database_url


def do_run_migrations(connection: Connection) -> None:
    """同期接続の上でマイグレーションを実行する。

    非同期エンジンの ``run_sync`` から呼ばれる。SQLite は ALTER TABLE で制約を
    変更できないため、batch モード（テーブルを作り直す方式）で構成する。

    Parameters
    ----------
    connection : Connection
        非同期エンジンから渡される同期接続。
    """
    # SQLite は ALTER TABLE の制約変更ができないため、将来の変更に備えて batch モードにする
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        render_as_batch=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """非同期エンジンで DB に接続し、オンラインモードでマイグレーションを実行する。

    アプリは aiosqlite の非同期エンジンを使うため、同じ ``create_engine`` で接続し、
    SQLite の PRAGMA などの接続設定をアプリと揃える。
    """
    engine = create_engine(_database_url())
    async with engine.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await engine.dispose()


def run_migrations_offline() -> None:
    """DB に接続せず、マイグレーションの SQL を出力する（オフラインモード）。

    ``alembic upgrade --sql`` で使う。値は SQL に埋め込み（literal_binds）、
    オンラインと同じく batch モードで出力する。
    """
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
