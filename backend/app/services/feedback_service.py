from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tenant_endpoint import EndpointType
from app.repositories.assistant_endpoint_repository import AssistantEndpointRepository
from app.repositories.assistant_repository import AssistantRepository
from app.repositories.message_feedback_repository import MessageFeedbackRepository
from app.repositories.room_repository import RoomRepository
from app.schemas.feedback import (
    ExternalServerInfoResponse,
    FeedbackMessageContentResponse,
    FeedbackMessageInfoResponse,
    FeedbackMessageItemResponse,
    FeedbackMessageListRequest,
    FeedbackMessageListResponse,
    FeedbackRoomCount,
    FeedbackRoomItemResponse,
    FeedbackRoomListRequest,
    FeedbackRoomListResponse,
    FeedbackUserInfo,
    FeedbackUserItemResponse,
    FeedbackUserListRequest,
    PagedFeedbackMessageResponse,
    PagedFeedbackRoomResponse,
    PagedFeedbackUserResponse,
    RoomInfoResponse,
)

_SORT_FIELD_TO_COLUMN = {
    "name": "display_name",
    "count": "feedback_message_count",
    "updatedAt": "latest_updated_at",
    "review5": "excellent",
    "review4": "very_good",
    "review3": "good",
    "review2": "average",
    "review1": "poor",
}
_FEEDBACK_MESSAGE_SORT_FIELD_TO_COLUMN = {
    "updatedAt": "updated_at",
    "name": "assistant_id",
    "accuracy": "rating",
    "add": "index_id",
    "folder": "index_id",
}
_FEEDBACK_ROOM_SORT_FIELD_TO_COLUMN = {
    "updatedAt": "updated_at",
    "chat": "room_name",
    "name": "assistant_id",
    "level": "rating",
}


class FeedbackService:
    @staticmethod
    async def get_feedback_messages(
        tenant_id: str, query: FeedbackMessageListRequest, session: AsyncSession
    ) -> FeedbackMessageListResponse:
        """テナント内のフィードバックメッセージ一覧を取得する。"""
        sort_column = _FEEDBACK_MESSAGE_SORT_FIELD_TO_COLUMN[query.sortField]
        rows, total = await MessageFeedbackRepository.find_feedback_messages(
            tenant_id,
            query.assistantId,
            query.rating.value if query.rating is not None else None,
            query.folderId,
            sort_column,
            query.sortOrder == "desc",
            query.page,
            query.size,
            session,
        )

        assistant_ids = sorted({row.assistant_id for row in rows if row.assistant_id})
        assistants = await AssistantRepository.find_by_ids_and_tenant_id(
            assistant_ids, tenant_id, session
        )
        assistant_names = {assistant.id: assistant.name for assistant in assistants}

        endpoints_map = await AssistantEndpointRepository.find_tenant_endpoints_grouped_by_assistant_id(
            assistant_ids, tenant_id, session
        )
        assistant_id_to_server_map: dict[str, ExternalServerInfoResponse] = {}
        for row in rows:
            if (
                row.assistant_id is None
                or row.question is not None
                or row.answer is not None
            ):
                continue
            local_server_endpoint = next(
                (
                    endpoint
                    for endpoint in endpoints_map.get(row.assistant_id, [])
                    if endpoint.type == EndpointType.LOCAL_SERVER
                ),
                None,
            )
            if local_server_endpoint is None:
                continue
            assistant_id_to_server_map[row.assistant_id] = ExternalServerInfoResponse(
                url=local_server_endpoint.endpoint,
                authKey=local_server_endpoint.api_key,
            )

        content = [
            FeedbackMessageItemResponse(
                id=row.feedback_id,
                tenantId=row.tenant_id,
                userId=str(row.user_id),
                messageId=row.message_id,
                message=FeedbackMessageInfoResponse(
                    assistantId=row.assistant_id,
                    assistantName=(
                        assistant_names.get(row.assistant_id)
                        if row.assistant_id is not None
                        else None
                    ),
                    content=FeedbackMessageContentResponse(
                        question=row.question,
                        answer=row.answer,
                    ),
                ),
                rating=row.rating,
                indexId=row.index_id,
                createdAt=row.created_at,
                updatedAt=row.updated_at,
            )
            for row in rows
        ]

        return FeedbackMessageListResponse(
            feedbacks=PagedFeedbackMessageResponse(
                content=content,
                totalElements=total,
                number=query.page,
                size=query.size,
            ),
            assistantIdToServerMap=assistant_id_to_server_map,
        )

    @staticmethod
    async def get_feedback_users(
        tenant_id: str, query: FeedbackUserListRequest, session: AsyncSession
    ) -> PagedFeedbackUserResponse:
        """テナント内のフィードバックユーザー一覧を取得する。

        Args:
            tenant_id: テナントID。
            query: 絞り込み・ソート・ページング条件。
            session: 非同期DBセッション。

        Returns:
            フィードバックユーザー一覧（ページング済み）。
        """
        sort_column = _SORT_FIELD_TO_COLUMN[query.sortField]
        rows, total = await MessageFeedbackRepository.find_feedback_users(
            tenant_id,
            query.responseStatus,
            query.satisfaction,
            sort_column,
            query.sortOrder == "desc",
            query.page,
            query.size,
            session,
        )

        content = [
            FeedbackUserItemResponse(
                user=FeedbackUserInfo(
                    id=str(row.user_id),
                    userId=row.login_id,
                    displayName=row.display_name,
                ),
                isResponded=row.feedback_message_count > 0,
                feedbackMessageCount=row.feedback_message_count,
                feedbackRoomCount=FeedbackRoomCount(
                    excellent=row.excellent,
                    veryGood=row.very_good,
                    good=row.good,
                    average=row.average,
                    poor=row.poor,
                ),
                updatedAt=row.latest_updated_at,
            )
            for row in rows
        ]

        return PagedFeedbackUserResponse(
            content=content,
            totalElements=total,
            number=query.page,
            size=query.size,
        )

    @staticmethod
    async def get_feedback_rooms(
        tenant_id: str, query: FeedbackRoomListRequest, session: AsyncSession
    ) -> FeedbackRoomListResponse:
        """テナント内の評価済みルーム一覧を取得する。"""
        sort_column = _FEEDBACK_ROOM_SORT_FIELD_TO_COLUMN[query.sortField]
        rows, total = await RoomRepository.find_feedback_rooms(
            tenant_id,
            query.assistantId,
            query.rating,
            sort_column,
            query.sortOrder == "desc",
            query.page,
            query.size,
            session,
        )

        content = [
            FeedbackRoomItemResponse(
                id=row.room_id,
                tenantId=row.tenant_id,
                userId=str(row.user_id),
                userName=row.user_name,
                roomId=row.room_id,
                room=RoomInfoResponse(
                    id=row.room_id,
                    name=row.room_name,
                    defaultAssistantId=row.assistant_id,
                    defaultAssistantName=row.assistant_name,
                    rating=row.rating,
                ),
                rating=row.rating,
                createdAt=row.created_at,
                updatedAt=row.updated_at,
            )
            for row in rows
        ]

        return FeedbackRoomListResponse(
            feedbacks=PagedFeedbackRoomResponse(
                content=content,
                totalElements=total,
                number=query.page,
                size=query.size,
            )
        )
