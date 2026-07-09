"""Add indexes, indexes_endpoints and indexes_groups tables

Revision ID: 017
Revises: 016
Create Date: 2026-07-09

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "017"
down_revision: str | None = "016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "indexes",
        sa.Column("id", sa.String(32), nullable=False),
        sa.Column("tenant_id", sa.String(32), nullable=False),
        sa.Column(
            "type",
            sa.Enum("SAAS_GLOBAL", "LOCAL", name="indextype"),
            nullable=False,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.String(255), nullable=True),
        sa.Column("add", sa.String(32), nullable=True),
        sa.Column("delete", sa.String(32), nullable=True),
        sa.Column("get", sa.String(32), nullable=True),
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
        sa.PrimaryKeyConstraint("id", name="pk_indexes"),
        sa.UniqueConstraint("id", "tenant_id", name="uq_indexes_id_tenant_id"),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            ondelete="CASCADE",
            name="fk_indexes_tenant_id",
        ),
    )

    op.create_table(
        "indexes_endpoints",
        sa.Column("index_id", sa.String(32), nullable=False),
        sa.Column("tenant_id", sa.String(32), nullable=False),
        sa.Column("endpoint_id", sa.String(32), nullable=False),
        sa.PrimaryKeyConstraint("index_id", "endpoint_id", name="pk_indexes_endpoints"),
        sa.ForeignKeyConstraint(
            ["index_id", "tenant_id"],
            ["indexes.id", "indexes.tenant_id"],
            ondelete="CASCADE",
            name="fk_indexes_endpoints_index_id",
        ),
        sa.ForeignKeyConstraint(
            ["endpoint_id"],
            ["tenant_endpoints.id"],
            ondelete="CASCADE",
            name="fk_indexes_endpoints_endpoint_id",
        ),
    )

    op.create_table(
        "indexes_groups",
        sa.Column("index_id", sa.String(32), nullable=False),
        sa.Column("tenant_id", sa.String(32), nullable=False),
        sa.Column("group_id", sa.String(32), nullable=False),
        sa.PrimaryKeyConstraint("index_id", "group_id", name="pk_indexes_groups"),
        sa.ForeignKeyConstraint(
            ["index_id", "tenant_id"],
            ["indexes.id", "indexes.tenant_id"],
            ondelete="CASCADE",
            name="fk_indexes_groups_index_id",
        ),
        sa.ForeignKeyConstraint(
            ["group_id"],
            ["groups.id"],
            ondelete="CASCADE",
            name="fk_indexes_groups_group_id",
        ),
    )


def downgrade() -> None:
    op.drop_table("indexes_groups")
    op.drop_table("indexes_endpoints")
    op.drop_table("indexes")
    sa.Enum(name="indextype").drop(op.get_bind(), checkfirst=True)
