"""Add token_usages table

Revision ID: 015
Revises: 014
Create Date: 2026-07-09

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "015"
down_revision: str | None = "014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "token_usages",
        sa.Column("id", sa.String(32), nullable=False),
        sa.Column("tenant_id", sa.String(32), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=True),
        sa.Column("room_id", sa.String(32), nullable=True),
        sa.Column("message_id", sa.String(32), nullable=True),
        sa.Column("endpoint_type", sa.String(32), nullable=True),
        sa.Column("model", sa.String(32), nullable=False),
        sa.Column("input_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("output_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("input_credits", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column(
            "output_credits", sa.BigInteger(), nullable=False, server_default="0"
        ),
        sa.Column("embedding_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "embedding_credits", sa.BigInteger(), nullable=False, server_default="0"
        ),
        sa.Column(
            "total_tokens",
            sa.BigInteger(),
            sa.Computed(
                "input_tokens + output_tokens + embedding_tokens", persisted=True
            ),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("id", name="pk_token_usages"),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            ondelete="CASCADE",
            name="fk_token_usages_tenant_id",
        ),
        sa.ForeignKeyConstraint(
            ["message_id"],
            ["messages.id"],
            ondelete="SET NULL",
            name="fk_token_usages_message_id",
        ),
    )
    op.create_index(
        "idx_token_usages_tenant_id", "token_usages", ["tenant_id"], unique=False
    )
    op.create_index(
        "idx_token_usages_user_id", "token_usages", ["user_id"], unique=False
    )
    op.create_index(
        "idx_token_usages_tenant_id_created_at",
        "token_usages",
        ["tenant_id", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("idx_token_usages_tenant_id_created_at", table_name="token_usages")
    op.drop_index("idx_token_usages_user_id", table_name="token_usages")
    op.drop_index("idx_token_usages_tenant_id", table_name="token_usages")
    op.drop_table("token_usages")
