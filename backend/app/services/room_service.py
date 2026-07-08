from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.assistant import Assistant
from app.models.room import Room, RoomPin, RoomRating
from app.models.user import User
from app.repositories.room_pin_repository import RoomPinRepository
from app.repositories.room_repository import RoomRepository
from app.schemas.room import (
    PagedRoomResponse,
    RoomCreateRequest,
    RoomListItemResponse,
    RoomResponse,
    RoomUpdateRequest,
)


class RoomService:
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
