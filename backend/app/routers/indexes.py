from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import get_verified_tenant_id, require_admin_or_group_admin
from app.models.user import User
from app.schemas.index import IndexRequest, IndexResponse, PagedIndexResponse
from app.services.index_service import IndexService

admin_router = APIRouter(prefix="/api/admin/indexes", tags=["admin-indexes"])


@admin_router.get("", response_model=PagedIndexResponse)
async def get_indexes(
    group_id: str | None = Query(None, alias="groupId"),
    search_text: str | None = Query(None, alias="searchText"),
    page: int = Query(0, ge=0),
    size: int = Query(20, ge=1, le=100),
    sort: str = Query("updatedAt,desc"),
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(require_admin_or_group_admin),
    session: AsyncSession = Depends(get_session),
) -> PagedIndexResponse:
    """インデックス一覧取得（グループ管理者は自分の管理範囲のみに絞り込まれる）"""
    sort_parts = sort.split(",")
    sort_col_name = sort_parts[0]
    sort_dir = sort_parts[1] if len(sort_parts) > 1 else "asc"
    return await IndexService.list_indexes(
        x_tenant_id,
        current_user,
        group_id,
        search_text,
        sort_col_name,
        sort_dir,
        page,
        size,
        session,
    )


@admin_router.get("/{index_id}", response_model=IndexResponse)
async def get_index_by_id(
    index_id: str,
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(require_admin_or_group_admin),
    session: AsyncSession = Depends(get_session),
) -> IndexResponse:
    """インデックス詳細取得"""
    return await IndexService.get_index(index_id, x_tenant_id, current_user, session)


@admin_router.post("", response_model=IndexResponse)
async def create_index(
    req: IndexRequest,
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(require_admin_or_group_admin),
    session: AsyncSession = Depends(get_session),
) -> IndexResponse:
    """インデックス作成"""
    return await IndexService.create_index(x_tenant_id, req, session)


@admin_router.patch("/{index_id}", response_model=IndexResponse)
async def update_index(
    index_id: str,
    req: IndexRequest,
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(require_admin_or_group_admin),
    session: AsyncSession = Depends(get_session),
) -> IndexResponse:
    """インデックス更新（全フィールド置換）"""
    return await IndexService.update_index(index_id, x_tenant_id, req, session)


@admin_router.delete("/{index_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_index(
    index_id: str,
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(require_admin_or_group_admin),
    session: AsyncSession = Depends(get_session),
) -> None:
    """インデックス削除"""
    await IndexService.delete_index(index_id, x_tenant_id, session)
