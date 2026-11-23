from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import get_verified_tenant_id, require_admin_or_group_admin
from app.models.user import User
from app.schemas.token_usage import (
    TokenUsageListQuery,
    TokenUsageListResponse,
    TokenUsagePeriodQuery,
    TokenUsageSummaryResponse,
)
from app.services.token_usage_service import TokenUsageService

admin_router = APIRouter(prefix="/api/admin/token-usages", tags=["admin-token-usages"])


@admin_router.get("", response_model=TokenUsageListResponse)
async def get_token_usages(
    query: Annotated[TokenUsageListQuery, Query()],
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(require_admin_or_group_admin),
    session: AsyncSession = Depends(get_session),
) -> TokenUsageListResponse:
    """トークン使用量の一覧を期間・ユーザーで絞り込んで返す。

    Parameters
    ----------
    query : Annotated[TokenUsageListQuery, Query()]
        期間・ユーザー・ページングのクエリパラメータ。
    x_tenant_id : str
        `X-Tenant-ID`ヘッダーで検証済みのテナントID。
    current_user : User
        操作しているユーザー。
    session : AsyncSession
        データベースセッション。

    Returns
    -------
    TokenUsageListResponse
        トークン使用量の一覧。
    """
    return await TokenUsageService.list_token_usages(x_tenant_id, query, session)


@admin_router.get("/summary", response_model=TokenUsageSummaryResponse)
async def get_token_usage_summary(
    query: Annotated[TokenUsagePeriodQuery, Query()],
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(require_admin_or_group_admin),
    session: AsyncSession = Depends(get_session),
) -> TokenUsageSummaryResponse:
    """トークン使用量の期間集計を返す。

    Parameters
    ----------
    query : Annotated[TokenUsagePeriodQuery, Query()]
        期間のクエリパラメータ。
    x_tenant_id : str
        `X-Tenant-ID`ヘッダーで検証済みのテナントID。
    current_user : User
        操作しているユーザー。
    session : AsyncSession
        データベースセッション。

    Returns
    -------
    TokenUsageSummaryResponse
        トークン使用量の集計結果。
    """
    return await TokenUsageService.get_summary(x_tenant_id, query, session)
