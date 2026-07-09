from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import (
    get_verified_tenant_id,
    require_admin,
    require_admin_for_tenant_path,
)
from app.models.user import User
from app.schemas.tenant import TenantAdminPatchRequest, TenantDetailResponse
from app.services.tenant_service import TenantService

router = APIRouter(prefix="/api/admin/tenants", tags=["tenants"])


@router.get("", response_model=TenantDetailResponse)
async def get_tenant_details(
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> TenantDetailResponse:
    """テナント情報取得"""
    return await TenantService.get_tenant_detail_response(x_tenant_id, session)


@router.patch("/{tenant_id}", response_model=TenantDetailResponse)
async def patch_admin_tenant(
    request: TenantAdminPatchRequest,
    tenant_id: str = Depends(require_admin_for_tenant_path),
    session: AsyncSession = Depends(get_session),
) -> TenantDetailResponse:
    """テナント情報の部分更新（管理）"""
    return await TenantService.patch_admin_tenant(tenant_id, request, session)
