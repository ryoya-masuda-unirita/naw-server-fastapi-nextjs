from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import get_current_user, get_verified_tenant_id
from app.models.user import User
from app.schemas.share import (
    ShareAccessDataResponse,
    ShareCreateRequest,
    ShareDataResponse,
)
from app.services.share_service import ShareService

router = APIRouter(prefix="/api/shares", tags=["shares"])


@router.post("", response_model=ShareDataResponse)
async def upsert_share(
    req: ShareCreateRequest,
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ShareDataResponse:
    """共有リンク作成・更新"""
    return await ShareService.upsert(x_tenant_id, current_user, req, session)


@router.get("/{share_id}/access", response_model=ShareAccessDataResponse)
async def resolve_share_access(
    share_id: str,
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ShareAccessDataResponse:
    """共有リンクアクセス解決"""
    return await ShareService.resolve_access(
        x_tenant_id, current_user, share_id, session
    )


@router.delete("/{share_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_share(
    share_id: str,
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    """共有リンク削除"""
    await ShareService.delete(x_tenant_id, current_user, share_id, session)
