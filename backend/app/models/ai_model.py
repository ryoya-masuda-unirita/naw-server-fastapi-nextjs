from decimal import Decimal
from enum import Enum

import sqlalchemy as sa
from sqlmodel import Field, SQLModel

from app.models.tenant_endpoint import EndpointType


class AIModelEndpointType(str, Enum):
    AZURE_OPENAI_CHAT = "AZURE_OPENAI_CHAT"
    CLAUDE_CHAT = "CLAUDE_CHAT"
    GEMINI_CHAT = "GEMINI_CHAT"
    OPENAI_CHAT = "OPENAI_CHAT"
    OPENAI_WEB_SEARCH_CHAT = "OPENAI_WEB_SEARCH_CHAT"
    AZURE_OPENAI_EMBEDDING = "AZURE_OPENAI_EMBEDDING"
    BEDROCK_CHAT = "BEDROCK_CHAT"


# チャット（LLMチャットAPI・メッセージ送信）で扱えるAIモデルの種別と、それに対応する
# テナントエンドポイントの種別。モデル検索の絞り込み・エンドポイントの解決をこの1か所で
# 管理し、プロバイダ追加時の更新漏れを防ぐ。サービス同士は呼び合わない規約のため、
# 複数のサービス・リポジトリが共有する置き場としてmodelsに置く。
CHAT_TENANT_ENDPOINT_TYPES: dict[AIModelEndpointType, EndpointType] = {
    AIModelEndpointType.AZURE_OPENAI_CHAT: EndpointType.AZURE_OPENAI_CHAT,
    AIModelEndpointType.BEDROCK_CHAT: EndpointType.BEDROCK_CHAT,
}

# `CHAT_TENANT_ENDPOINT_TYPES`の逆引き（テナントエンドポイント種別 → AIモデル種別）。
CHAT_AI_MODEL_ENDPOINT_TYPES: dict[EndpointType, AIModelEndpointType] = {
    tenant_type: model_type
    for model_type, tenant_type in CHAT_TENANT_ENDPOINT_TYPES.items()
}


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
