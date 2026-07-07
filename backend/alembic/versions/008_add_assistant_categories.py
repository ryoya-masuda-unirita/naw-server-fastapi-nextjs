"""Add assistant_categories table

Revision ID: 008
Revises: 007
Create Date: 2026-07-07

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "008"
down_revision: str | None = "007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "assistant_categories",
        sa.Column("id", sa.String(32), nullable=False),
        sa.Column("tenant_id", sa.String(32), nullable=False),
        sa.Column("name", sa.String(32), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
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
        sa.Column("updated_user_id", sa.UUID(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_assistant_categories"),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            ondelete="CASCADE",
            name="fk_assistant_categories_tenant_id",
        ),
        sa.UniqueConstraint(
            "tenant_id", "name", name="uq_assistant_categories_tenant_id_name"
        ),
    )


def downgrade() -> None:
    op.drop_table("assistant_categories")
