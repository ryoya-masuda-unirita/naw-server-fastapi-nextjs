"""Add ai_models table

Revision ID: 009
Revises: 008
Create Date: 2026-07-08

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "009"
down_revision: str | None = "008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "ai_models",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("endpoint_type", sa.String(32), nullable=False),
        sa.Column("name", sa.String(32), nullable=False),
        sa.Column("max_tokens", sa.Integer(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column(
            "token_weight",
            sa.Numeric(12, 6),
            nullable=False,
            server_default="1.0",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_ai_models"),
    )


def downgrade() -> None:
    op.drop_table("ai_models")
