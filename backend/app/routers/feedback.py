from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import get_verified_tenant_id, require_admin_or_group_admin
from app.models.user import User
from app.schemas.feedback import FeedbackUserListRequest, PagedFeedbackUserResponse
from app.services.feedback_service import FeedbackService

router = APIRouter(prefix="/api/admin", tags=["feedback"])


@router.get("/feedbackUser", response_model=PagedFeedbackUserResponse)
async def get_feedback_users(
    query: Annotated[FeedbackUserListRequest, Query()],
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(require_admin_or_group_admin),
    session: AsyncSession = Depends(get_session),
) -> PagedFeedbackUserResponse:
    """フィードバックユーザー一覧取得（テナント管理者またはグループ管理者）"""
    return await FeedbackService.get_feedback_users(x_tenant_id, query, session)
