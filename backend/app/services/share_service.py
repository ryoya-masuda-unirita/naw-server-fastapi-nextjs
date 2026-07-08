from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.room import Room
from app.models.share import Share
from app.models.user import User
from app.repositories.group_repository import GroupRepository
from app.repositories.group_user_repository import GroupUserRepository
from app.repositories.room_repository import RoomRepository
from app.repositories.share_repository import ShareRepository
from app.repositories.share_room_repository import ShareRoomRepository
from app.schemas.share import (
    ShareAccessDataResponse,
    ShareCreateRequest,
    ShareDataResponse,
)


class ShareService:
    @staticmethod
    async def _require_owned_room(
        tenant_id: str, current_user: User, room_id: str, session: AsyncSession
    ) -> Room:
        """ルームの所有者本人であることを検証し、ルームを返す。

        存在しないルームIDは404、存在するが所有者でない場合は403を返す。

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
        room = await RoomRepository.find_by_id_and_tenant_id(
            room_id, tenant_id, session
        )
        if room is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Room not found"
            )
        if room.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Access Denied"
            )
        return room

    @staticmethod
    async def upsert(
        tenant_id: str,
        current_user: User,
        req: ShareCreateRequest,
        session: AsyncSession,
    ) -> ShareDataResponse:
        """共有リンクを作成または更新する。

        既に対象ルームの共有リンクが存在する場合は、共有先グループを入れ替える
        （新規に共有リンクを作り直さない）。

        Args:
            tenant_id: テナントID。
            current_user: 認証済みユーザー。
            req: 共有リンク作成・更新リクエスト。
            session: 非同期DBセッション。

        Returns:
            作成・更新した共有リンク。

        Raises:
            HTTPException: ルームが存在しない場合は404、所有者でない場合は403、
                指定グループの一部がテナントに存在しない場合は400。
        """
        await ShareService._require_owned_room(
            tenant_id, current_user, req.roomId, session
        )

        distinct_team_ids = list(dict.fromkeys(req.teamIds))
        found_groups = await GroupRepository.find_by_tenant_id_and_ids(
            tenant_id, distinct_team_ids, session
        )
        if len(found_groups) != len(distinct_team_ids):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="指定されたグループが存在しません",
            )

        share = await ShareRepository.find_by_room_id(req.roomId, tenant_id, session)
        if share is None:
            share = Share(tenant_id=tenant_id, room_id=req.roomId)
        share = await ShareRepository.save(share, session)

        await ShareRoomRepository.replace_groups_for_share(
            share.id, req.roomId, tenant_id, distinct_team_ids, session
        )
        await session.commit()

        return ShareDataResponse(
            id=share.id, roomId=share.room_id, teamIds=distinct_team_ids
        )

    @staticmethod
    async def resolve_access(
        tenant_id: str, current_user: User, share_id: str, session: AsyncSession
    ) -> ShareAccessDataResponse:
        """共有リンク経由のアクセスを解決する。

        ルーム所有者本人、または共有先グループに所属するメンバーがアクセスできる。
        所有者本人でなければ読み取り専用として扱う。

        Args:
            tenant_id: テナントID。
            current_user: 認証済みユーザー。
            share_id: 対象の共有リンクID。
            session: 非同期DBセッション。

        Returns:
            アクセス解決結果（ルームID・ルーム名・読み取り専用フラグ・共有先グループID一覧）。

        Raises:
            HTTPException: 共有リンクが存在しない場合は404、
                所有者でも共有先グループのメンバーでもない場合は403。
        """
        share = await ShareRepository.find_by_id_and_tenant_id(
            share_id, tenant_id, session
        )
        if share is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Share not found"
            )
        room = await RoomRepository.find_by_id_and_tenant_id(
            share.room_id, tenant_id, session
        )
        if room is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Share not found"
            )

        is_owner = room.user_id == current_user.id
        if not is_owner:
            user_group_ids = await GroupUserRepository.find_belonging_group_ids(
                tenant_id, current_user.id, session
            )
            has_access = await ShareRoomRepository.exists_shared_access(
                share.room_id, tenant_id, user_group_ids, session
            )
            if not has_access:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN, detail="Access Denied"
                )

        team_ids = await ShareRoomRepository.find_group_ids_by_share_id(
            share.id, tenant_id, session
        )
        return ShareAccessDataResponse(
            roomId=share.room_id,
            roomName=room.name,
            isReadOnly=not is_owner,
            teamIds=team_ids,
        )

    @staticmethod
    async def delete(
        tenant_id: str, current_user: User, share_id: str, session: AsyncSession
    ) -> None:
        """共有リンクを削除する。対象ルームの所有者本人のみ削除できる。

        Args:
            tenant_id: テナントID。
            current_user: 認証済みユーザー。
            share_id: 削除対象の共有リンクID。
            session: 非同期DBセッション。

        Raises:
            HTTPException: 共有リンクが存在しない場合は404、
                対象ルームの所有者でない場合は403。
        """
        share = await ShareRepository.find_by_id_and_tenant_id(
            share_id, tenant_id, session
        )
        if share is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Share not found"
            )
        await ShareService._require_owned_room(
            tenant_id, current_user, share.room_id, session
        )
        await ShareRepository.delete(share, session)
