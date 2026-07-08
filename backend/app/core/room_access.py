from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.room import Room
from app.models.user import User, UserRole
from app.repositories.group_user_repository import GroupUserRepository
from app.repositories.room_repository import RoomRepository
from app.repositories.share_room_repository import ShareRoomRepository


async def require_owned_room(
    tenant_id: str, current_user: User, room_id: str, session: AsyncSession
) -> Room:
    """ルームの所有者本人であることを検証し、ルームを返す。

    存在しないルームIDは404、存在するが所有者でない場合は403を返す。
    複数のservice（message_service.py・share_service.py等）から共通で使う
    ルーム所有権チェックのため、特定のserviceに属させずcore/に置く
    （service間の直接呼び出しは禁止のため）。

    Args:
        tenant_id: テナントID。
        current_user: 認証済みユーザー。
        room_id: 検証対象のルームID。
        session: 非同期DBセッション。

    Returns:
        所有権が確認できたルーム。

    Raises:
        HTTPException: ルームが存在しない場合は404、所有者でない場合は403。
    """
    room = await RoomRepository.find_by_id_and_tenant_id(room_id, tenant_id, session)
    if room is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Room not found"
        )
    if room.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Access Denied"
        )
    return room


async def can_view_room(
    tenant_id: str, current_user: User, room: Room, session: AsyncSession
) -> bool:
    """ルームを閲覧できるかどうかを判定する。

    所有者本人、テナント管理者、または共有先グループのメンバーであれば閲覧できる
    （移植元Spring Bootの`RoomAccessService.canAccessRoom`に相当。書き込み可否は
    グループ・管理者バイパスを考慮しないため、この関数とは別に`require_owned_room`
    を使う）。

    Args:
        tenant_id: テナントID。
        current_user: 認証済みユーザー。
        room: 判定対象のルーム。
        session: 非同期DBセッション。

    Returns:
        閲覧できる場合True。
    """
    if room.user_id == current_user.id:
        return True
    if current_user.role in (UserRole.ADMIN, UserRole.SYSTEM):
        return True
    shared_group_ids = await ShareRoomRepository.find_group_ids_by_room_id(
        room.id, tenant_id, session
    )
    if not shared_group_ids:
        return False
    user_group_ids = await GroupUserRepository.find_belonging_group_ids(
        tenant_id, current_user.id, session
    )
    return bool(set(shared_group_ids) & set(user_group_ids))


async def require_viewable_room(
    tenant_id: str, current_user: User, room_id: str, session: AsyncSession
) -> Room:
    """ルームの閲覧権限があることを検証し、ルームを返す。

    存在しないルームIDは404、閲覧権限がない場合は403を返す。

    Args:
        tenant_id: テナントID。
        current_user: 認証済みユーザー。
        room_id: 検証対象のルームID。
        session: 非同期DBセッション。

    Returns:
        閲覧権限が確認できたルーム。

    Raises:
        HTTPException: ルームが存在しない場合は404、閲覧権限がない場合は403。
    """
    room = await RoomRepository.find_by_id_and_tenant_id(room_id, tenant_id, session)
    if room is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Room not found"
        )
    if not await can_view_room(tenant_id, current_user, room, session):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Access Denied"
        )
    return room
