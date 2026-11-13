from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.models.room import RoomRating


class RoomCreateRequest(BaseModel):
    """ルーム作成のリクエスト。"""

    name: str
    assistantId: str


class RoomUpdateRequest(BaseModel):
    """ルーム更新のリクエスト。"""

    name: str


class RoomFeedbackCreateRequest(BaseModel):
    """ルームへのフィードバック登録のリクエスト。"""

    rating: RoomRating


class RoomResponse(BaseModel):
    """ルームのレスポンス。"""

    id: str
    tenantId: str
    name: str | None
    defaultAssistantId: str
    userId: UUID
    createdAt: datetime
    updatedAt: datetime


class RoomListItemResponse(RoomResponse):
    """ルーム一覧の1件分のレスポンス。"""

    pinned: bool


class PagedRoomResponse(BaseModel):
    """ルーム一覧のページングレスポンス。"""

    content: list[RoomListItemResponse]
    totalElements: int
    number: int
    size: int


class AdminRoomHistoryItemResponse(BaseModel):
    """管理者向けルーム履歴一覧の1件分のレスポンス。"""

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
    """管理者向けルーム履歴詳細のレスポンス。"""

    rating: RoomRating | None = None


class PagedAdminRoomHistoryResponse(BaseModel):
    """管理者向けルーム履歴一覧のページングレスポンス。"""

    content: list[AdminRoomHistoryItemResponse]
    totalElements: int
    number: int
    size: int
