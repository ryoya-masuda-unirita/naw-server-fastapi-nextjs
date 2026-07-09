from datetime import datetime, time
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.assistant import Assistant
from app.models.room import Room, RoomPin, RoomRating
from app.models.user import User, UserRole
from app.repositories.group_assistant_repository import GroupAssistantRepository
from app.repositories.group_user_repository import GroupUserRepository
from app.repositories.room_pin_repository import RoomPinRepository
from app.repositories.room_repository import RoomRepository
from app.schemas.room import (
    AdminRoomHistoryDetailResponse,
    AdminRoomHistoryItemResponse,
    PagedAdminRoomHistoryResponse,
    PagedRoomResponse,
    RoomCreateRequest,
    RoomListItemResponse,
    RoomResponse,
    RoomUpdateRequest,
)


class RoomService:
    @staticmethod
    def _is_tenant_admin(current_user: User) -> bool:
        return current_user.role in (UserRole.ADMIN, UserRole.SYSTEM)

    @staticmethod
    def _normalize_name(name: str) -> str:
        """移植元準拠で255文字を超えるルーム名を切り詰める。"""
        return name[:255]

    @staticmethod
    def _to_room_response(room: Room) -> RoomResponse:
        return RoomResponse(
            id=room.id,
            tenantId=room.tenant_id,
            name=room.name,
            defaultAssistantId=room.default_assistant_id,
            userId=room.user_id,
            createdAt=room.created_at,
            updatedAt=room.updated_at,
        )

    @staticmethod
    def _parse_date(value: str | None, *, end_of_day: bool) -> datetime | None:
        """yyyy-MM-dd形式の日付文字列をdatetimeに変換する。"""
        if value is None:
            return None
        try:
            parsed = datetime.strptime(value, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid date format",
            )
        return datetime.combine(parsed, time.max if end_of_day else time.min)

    @staticmethod
    def _parse_user_id(value: str | None) -> UUID | None:
        if value is None:
            return None
        try:
            return UUID(value)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid user id",
            )

    @staticmethod
    async def _get_owned_room_or_404(
        room_id: str, tenant_id: str, current_user: User, session: AsyncSession
    ) -> Room:
        room = await RoomRepository.find_by_id_and_login_id(
            room_id, tenant_id, current_user.login_id, session
        )
        if not room:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Room not found"
            )
        return room

    @staticmethod
    async def _validate_assistant_or_400(
        assistant_id: str, tenant_id: str, session: AsyncSession
    ) -> None:
        assistant = await session.get(Assistant, assistant_id)
        if not assistant or assistant.tenant_id != tenant_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid assistant id",
            )

    @staticmethod
    async def list_rooms(
        tenant_id: str,
        current_user: User,
        page: int,
        size: int,
        name: str | None,
        session: AsyncSession,
    ) -> PagedRoomResponse:
        rooms, total = await RoomRepository.find_page_by_login_id(
            tenant_id, current_user.login_id, page, size, name, session
        )
        pinned_room_ids = await RoomPinRepository.find_pinned_room_ids_by_login_id(
            tenant_id, current_user.login_id, session
        )
        content = [
            RoomListItemResponse(
                id=room.id,
                tenantId=room.tenant_id,
                name=room.name,
                defaultAssistantId=room.default_assistant_id,
                userId=room.user_id,
                createdAt=room.created_at,
                updatedAt=room.updated_at,
                pinned=room.id in pinned_room_ids,
            )
            for room in rooms
        ]
        return PagedRoomResponse(
            content=content, totalElements=total, number=page, size=size
        )

    @staticmethod
    async def get_room(
        room_id: str, tenant_id: str, current_user: User, session: AsyncSession
    ) -> RoomResponse:
        room = await RoomService._get_owned_room_or_404(
            room_id, tenant_id, current_user, session
        )
        return RoomService._to_room_response(room)

    @staticmethod
    async def list_admin_histories(
        tenant_id: str,
        current_user: User,
        page: int,
        size: int,
        user_id: str | None,
        created_at_from: str | None,
        created_at_to: str | None,
        room_rate: str | None,
        name: str | None,
        order_by: str,
        reverse: bool,
        session: AsyncSession,
    ) -> PagedAdminRoomHistoryResponse:
        """管理者向けルーム履歴一覧を取得する。"""
        visible_assistant_ids: list[str] | None = None
        if not RoomService._is_tenant_admin(current_user):
            admin_group_ids = await GroupUserRepository.find_admin_group_ids_for_user(
                tenant_id, current_user.id, session
            )
            visible_assistant_ids = (
                await GroupAssistantRepository.find_assistant_ids_by_group_ids(
                    admin_group_ids, tenant_id, session
                )
            )

        effective_order_by = (
            order_by if order_by in {"updatedAt", "name", "userName"} else "updatedAt"
        )
        rows, total = await RoomRepository.find_admin_histories(
            tenant_id,
            RoomService._parse_user_id(user_id),
            RoomService._parse_date(created_at_from, end_of_day=False),
            RoomService._parse_date(created_at_to, end_of_day=True),
            room_rate,
            name,
            visible_assistant_ids,
            effective_order_by,
            reverse,
            page,
            size,
            session,
        )

        content = [
            AdminRoomHistoryItemResponse(
                id=row.room_id,
                name=row.room_name,
                defaultAssistantId=row.default_assistant_id,
                userId=row.user_id,
                userName=row.user_name,
                indexIds=[],
                createdAt=row.created_at,
                updatedAt=row.updated_at,
                shareUrl=None,
                rating=row.rating,
            )
            for row in rows
        ]
        return PagedAdminRoomHistoryResponse(
            content=content, totalElements=total, number=page, size=size
        )

    @staticmethod
    async def get_admin_history(
        room_id: str, tenant_id: str, session: AsyncSession
    ) -> AdminRoomHistoryDetailResponse:
        """管理者向けルーム履歴1件を取得する。"""
        room = await RoomRepository.find_by_id_and_tenant_id(
            room_id, tenant_id, session
        )
        if not room:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Room not found"
            )
        return AdminRoomHistoryDetailResponse(
            id=room.id,
            tenantId=room.tenant_id,
            name=room.name,
            defaultAssistantId=room.default_assistant_id,
            userId=room.user_id,
            createdAt=room.created_at,
            updatedAt=room.updated_at,
            rating=room.rating,
        )

    @staticmethod
    async def create_room(
        tenant_id: str,
        current_user: User,
        req: RoomCreateRequest,
        session: AsyncSession,
    ) -> RoomResponse:
        await RoomService._validate_assistant_or_400(
            req.assistantId, tenant_id, session
        )
        room = Room(
            tenant_id=tenant_id,
            name=RoomService._normalize_name(req.name),
            default_assistant_id=req.assistantId,
            user_id=current_user.id,
        )
        session.add(room)
        await session.commit()
        await session.refresh(room)
        return RoomService._to_room_response(room)

    @staticmethod
    async def update_room(
        room_id: str,
        tenant_id: str,
        current_user: User,
        req: RoomUpdateRequest,
        session: AsyncSession,
    ) -> RoomResponse:
        room = await RoomService._get_owned_room_or_404(
            room_id, tenant_id, current_user, session
        )
        room.name = RoomService._normalize_name(req.name)
        session.add(room)
        await session.commit()
        await session.refresh(room)
        return RoomService._to_room_response(room)

    @staticmethod
    async def delete_room(
        room_id: str, tenant_id: str, current_user: User, session: AsyncSession
    ) -> None:
        room = await RoomService._get_owned_room_or_404(
            room_id, tenant_id, current_user, session
        )
        await session.delete(room)
        await session.commit()

    @staticmethod
    async def pin_room(
        room_id: str, tenant_id: str, current_user: User, session: AsyncSession
    ) -> None:
        room = await RoomService._get_owned_room_or_404(
            room_id, tenant_id, current_user, session
        )
        existing_pin = await RoomPinRepository.find_by_login_id_and_room_id(
            tenant_id, current_user.login_id, room_id, session
        )
        if existing_pin is not None:
            return

        session.add(
            RoomPin(user_id=current_user.id, tenant_id=tenant_id, room_id=room.id)
        )
        await session.commit()

    @staticmethod
    async def unpin_room(
        room_id: str, tenant_id: str, current_user: User, session: AsyncSession
    ) -> None:
        await RoomService._get_owned_room_or_404(
            room_id, tenant_id, current_user, session
        )
        existing_pin = await RoomPinRepository.find_by_login_id_and_room_id(
            tenant_id, current_user.login_id, room_id, session
        )
        if existing_pin is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Room pin not found"
            )
        await session.delete(existing_pin)
        await session.commit()

    @staticmethod
    async def feedback_room(
        room_id: str,
        tenant_id: str,
        current_user: User,
        rating: RoomRating,
        session: AsyncSession,
    ) -> None:
        """ルーム所有者が満足度評価を登録する。"""
        room = await RoomService._get_owned_room_or_404(
            room_id, tenant_id, current_user, session
        )
        room.rating = rating
        session.add(room)
        await session.commit()
