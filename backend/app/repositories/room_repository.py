from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.search import escape_like_pattern
from app.models.room import Room, RoomPin
from app.models.user import User


class RoomRepository:
    @staticmethod
    async def find_page_by_login_id(
        tenant_id: str,
        login_id: str,
        page: int,
        size: int,
        name: str | None,
        session: AsyncSession,
    ) -> tuple[list[Room], int]:
        """ログインユーザーが所有するルーム一覧を、固定優先・更新日時降順で取得する。"""
        user_id_subquery = (
            select(User.id)
            .where(User.login_id == login_id, User.tenant_id == tenant_id)
            .scalar_subquery()
        )

        base_stmt = select(Room).where(
            Room.tenant_id == tenant_id, Room.user_id == user_id_subquery
        )
        if name:
            pattern = escape_like_pattern(name.lower())
            base_stmt = base_stmt.where(
                func.lower(func.coalesce(Room.name, "")).like(pattern, escape="\\")
            )

        total = (
            await session.execute(
                select(func.count()).select_from(base_stmt.subquery())
            )
        ).scalar() or 0

        pinned_order = case((RoomPin.room_id.is_not(None), 0), else_=1)
        stmt = (
            base_stmt.outerjoin(
                RoomPin,
                (
                    (RoomPin.room_id == Room.id)
                    & (RoomPin.tenant_id == tenant_id)
                    & (RoomPin.user_id == user_id_subquery)
                ),
            )
            .order_by(pinned_order.asc(), Room.updated_at.desc())
            .offset(page * size)
            .limit(size)
        )

        result = await session.execute(stmt)
        return list(result.scalars().all()), total

    @staticmethod
    async def find_by_id_and_login_id(
        room_id: str, tenant_id: str, login_id: str, session: AsyncSession
    ) -> Room | None:
        """ログインユーザー所有のルームを取得する。"""
        stmt = (
            select(Room)
            .join(User, User.id == Room.user_id)
            .where(
                Room.id == room_id,
                Room.tenant_id == tenant_id,
                User.login_id == login_id,
                User.tenant_id == tenant_id,
            )
        )
        result = await session.execute(stmt)
        return result.scalars().first()

    @staticmethod
    async def find_by_id_and_tenant_id(
        room_id: str, tenant_id: str, session: AsyncSession
    ) -> Room | None:
        """ルームIDとテナントIDでルームを取得する。"""
        stmt = select(Room).where(Room.id == room_id, Room.tenant_id == tenant_id)
        result = await session.execute(stmt)
        return result.scalars().first()

    @staticmethod
    async def find_by_ids_and_tenant_id(
        room_ids: list[str], tenant_id: str, session: AsyncSession
    ) -> list[Room]:
        """ルームID一覧とテナントIDでルーム一覧を1クエリで取得する。"""
        if not room_ids:
            return []
        stmt = select(Room).where(Room.id.in_(room_ids), Room.tenant_id == tenant_id)
        result = await session.execute(stmt)
        return list(result.scalars().all())
