"""Add messages, message_contents, message_files and message_feedbacks tables

Revision ID: 012
Revises: 011
Create Date: 2026-07-08

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "012"
down_revision: str | None = "011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "messages",
        sa.Column("id", sa.String(32), nullable=False),
        sa.Column("tenant_id", sa.String(32), nullable=False),
        sa.Column("room_id", sa.String(32), nullable=False),
        sa.Column("assistant_id", sa.String(32), nullable=True),
        sa.Column("parent_id", sa.String(32), nullable=True),
        sa.Column("tools", sa.Text(), nullable=True),
        sa.Column("prompt_template_content", sa.Text(), nullable=True),
        sa.Column(
            "is_create_library", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        sa.PrimaryKeyConstraint("id", name="pk_messages"),
        sa.UniqueConstraint("id", "tenant_id", name="uq_messages_id_tenant_id"),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            ondelete="CASCADE",
            name="fk_messages_tenant_id",
        ),
        sa.ForeignKeyConstraint(
            ["room_id", "tenant_id"],
            ["rooms.id", "rooms.tenant_id"],
            ondelete="CASCADE",
            name="fk_messages_room_id",
        ),
        sa.ForeignKeyConstraint(
            ["assistant_id"],
            ["assistants.id"],
            ondelete="SET NULL",
            name="fk_messages_assistant_id",
        ),
        sa.ForeignKeyConstraint(
            ["parent_id"],
            ["messages.id"],
            ondelete="CASCADE",
            name="fk_messages_parent_id",
        ),
    )

    op.create_table(
        "message_contents",
        sa.Column("id", sa.String(32), nullable=False),
        sa.Column("tenant_id", sa.String(32), nullable=False),
        sa.Column("message_id", sa.String(32), nullable=False),
        sa.Column(
            "status",
            sa.Enum("OK", "ERROR", name="messagecontentstatus"),
            nullable=False,
        ),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("answer", sa.Text(), nullable=False),
        sa.Column("context", sa.Text(), nullable=True),
        sa.Column("file_paths", sa.Text(), nullable=True),
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
        sa.PrimaryKeyConstraint("id", name="pk_message_contents"),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            ondelete="CASCADE",
            name="fk_message_contents_tenant_id",
        ),
        sa.ForeignKeyConstraint(
            ["message_id"],
            ["messages.id"],
            ondelete="CASCADE",
            name="fk_message_contents_message_id",
        ),
    )
    op.create_index(
        "message_contents_created_at_idx",
        "message_contents",
        ["id", "created_at"],
        unique=False,
    )

    op.create_table(
        "message_files",
        sa.Column("id", sa.String(32), nullable=False),
        sa.Column("tenant_id", sa.String(32), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("type", sa.String(128), nullable=False),
        sa.Column("data", sa.LargeBinary(), nullable=False),
        sa.Column("message_id", sa.String(32), nullable=False),
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
        sa.PrimaryKeyConstraint("id", name="pk_message_files"),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            ondelete="CASCADE",
            name="fk_message_files_tenant_id",
        ),
        sa.ForeignKeyConstraint(
            ["message_id"],
            ["message_contents.id"],
            ondelete="CASCADE",
            name="fk_message_files_message_content_id",
        ),
    )

    op.create_table(
        "message_feedbacks",
        sa.Column("id", sa.String(32), nullable=False),
        sa.Column("tenant_id", sa.String(32), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("message_id", sa.String(32), nullable=False),
        sa.Column(
            "rating", sa.Enum("GOOD", "BAD", name="messagerating"), nullable=False
        ),
        sa.Column("index_id", sa.String(64), nullable=True),
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
        sa.PrimaryKeyConstraint("id", name="pk_message_feedbacks"),
        sa.UniqueConstraint("message_id", name="uq_message_feedbacks_message_id"),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            ondelete="CASCADE",
            name="fk_message_feedbacks_tenant_id",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE",
            name="fk_message_feedbacks_user_id",
        ),
        sa.ForeignKeyConstraint(
            ["message_id"],
            ["messages.id"],
            ondelete="CASCADE",
            name="fk_message_feedbacks_message_id",
        ),
    )


def downgrade() -> None:
    op.drop_table("message_feedbacks")
    op.execute("DROP TYPE IF EXISTS messagerating")
    op.drop_table("message_files")
    op.drop_index("message_contents_created_at_idx", table_name="message_contents")
    op.drop_table("message_contents")
    op.execute("DROP TYPE IF EXISTS messagecontentstatus")
    op.drop_table("messages")
