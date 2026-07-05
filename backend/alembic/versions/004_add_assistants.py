"""Add assistants and groups_assistants tables

Revision ID: 004
Revises: 003
Create Date: 2026-07-06

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "004"
down_revision: str | None = "003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "assistants",
        sa.Column("id", sa.String(32), nullable=False),
        sa.Column("tenant_id", sa.String(32), nullable=False),
        sa.Column("type", sa.Enum("SECURE", "SAAS_CHAT", "SAAS_RAG", name="assistanttype"), nullable=False),
        sa.Column("index_id", sa.String(32), nullable=True),
        sa.Column("name", sa.String(32), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("include_history", sa.Boolean(), nullable=False),
        sa.Column("icon_color", sa.String(16), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id", name="pk_assistants"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE", name="fk_assistants_tenant_id"),
    )

    op.create_table(
        "groups_assistants",
        sa.Column("group_id", sa.String(32), nullable=False),
        sa.Column("assistant_id", sa.String(32), nullable=False),
        sa.Column("tenant_id", sa.String(32), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("group_id", "assistant_id", "tenant_id", name="pk_groups_assistants"),
        sa.ForeignKeyConstraint(
            ["group_id"], ["groups.id"], ondelete="CASCADE", name="fk_groups_assistants_group_id"
        ),
        sa.ForeignKeyConstraint(
            ["assistant_id"], ["assistants.id"], ondelete="CASCADE", name="fk_groups_assistants_assistant_id"
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id"], ["tenants.id"], ondelete="CASCADE", name="fk_groups_assistants_tenant_id"
        ),
    )


def downgrade() -> None:
    op.drop_table("groups_assistants")
    op.drop_table("assistants")
    op.execute("DROP TYPE IF EXISTS assistanttype")
