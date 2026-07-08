import uuid

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.room_access import (
    can_view_room,
    require_owned_room,
    require_viewable_room,
)
from app.models.library import Library
from app.models.user import User
from app.repositories.group_repository import GroupRepository
from app.repositories.library_repository import LibraryRepository
from app.repositories.library_tag_mapping_repository import LibraryTagMappingRepository
from app.repositories.library_tag_repository import LibraryTagRepository
from app.repositories.message_repository import MessageRepository
from app.repositories.room_repository import RoomRepository
from app.repositories.share_library_repository import ShareLibraryRepository
from app.schemas.library import (
    LibraryGetResponse,
    LibraryListItemResponse,
    LibraryPageItemResponse,
    LibraryPageResponse,
    LibrarySharedGroupInfo,
    LibraryTagInfo,
    LibraryUpdateRequest,
    LibraryUpdateResponse,
)


def _parse_library_id(library_id: str) -> uuid.UUID:
    """パス変数のライブラリID文字列をUUIDへ変換する。不正な形式は404として扱う。

    Args:
        library_id: パス変数のライブラリID文字列。

    Returns:
        変換後のUUID。

    Raises:
        HTTPException: UUID形式でない場合404を返す（存在しないIDと同様に扱う）。
    """
    try:
        return uuid.UUID(library_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Library not found"
        ) from exc


