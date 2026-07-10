"""Add files table

Revision ID: 021
Revises: 020
Create Date: 2026-07-09

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "021"
down_revision: str | None = "020"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "files",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("tenant_id", sa.String(32), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("display_name", sa.String(255), nullable=True),
        sa.Column("reference", sa.String(255), nullable=True),
        sa.Column("status", sa.SmallInteger(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("index_id", sa.String(32), nullable=False),
        sa.Column("storage_url", sa.String(2048), nullable=True),
        sa.Column("feedback_id", sa.String(32), nullable=True),
        sa.Column("room_id", sa.String(32), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("id", name="pk_files"),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            ondelete="CASCADE",
            name="fk_files_tenant_id",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE",
            name="fk_files_user_id",
        ),
        sa.ForeignKeyConstraint(
            ["index_id", "tenant_id"],
            ["indexes.id", "indexes.tenant_id"],
            ondelete="CASCADE",
            name="fk_files_index_id",
        ),
        sa.ForeignKeyConstraint(
            ["feedback_id"],
            ["message_feedbacks.id"],
            ondelete="CASCADE",
            name="fk_files_feedback_id",
        ),
        sa.ForeignKeyConstraint(
            ["room_id", "tenant_id"],
            ["rooms.id", "rooms.tenant_id"],
            ondelete="CASCADE",
            name="fk_files_room_id",
        ),
    )
    op.create_index("idx_files_tenant_id", "files", ["tenant_id"])
    op.create_index("idx_files_index_id", "files", ["index_id"])


def downgrade() -> None:
    op.drop_index("idx_files_index_id", table_name="files")
    op.drop_index("idx_files_tenant_id", table_name="files")
    op.drop_table("files")
