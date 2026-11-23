import uuid
from datetime import datetime
from enum import IntEnum

import sqlalchemy as sa
from sqlmodel import Field, SQLModel


class FileStatus(IntEnum):
    """ファイルの状態。

    移植元（Spring Boot）のJPA `@Enumerated` 未指定（ORDINAL保存）を踏襲し、
    DB上は`ENABLE=0, DISABLE=1, DELETED=2`の整数値で保存する。
    """

    ENABLE = 0
    DISABLE = 1
    DELETED = 2


class File(SQLModel, table=True):
    """インデックス配下のファイル（移植元`File`エンティティ相当）。

    移植元のLiquibase最終形（`files-007b-drop-composite-pk-use-id-only`）に合わせ、
    主キーは`id`単独とする。`file_parts`（埋め込みチャンク）は本Issue（#87）のスコープ外
    （Issue #88でベクトルDB連携と合わせて追加する）のためモデル化しない。
    """

    __tablename__ = "files"

    id: str = Field(
        max_length=36, primary_key=True, default_factory=lambda: uuid.uuid4().hex
    )
    tenant_id: str = Field(
        sa_column=sa.Column(
            sa.String(32),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
    )
    name: str = Field(max_length=255)
    display_name: str | None = Field(default=None, max_length=255)
    reference: str | None = Field(default=None, max_length=255)
    status: FileStatus = Field(
        sa_column=sa.Column(sa.SmallInteger, nullable=False),
    )
    user_id: uuid.UUID = Field(
        sa_column=sa.Column(
            sa.UUID,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
    )
    index_id: str = Field(max_length=32, nullable=False)
    storage_url: str | None = Field(default=None, max_length=2048)
    feedback_id: str | None = Field(
        default=None,
        sa_column=sa.Column(
            sa.String(32),
            sa.ForeignKey("message_feedbacks.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    room_id: str | None = Field(default=None, max_length=32)
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

    __table_args__ = (
        sa.ForeignKeyConstraint(
            ["index_id", "tenant_id"],
            ["indexes.id", "indexes.tenant_id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["room_id", "tenant_id"],
            ["rooms.id", "rooms.tenant_id"],
            ondelete="CASCADE",
        ),
    )
