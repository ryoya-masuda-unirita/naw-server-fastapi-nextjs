"""Add shares and share_rooms tables

Revision ID: 013
Revises: 012
Create Date: 2026-07-08

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "013"
down_revision: str | None = "012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "shares",
        sa.Column("id", sa.String(32), nullable=False),
        sa.Column("tenant_id", sa.String(32), nullable=False),
        sa.Column("room_id", sa.String(32), nullable=False),
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
        sa.PrimaryKeyConstraint("id", name="pk_shares"),
        sa.UniqueConstraint("room_id", name="uq_shares_room_id"),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            ondelete="CASCADE",
            name="fk_shares_tenant_id",
        ),
        sa.ForeignKeyConstraint(
            ["room_id", "tenant_id"],
            ["rooms.id", "rooms.tenant_id"],
            ondelete="CASCADE",
            name="fk_shares_room_id",
        ),
    )

    op.create_table(
        "share_rooms",
        sa.Column(
            "id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column("tenant_id", sa.String(32), nullable=False),
        sa.Column("share_id", sa.String(32), nullable=False),
        sa.Column("room_id", sa.String(32), nullable=False),
        sa.Column("group_id", sa.String(32), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("id", name="pk_share_rooms"),
        sa.UniqueConstraint(
            "share_id", "group_id", name="uq_share_rooms_share_id_group_id"
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            ondelete="CASCADE",
            name="fk_share_rooms_tenant_id",
        ),
        sa.ForeignKeyConstraint(
            ["share_id"],
            ["shares.id"],
            ondelete="CASCADE",
            name="fk_share_rooms_share_id",
        ),
        sa.ForeignKeyConstraint(
            ["room_id"], ["rooms.id"], ondelete="CASCADE", name="fk_share_rooms_room_id"
        ),
        sa.ForeignKeyConstraint(
            ["group_id"],
            ["groups.id"],
            ondelete="CASCADE",
            name="fk_share_rooms_group_id",
        ),
    )


def downgrade() -> None:
    op.drop_table("share_rooms")
    op.drop_table("shares")
