from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator

from app.models.ai_model import AIModelEndpointType
from app.models.assistant import AssistantType
from app.models.tenant_endpoint import EndpointType


class AssistantEndpointItemResponse(BaseModel):
    id: str
    model: str
    type: EndpointType
    url: str


class AssistantCategoryItemResponse(BaseModel):
    id: str
    name: str
    description: str | None


class AssistantGetResponse(BaseModel):
    """アシスタント一覧の1件分。"""

    id: str
    tenantId: str
    type: AssistantType
    endpoints: list[AssistantEndpointItemResponse] = []
    name: str
    indexId: str | None
    groups: list[str]
    category: AssistantCategoryItemResponse | None = None
    categories: list[AssistantCategoryItemResponse] = []
    description: str | None
    includeHistory: bool
    iconColor: str | None
    addedAt: datetime | None = None


class PagedAssistantResponse(BaseModel):
    content: list[AssistantGetResponse]
    totalElements: int
    number: int
    size: int


class AssistantEndpointInput(BaseModel):
    """作成・更新リクエストに含まれるエンドポイントとモデルの組。"""

    id: str
    url: str | None = None
    model: str


class AssistantRequestBase(BaseModel):
    type: AssistantType
    endpoints: list[AssistantEndpointInput] = Field(min_length=1)
    indexId: str | None = None
    groups: list[str] | None = None
    description: str | None = Field(default=None, max_length=1000)
    includeHistory: bool = False
    iconColor: str | None = None
    categoryIds: list[str] | None = None


class AssistantCreateRequest(AssistantRequestBase):
    name: str = Field(max_length=32)

    @field_validator("name")
    @classmethod
    def _validate_name(cls, value: str) -> str:
        """アシスタント表示名が空白のみでないことを検証する。"""
        if not value.strip():
            raise ValueError("アシスタント表示名は必須です")
        return value


class AssistantUpdateRequest(AssistantRequestBase):
    name: str | None = Field(default=None, max_length=32)

    @field_validator("name")
    @classmethod
    def _validate_name(cls, value: str | None) -> str | None:
        """アシスタント表示名が送信された場合のみ、空白のみでないことを検証する。

        Noneまたは空文字は「変更なし」として許可する（移植元の
        `isNameNotBlankWhenPresent`と同様、空白のみの非空文字列だけを拒否する）。
        """
        if value is not None and value != "" and not value.strip():
            raise ValueError("アシスタント表示名は空白にできません")
        return value


class AssistantEndpointResponse(BaseModel):
    """種別ごとの選択可能テナントエンドポイント一覧の1件分。"""

    id: str
    endpoint: str
    endpointName: str
    type: EndpointType


class AIModelResponse(BaseModel):
    id: int
    endpointType: AIModelEndpointType
    name: str
    maxTokens: int
    active: bool
    tokenWeight: Decimal
