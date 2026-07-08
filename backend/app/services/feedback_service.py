from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.message_feedback_repository import MessageFeedbackRepository
from app.schemas.feedback import (
    FeedbackRoomCount,
    FeedbackUserInfo,
    FeedbackUserItemResponse,
    FeedbackUserListRequest,
    PagedFeedbackUserResponse,
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


class FeedbackService:
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
