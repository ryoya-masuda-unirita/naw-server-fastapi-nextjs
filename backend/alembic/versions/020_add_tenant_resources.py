"""Add tenant_resources table

Revision ID: 020
Revises: 019
Create Date: 2026-07-09

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "020"
down_revision: str | None = "019"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "tenant_resources",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("tenant_id", sa.String(32), nullable=False),
        sa.Column(
            "type",
            sa.Enum("AZURE_OPENAI", name="tenantresourcetype"),
            nullable=False,
        ),
        sa.Column("description", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id", name="pk_tenant_resources"),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            ondelete="CASCADE",
            name="fk_tenant_resources_tenant_id",
        ),
    )
    op.create_index("idx_tenant_resources_tenant_id", "tenant_resources", ["tenant_id"])


def downgrade() -> None:
    op.drop_index("idx_tenant_resources_tenant_id", table_name="tenant_resources")
    op.drop_table("tenant_resources")
    sa.Enum(name="tenantresourcetype").drop(op.get_bind(), checkfirst=True)
