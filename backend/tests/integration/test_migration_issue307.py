"""マイグレーション issue307（ライブラリ本文の分割）の結合テスト。

PostgreSQL ではなくインメモリ SQLite に移行前のテーブルを作り、マイグレーションの
`upgrade()`・`downgrade()` をそのまま実行して、データの移行と戻しを確かめる。
"""

import importlib.util
import uuid
from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path
from types import ModuleType

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

_MIGRATION_PATH = (
    Path(__file__).resolve().parents[2]
    / "alembic"
    / "versions"
    / "issue307_split_library_contents.py"
)
_TENANT_ID = "tenant-migration"
_CREATED_AT = datetime(2026, 1, 2, 3, 4, 5, tzinfo=UTC)
_UPDATED_AT = datetime(2026, 2, 3, 4, 5, 6, tzinfo=UTC)


def _load_migration() -> ModuleType:
    """マイグレーションのファイルをモジュールとして読み込む。

    Returns
    -------
    ModuleType
        読み込んだマイグレーションのモジュール。
    """
    spec = importlib.util.spec_from_file_location("issue307", _MIGRATION_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _create_pre_migration_libraries(connection: sa.Connection) -> sa.Table:
    """移行前（`content` 列あり・`title` 必須）の `libraries` を作る。

    Parameters
    ----------
    connection : sa.Connection
        接続。

    Returns
    -------
    sa.Table
        移行前の `libraries` テーブル。
    """
    metadata = sa.MetaData()
    # 本文テーブルの外部キーの参照先。反映時に必要なため最小限の定義で作る
    sa.Table("tenants", metadata, sa.Column("id", sa.String(32), primary_key=True))
    table = sa.Table(
        "libraries",
        metadata,
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("tenant_id", sa.String(32), nullable=False),
        sa.Column("message_id", sa.String(32), nullable=False),
        sa.Column("user_id", sa.String(32), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    metadata.create_all(connection)
    return table


def _insert_library(
    connection: sa.Connection,
    table: sa.Table,
    title: str | None,
    content: str | None,
) -> uuid.UUID:
    """ライブラリを1件入れる。

    Parameters
    ----------
    connection : sa.Connection
        接続。
    table : sa.Table
        `libraries` テーブル。
    title : str | None
        タイトル。
    content : str | None
        移行前の `content` 列の値。列が無いテーブルでは無視される想定で、
        移行前のテーブルにだけ渡す。

    Returns
    -------
    uuid.UUID
        入れたライブラリのID。
    """
    library_id = uuid.uuid4()
    values: dict[str, object] = {
        "id": library_id.hex,
        "tenant_id": _TENANT_ID,
        "message_id": "message-1",
        "user_id": uuid.uuid4().hex,
        "title": title,
        "created_at": _CREATED_AT,
        "updated_at": _UPDATED_AT,
    }
    if "content" in table.c:
        values["content"] = content
    connection.execute(sa.insert(table).values(**values))
    return library_id


@pytest.fixture
def connection() -> Iterator[sa.Connection]:
    """移行前の `libraries` を持つインメモリ SQLite の接続。"""
    engine = sa.create_engine("sqlite://")
    with engine.begin() as conn:
        yield conn
    engine.dispose()


def _run(connection: sa.Connection, direction: str) -> None:
    """マイグレーションの `upgrade` または `downgrade` を実行する。

    Parameters
    ----------
    connection : sa.Connection
        接続。
    direction : str
        `"upgrade"` または `"downgrade"`。
    """
    migration = _load_migration()
    context = MigrationContext.configure(connection)
    with Operations.context(context):
        getattr(migration, direction)()


def _reflect(connection: sa.Connection, name: str) -> sa.Table:
    """テーブルの現在の定義を読み取る。

    Parameters
    ----------
    connection : sa.Connection
        接続。
    name : str
        テーブル名。

    Returns
    -------
    sa.Table
        読み取ったテーブル。
    """
    return sa.Table(name, sa.MetaData(), autoload_with=connection)


class TestMigrationIssue307:
    """マイグレーション issue307 のテスト"""

    def test_revision_follows_head_023(self) -> None:
        """revision が issue307、down_revision が 023 であること"""
        migration = _load_migration()

        assert migration.revision == "issue307"
        assert migration.down_revision == "023"

    def test_upgrade_moves_content_to_library_contents(
        self, connection: sa.Connection
    ) -> None:
        """本文のあるライブラリだけが本文テーブルへ移り、列の定義が変わること"""
        libraries = _create_pre_migration_libraries(connection)
        with_content = _insert_library(connection, libraries, "あり", "# 本文")
        _insert_library(connection, libraries, "なし", None)
        empty_content = _insert_library(connection, libraries, "空", "")

        _run(connection, "upgrade")

        # SQLite では `UUID` 型名が NUMERIC として反映されてしまうため、生SQLで読む
        rows = {
            row.library_id: row
            for row in connection.execute(
                sa.text(
                    "SELECT library_id, tenant_id, content, created_at, updated_at "
                    "FROM library_contents"
                )
            ).all()
        }
        assert len(rows) == 2
        # SQLite では UUID が文字列として読み戻されるため、文字列で突き合わせる
        by_id = {uuid.UUID(k): v for k, v in rows.items()}
        assert by_id[with_content].content == "# 本文"
        assert by_id[with_content].tenant_id == _TENANT_ID
        assert by_id[empty_content].content == ""
        assert str(by_id[with_content].created_at).startswith("2026-01-02 03:04:05")
        assert str(by_id[with_content].updated_at).startswith("2026-02-03 04:05:06")

        migrated = _reflect(connection, "libraries")
        assert "content" not in migrated.c
        assert migrated.c.title.nullable is True

    def test_upgrade_allows_null_title(self, connection: sa.Connection) -> None:
        """移行後はタイトルが NULL のライブラリ（スタブ）を入れられること"""
        _create_pre_migration_libraries(connection)

        _run(connection, "upgrade")

        migrated = _reflect(connection, "libraries")
        _insert_library(connection, migrated, None, None)
        assert (
            connection.execute(
                sa.select(sa.func.count()).select_from(migrated)
            ).scalar_one()
            == 1
        )

    def test_downgrade_restores_content_and_fills_null_title(
        self, connection: sa.Connection
    ) -> None:
        """戻すと本文が列に戻り、スタブのタイトルは既定値になり、本文テーブルが消えること"""
        libraries = _create_pre_migration_libraries(connection)
        with_content = _insert_library(connection, libraries, "あり", "# 本文")
        without_content = _insert_library(connection, libraries, "なし", None)
        _run(connection, "upgrade")
        migrated = _reflect(connection, "libraries")
        stub = _insert_library(connection, migrated, None, None)

        _run(connection, "downgrade")

        restored = _reflect(connection, "libraries")
        rows = {
            uuid.UUID(str(row.id)): row
            for row in connection.execute(sa.select(restored)).all()
        }
        assert rows[with_content].content == "# 本文"
        assert rows[with_content].title == "あり"
        assert rows[without_content].content is None
        assert rows[stub].content is None
        assert rows[stub].title == "ライブラリ"
        assert restored.c.title.nullable is False
        assert "library_contents" not in sa.inspect(connection).get_table_names()

    def test_upgrade_then_downgrade_keeps_data(self, connection: sa.Connection) -> None:
        """upgrade してから downgrade しても本文・タイトルが移行前と同じであること"""
        libraries = _create_pre_migration_libraries(connection)
        expected = {
            _insert_library(connection, libraries, "A", "# a"): ("A", "# a"),
            _insert_library(connection, libraries, "B", None): ("B", None),
            _insert_library(connection, libraries, "C", ""): ("C", ""),
        }

        _run(connection, "upgrade")
        _run(connection, "downgrade")

        restored = _reflect(connection, "libraries")
        actual = {
            uuid.UUID(str(row.id)): (row.title, row.content)
            for row in connection.execute(sa.select(restored)).all()
        }
        assert actual == expected
