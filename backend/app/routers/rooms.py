from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import (
    get_current_user,
    get_verified_tenant_id,
    require_admin_or_group_admin,
)
from app.models.user import User
from app.schemas.room import (
    AdminRoomHistoryDetailResponse,
    PagedRoomResponse,
    PagedAdminRoomHistoryResponse,
    RoomCreateRequest,
    RoomFeedbackCreateRequest,
    RoomResponse,
    RoomUpdateRequest,
)
from app.services.room_service import RoomService

router = APIRouter(prefix="/api/rooms", tags=["rooms"])
admin_router = APIRouter(prefix="/api/admin", tags=["admin-rooms"])


@router.get("", response_model=PagedRoomResponse)
async def get_rooms(
    page: int = Query(0, ge=0),
    size: int = Query(20, ge=1, le=100),
    name: str | None = Query(None),
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> PagedRoomResponse:
    """ルーム一覧取得"""
    return await RoomService.list_rooms(
        x_tenant_id, current_user, page, size, name, session
    )


@router.get("/{room_id}", response_model=RoomResponse)
async def get_room(
    room_id: str,
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> RoomResponse:
    """ルーム単体取得"""
    return await RoomService.get_room(room_id, x_tenant_id, current_user, session)


@router.post("", response_model=RoomResponse)
async def create_room(
    req: RoomCreateRequest,
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> RoomResponse:
    """ルーム作成"""
    return await RoomService.create_room(x_tenant_id, current_user, req, session)


@router.patch("/{room_id}", response_model=RoomResponse)
async def update_room(
    room_id: str,
    req: RoomUpdateRequest,
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> RoomResponse:
    """ルーム更新"""
    return await RoomService.update_room(
        room_id, x_tenant_id, current_user, req, session
    )


@router.delete("/{room_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_room(
    room_id: str,
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    """ルーム削除"""
    await RoomService.delete_room(room_id, x_tenant_id, current_user, session)


@router.post("/{room_id}/pin", status_code=status.HTTP_204_NO_CONTENT)
async def pin_room(
    room_id: str,
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    """ルーム固定"""
    await RoomService.pin_room(room_id, x_tenant_id, current_user, session)


@router.delete("/{room_id}/pin", status_code=status.HTTP_204_NO_CONTENT)
async def unpin_room(
    room_id: str,
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    """ルーム固定解除"""
    await RoomService.unpin_room(room_id, x_tenant_id, current_user, session)


@router.post("/{room_id}/feedback", status_code=status.HTTP_204_NO_CONTENT)
async def feedback_room(
    room_id: str,
    req: RoomFeedbackCreateRequest,
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    """ルーム満足度評価登録"""
    await RoomService.feedback_room(
        room_id, x_tenant_id, current_user, req.rating, session
    )


@admin_router.get("/histories", response_model=PagedAdminRoomHistoryResponse)
async def get_admin_room_histories(
    page: int = Query(0, ge=0),
    size: int = Query(20, ge=1, le=100),
    user_id: str | None = Query(None, alias="userId"),
    created_at_from: str | None = Query(None, alias="createdAtFrom"),
    created_at_to: str | None = Query(None, alias="createdAtTo"),
    room_rate: str | None = Query(None, alias="roomRate"),
    name: str | None = Query(None),
    order_by: str = Query("updatedAt", alias="orderBy"),
    reverse: bool = Query(False),
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(require_admin_or_group_admin),
    session: AsyncSession = Depends(get_session),
) -> PagedAdminRoomHistoryResponse:
    """管理者向けルーム履歴一覧取得"""
    return await RoomService.list_admin_histories(
        x_tenant_id,
        current_user,
        page,
        size,
        user_id,
        created_at_from,
        created_at_to,
        room_rate,
        name,
        order_by,
        reverse,
        session,
    )


@admin_router.get("/histories/{room_id}", response_model=AdminRoomHistoryDetailResponse)
async def get_admin_room_history(
    room_id: str,
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(require_admin_or_group_admin),
    session: AsyncSession = Depends(get_session),
) -> AdminRoomHistoryDetailResponse:
    """管理者向けルーム履歴1件取得"""
    return await RoomService.get_admin_history(room_id, x_tenant_id, session)
