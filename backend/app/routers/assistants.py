from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import get_current_user, get_verified_tenant_id
from app.models.user import User
from app.schemas.assistant import AssistantGetResponse
from app.services.assistant_service import AssistantService

router = APIRouter(prefix="/api/assistants", tags=["assistants"])


@router.get("", response_model=list[AssistantGetResponse])
async def get_assistants(
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[AssistantGetResponse]:
    """アシスタント一覧取得"""
    return await AssistantService.get_assistants(x_tenant_id, current_user, session)
