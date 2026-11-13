from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import get_current_user, get_verified_tenant_id
from app.models.user import User
from app.schemas.share import (
    ShareAccessResponse,
    ShareCreateRequest,
    ShareDeleteDataResponse,
    ShareDeleteResponse,
    ShareResponse,
)
from app.services.share_service import ShareService

router = APIRouter(prefix="/api/shares", tags=["shares"])


@router.post("", response_model=ShareResponse)
async def upsert_share(
    req: ShareCreateRequest,
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ShareResponse:
    """共有リンクを作成・更新する。

    Parameters
    ----------
    req : ShareCreateRequest
        共有するルームと共有先グループ。
    x_tenant_id : str
        リクエストのテナントID。
    current_user : User
        ログイン中のユーザー。
    session : AsyncSession
        非同期DBセッション。

    Returns
    -------
    ShareResponse
        `{data: {id, roomId, teamIds}}`。
    """
    data = await ShareService.upsert(x_tenant_id, current_user, req, session)
    return ShareResponse(data=data)


@router.get("/{share_id}/access", response_model=ShareAccessResponse)
async def resolve_share_access(
    share_id: str,
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ShareAccessResponse:
    """共有リンクにアクセスできるかを解決する。

    Parameters
    ----------
    share_id : str
        共有リンクのID。
    x_tenant_id : str
        リクエストのテナントID。
    current_user : User
        ログイン中のユーザー。
    session : AsyncSession
        非同期DBセッション。

    Returns
    -------
    ShareAccessResponse
        `{data: {roomId, roomName, isReadOnly, teamIds}}`。
    """
    data = await ShareService.resolve_access(
        x_tenant_id, current_user, share_id, session
    )
    return ShareAccessResponse(data=data)


@router.delete("/{share_id}", response_model=ShareDeleteResponse)
async def delete_share(
    share_id: str,
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ShareDeleteResponse:
    """共有リンクを削除する。

    Parameters
    ----------
    share_id : str
        共有リンクのID。
    x_tenant_id : str
        リクエストのテナントID。
    current_user : User
        ログイン中のユーザー。
    session : AsyncSession
        非同期DBセッション。

    Returns
    -------
    ShareDeleteResponse
        `{data: {id}}`（移植元は 204 ではなく 200 で返す）。
    """
    await ShareService.delete(x_tenant_id, current_user, share_id, session)
    return ShareDeleteResponse(data=ShareDeleteDataResponse(id=share_id))
