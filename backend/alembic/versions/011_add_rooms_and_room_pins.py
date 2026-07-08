"""Add rooms and room_pins tables

Revision ID: 011
Revises: 010
Create Date: 2026-07-08

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "011"
down_revision: str | None = "010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "rooms",
        sa.Column("id", sa.String(32), nullable=False),
        sa.Column("tenant_id", sa.String(32), nullable=False),
        sa.Column("name", sa.String(255), nullable=True),
        sa.Column("default_assistant_id", sa.String(32), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
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
        sa.Column(
            "rating",
            sa.Enum(
                "EXCELLENT",
                "VERY_GOOD",
                "GOOD",
                "AVERAGE",
                "POOR",
                name="roomrating",
            ),
            nullable=True,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_rooms"),
        sa.UniqueConstraint("id", "tenant_id", name="uq_rooms_id_tenant_id"),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            ondelete="CASCADE",
            name="fk_rooms_tenant_id",
        ),
        sa.ForeignKeyConstraint(
            ["default_assistant_id"],
            ["assistants.id"],
            ondelete="RESTRICT",
            name="fk_rooms_default_assistant_id",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE",
            name="fk_rooms_user_id",
        ),
    )

    op.create_table(
        "room_pins",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("tenant_id", sa.String(32), nullable=False),
        sa.Column("room_id", sa.String(32), nullable=False),
        sa.PrimaryKeyConstraint("user_id", "tenant_id", "room_id", name="pk_room_pins"),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            ondelete="CASCADE",
            name="fk_room_pins_tenant_id",
        ),
        sa.ForeignKeyConstraint(
            ["room_id"],
            ["rooms.id"],
            ondelete="CASCADE",
            name="fk_room_pins_room_id",
        ),
    )


def downgrade() -> None:
    op.drop_table("room_pins")
    op.drop_table("rooms")
    op.execute("DROP TYPE IF EXISTS roomrating")
