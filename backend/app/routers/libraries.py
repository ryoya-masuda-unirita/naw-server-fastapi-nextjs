import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import get_current_user, get_verified_tenant_id
from app.models.user import User
from app.schemas.library import (
    LibraryGetResponse,
    LibraryListItemResponse,
    LibraryPageResponse,
    LibraryUpdateRequest,
    LibraryUpdateResponse,
)
from app.services.library_service import LibraryService

library_router = APIRouter(prefix="/api/libraries", tags=["libraries"])


@library_router.get("")
async def get_libraries(
    page: int = Query(0, ge=0),
    size: int = Query(20, ge=1, le=100),
    title: str | None = Query(default=None),
    createdBy: str | None = Query(default=None),
    excludeCreatedBy: str | None = Query(default=None),
    tagIds: list[uuid.UUID] | None = Query(default=None),
    sortBy: str = Query(default="updatedAt"),
    sortDir: str = Query(default="desc"),
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict[str, LibraryPageResponse]:
    """ライブラリ一覧取得（自身が作成 or 所属グループに共有されたもの）"""
    result = await LibraryService.get_libraries(
        x_tenant_id,
        current_user,
        page,
        size,
        title,
        createdBy,
        excludeCreatedBy,
        tagIds,
        sortBy,
        sortDir,
        session,
    )
    return {"data": result}


@library_router.get("/{room_id}/list")
async def get_library_list(
    room_id: str,
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict[str, list[LibraryListItemResponse]]:
    """ルームに紐づくライブラリ一覧取得"""
    result = await LibraryService.get_library_list(
        x_tenant_id, current_user, room_id, session
    )
    return {"data": result}


@library_router.get("/{library_id}", response_model=LibraryGetResponse)
async def get_library(
    library_id: str,
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> LibraryGetResponse:
    """ライブラリのMarkdownコンテンツ取得"""
    return await LibraryService.get_library(
        x_tenant_id, current_user, library_id, session
    )


@library_router.put("/{library_id}")
async def update_library(
    library_id: str,
    req: LibraryUpdateRequest,
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict[str, LibraryUpdateResponse]:
    """ライブラリ更新（名前・共有グループ・タグ）"""
    result = await LibraryService.update_library(
        x_tenant_id, current_user, library_id, req, session
    )
    return {"data": result}


@library_router.delete("/{library_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_library(
    library_id: str,
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    """ライブラリ削除"""
    await LibraryService.delete_library(x_tenant_id, current_user, library_id, session)
