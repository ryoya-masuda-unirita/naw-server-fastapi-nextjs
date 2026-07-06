from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import get_current_user, get_verified_tenant_id, require_admin
from app.models.user import User
from app.schemas.group import (
    GroupCreateRequest,
    GroupDetailResponse,
    GroupListItemResponse,
    GroupListPageResponse,
    GroupUpdateRequest,
    GroupUserRoleUpdateRequest,
    GroupUsersAddRequest,
    PagedGroupMemberResponse,
)
from app.services.group_service import GroupService

group_router = APIRouter(prefix="/api/groups", tags=["groups"])
admin_group_router = APIRouter(prefix="/api/admin/groups", tags=["admin-groups"])
admin_all_groups_router = APIRouter(
    prefix="/api/admin/all-groups", tags=["admin-groups"]
)


@group_router.get("", response_model=list[GroupListItemResponse])
async def get_groups(
    is_belonged: bool = Query(False, alias="isBelonged"),
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[GroupListItemResponse]:
    """グループ一覧取得"""
    return await GroupService.get_groups(
        x_tenant_id, current_user, is_belonged, session
    )


@admin_group_router.get("", response_model=GroupListPageResponse)
async def list_groups(
    q: str = Query(""),
    page: int = Query(0, ge=0),
    size: int = Query(20, ge=1, le=100),
    sort: str = Query("updatedAt,desc"),
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> GroupListPageResponse:
    """グループ一覧取得（管理者向け、自分が管理するグループに自動的に絞り込まれる）"""
    return await GroupService.list_groups(
        x_tenant_id,
        current_user,
        q or None,
        sort,
        page,
        size,
        session,
        restrict_to_managed=True,
    )


@admin_all_groups_router.get("", response_model=GroupListPageResponse)
async def list_all_groups(
    q: str = Query(""),
    page: int = Query(0, ge=0),
    size: int = Query(20, ge=1, le=100),
    sort: str = Query("updatedAt,desc"),
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> GroupListPageResponse:
    """テナントすべてのグループ一覧取得（テナント管理者専用）"""
    return await GroupService.list_groups(
        x_tenant_id,
        current_user,
        q or None,
        sort,
        page,
        size,
        session,
        restrict_to_managed=False,
    )


@admin_group_router.get("/{group_id}", response_model=GroupDetailResponse)
async def get_group(
    group_id: str,
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> GroupDetailResponse:
    """グループIDでグループ取得"""
    return await GroupService.get_group_detail(
        group_id, x_tenant_id, current_user, session
    )


@admin_group_router.post("", response_model=GroupDetailResponse)
async def create_group(
    req: GroupCreateRequest,
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> GroupDetailResponse:
    """グループ作成（テナント管理者専用）"""
    return await GroupService.create_group(req, x_tenant_id, session)


@admin_group_router.patch("/{group_id}", response_model=GroupDetailResponse)
async def update_group(
    group_id: str,
    req: GroupUpdateRequest,
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> GroupDetailResponse:
    """グループ更新"""
    return await GroupService.update_group(
        group_id, req, x_tenant_id, current_user, session
    )


@admin_group_router.delete("/{group_id}", status_code=204)
async def delete_group(
    group_id: str,
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> None:
    """グループ削除（テナント管理者専用）"""
    await GroupService.delete_group(group_id, x_tenant_id, session)


@admin_group_router.get(
    "/{group_id}/users",
    response_model=PagedGroupMemberResponse,
    response_model_exclude_none=True,
)
async def get_group_users(
    group_id: str,
    search_text: str | None = Query(None, alias="searchText"),
    role: str | None = Query(None),
    page: int = Query(0, ge=0),
    size: int = Query(20, ge=1, le=100),
    sort: str = Query("name,asc"),
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> PagedGroupMemberResponse:
    """グループ所属ユーザー一覧"""
    return await GroupService.list_group_users(
        group_id,
        x_tenant_id,
        current_user,
        search_text,
        role,
        sort,
        page,
        size,
        session,
    )


@admin_group_router.post("/{group_id}/users", status_code=204)
async def add_group_users(
    group_id: str,
    req: GroupUsersAddRequest,
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    """グループにユーザーを追加"""
    await GroupService.add_group_users(
        group_id, x_tenant_id, req.userIds, current_user, session
    )


@admin_group_router.delete("/{group_id}/users/{user_id}", status_code=204)
async def remove_group_user(
    group_id: str,
    user_id: str,
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    """グループからユーザーを削除"""
    await GroupService.remove_group_user(
        group_id, x_tenant_id, user_id, current_user, session
    )


@admin_group_router.patch("/{group_id}/users/{user_id}", status_code=204)
async def update_group_user_role(
    group_id: str,
    user_id: str,
    req: GroupUserRoleUpdateRequest,
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    """グループ内ユーザーロール更新"""
    await GroupService.update_group_user_role(
        group_id, x_tenant_id, user_id, req.groupAdmin, current_user, session
    )
