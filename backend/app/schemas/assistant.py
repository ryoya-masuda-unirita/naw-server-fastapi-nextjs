from pydantic import BaseModel

from app.models.assistant import AssistantType


class AssistantGetResponse(BaseModel):
    """アシスタント一覧の1件分。endpoints/category/categoriesは本スコープでは常に空。"""

    id: str
    tenantId: str
    type: AssistantType
    endpoints: list[dict] = []
    name: str
    indexId: str | None
    groups: list[str]
    category: dict | None = None
    categories: list[dict] = []
    description: str | None
    includeHistory: bool
    iconColor: str | None
