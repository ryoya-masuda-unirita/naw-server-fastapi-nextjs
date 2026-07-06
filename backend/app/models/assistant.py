import uuid
from datetime import datetime
from enum import Enum

import sqlalchemy as sa
from sqlmodel import Field, SQLModel


class AssistantType(str, Enum):
    SECURE = "SECURE"
    SAAS_CHAT = "SAAS_CHAT"
    SAAS_RAG = "SAAS_RAG"


class Assistant(SQLModel, table=True):
    __tablename__ = "assistants"

    id: str = Field(max_length=32, primary_key=True, default_factory=lambda: uuid.uuid4().hex)
    tenant_id: str = Field(
        sa_column=sa.Column(sa.String(32), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
    )
    type: AssistantType = Field(
        sa_column=sa.Column(sa.Enum(AssistantType, name="assistanttype", create_type=True), nullable=False),
    )
    index_id: str | None = Field(default=None, max_length=32)
    name: str = Field(max_length=32)
    description: str | None = Field(default=None, sa_column=sa.Column(sa.Text, nullable=True))
    include_history: bool = Field(sa_column=sa.Column(sa.Boolean, nullable=False))
    icon_color: str | None = Field(default=None, max_length=16)
    created_at: datetime = Field(
        sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    updated_at: datetime = Field(
        sa_column=sa.Column(
            sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now(), onupdate=sa.func.now()
        ),
    )


class GroupAssistant(SQLModel, table=True):
    """グループとアシスタントの中間テーブル（`GroupUser`と同様のパターン）。

    `assistants_endpoints`・`assistant_category_mappings`は本スコープ外のため未移植。
    """

    __tablename__ = "groups_assistants"

    group_id: str = Field(
        sa_column=sa.Column(
            sa.String(32), sa.ForeignKey("groups.id", ondelete="CASCADE"), primary_key=True, nullable=False
        ),
    )
    assistant_id: str = Field(
        sa_column=sa.Column(
            sa.String(32), sa.ForeignKey("assistants.id", ondelete="CASCADE"), primary_key=True, nullable=False
        ),
    )
    tenant_id: str = Field(
        sa_column=sa.Column(
            sa.String(32), sa.ForeignKey("tenants.id", ondelete="CASCADE"), primary_key=True, nullable=False
        ),
    )
    updated_at: datetime = Field(
        sa_column=sa.Column(
            sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now(), onupdate=sa.func.now()
        ),
    )


class AssistantEndpoint(SQLModel, table=True):
    """アシスタントとテナントエンドポイントの中間テーブル。

    `GroupAssistant`等と異なり、主キーは`(assistant_id, endpoint_id)`で`tenant_id`を含まない
    （移植元の最終スキーマに準拠）。
    """

    __tablename__ = "assistants_endpoints"

    assistant_id: str = Field(
        sa_column=sa.Column(
            sa.String(32), sa.ForeignKey("assistants.id", ondelete="CASCADE"), primary_key=True, nullable=False
        ),
    )
    endpoint_id: str = Field(
        sa_column=sa.Column(
            sa.String(32),
            sa.ForeignKey("tenant_endpoints.id", ondelete="CASCADE"),
            primary_key=True,
            nullable=False,
        ),
    )
    tenant_id: str = Field(
        sa_column=sa.Column(sa.String(32), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
    )
    model: str = Field(max_length=32)
