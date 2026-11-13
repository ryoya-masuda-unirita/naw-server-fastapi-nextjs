from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import get_current_user, get_verified_tenant_id
from app.models.user import User
from app.schemas.credit_usage import (
    MyCreditUsageResponse,
    WorkspaceCreditUsageResponse,
)
from app.services.credit_usage_service import CreditUsageService

router = APIRouter(prefix="/api/credit-usage", tags=["credit-usage"])


@router.get(
    "/me", response_model=MyCreditUsageResponse, response_model_exclude_none=True
)
async def get_my_credit_usage(
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> MyCreditUsageResponse:
    """ログインユーザー自身のクレジット使用状況を返す。

    Parameters
    ----------
    x_tenant_id : str
        `X-Tenant-ID`ヘッダーで検証済みのテナントID。
    current_user : User
        操作しているユーザー。
    session : AsyncSession
        データベースセッション。

    Returns
    -------
    MyCreditUsageResponse
        自身のクレジット使用状況。
    """
    return await CreditUsageService.get_my_credit_usage(
        x_tenant_id, current_user, session
    )


@router.get(
    "/workspace",
    response_model=WorkspaceCreditUsageResponse,
    response_model_exclude_none=True,
)
async def get_workspace_credit_usage(
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> WorkspaceCreditUsageResponse:
    """ワークスペース全体のクレジット使用状況を返す。

    Parameters
    ----------
    x_tenant_id : str
        `X-Tenant-ID`ヘッダーで検証済みのテナントID。
    current_user : User
        操作しているユーザー。
    session : AsyncSession
        データベースセッション。

    Returns
    -------
    WorkspaceCreditUsageResponse
        ワークスペースのクレジット使用状況。
    """
    return await CreditUsageService.get_workspace_credit_usage(x_tenant_id, session)
