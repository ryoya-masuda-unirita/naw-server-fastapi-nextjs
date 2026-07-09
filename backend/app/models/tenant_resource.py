import uuid
from enum import Enum

import sqlalchemy as sa
from sqlmodel import Field, SQLModel


class TenantResourceType(str, Enum):
    AZURE_OPENAI = "AZURE_OPENAI"


class TenantResource(SQLModel, table=True):
    """テナントに紐づくクラウドリソース（Azure OpenAI等）。

    移植元(Spring Boot)の`TENANT_RESOURCES`テーブルに対応する。
    """

    __tablename__ = "tenant_resources"

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
    type: TenantResourceType = Field(
        sa_column=sa.Column(
            sa.Enum(TenantResourceType, name="tenantresourcetype", create_type=True),
            nullable=False,
        ),
    )
    description: str | None = Field(default=None, sa_column=sa.Column(sa.Text))
