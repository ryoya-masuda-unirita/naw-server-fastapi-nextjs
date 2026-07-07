from decimal import Decimal
from enum import Enum

import sqlalchemy as sa
from sqlmodel import Field, SQLModel


class AIModelEndpointType(str, Enum):
    AZURE_OPENAI_CHAT = "AZURE_OPENAI_CHAT"
    CLAUDE_CHAT = "CLAUDE_CHAT"
    GEMINI_CHAT = "GEMINI_CHAT"
    OPENAI_CHAT = "OPENAI_CHAT"
    OPENAI_WEB_SEARCH_CHAT = "OPENAI_WEB_SEARCH_CHAT"
    AZURE_OPENAI_EMBEDDING = "AZURE_OPENAI_EMBEDDING"


class AIModel(SQLModel, table=True):
    __tablename__ = "ai_models"

    id: int | None = Field(default=None, primary_key=True)
    endpoint_type: AIModelEndpointType = Field(max_length=32)
    name: str = Field(max_length=32)
    max_tokens: int
    active: bool = Field(sa_column=sa.Column(sa.Boolean, nullable=False, default=True))
    token_weight: Decimal = Field(
        default=Decimal("1.0"),
        sa_column=sa.Column(sa.Numeric(12, 6), nullable=False),
    )