class LibraryService:
    @staticmethod
    async def _get_library_or_404(
        library_id: str, tenant_id: str, session: AsyncSession
    ) -> Library:
        """IDとテナントIDでライブラリを取得し、存在しなければ404を送出する。

        Args:
            library_id: 対象のライブラリID。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            該当するライブラリ。

        Raises:
            HTTPException: 存在しない場合404を返す。
        """
        library_uuid = _parse_library_id(library_id)
        library = await LibraryRepository.find_by_id_and_tenant_id(
            library_uuid, tenant_id, session
        )
        if library is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Library not found"
            )
        return library

    @staticmethod
    async def _require_owned_room_for_library(
        tenant_id: str, current_user: User, library: Library, session: AsyncSession
    ) -> None:
        """ライブラリに紐づくルームの所有者本人であることを検証する（更新・削除用）。

        Args:
            tenant_id: テナントID。
            current_user: 認証済みユーザー。
            library: 検証対象のライブラリ。
            session: 非同期DBセッション。

        Raises:
            HTTPException: 紐づくメッセージ・ルームが存在しない場合は404、
                所有者でない場合は403。
        """
        message = await MessageRepository.find_by_tenant_id_and_id(
            tenant_id, library.message_id, session
        )
        if message is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Library not found"
            )
        await require_owned_room(tenant_id, current_user, message.room_id, session)

    @staticmethod
    async def get_libraries(
        tenant_id: str,
        current_user: User,
        page: int,
        size: int,
        title: str | None,
        created_by: str | None,
        exclude_created_by: str | None,
        tag_ids: list[uuid.UUID] | None,
        sort_by: str,
        sort_dir: str,
        session: AsyncSession,
    ) -> LibraryPageResponse:
        """自身が作成または所属グループに共有されたライブラリ一覧をページング付きで取得する。

        Args:
            tenant_id: テナントID。
            current_user: 認証済みユーザー。
            page: 0始まりのページ番号。
            size: 1ページあたりの件数。
            title: タイトルの部分一致検索文字列。
            created_by: 作成者のloginId絞り込み。
            exclude_created_by: 除外する作成者のloginId絞り込み。
            tag_ids: 絞り込み対象のタグID一覧。
            sort_by: ソート対象列名。
            sort_dir: ソート方向。
            session: 非同期DBセッション。

        Returns:
            ページング済みのライブラリ一覧。
        """
        libraries, total = await LibraryRepository.find_page(
            tenant_id,
            current_user.id,
            page,
            size,
            title,
            created_by,
            exclude_created_by,
            tag_ids,
            sort_by,
            sort_dir,
            session,
        )

        library_ids = [lib.id for lib in libraries]
        tags_by_library_id = (
            await LibraryTagMappingRepository.find_tags_grouped_by_library_ids(
                library_ids, tenant_id, session
            )
        )
        groups_by_library_id = (
            await ShareLibraryRepository.find_groups_grouped_by_library_ids(
                library_ids, tenant_id, session
            )
        )

        content = [
            LibraryPageItemResponse(
                id=str(lib.id),
                title=lib.title,
                userId=str(lib.user_id),
                createdAt=lib.created_at,
                updatedAt=lib.updated_at,
                tags=[
                    LibraryTagInfo(id=tag_id, name=tag_name)
                    for tag_id, tag_name in tags_by_library_id.get(lib.id, [])
                ],
                sharedGroups=[
                    LibrarySharedGroupInfo(id=group_id, name=group_name)
                    for group_id, group_name in groups_by_library_id.get(lib.id, [])
                ],
            )
            for lib in libraries
        ]

        return LibraryPageResponse(
            content=content, totalElements=total, number=page, size=size
        )

    @staticmethod
    async def get_library_list(
        tenant_id: str, current_user: User, room_id: str, session: AsyncSession
    ) -> list[LibraryListItemResponse]:
        """ルームに紐づくライブラリ一覧を取得する。閲覧権限のないルームは403を返す。

        Args:
            tenant_id: テナントID。
            current_user: 認証済みユーザー。
            room_id: 対象のルームID。
            session: 非同期DBセッション。

        Returns:
            ルームに紐づくライブラリ一覧（id・titleのみ）。

        Raises:
            HTTPException: ルームが存在しない場合404、閲覧権限がない場合403。
        """
        await require_viewable_room(tenant_id, current_user, room_id, session)

        libraries = await LibraryRepository.find_by_room_id_and_tenant_id(
            room_id, tenant_id, session
        )
        return [
            LibraryListItemResponse(id=str(lib.id), title=lib.title)
            for lib in libraries
        ]

    @staticmethod
    async def get_library(
        tenant_id: str, current_user: User, library_id: str, session: AsyncSession
    ) -> LibraryGetResponse:
        """ライブラリのMarkdownコンテンツを取得する。

        「紐づくメッセージのルームへの閲覧権限がある」または「ライブラリ自体が
        可視（所有者 or 共有先グループ所属）」のいずれかを満たせば取得できる。

        Args:
            tenant_id: テナントID。
            current_user: 認証済みユーザー。
            library_id: 対象のライブラリID。
            session: 非同期DBセッション。

        Returns:
            ライブラリのタイトル・コンテンツ。

        Raises:
            HTTPException: どちらの条件も満たさない場合404を返す。
        """
        library = await LibraryService._get_library_or_404(
            library_id, tenant_id, session
        )

        message = await MessageRepository.find_by_tenant_id_and_id(
            tenant_id, library.message_id, session
        )
        if message is not None:
            room = await RoomRepository.find_by_id_and_tenant_id(
                message.room_id, tenant_id, session
            )
            if room is not None and await can_view_room(
                tenant_id, current_user, room, session
            ):
                return LibraryGetResponse(title=library.title, data=library.content)

        if not await LibraryRepository.is_visible_to_user(
            library.id, tenant_id, current_user.id, session
        ):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Library not found"
            )

        return LibraryGetResponse(title=library.title, data=library.content)

    @staticmethod
    async def update_library(
        tenant_id: str,
        current_user: User,
        library_id: str,
        req: LibraryUpdateRequest,
        session: AsyncSession,
    ) -> LibraryUpdateResponse:
        """ライブラリの名前・共有グループ・タグを更新する（グループ・タグは完全置換）。

        更新できるのは紐づくルームの所有者本人のみ。

        Args:
            tenant_id: テナントID。
            current_user: 認証済みユーザー。
            library_id: 更新対象のライブラリID。
            req: 更新リクエスト。
            session: 非同期DBセッション。

        Returns:
            更新したライブラリのID。

        Raises:
            HTTPException: ライブラリ・紐づくルームが存在しない場合404、所有者で
                ない場合403、指定グループ・タグの一部が存在しない場合400。
        """
        library = await LibraryService._get_library_or_404(
            library_id, tenant_id, session
        )
        await LibraryService._require_owned_room_for_library(
            tenant_id, current_user, library, session
        )

        library.title = req.name

        group_ids = list(dict.fromkeys(req.groups)) if req.groups else []
        if group_ids:
            found_groups = await GroupRepository.find_by_tenant_id_and_ids(
                tenant_id, group_ids, session
            )
            if len(found_groups) != len(group_ids):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="指定されたグループが存在しません",
                )

        tag_ids = list(dict.fromkeys(req.tags)) if req.tags else []
        if tag_ids:
            found_tags = await LibraryTagRepository.find_by_tenant_id_and_ids(
                tenant_id, tag_ids, session
            )
            if len(found_tags) != len(tag_ids):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="指定されたタグが存在しません",
                )

        session.add(library)
        await ShareLibraryRepository.replace_groups_for_library(
            library.id, tenant_id, group_ids, session
        )
        await LibraryTagMappingRepository.replace_tags_for_library(
            library.id, tenant_id, tag_ids, session
        )
        await session.commit()

        return LibraryUpdateResponse(id=str(library.id))

    @staticmethod
    async def delete_library(
        tenant_id: str, current_user: User, library_id: str, session: AsyncSession
    ) -> None:
        """ライブラリを削除する。削除できるのは紐づくルームの所有者本人のみ。

        Args:
            tenant_id: テナントID。
            current_user: 認証済みユーザー。
            library_id: 削除対象のライブラリID。
            session: 非同期DBセッション。

        Raises:
            HTTPException: ライブラリ・紐づくルームが存在しない場合404、
                所有者でない場合403。
        """
        library = await LibraryService._get_library_or_404(
            library_id, tenant_id, session
        )
        await LibraryService._require_owned_room_for_library(
            tenant_id, current_user, library, session
        )
        await LibraryRepository.delete(library, session)
