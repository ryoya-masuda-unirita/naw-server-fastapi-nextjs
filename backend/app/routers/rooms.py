from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import get_current_user, get_verified_tenant_id
from app.models.user import User
from app.schemas.room import (
    PagedRoomResponse,
    RoomCreateRequest,
    RoomResponse,
    RoomUpdateRequest,
)
from app.services.room_service import RoomService

router = APIRouter(prefix="/api/rooms", tags=["rooms"])


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
