"""Add tenant_endpoints table

Revision ID: 005
Revises: 004
Create Date: 2026-07-06

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "005"
down_revision: str | None = "004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "tenant_endpoints",
        sa.Column("id", sa.String(32), nullable=False),
        sa.Column("tenant_id", sa.String(32), nullable=False),
        sa.Column(
            "type",
            sa.Enum(
                "LOCAL_SERVER",
                "VDB",
                "AZURE_OPENAI_CHAT",
                "CLAUDE_CHAT",
                "GEMINI_CHAT",
                "OPENAI_CHAT",
                "OPENAI_WEB_SEARCH_CHAT",
                "AZURE_OPENAI_EMBEDDING",
                name="endpointtype",
            ),
            nullable=False,
        ),
        sa.Column("endpoint_name", sa.String(255), nullable=False),
        sa.Column("endpoint", sa.String(255), nullable=False),
        sa.Column("api_key", sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_tenant_endpoints"),
        sa.ForeignKeyConstraint(
            ["tenant_id"], ["tenants.id"], ondelete="CASCADE", name="fk_tenant_endpoints_tenant_id"
        ),
    )


def downgrade() -> None:
    op.drop_table("tenant_endpoints")
    op.execute("DROP TYPE IF EXISTS endpointtype")
