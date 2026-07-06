"""Add assistants_endpoints table

Revision ID: 006
Revises: 005
Create Date: 2026-07-06

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "006"
down_revision: str | None = "005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "assistants_endpoints",
        sa.Column("assistant_id", sa.String(32), nullable=False),
        sa.Column("endpoint_id", sa.String(32), nullable=False),
        sa.Column("tenant_id", sa.String(32), nullable=False),
        sa.Column("model", sa.String(32), nullable=False),
        sa.PrimaryKeyConstraint("assistant_id", "endpoint_id", name="pk_assistants_endpoints"),
        sa.ForeignKeyConstraint(
            ["assistant_id"], ["assistants.id"], ondelete="CASCADE", name="fk_assistants_endpoints_assistant_id"
        ),
        sa.ForeignKeyConstraint(
            ["endpoint_id"], ["tenant_endpoints.id"], ondelete="CASCADE", name="fk_assistants_endpoints_endpoint_id"
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id"], ["tenants.id"], ondelete="CASCADE", name="fk_assistants_endpoints_tenant_id"
        ),
    )


def downgrade() -> None:
    op.drop_table("assistants_endpoints")
