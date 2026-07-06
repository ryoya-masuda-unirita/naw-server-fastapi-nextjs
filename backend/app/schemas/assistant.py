from pydantic import BaseModel

from app.models.assistant import AssistantType
from app.models.tenant_endpoint import EndpointType


class AssistantEndpointItemResponse(BaseModel):
    id: str
    model: str
    type: EndpointType
    url: str


class AssistantGetResponse(BaseModel):
    """アシスタント一覧の1件分。category/categoriesは本スコープでは常に空。"""

    id: str
    tenantId: str
    type: AssistantType
    endpoints: list[AssistantEndpointItemResponse] = []
    name: str
    indexId: str | None
    groups: list[str]
    category: dict | None = None
    categories: list[dict] = []
    description: str | None
    includeHistory: bool
    iconColor: str | None
