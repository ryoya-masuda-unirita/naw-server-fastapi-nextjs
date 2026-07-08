from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.room import RoomPin
from app.models.user import User


class RoomPinRepository:
    @staticmethod
    async def find_pinned_room_ids_by_login_id(
        tenant_id: str, login_id: str, session: AsyncSession
    ) -> set[str]:
        """ログインユーザーが固定しているルームID集合を取得する。"""
        stmt = (
            select(RoomPin.room_id)
            .join(User, User.id == RoomPin.user_id)
            .where(
                RoomPin.tenant_id == tenant_id,
                User.login_id == login_id,
                User.tenant_id == tenant_id,
            )
        )
        result = await session.execute(stmt)
        return set(result.scalars().all())

    @staticmethod
    async def find_by_login_id_and_room_id(
        tenant_id: str, login_id: str, room_id: str, session: AsyncSession
    ) -> RoomPin | None:
        """ログインユーザー・テナント・ルームの組み合わせで固定レコードを取得する。"""
        stmt = (
            select(RoomPin)
            .join(User, User.id == RoomPin.user_id)
            .where(
                RoomPin.room_id == room_id,
                RoomPin.tenant_id == tenant_id,
                User.login_id == login_id,
                User.tenant_id == tenant_id,
            )
        )
        result = await session.execute(stmt)
        return result.scalars().first()
