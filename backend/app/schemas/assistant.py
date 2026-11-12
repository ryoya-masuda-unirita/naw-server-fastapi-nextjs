from datetime import datetime
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, Field, field_validator

from app.core.validation_messages import RequestModel, ValidationMessages
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


NAME_MAX_LENGTH = 32
DESCRIPTION_MAX_LENGTH = 1000
_NAME_REQUIRED_MESSAGE = "アシスタント表示名は必須です"
_NAME_SIZE_MESSAGE = "アシスタント表示名は32文字以内で入力してください"


class AssistantEndpointInput(RequestModel):
    """作成・更新リクエストに含まれるエンドポイントとモデルの組。"""

    id: Annotated[str, ValidationMessages(not_blank="エンドポイントIDは必須です")]
    url: str | None = None
    model: Annotated[str, ValidationMessages(not_blank="生成AIモデルは必須です")]


class AssistantRequestBase(RequestModel):
    type: Annotated[
        AssistantType,
        ValidationMessages(not_null="接続サーバー（タイプ）を指定してください。"),
    ]
    endpoints: Annotated[
        list[AssistantEndpointInput],
        Field(min_length=1),
        ValidationMessages(not_empty="少なくとも1つのエンドポイントが必要です。"),
    ]
    indexId: str | None = None
    groups: list[str] | None = None
    description: Annotated[
        str | None,
        Field(max_length=DESCRIPTION_MAX_LENGTH),
        ValidationMessages(size="アシスタントの説明は1000文字以内で入力してください"),
    ] = None
    includeHistory: bool = False
    iconColor: str | None = None
    categoryIds: list[str] | None = None


class AssistantCreateRequest(AssistantRequestBase):
    name: Annotated[
        str,
        Field(max_length=NAME_MAX_LENGTH),
        ValidationMessages(not_blank=_NAME_REQUIRED_MESSAGE, size=_NAME_SIZE_MESSAGE),
    ]

    @field_validator("name")
    @classmethod
    def _validate_name(cls, value: str) -> str:
        """アシスタント表示名が空白のみでないことを検証する。"""
        if not value.strip():
            raise ValueError(_NAME_REQUIRED_MESSAGE)
        return value


class AssistantUpdateRequest(AssistantRequestBase):
    name: Annotated[
        str | None,
        Field(max_length=NAME_MAX_LENGTH),
        ValidationMessages(size=_NAME_SIZE_MESSAGE),
    ] = None

    @field_validator("name")
    @classmethod
    def _validate_name(cls, value: str | None) -> str | None:
        """アシスタント表示名が送信された場合のみ、空白のみでないことを検証する。

        Noneまたは空文字は「変更なし」として許可する（移植元の
        `isNameNotBlankWhenPresent`と同様、空白のみの非空文字列だけを拒否する）。
        """
        if value is not None and value != "" and not value.strip():
            raise ValueError("アシスタント表示名は空白にできません。")
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
