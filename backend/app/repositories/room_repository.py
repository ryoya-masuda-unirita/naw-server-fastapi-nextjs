from datetime import datetime
from uuid import UUID

from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.engine import Row
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.search import escape_like_pattern
from app.models.assistant import Assistant
from app.models.room import Room, RoomPin, RoomRating
from app.models.share import ShareRoom
from app.models.user import User


class RoomRepository:
    @staticmethod
    async def find_page_viewable_by_user(
        tenant_id: str,
        user_id: UUID,
        group_ids: list[str],
        page: int,
        size: int,
        name: str | None,
        session: AsyncSession,
    ) -> tuple[list[Room], int]:
        """ログインユーザーが閲覧可能なルーム一覧を、固定優先・更新日時降順で取得する。

        「閲覧可能」は、自ユーザーが所有するルーム、または共有リンクで自ユーザーの
        所属グループに共有されているルームのいずれか（issue-114で追加）。

        Args:
            tenant_id: テナントID。
            user_id: ログインユーザーのID。
            group_ids: ログインユーザーが所属するグループID一覧。
            page: ページ番号（0始まり）。
            size: 1ページあたりの件数。
            name: ルーム名の部分一致検索文字列。
            session: 非同期DBセッション。

        Returns:
            (ルーム一覧, 総件数) のタプル。
        """
        conditions = [Room.user_id == user_id]
        if group_ids:
            shared_room_ids = select(ShareRoom.room_id).where(
                ShareRoom.tenant_id == tenant_id, ShareRoom.group_id.in_(group_ids)
            )
            conditions.append(Room.id.in_(shared_room_ids))

        base_stmt = select(Room).where(Room.tenant_id == tenant_id, or_(*conditions))
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
                    & (RoomPin.user_id == user_id)
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
        """ルームID一覧とテナントIDでルーム一覧を1クエリで取得する。

        Args:
            room_ids: 取得対象のルームID一覧。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            ルーム一覧。
        """
        if not room_ids:
            return []
        stmt = select(Room).where(Room.id.in_(room_ids), Room.tenant_id == tenant_id)
        result = await session.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def find_feedback_rooms(
        tenant_id: str,
        assistant_id: str | None,
        rating: RoomRating | None,
        sort_column: str,
        sort_desc: bool,
        page: int,
        size: int,
        session: AsyncSession,
    ) -> tuple[list[Row], int]:
        """評価済みルームのフィードバック一覧を取得する。"""
        stmt = (
            select(
                Room.id.label("room_id"),
                Room.tenant_id.label("tenant_id"),
                Room.user_id.label("user_id"),
                Room.name.label("room_name"),
                Room.default_assistant_id.label("assistant_id"),
                Room.rating.label("rating"),
                Room.created_at.label("created_at"),
                Room.updated_at.label("updated_at"),
                User.name.label("user_name"),
                Assistant.name.label("assistant_name"),
            )
            .select_from(Room)
            .outerjoin(User, and_(User.id == Room.user_id, User.tenant_id == tenant_id))
            .outerjoin(
                Assistant,
                and_(
                    Assistant.id == Room.default_assistant_id,
                    Assistant.tenant_id == tenant_id,
                ),
            )
            .where(Room.tenant_id == tenant_id, Room.rating.is_not(None))
        )

        if assistant_id is not None:
            stmt = stmt.where(Room.default_assistant_id == assistant_id)
        if rating is not None:
            stmt = stmt.where(Room.rating == rating)

        total = (
            await session.execute(select(func.count()).select_from(stmt.subquery()))
        ).scalar() or 0

        if sort_column == "room_name":
            order_col = Room.name
        elif sort_column == "assistant_id":
            order_col = Room.default_assistant_id
        elif sort_column == "rating":
            order_col = Room.rating
        else:
            order_col = Room.updated_at

        stmt = stmt.order_by(order_col.desc() if sort_desc else order_col.asc())
        stmt = stmt.offset(page * size).limit(size)
        result = await session.execute(stmt)
        return list(result.all()), total

    @staticmethod
    async def find_admin_histories(
        tenant_id: str,
        user_id: UUID | None,
        created_at_from: datetime | None,
        created_at_to: datetime | None,
        room_rate: str | None,
        name: str | None,
        visible_assistant_ids: list[str] | None,
        order_by: str,
        reverse: bool,
        page: int,
        size: int,
        session: AsyncSession,
    ) -> tuple[list[Row], int]:
        """管理者向けルーム履歴一覧を取得する。

        Args:
            tenant_id: テナントID。
            user_id: ユーザーIDでの絞り込み。
            created_at_from: 作成日時下限。
            created_at_to: 作成日時上限。
            room_rate: 評価での絞り込み。`unRated` の場合は未評価。
            name: ルーム名の部分一致検索文字列。
            visible_assistant_ids: グループ管理者向けに可視なアシスタントID一覧。Noneなら制限なし。
            order_by: ソート対象（updatedAt/name/userName）。
            reverse: Trueなら降順。
            page: ページ番号。
            size: 1ページあたりの件数。
            session: 非同期DBセッション。

        Returns:
            (行一覧, 総件数) のタプル。
        """
        if visible_assistant_ids is not None and not visible_assistant_ids:
            return [], 0

        stmt = (
            select(
                Room.id.label("room_id"),
                Room.name.label("room_name"),
                Room.default_assistant_id.label("default_assistant_id"),
                Room.user_id.label("user_id"),
                User.name.label("user_name"),
                Room.created_at.label("created_at"),
                Room.updated_at.label("updated_at"),
                Room.rating.label("rating"),
            )
            .select_from(Room)
            .outerjoin(User, and_(User.id == Room.user_id, User.tenant_id == tenant_id))
            .where(Room.tenant_id == tenant_id)
        )

        if visible_assistant_ids is not None:
            stmt = stmt.where(Room.default_assistant_id.in_(visible_assistant_ids))
        if user_id:
            stmt = stmt.where(Room.user_id == user_id)
        if created_at_from is not None:
            stmt = stmt.where(Room.created_at >= created_at_from)
        if created_at_to is not None:
            stmt = stmt.where(Room.created_at <= created_at_to)
        if room_rate == "unRated":
            stmt = stmt.where(Room.rating.is_(None))
        elif room_rate:
            stmt = stmt.where(Room.rating == room_rate)
        if name:
            pattern = escape_like_pattern(name.lower())
            stmt = stmt.where(
                func.lower(func.coalesce(Room.name, "")).like(pattern, escape="\\")
            )

        total = (
            await session.execute(select(func.count()).select_from(stmt.subquery()))
        ).scalar() or 0

        if order_by == "name":
            order_col = Room.name
        elif order_by == "userName":
            order_col = User.name
        else:
            order_col = Room.updated_at
        stmt = stmt.order_by(order_col.desc() if reverse else order_col.asc())
        stmt = stmt.offset(page * size).limit(size)

        result = await session.execute(stmt)
        return list(result.all()), total
