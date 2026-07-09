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
    """一覧取得のレスポンス。移植元同様、groupsにはグループ名を返す。

    addedAtは、グループ所属テンプレート一覧（中間テーブル起点）取得時のみ設定される
    紐付け日時。それ以外の一覧取得では常にNone。
    """

    id: str
    tenantId: str
    name: str
    description: str | None
    systemPrompt: str
    groups: set[str]
    updatedAt: datetime
    addedAt: datetime | None = None


class PagedPromptTemplateResponse(BaseModel):
    content: list[PromptTemplateResponse]
    totalElements: int
    number: int
    size: int
