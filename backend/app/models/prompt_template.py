import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlmodel import Field, SQLModel


class PromptTemplate(SQLModel, table=True):
    __tablename__ = "prompt_templates"

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
    name: str = Field(max_length=32)
    description: str | None = Field(
        default=None, sa_column=sa.Column(sa.Text, nullable=True)
    )
    system_prompt: str = Field(sa_column=sa.Column(sa.Text, nullable=False))
    updated_at: datetime = Field(
        sa_column=sa.Column(
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
        ),
    )


class GroupPromptTemplate(SQLModel, table=True):
    """グループとプロンプトテンプレートの中間テーブル（`GroupAssistant`と同様のパターン）。"""

    __tablename__ = "groups_prompt_templates"

    group_id: str = Field(
        sa_column=sa.Column(
            sa.String(32),
            sa.ForeignKey("groups.id", ondelete="CASCADE"),
            primary_key=True,
            nullable=False,
        ),
    )
    prompt_template_id: str = Field(
        sa_column=sa.Column(
            sa.String(32),
            sa.ForeignKey("prompt_templates.id", ondelete="CASCADE"),
            primary_key=True,
            nullable=False,
        ),
    )
    tenant_id: str = Field(
        sa_column=sa.Column(
            sa.String(32),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            primary_key=True,
            nullable=False,
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
