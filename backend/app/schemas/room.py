from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.models.room import RoomRating


class RoomCreateRequest(BaseModel):
    name: str
    assistantId: str


class RoomUpdateRequest(BaseModel):
    name: str


class RoomFeedbackCreateRequest(BaseModel):
    rating: RoomRating


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


class AdminRoomHistoryItemResponse(BaseModel):
    id: str
    name: str | None
    defaultAssistantId: str
    userId: UUID
    userName: str | None
    indexIds: list[str]
    createdAt: datetime
    updatedAt: datetime
    shareUrl: str | None = None
    rating: RoomRating | None = None


class AdminRoomHistoryDetailResponse(RoomResponse):
    rating: RoomRating | None = None


class PagedAdminRoomHistoryResponse(BaseModel):
    content: list[AdminRoomHistoryItemResponse]
    totalElements: int
    number: int
    size: int
