from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import (
    get_current_user,
    get_verified_tenant_id,
    require_admin_or_group_admin,
)
from app.models.assistant import AssistantType
from app.models.user import User
from app.schemas.assistant import (
    AIModelResponse,
    AssistantCreateRequest,
    AssistantEndpointResponse,
    AssistantGetResponse,
    AssistantUpdateRequest,
    PagedAssistantResponse,
)
from app.services.assistant_service import AssistantService

router = APIRouter(prefix="/api/assistants", tags=["assistants"])
admin_router = APIRouter(prefix="/api/admin/assistants", tags=["admin-assistants"])


@router.get("", response_model=list[AssistantGetResponse])
async def get_assistants(
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[AssistantGetResponse]:
    """アシスタント一覧取得"""
    return await AssistantService.get_assistants(x_tenant_id, current_user, session)


@admin_router.post("", response_model=AssistantGetResponse)
async def create_assistant(
    req: AssistantCreateRequest,
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(require_admin_or_group_admin),
    session: AsyncSession = Depends(get_session),
) -> AssistantGetResponse:
    """アシスタント作成（テナント管理者またはグループ管理者）"""
    return await AssistantService.create_assistant(x_tenant_id, req, session)


@admin_router.patch("/{assistant_id}", response_model=AssistantGetResponse)
async def update_assistant(
    assistant_id: str,
    req: AssistantUpdateRequest,
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(require_admin_or_group_admin),
    session: AsyncSession = Depends(get_session),
) -> AssistantGetResponse:
    """アシスタント更新（テナント管理者またはグループ管理者）"""
    return await AssistantService.update_assistant(
        assistant_id, x_tenant_id, req, session
    )


@admin_router.delete("/{assistant_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_assistant(
    assistant_id: str,
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(require_admin_or_group_admin),
    session: AsyncSession = Depends(get_session),
) -> None:
    """アシスタント削除（テナント管理者またはグループ管理者）"""
    await AssistantService.delete_assistant(assistant_id, x_tenant_id, session)


@admin_router.get("", response_model=PagedAssistantResponse)
async def list_admin_assistants(
    q: str = Query(""),
    type: AssistantType | None = Query(None),
    category_id: str | None = Query(None, alias="categoryId"),
    group_id: str | None = Query(None, alias="groupId"),
    exclude_group_id: str | None = Query(None, alias="excludeGroupId"),
    page: int = Query(0, ge=0),
    size: int = Query(20, ge=1, le=100),
    sort: str = Query("updatedAt,desc"),
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(require_admin_or_group_admin),
    session: AsyncSession = Depends(get_session),
) -> PagedAssistantResponse:
    """アシスタント一覧取得（管理者向け。グループ管理者は自分の管理グループのみに絞り込まれる）"""
    return await AssistantService.list_admin_assistants(
        x_tenant_id,
        current_user,
        q or None,
        type,
        category_id,
        group_id,
        exclude_group_id,
        sort,
        page,
        size,
        session,
    )


@admin_router.get("/endpoints/{type}", response_model=list[AssistantEndpointResponse])
async def get_assistant_endpoints(
    type: AssistantType,
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(require_admin_or_group_admin),
    session: AsyncSession = Depends(get_session),
) -> list[AssistantEndpointResponse]:
    """種別ごとの選択可能テナントエンドポイント一覧取得"""
    return await AssistantService.get_assistant_endpoints(type, x_tenant_id, session)


@admin_router.get("/AIModels", response_model=list[AIModelResponse])
async def get_ai_models(
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(require_admin_or_group_admin),
    session: AsyncSession = Depends(get_session),
) -> list[AIModelResponse]:
    """AIモデル一覧取得"""
    return await AssistantService.get_ai_models(session)
