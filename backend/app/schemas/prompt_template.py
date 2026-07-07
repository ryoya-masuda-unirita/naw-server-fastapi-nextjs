from datetime import datetime

from pydantic import BaseModel


class PromptTemplateCreateRequest(BaseModel):
    name: str
    description: str | None = None
    systemPrompt: str
    groups: set[str] | None = None


class PromptTemplateCreateResponse(BaseModel):
    """作成・更新のレスポンス。移植元同様、groupsにはグループIDを返す。"""

    id: str
    tenantId: str
    name: str
    description: str | None
    systemPrompt: str
    groups: set[str]


class PromptTemplateResponse(BaseModel):
    """一覧取得のレスポンス。移植元同様、groupsにはグループ名を返す。"""

    id: str
    tenantId: str
    name: str
    description: str | None
    systemPrompt: str
    groups: set[str]
    updatedAt: datetime


class PagedPromptTemplateResponse(BaseModel):
    content: list[PromptTemplateResponse]
    totalElements: int
    number: int
    size: int
