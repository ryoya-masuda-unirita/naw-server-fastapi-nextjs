from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import require_admin, require_admin_for_tenant_path
from app.models.tenant_endpoint import EndpointType
from app.models.user import User
from app.schemas.tenant_endpoint import (
    EndpointResponse,
    LocalServerEndpointResponse,
    TenantEndpointCreateRequest,
    TenantEndpointUpdateRequest,
)
from app.services.tenant_endpoint_service import TenantEndpointService

router = APIRouter(prefix="/api/admin/tenants", tags=["tenant-endpoints"])

# 移植元Java（TenantController）では他のエンドポイント（/admin/tenants/...）とは異なり
# /api/tenants/endpoints 配下にあり、レスポンス形状（apiKeyを含む）も異なるため、
# 独立したAPIRouterとして定義する（groups.pyが複数routerを1ファイルで定義する構成を踏襲）。
local_endpoint_router = APIRouter(
    prefix="/api/tenants/endpoints", tags=["tenant-endpoints"]
)


@router.get("/{tenant_id}/endpoints", response_model=list[EndpointResponse])
async def get_endpoints(
    tenant_id: str = Depends(require_admin_for_tenant_path),
    session: AsyncSession = Depends(get_session),
) -> list[EndpointResponse]:
    """エンドポイント一覧取得"""
    return await TenantEndpointService.get_endpoints(tenant_id, session)


@router.post("/{tenant_id}/endpoints", response_model=EndpointResponse)
async def create_endpoint(
    req: TenantEndpointCreateRequest,
    tenant_id: str = Depends(require_admin_for_tenant_path),
    session: AsyncSession = Depends(get_session),
) -> EndpointResponse:
    """エンドポイント作成"""
    return await TenantEndpointService.create_endpoint(tenant_id, req, session)


@router.patch("/{tenant_id}/endpoints/{endpoint_id}", response_model=EndpointResponse)
async def update_endpoint(
    endpoint_id: str,
    req: TenantEndpointUpdateRequest,
    tenant_id: str = Depends(require_admin_for_tenant_path),
    session: AsyncSession = Depends(get_session),
) -> EndpointResponse:
    """エンドポイント更新"""
    return await TenantEndpointService.update_endpoint(
        endpoint_id, tenant_id, req, session
    )


@router.delete("/{tenant_id}/endpoints/{endpoint_id}", status_code=204)
async def delete_endpoint(
    endpoint_id: str,
    tenant_id: str = Depends(require_admin_for_tenant_path),
    session: AsyncSession = Depends(get_session),
) -> None:
    """エンドポイント削除"""
    await TenantEndpointService.delete_endpoint(endpoint_id, tenant_id, session)


@router.get("/endpoints/{type}", response_model=list[EndpointResponse])
async def get_endpoints_by_type(
    type: EndpointType,
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> list[EndpointResponse]:
    """タイプ別エンドポイント一覧取得"""
    return await TenantEndpointService.get_endpoints_by_type(
        current_user.tenant_id, type, session
    )


@local_endpoint_router.get(
    "/local/{endpoint_id}", response_model=LocalServerEndpointResponse
)
async def get_local_server_endpoint(
    endpoint_id: str,
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> LocalServerEndpointResponse:
    """ローカルサーバーエンドポイント取得（apiKeyを含む）"""
    return await TenantEndpointService.get_local_server_endpoint(
        current_user.tenant_id, endpoint_id, session
    )
