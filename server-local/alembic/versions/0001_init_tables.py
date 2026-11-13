"""移植元 Liquibase changelog（message_contents / message_content_files / files /
file_parts / library_contents）の最終形を 1 本にまとめた初期テーブル定義

Revision ID: 0001
Revises:
Create Date: 2026-11-12

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _timestamps() -> list[sa.Column]:
    """各テーブル共通の作成日時・更新日時の列を作る。

    移植元の Liquibase と同じく、どちらも NOT NULL で DB 側の現在時刻を既定値にする。
    ``sa.Column`` は 1 つのテーブルにしか属せないため、テーブルごとに新しく作る。

    Returns
    -------
    list[sa.Column]
        ``created_at`` と ``updated_at`` の列。
    """
    return [
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.current_timestamp(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.current_timestamp(),
        ),
    ]


def upgrade() -> None:
    """初期テーブルとインデックスを作る。

    移植元 Liquibase changelog の最終形に合わせ、message_contents（と message_id・
    created_at のインデックス）、message_content_files、files、file_parts、
    library_contents を作る。
    """
    op.create_table(
        "message_contents",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("message_id", sa.String(32), nullable=False, unique=True),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("answer", sa.Text(), nullable=False),
        sa.Column("context", sa.Text(), nullable=True),
        sa.Column("file_paths", sa.Text(), nullable=True),
        *_timestamps(),
    )
    op.create_index(
        "message_contents_message_id_idx", "message_contents", ["message_id"]
    )
    op.create_index(
        "message_contents_created_at_idx", "message_contents", ["id", "created_at"]
    )

    op.create_table(
        "message_content_files",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column(
            "message_content_id",
            sa.String(32),
            sa.ForeignKey(
                "message_contents.id",
                name="fk_message_content_files_message_content_id",
                ondelete="CASCADE",
            ),
            nullable=False,
        ),
        sa.Column("name", sa.String(256), nullable=False),
        sa.Column("type", sa.String(128), nullable=False),
        sa.Column("data", sa.LargeBinary(), nullable=False),
        *_timestamps(),
    )

    op.create_table(
        "files",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("tenant_id", sa.String(32), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("display_name", sa.String(255), nullable=True),
        sa.Column("reference", sa.String(255), nullable=True),
        sa.Column("status", sa.SmallInteger(), nullable=False),
        sa.Column("user_id", sa.String(255), nullable=False),
        sa.Column("index_id", sa.String(32), nullable=False),
        sa.Column("storage_url", sa.String(2048), nullable=True),
        sa.Column("feedback_id", sa.String(32), nullable=True),
        sa.Column("room_id", sa.String(32), nullable=True),
        *_timestamps(),
    )

    op.create_table(
        "file_parts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("tenant_id", sa.String(32), nullable=False),
        sa.Column(
            "file_id",
            sa.String(255),
            sa.ForeignKey("files.id", name="fk_file_parts_file_id", ondelete="CASCADE"),
            nullable=False,
        ),
        *_timestamps(),
        sa.UniqueConstraint("id", "file_id", name="uk_file_parts_id_file_id"),
    )

    op.create_table(
        "library_contents",
        sa.Column("library_id", sa.String(36), primary_key=True),
        sa.Column("content", sa.Text(), nullable=False),
        *_timestamps(),
    )


def downgrade() -> None:
    """upgrade で作ったテーブルとインデックスを削除する。

    外部キーで参照される側より先に参照する側を消すよう、作成と逆の順で削除する。
    """
    op.drop_table("library_contents")
    op.drop_table("file_parts")
    op.drop_table("files")
    op.drop_table("message_content_files")
    op.drop_index("message_contents_created_at_idx", table_name="message_contents")
    op.drop_index("message_contents_message_id_idx", table_name="message_contents")
    op.drop_table("message_contents")
