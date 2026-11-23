from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import get_current_user, get_verified_tenant_id, require_admin
from app.models.user import User
from app.schemas.library_tag import (
    LibraryTagCreateRequest,
    LibraryTagDeleteRequest,
    LibraryTagListResponse,
    LibraryTagPageResponse,
    LibraryTagResponse,
    LibraryTagUpdateRequest,
)
from app.services.library_tag_service import LibraryTagService

library_tag_router = APIRouter(prefix="/api/libraries/tags", tags=["library-tags"])
admin_library_tag_router = APIRouter(
    prefix="/api/admin/library-tags", tags=["admin-library-tags"]
)


@library_tag_router.get("", response_model=LibraryTagListResponse)
async def list_library_tags(
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> LibraryTagListResponse:
    """ライブラリタグ一覧取得"""
    tags = await LibraryTagService.get_all_library_tags(x_tenant_id, session)
    return LibraryTagListResponse(tags=tags)


@admin_library_tag_router.get("", response_model=LibraryTagPageResponse)
async def get_library_tags(
    search: str | None = Query(default=None),
    page: int = Query(0, ge=0),
    size: int = Query(20, ge=1, le=100),
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> LibraryTagPageResponse:
    """ライブラリタグ一覧取得（管理者用、ページング・検索対応）"""
    return await LibraryTagService.get_library_tags_page(
        x_tenant_id, search, page, size, session
    )


@admin_library_tag_router.post("", response_model=LibraryTagResponse)
async def create_library_tag(
    req: LibraryTagCreateRequest,
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> LibraryTagResponse:
    """ライブラリタグ作成（管理者用）"""
    return await LibraryTagService.create_library_tag(x_tenant_id, req, session)


@admin_library_tag_router.patch("/{id}", response_model=LibraryTagResponse)
async def update_library_tag(
    id: str,
    req: LibraryTagUpdateRequest,
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> LibraryTagResponse:
    """ライブラリタグ更新（管理者用）"""
    return await LibraryTagService.update_library_tag(id, x_tenant_id, req, session)


@admin_library_tag_router.delete("", status_code=204)
async def delete_library_tags(
    req: LibraryTagDeleteRequest,
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> None:
    """ライブラリタグ一括削除（管理者用）"""
    await LibraryTagService.delete_library_tags(x_tenant_id, req.ids, session)
