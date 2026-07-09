"""Add plans and subscriptions tables

Revision ID: 019
Revises: 018
Create Date: 2026-07-09

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "019"
down_revision: str | None = "018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "plans",
        sa.Column("id", sa.String(32), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("max_users", sa.Integer(), nullable=False),
        sa.Column("max_credits_per_month", sa.BigInteger(), nullable=True),
        sa.PrimaryKeyConstraint("id", name="pk_plans"),
    )

    op.create_table(
        "subscriptions",
        sa.Column("id", sa.String(32), nullable=False),
        sa.Column("tenant_id", sa.String(32), nullable=False),
        sa.Column("plan_id", sa.String(32), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "ACTIVE",
                "CANCELLED",
                "EXPIRED",
                "PENDING",
                "TRIAL",
                name="subscriptionstatus",
            ),
            nullable=False,
        ),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=True),
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
        sa.PrimaryKeyConstraint("id", name="pk_subscriptions"),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            ondelete="CASCADE",
            name="fk_subscriptions_tenant_id",
        ),
        sa.ForeignKeyConstraint(
            ["plan_id"],
            ["plans.id"],
            ondelete="RESTRICT",
            name="fk_subscriptions_plan_id",
        ),
    )
    op.create_index("idx_subscriptions_tenant_id", "subscriptions", ["tenant_id"])


def downgrade() -> None:
    op.drop_index("idx_subscriptions_tenant_id", table_name="subscriptions")
    op.drop_table("subscriptions")
    sa.Enum(name="subscriptionstatus").drop(op.get_bind(), checkfirst=True)
    op.drop_table("plans")
