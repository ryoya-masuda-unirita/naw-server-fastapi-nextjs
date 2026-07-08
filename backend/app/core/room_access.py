from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.room import Room
from app.models.user import User
from app.repositories.room_repository import RoomRepository


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
