"""マイグレーション issue442（`messages` の `room_id`・`parent_id` の索引）の結合テスト。

PostgreSQL ではなくインメモリ SQLite に移行前のテーブルを作り、マイグレーションの
`upgrade()`・`downgrade()` をそのまま実行して、索引が作られ・消えることを確かめる。
性能（実行計画）は PostgreSQL でしか確かめられないため、`docs/issue-442/08_動作確認.md` に記録する。
"""

import importlib.util
from collections.abc import Iterator
from pathlib import Path
from types import ModuleType

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

from app.models.message import Message

_MIGRATION_PATH = (
    Path(__file__).resolve().parents[2]
    / "alembic"
    / "versions"
    / "issue442_add_messages_room_and_parent_indexes.py"
)
_EXPECTED_INDEXES = {
    "messages_tenant_id_room_id_idx": ["tenant_id", "room_id"],
    "messages_parent_id_idx": ["parent_id"],
}


def _load_migration() -> ModuleType:
    """マイグレーションのファイルをモジュールとして読み込む。

    Returns
    -------
    ModuleType
        読み込んだマイグレーションのモジュール。
    """
    spec = importlib.util.spec_from_file_location("issue442", _MIGRATION_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _index_columns(connection: sa.Connection) -> dict[str, list[str | None]]:
    """`messages` の索引の名前と列を返す。

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
        for index in inspector.get_indexes("messages")
        if index["name"] is not None
    }


@pytest.fixture
def connection() -> Iterator[sa.Connection]:
    """移行前の `messages`（`room_id`・`parent_id` の索引なし）を持つ接続を返す。"""
    engine = sa.create_engine("sqlite://")
    with engine.begin() as conn:
        metadata = sa.MetaData()
        sa.Table(
            "messages",
            metadata,
            sa.Column("id", sa.String(32), primary_key=True),
            sa.Column("tenant_id", sa.String(32), nullable=False),
            sa.Column("room_id", sa.String(32), nullable=False),
            sa.Column("parent_id", sa.String(32), nullable=True),
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
    """マイグレーションの前が、直前の先頭（issue433）であること"""
    migration = _load_migration()

    assert migration.revision == "issue442"
    assert migration.down_revision == "issue433"


def test_upgrade_creates_room_and_parent_indexes(connection: sa.Connection) -> None:
    """upgrade で、(tenant_id, room_id) と parent_id の索引ができること"""
    assert not set(_EXPECTED_INDEXES) & set(_index_columns(connection))

    _run(connection, "upgrade")

    indexes = _index_columns(connection)
    for name, columns in _EXPECTED_INDEXES.items():
        assert indexes[name] == columns


def test_downgrade_drops_both_indexes(connection: sa.Connection) -> None:
    """downgrade で、両方の索引が消えること"""
    _run(connection, "upgrade")

    _run(connection, "downgrade")

    assert not set(_EXPECTED_INDEXES) & set(_index_columns(connection))


def test_model_declares_the_same_indexes() -> None:
    """モデルが、マイグレーションと同じ名前・列・一意性の索引を宣言していること（ずれると差分が出る）"""
    table: sa.Table = Message.__table__  # type: ignore[attr-defined]
    declared = {index.name: index for index in table.indexes}

    for name, columns in _EXPECTED_INDEXES.items():
        index = declared[name]
        assert [c.name for c in index.columns] == columns
        # マイグレーションは、一意でない索引を作る
        assert not index.unique
