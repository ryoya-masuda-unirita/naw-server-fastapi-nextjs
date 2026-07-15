from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import get_current_user, get_verified_tenant_id, require_admin
from app.models.user import User
from app.schemas.user import (
    PagedUserResponse,
    UserCreateRequest,
    UserCreateResponse,
    UserProfileUpdateRequest,
    UserResponse,
    UserUpdateRequest,
    UserUpdateResponse,
)
from app.services.user_service import UserService

admin_router = APIRouter(prefix="/api/admin/users", tags=["admin-users"])
user_router = APIRouter(prefix="/api/users", tags=["users"])


@admin_router.get(
    "",
    response_model=PagedUserResponse,
    response_model_exclude_none=True,
)
async def get_users(
    x_tenant_id: str = Depends(get_verified_tenant_id),
    page: int = Query(0, ge=0),
    size: int = Query(20, ge=1, le=1000),
    sort: str = Query("created_at,desc"),
    searchText: str | None = Query(None),
    role: str | None = Query(None),
    excludeGroupId: str | None = Query(None),
    includeUsage: bool = Query(False),
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> PagedUserResponse:
    return await UserService.get_users(
        x_tenant_id,
        page,
        size,
        sort,
        searchText,
        role,
        excludeGroupId,
        session,
        include_usage=includeUsage,
    )


@admin_router.post("", response_model=UserCreateResponse)
async def create_user(
    req: UserCreateRequest,
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> UserCreateResponse:
    return await UserService.create_user(req, x_tenant_id, session)


@admin_router.patch("/{user_id}", response_model=UserUpdateResponse)
async def update_user(
    user_id: str,
    req: UserUpdateRequest,
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> UserUpdateResponse:
    return await UserService.update_user(user_id, req, x_tenant_id, session)


@admin_router.delete("/{user_id}", status_code=204)
async def delete_user(
    user_id: str,
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> None:
    await UserService.delete_user(user_id, x_tenant_id, session)


@user_router.get("/profile", response_model=UserResponse)
async def get_profile(
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> UserResponse:
    return await UserService.get_profile(current_user.login_id, x_tenant_id, session)


@user_router.patch("/profile", response_model=UserResponse)
async def update_profile(
    req: UserProfileUpdateRequest,
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> UserResponse:
    return await UserService.update_profile(
        current_user.login_id, req, x_tenant_id, session
    )
