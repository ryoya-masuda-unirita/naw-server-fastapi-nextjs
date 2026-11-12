import sqlite3
from pathlib import Path

import pytest
from alembic.config import Config
from sqlmodel import SQLModel

import app.models  # noqa: F401
from alembic import command

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def _table_columns(conn: sqlite3.Connection, table: str) -> dict[str, tuple[str, bool]]:
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return {row[1]: (row[2].upper(), bool(row[3])) for row in rows}


def test_migration_matches_models(tmp_path: Path) -> None:
    """空の DB にマイグレーションを適用すると、モデル定義どおりのテーブルができること"""
    db_path = tmp_path / "migrated.sqlite3"
    config = Config(str(PROJECT_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(PROJECT_ROOT / "alembic"))
    config.set_main_option("sqlalchemy.url", f"sqlite+aiosqlite:///{db_path}")
    command.upgrade(config, "head")

    with sqlite3.connect(db_path) as conn:
        tables = {
            row[0]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }
        assert set(SQLModel.metadata.tables) <= tables

        for name, table in SQLModel.metadata.tables.items():
            columns = _table_columns(conn, name)
            assert set(columns) == {c.name for c in table.columns}, name
            for column in table.columns:
                if column.primary_key:
                    continue
                _, not_null = columns[column.name]
                assert not_null == (not column.nullable), f"{name}.{column.name}"

        fks = conn.execute("PRAGMA foreign_key_list(file_parts)").fetchall()
        assert [(fk[2], fk[3], fk[4], fk[6]) for fk in fks] == [
            ("files", "file_id", "id", "CASCADE")
        ]
        fks = conn.execute("PRAGMA foreign_key_list(message_content_files)").fetchall()
        assert [(fk[2], fk[3], fk[4], fk[6]) for fk in fks] == [
            ("message_contents", "message_content_id", "id", "CASCADE")
        ]
        indexes = {
            row[1] for row in conn.execute("PRAGMA index_list(message_contents)")
        }
        assert {
            "message_contents_message_id_idx",
            "message_contents_created_at_idx",
        } <= indexes
        file_part_indexes = {
            row[1] for row in conn.execute("PRAGMA index_list(file_parts)")
        }
        assert "file_parts_file_id_idx" in file_part_indexes

    command.downgrade(config, "base")
    with sqlite3.connect(db_path) as conn:
        remaining = {
            row[0]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }
        assert remaining == {"alembic_version"}


def test_migration_uses_database_url_in_dotenv(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """alembic もアプリと同じく .env の DATABASE_URL の DB にマイグレーションすること"""
    db_path = tmp_path / "from-dotenv.sqlite3"
    (tmp_path / ".env").write_text(
        f"DATABASE_URL=sqlite+aiosqlite:///{db_path}\n", encoding="utf-8"
    )
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    config = Config(str(PROJECT_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(PROJECT_ROOT / "alembic"))
    command.upgrade(config, "head")

    with sqlite3.connect(db_path) as conn:
        tables = {
            row[0]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }
    assert set(SQLModel.metadata.tables) <= tables
