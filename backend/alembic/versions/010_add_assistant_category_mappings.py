"""Add assistant_category_mappings table

Revision ID: 010
Revises: 009
Create Date: 2026-07-08

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "010"
down_revision: str | None = "009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "assistant_category_mappings",
        sa.Column("assistant_id", sa.String(32), nullable=False),
        sa.Column("category_id", sa.String(32), nullable=False),
        sa.Column("tenant_id", sa.String(32), nullable=False),
        sa.PrimaryKeyConstraint(
            "assistant_id", "category_id", name="pk_assistant_category_mappings"
        ),
        sa.ForeignKeyConstraint(
            ["assistant_id"],
            ["assistants.id"],
            ondelete="CASCADE",
            name="fk_mapping_assistant",
        ),
        sa.ForeignKeyConstraint(
            ["category_id"],
            ["assistant_categories.id"],
            ondelete="CASCADE",
            name="fk_mapping_category",
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            ondelete="CASCADE",
            name="fk_assistant_category_mappings_tenant_id",
        ),
    )


def downgrade() -> None:
    op.drop_table("assistant_category_mappings")
