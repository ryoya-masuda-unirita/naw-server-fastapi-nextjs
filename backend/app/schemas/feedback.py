from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.models.message import MessageRating
from app.models.room import RoomRating

_RESPONSE_STATUS_VALUES = {"has_response", "no_response"}
_SATISFACTION_VALUES = {"star1", "star2", "star3", "star4", "star5"}
_SORT_FIELD_VALUES = {
    "updatedAt",
    "name",
    "count",
    "review1",
    "review2",
    "review3",
    "review4",
    "review5",
}
_SORT_ORDER_VALUES = {"asc", "desc"}
_FEEDBACK_MESSAGE_SORT_FIELD_VALUES = {"updatedAt", "name", "accuracy", "add", "folder"}
_FEEDBACK_ROOM_SORT_FIELD_VALUES = {"updatedAt", "chat", "name", "level"}


class FeedbackUserListRequest(BaseModel):
    page: int = Field(default=0, ge=0)
    size: int = Field(default=20, ge=1, le=100)
    responseStatus: str | None = None
    satisfaction: str | None = None
    sortField: str = "updatedAt"
    sortOrder: str = "desc"

    @field_validator("responseStatus")
    @classmethod
    def _validate_response_status(cls, value: str | None) -> str | None:
        """responseStatusがhas_response/no_responseのいずれかであることを検証する。"""
        if value is not None and value not in _RESPONSE_STATUS_VALUES:
            raise ValueError("responseStatus は has_response または no_response です")
        return value

    @field_validator("satisfaction")
    @classmethod
    def _validate_satisfaction(cls, value: str | None) -> str | None:
        """satisfactionがstar1〜star5のいずれかであることを検証する。"""
        if value is not None and value not in _SATISFACTION_VALUES:
            raise ValueError("satisfaction は star1〜star5 のいずれかです")
        return value

    @field_validator("sortField")
    @classmethod
    def _validate_sort_field(cls, value: str) -> str:
        """sortFieldが許容値のいずれかであることを検証する。"""
        if value not in _SORT_FIELD_VALUES:
            raise ValueError(
                "sortField は updatedAt, name, count, review1〜review5 のいずれかです"
            )
        return value

    @field_validator("sortOrder")
    @classmethod
    def _validate_sort_order(cls, value: str) -> str:
        """sortOrderがasc/descのいずれかであることを検証する。"""
        if value not in _SORT_ORDER_VALUES:
            raise ValueError("sortOrder は asc または desc です")
        return value


class FeedbackUserInfo(BaseModel):
    id: str
    userId: str
    displayName: str


class FeedbackRoomCount(BaseModel):
    excellent: int = 0
    veryGood: int = 0
    good: int = 0
    average: int = 0
    poor: int = 0


class FeedbackUserItemResponse(BaseModel):
    user: FeedbackUserInfo
    isResponded: bool
    feedbackMessageCount: int
    feedbackRoomCount: FeedbackRoomCount
    updatedAt: datetime


class PagedFeedbackUserResponse(BaseModel):
    content: list[FeedbackUserItemResponse]
    totalElements: int
    number: int
    size: int
    totalPages: int
    numberOfElements: int


class FeedbackUserListResponse(BaseModel):
    feedbacks: PagedFeedbackUserResponse


class FeedbackMessageListRequest(BaseModel):
    page: int = Field(default=0, ge=0)
    size: int = Field(default=20, ge=1, le=100)
    assistantId: str | None = None
    rating: MessageRating | None = None
    folderId: str | None = None
    sortField: str = "updatedAt"
    sortOrder: str = "desc"

    @field_validator("sortField")
    @classmethod
    def _validate_feedback_message_sort_field(cls, value: str) -> str:
        """feedbackMessage用のsortFieldが許容値のいずれかであることを検証する。"""
        if value not in _FEEDBACK_MESSAGE_SORT_FIELD_VALUES:
            raise ValueError(
                "sortField は updatedAt, name, accuracy, add, folder のいずれかです"
            )
        return value

    @field_validator("sortOrder")
    @classmethod
    def _validate_feedback_message_sort_order(cls, value: str) -> str:
        """feedbackMessage用のsortOrderがasc/descのいずれかであることを検証する。"""
        if value not in _SORT_ORDER_VALUES:
            raise ValueError("sortOrder は asc または desc です")
        return value


class FeedbackMessageContentResponse(BaseModel):
    question: str | None
    answer: str | None


class FeedbackMessageInfoResponse(BaseModel):
    assistantId: str | None
    assistantName: str | None
    content: FeedbackMessageContentResponse


class FeedbackMessageItemResponse(BaseModel):
    id: str
    tenantId: str
    userId: str
    messageId: str
    message: FeedbackMessageInfoResponse
    rating: MessageRating
    indexId: str | None
    createdAt: datetime
    updatedAt: datetime


class PagedFeedbackMessageResponse(BaseModel):
    content: list[FeedbackMessageItemResponse]
    totalElements: int
    number: int
    size: int
    totalPages: int
    numberOfElements: int


class ExternalServerInfoResponse(BaseModel):
    url: str
    authKey: str


class FeedbackMessageListResponse(BaseModel):
    feedbacks: PagedFeedbackMessageResponse
    assistantIdToServerMap: dict[str, ExternalServerInfoResponse]


class FeedbackRoomListRequest(BaseModel):
    page: int = Field(default=0, ge=0)
    size: int = Field(default=20, ge=1, le=100)
    assistantId: str | None = None
    rating: RoomRating | None = None
    sortField: str = "updatedAt"
    sortOrder: str = "desc"

    @field_validator("sortField")
    @classmethod
    def _validate_feedback_room_sort_field(cls, value: str) -> str:
        """feedbackRoom用のsortFieldが許容値のいずれかであることを検証する。"""
        if value not in _FEEDBACK_ROOM_SORT_FIELD_VALUES:
            raise ValueError("sortField は updatedAt, chat, name, level のいずれかです")
        return value

    @field_validator("sortOrder")
    @classmethod
    def _validate_feedback_room_sort_order(cls, value: str) -> str:
        """feedbackRoom用のsortOrderがasc/descのいずれかであることを検証する。"""
        if value not in _SORT_ORDER_VALUES:
            raise ValueError("sortOrder は asc または desc です")
        return value


class RoomInfoResponse(BaseModel):
    id: str
    name: str | None
    defaultAssistantId: str | None
    defaultAssistantName: str | None
    rating: RoomRating


class FeedbackRoomItemResponse(BaseModel):
    id: str
    tenantId: str
    userId: str
    userName: str | None
    roomId: str
    room: RoomInfoResponse
    rating: RoomRating
    createdAt: datetime
    updatedAt: datetime


class PagedFeedbackRoomResponse(BaseModel):
    content: list[FeedbackRoomItemResponse]
    totalElements: int
    number: int
    size: int
    totalPages: int
    numberOfElements: int


class FeedbackRoomListResponse(BaseModel):
    feedbacks: PagedFeedbackRoomResponse
