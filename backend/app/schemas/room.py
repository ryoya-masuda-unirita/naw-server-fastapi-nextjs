from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class RoomCreateRequest(BaseModel):
    name: str
    assistantId: str


class RoomUpdateRequest(BaseModel):
    name: str


class RoomResponse(BaseModel):
    id: str
    tenantId: str
    name: str | None
    defaultAssistantId: str
    userId: UUID
    createdAt: datetime
    updatedAt: datetime


class RoomListItemResponse(RoomResponse):
    pinned: bool


class PagedRoomResponse(BaseModel):
    content: list[RoomListItemResponse]
    totalElements: int
    number: int
    size: int
