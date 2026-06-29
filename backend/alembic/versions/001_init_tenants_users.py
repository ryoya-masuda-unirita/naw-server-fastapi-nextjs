"""init tenants users

Revision ID: 001
Revises:
Create Date: 2026-06-29

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "tenants",
        sa.Column("id", sa.String(32), nullable=False),
        sa.Column("name", sa.String(32), nullable=False),
        sa.Column("owner", sa.String(32), nullable=False),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("max_usage_based_credits_per_month", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("pw_policy_min_length", sa.SmallInteger(), nullable=False, server_default="12"),
        sa.Column("pw_policy_use_uppercase", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("pw_policy_use_lowercase", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("pw_policy_use_digits", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("pw_policy_use_symbols", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("pw_policy_valid_symbols", sa.String(100), nullable=False, server_default="!@#$%^&*"),
        sa.Column("pw_validity_period_days", sa.SmallInteger(), nullable=False, server_default="90"),
        sa.Column("pw_histories_limit", sa.SmallInteger(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id", name="pk_tenants"),
        sa.CheckConstraint("pw_histories_limit >= 1", name="ck_tenants_pw_histories_limit"),
    )
    op.create_index("tenants_is_deleted_idx", "tenants", ["is_deleted"])

    op.create_table(
        "users",
        sa.Column("id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("login_id", sa.String(255), nullable=False),
        sa.Column("tenant_id", sa.String(32), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("password", sa.String(255), nullable=False),
        sa.Column("role", sa.Enum("USER", "ADMIN", "SYSTEM", name="userrole"), nullable=False),
        sa.Column("login_key", sa.String(32), nullable=True),
        sa.Column("is_required_password_reset", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id", name="pk_users"),
        sa.UniqueConstraint("login_id", "tenant_id", name="uq_users_login_id_tenant_id"),
    )


def downgrade() -> None:
    op.drop_table("users")
    op.execute("DROP TYPE IF EXISTS userrole")
    op.drop_index("tenants_is_deleted_idx", table_name="tenants")
    op.drop_table("tenants")
