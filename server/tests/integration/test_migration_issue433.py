"""マイグレーション issue433（`message_contents.message_id` の索引）の結合テスト。

PostgreSQL ではなくインメモリ SQLite に移行前のテーブルを作り、マイグレーションの
`upgrade()`・`downgrade()` をそのまま実行して、索引が作られ・消えることを確かめる。
性能（実行計画）は PostgreSQL でしか確かめられないため、`docs/issue-433/08_動作確認.md` に記録する。
"""

import importlib.util
from collections.abc import Iterator
from pathlib import Path
from types import ModuleType

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

from app.models.message import MessageContent

_MIGRATION_PATH = (
    Path(__file__).resolve().parents[2]
    / "alembic"
    / "versions"
    / "issue433_add_message_contents_message_id_index.py"
)
_INDEX_NAME = "message_contents_message_id_idx"


def _load_migration() -> ModuleType:
    """マイグレーションのファイルをモジュールとして読み込む。

    Returns
    -------
    ModuleType
        読み込んだマイグレーションのモジュール。
    """
    spec = importlib.util.spec_from_file_location("issue433", _MIGRATION_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _index_columns(connection: sa.Connection) -> dict[str, list[str | None]]:
    """`message_contents` の索引の名前と列を返す。

    Parameters
    ----------
    connection : sa.Connection
        接続。

    Returns
    -------
    dict[str, list[str | None]]
        索引名から、索引の列への対応。
    """
    inspector = sa.inspect(connection)
    return {
        index["name"]: list(index["column_names"])
        for index in inspector.get_indexes("message_contents")
        if index["name"] is not None
    }


@pytest.fixture
def connection() -> Iterator[sa.Connection]:
    """移行前の `message_contents`（`message_id` の索引なし）を持つ接続を返す。"""
    engine = sa.create_engine("sqlite://")
    with engine.begin() as conn:
        metadata = sa.MetaData()
        sa.Table(
            "message_contents",
            metadata,
            sa.Column("id", sa.String(32), primary_key=True),
            sa.Column("message_id", sa.String(32), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
        metadata.create_all(conn)
        yield conn
    engine.dispose()


def _run(connection: sa.Connection, direction: str) -> None:
    """マイグレーションの `upgrade` または `downgrade` を、接続に対して実行する。

    Parameters
    ----------
    connection : sa.Connection
        接続。
    direction : str
        `upgrade` または `downgrade`。
    """
    migration = _load_migration()
    with Operations.context(MigrationContext.configure(connection)):
        getattr(migration, direction)()


def test_migration_follows_latest_revision() -> None:
    """マイグレーションの前が、直前の先頭（issue309）であること"""
    migration = _load_migration()

    assert migration.revision == "issue433"
    assert migration.down_revision == "issue309"


def test_upgrade_creates_message_id_index(connection: sa.Connection) -> None:
    """upgrade で、message_id だけの索引ができること"""
    assert _INDEX_NAME not in _index_columns(connection)

    _run(connection, "upgrade")

    assert _index_columns(connection)[_INDEX_NAME] == ["message_id"]


def test_downgrade_drops_message_id_index(connection: sa.Connection) -> None:
    """downgrade で、索引が消えること"""
    _run(connection, "upgrade")

    _run(connection, "downgrade")

    assert _INDEX_NAME not in _index_columns(connection)


def test_model_declares_the_same_index() -> None:
    """モデルが、マイグレーションと同じ名前・列の索引を宣言していること（ずれると差分が出る）"""
    table: sa.Table = MessageContent.__table__  # type: ignore[assignment]
    indexes = {index.name: [c.name for c in index.columns] for index in table.indexes}

    assert indexes[_INDEX_NAME] == ["message_id"]
