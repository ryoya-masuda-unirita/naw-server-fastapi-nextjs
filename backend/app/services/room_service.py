from datetime import datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.room_access import require_viewable_room
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
    """ルームに関するビジネスロジック。"""

    @staticmethod
    def _is_tenant_admin(current_user: User) -> bool:
        """テナント管理者かどうかを判定する。

        Parameters
        ----------
        current_user : User
            判定対象のユーザー。

        Returns
        -------
        bool
            テナント管理者の場合は True。
        """
        return current_user.role in (UserRole.ADMIN, UserRole.SYSTEM)

    @staticmethod
    def _normalize_name(name: str) -> str:
        """移植元準拠で255文字を超えるルーム名を切り詰める。"""
        return name[:255]

    @staticmethod
    def _to_room_response(room: Room) -> RoomResponse:
        """ルームのモデルからレスポンスを組み立てる。

        Parameters
        ----------
        room : Room
            ルーム。

        Returns
        -------
        RoomResponse
            ルームのレスポンス。
        """
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
    def _parse_user_id(value: str | None) -> UUID | None:
        """文字列のユーザーIDをUUIDに変換する。

        Parameters
        ----------
        value : str | None
            ユーザーIDの文字列。指定しない場合は None。

        Returns
        -------
        UUID | None
            変換したUUID。指定がなければ None。

        Raises
        ------
        HTTPException
            UUIDとして不正な場合（400）。
        """
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
        """自分のルームを取得する。

        Parameters
        ----------
        room_id : str
            ルームID。
        tenant_id : str
            テナントID。
        current_user : User
            操作しているユーザー。
        session : AsyncSession
            データベースセッション。

        Returns
        -------
        Room
            取得したルーム。

        Raises
        ------
        HTTPException
            ルームが存在しない、または自分のものでない場合（404）。
        """
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
        """指定したアシスタントがテナントに存在することを確かめる。

        Parameters
        ----------
        assistant_id : str
            アシスタントID。
        tenant_id : str
            テナントID。
        session : AsyncSession
            データベースセッション。

        Raises
        ------
        HTTPException
            アシスタントが存在しない場合（400）。
        """
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
        """自分のルームを新しい順にページングして返す。

        Parameters
        ----------
        tenant_id : str
            テナントID。
        current_user : User
            操作しているユーザー。
        page : int
            ページ番号（0始まり）。
        size : int
            1ページあたりの件数。
        name : str | None
            絞り込み用の名前。部分一致で検索する。
        session : AsyncSession
            データベースセッション。

        Returns
        -------
        PagedRoomResponse
            ルーム一覧のページングレスポンス。
        """
        group_ids = await GroupUserRepository.find_belonging_group_ids(
            tenant_id, current_user.id, session
        )
        rooms, total = await RoomRepository.find_page_viewable_by_user(
            tenant_id, current_user.id, group_ids, page, size, name, session
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
        """自分のルームを1件返す。

        Parameters
        ----------
        room_id : str
            ルームID。
        tenant_id : str
            テナントID。
        current_user : User
            操作しているユーザー。
        session : AsyncSession
            データベースセッション。

        Returns
        -------
        RoomResponse
            ルームのレスポンス。

        Raises
        ------
        HTTPException
            ルームが存在しない場合（404）。
        """
        room = await require_viewable_room(tenant_id, current_user, room_id, session)
        return RoomService._to_room_response(room)

    @staticmethod
    async def list_admin_histories(
        tenant_id: str,
        current_user: User,
        page: int,
        size: int,
        user_id: str | None,
        created_at_from: datetime | None,
        created_at_to: datetime | None,
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
            created_at_from,
            created_at_to,
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
        """ルームを作成する。

        Parameters
        ----------
        tenant_id : str
            テナントID。
        current_user : User
            操作しているユーザー。
        req : RoomCreateRequest
            リクエスト本文。
        session : AsyncSession
            データベースセッション。

        Returns
        -------
        RoomResponse
            作成したルーム。

        Raises
        ------
        HTTPException
            アシスタントが存在しない場合（400）。
        """
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
        """ルームを更新する。

        Parameters
        ----------
        room_id : str
            ルームID。
        tenant_id : str
            テナントID。
        current_user : User
            操作しているユーザー。
        req : RoomUpdateRequest
            リクエスト本文。
        session : AsyncSession
            データベースセッション。

        Returns
        -------
        RoomResponse
            更新後のルーム。

        Raises
        ------
        HTTPException
            ルームが存在しない場合（404）、またはアシスタントが存在しない場合（400）。
        """
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
        """ルームを削除する。

        Parameters
        ----------
        room_id : str
            ルームID。
        tenant_id : str
            テナントID。
        current_user : User
            操作しているユーザー。
        session : AsyncSession
            データベースセッション。

        Raises
        ------
        HTTPException
            ルームが存在しない場合（404）。
        """
        room = await RoomService._get_owned_room_or_404(
            room_id, tenant_id, current_user, session
        )
        await session.delete(room)
        await session.commit()

    @staticmethod
    async def pin_room(
        room_id: str, tenant_id: str, current_user: User, session: AsyncSession
    ) -> None:
        """ルームをピン留めする。

        Parameters
        ----------
        room_id : str
            ルームID。
        tenant_id : str
            テナントID。
        current_user : User
            操作しているユーザー。
        session : AsyncSession
            データベースセッション。

        Raises
        ------
        HTTPException
            ルームが存在しない場合（404）。
        """
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
        """ルームのピン留めを解除する。

        Parameters
        ----------
        room_id : str
            ルームID。
        tenant_id : str
            テナントID。
        current_user : User
            操作しているユーザー。
        session : AsyncSession
            データベースセッション。

        Raises
        ------
        HTTPException
            ルームが存在しない場合（404）。
        """
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
