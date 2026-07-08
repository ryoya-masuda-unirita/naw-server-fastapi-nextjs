import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlmodel import Field, SQLModel


class Share(SQLModel, table=True):
    """チャットルームの共有リンク。ルーム1件につき常に0または1件。"""

    __tablename__ = "shares"
    __table_args__ = (
        sa.ForeignKeyConstraint(
            ["room_id", "tenant_id"],
            ["rooms.id", "rooms.tenant_id"],
            ondelete="CASCADE",
            name="fk_shares_room_id",
        ),
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
    room_id: str = Field(max_length=32, unique=True)
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


class ShareRoom(SQLModel, table=True):
    """共有リンクと共有先グループの中間テーブル。"""

    __tablename__ = "share_rooms"
    __table_args__ = (
        sa.UniqueConstraint(
            "share_id", "group_id", name="uq_share_rooms_share_id_group_id"
        ),
    )

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=sa.Column(
            sa.UUID,
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
    )
    tenant_id: str = Field(
        sa_column=sa.Column(
            sa.String(32),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
    )
    share_id: str = Field(
        sa_column=sa.Column(
            sa.String(32),
            sa.ForeignKey("shares.id", ondelete="CASCADE"),
            nullable=False,
        ),
    )
    room_id: str = Field(
        sa_column=sa.Column(
            sa.String(32),
            sa.ForeignKey("rooms.id", ondelete="CASCADE"),
            nullable=False,
        ),
    )
    group_id: str = Field(
        sa_column=sa.Column(
            sa.String(32),
            sa.ForeignKey("groups.id", ondelete="CASCADE"),
            nullable=False,
        ),
    )
    created_at: datetime = Field(
        sa_column=sa.Column(
            sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
