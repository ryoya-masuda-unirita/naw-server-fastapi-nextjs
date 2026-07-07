import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlmodel import Field, SQLModel


class AssistantCategory(SQLModel, table=True):
    __tablename__ = "assistant_categories"
    __table_args__ = (
        sa.UniqueConstraint(
            "tenant_id", "name", name="uq_assistant_categories_tenant_id_name"
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
    name: str = Field(max_length=32)
    description: str | None = Field(
        default=None, sa_column=sa.Column(sa.Text, nullable=True)
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
    updated_user_id: uuid.UUID = Field(sa_column=sa.Column(sa.UUID, nullable=False))
