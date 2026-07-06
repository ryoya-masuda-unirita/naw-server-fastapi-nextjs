import uuid
from enum import Enum

import sqlalchemy as sa
from sqlmodel import Field, SQLModel


class EndpointType(str, Enum):
    LOCAL_SERVER = "LOCAL_SERVER"
    VDB = "VDB"
    AZURE_OPENAI_CHAT = "AZURE_OPENAI_CHAT"
    CLAUDE_CHAT = "CLAUDE_CHAT"
    GEMINI_CHAT = "GEMINI_CHAT"
    OPENAI_CHAT = "OPENAI_CHAT"
    OPENAI_WEB_SEARCH_CHAT = "OPENAI_WEB_SEARCH_CHAT"
    AZURE_OPENAI_EMBEDDING = "AZURE_OPENAI_EMBEDDING"


class TenantEndpoint(SQLModel, table=True):
    __tablename__ = "tenant_endpoints"

    id: str = Field(max_length=32, primary_key=True, default_factory=lambda: uuid.uuid4().hex)
    tenant_id: str = Field(
        sa_column=sa.Column(sa.String(32), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
    )
    type: EndpointType = Field(
        sa_column=sa.Column(sa.Enum(EndpointType, name="endpointtype", create_type=True), nullable=False),
    )
    endpoint_name: str = Field(max_length=255)
    endpoint: str = Field(max_length=255)
    api_key: str = Field(sa_column=sa.Column(sa.Text, nullable=False))
