import uuid
from datetime import datetime
from enum import Enum

import sqlalchemy as sa
from sqlmodel import Field, SQLModel


class RoomRating(str, Enum):
    EXCELLENT = "EXCELLENT"
    VERY_GOOD = "VERY_GOOD"
    GOOD = "GOOD"
    AVERAGE = "AVERAGE"
    POOR = "POOR"


class Room(SQLModel, table=True):
    __tablename__ = "rooms"
    __table_args__ = (
        sa.UniqueConstraint("id", "tenant_id", name="uq_rooms_id_tenant_id"),
    )

    id: str = Field(
        max_length=32, primary_key=True, default_factory=lambda: uuid.uuid4().hex
    )
    tenant_id: str = Field(
        sa_column=sa.Column(
            sa.String(32),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
    )
    name: str | None = Field(default=None, max_length=255)
    default_assistant_id: str = Field(
        sa_column=sa.Column(
            sa.String(32),
            sa.ForeignKey("assistants.id", ondelete="RESTRICT"),
            nullable=False,
        ),
    )
    user_id: uuid.UUID = Field(
        sa_column=sa.Column(
            sa.UUID,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
    )
    created_at: datetime = Field(
        sa_column=sa.Column(
            sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
    updated_at: datetime = Field(
        sa_column=sa.Column(
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
        ),
    )
    rating: RoomRating | None = Field(
        default=None,
        sa_column=sa.Column(
            sa.Enum(RoomRating, name="roomrating", create_type=True),
            nullable=True,
        ),
    )


class RoomPin(SQLModel, table=True):
    __tablename__ = "room_pins"

    user_id: uuid.UUID = Field(
        sa_column=sa.Column(sa.UUID, primary_key=True, nullable=False)
    )
    tenant_id: str = Field(
        sa_column=sa.Column(
            sa.String(32),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            primary_key=True,
            nullable=False,
        ),
    )
    room_id: str = Field(
        sa_column=sa.Column(
            sa.String(32),
            sa.ForeignKey("rooms.id", ondelete="CASCADE"),
            primary_key=True,
            nullable=False,
        ),
    )
