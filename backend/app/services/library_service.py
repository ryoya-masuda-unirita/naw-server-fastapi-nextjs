import uuid

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.library_tag_id import normalize_library_tag_ids
from app.core.room_access import (
    can_view_room,
    require_owned_room,
    require_viewable_room,
)
from app.models.assistant import AssistantType
from app.models.library import Library
from app.models.tenant_endpoint import EndpointType
from app.models.user import User
from app.repositories.assistant_endpoint_repository import (
    AssistantEndpointRepository,
)
from app.repositories.assistant_repository import AssistantRepository
from app.repositories.group_repository import GroupRepository
from app.repositories.library_content_repository import (
    LibraryContentRepository,
)
from app.repositories.library_repository import LibraryRepository
from app.repositories.library_tag_mapping_repository import LibraryTagMappingRepository
from app.repositories.library_tag_repository import LibraryTagRepository
from app.repositories.message_repository import MessageRepository
from app.repositories.room_repository import RoomRepository
from app.repositories.share_library_repository import ShareLibraryRepository
from app.schemas.library import (
    LibraryAssistantResponse,
    LibraryContentResponse,
    LibraryGetResponse,
    LibraryListItemResponse,
    LibraryPageItemResponse,
    LibraryPageResponse,
    LibrarySharedGroupInfo,
    LibraryTagInfo,
    LibraryUpdateRequest,
    LibraryUpdateResponse,
)
from app.schemas.message import EndpointResponse


def _parse_library_id(library_id: str) -> uuid.UUID:
    """パス変数のライブラリID文字列をUUIDへ変換する。不正な形式は404として扱う。

    Parameters
    ----------
    library_id : str
        パス変数のライブラリID文字列。

    Returns
    -------
    uuid.UUID
        変換後のUUID。

    Raises
    ------
    HTTPException
        UUID形式でない場合404を返す（存在しないIDと同様に扱う）。
    """
    try:
        return uuid.UUID(library_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Library not found"
        ) from exc


class LibraryService:
    """ライブラリの取得・作成・更新・削除を行うサービス。"""

    @staticmethod
    async def _get_library_or_404(
        library_id: str, tenant_id: str, session: AsyncSession
    ) -> Library:
        """IDとテナントIDでライブラリを取得し、存在しなければ404を送出する。

        Parameters
        ----------
        library_id : str
            対象のライブラリID。
        tenant_id : str
            テナントID。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        Library
            該当するライブラリ。

        Raises
        ------
        HTTPException
            存在しない場合404を返す。
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

        Parameters
        ----------
        tenant_id : str
            テナントID。
        current_user : User
            認証済みユーザー。
        library : Library
            検証対象のライブラリ。
        session : AsyncSession
            非同期DBセッション。

        Raises
        ------
        HTTPException
            紐づくメッセージ・ルームが存在しない場合は404、
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

        Parameters
        ----------
        tenant_id : str
            テナントID。
        current_user : User
            認証済みユーザー。
        page : int
            0始まりのページ番号。
        size : int
            1ページあたりの件数。
        title : str | None
            タイトルの部分一致検索文字列。
        created_by : str | None
            作成者のloginId絞り込み。
        exclude_created_by : str | None
            除外する作成者のloginId絞り込み。
        tag_ids : list[uuid.UUID] | None
            絞り込み対象のタグID一覧。
        sort_by : str
            ソート対象列名。
        sort_dir : str
            ソート方向。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        LibraryPageResponse
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

        Parameters
        ----------
        tenant_id : str
            テナントID。
        current_user : User
            認証済みユーザー。
        room_id : str
            対象のルームID。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        list[LibraryListItemResponse]
            ルームに紐づくライブラリ一覧（id・titleのみ）。

        Raises
        ------
        HTTPException
            ルームが存在しない場合404、閲覧権限がない場合403。
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
    async def _require_readable_library(
        tenant_id: str, current_user: User, library_id: str, session: AsyncSession
    ) -> Library:
        """閲覧できるライブラリを取得する（移植元 LibraryService#requireReadableLibrary）。

        「紐づくメッセージのルームへの閲覧権限がある」または「ライブラリ自体が
        可視（所有者 or 共有先グループ所属）」のいずれかを満たせば閲覧できる。

        Parameters
        ----------
        tenant_id : str
            テナントID。
        current_user : User
            認証済みユーザー。
        library_id : str
            対象のライブラリID。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        Library
            閲覧できるライブラリ。

        Raises
        ------
        HTTPException
            存在しない、またはどちらの条件も満たさない場合404を返す。
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
                return library

        if not await LibraryRepository.is_visible_to_user(
            library.id, tenant_id, current_user.id, session
        ):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Library not found"
            )
        return library

    @staticmethod
    async def _build_assistant_response(
        tenant_id: str, assistant_id: str, session: AsyncSession
    ) -> LibraryAssistantResponse | None:
        """ライブラリ詳細に載せるアシスタント情報を組み立てる。

        移植元`LibraryGetResponse#toAssistantResponse`と同じく、APIキーは
        SECUREかつLOCAL_SERVERのエンドポイントだけ返し、`model`は先頭の
        エンドポイントのモデルとする。

        Parameters
        ----------
        tenant_id : str
            テナントID。
        assistant_id : str
            アシスタントID。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        LibraryAssistantResponse | None
            アシスタント情報。アシスタントが存在しない場合はNone。
        """
        assistant = await AssistantRepository.find_by_id_and_tenant_id(
            assistant_id, tenant_id, session
        )
        if assistant is None:
            return None
        pairs = await AssistantEndpointRepository.find_with_tenant_endpoints_by_assistant_id(
            assistant_id, tenant_id, session
        )
        endpoints = [
            EndpointResponse(
                type=tenant_endpoint.type.value,
                destination=tenant_endpoint.endpoint,
                apiKey=(
                    tenant_endpoint.api_key
                    if assistant.type == AssistantType.SECURE
                    and tenant_endpoint.type == EndpointType.LOCAL_SERVER
                    else ""
                ),
            )
            for _, tenant_endpoint in pairs
        ]
        return LibraryAssistantResponse(
            id=assistant.id,
            type=assistant.type.value,
            includeHistory=assistant.include_history,
            model=pairs[0][0].model if pairs else None,
            endpoints=endpoints,
        )

    @staticmethod
    async def get_library(
        tenant_id: str, current_user: User, library_id: str, session: AsyncSession
    ) -> LibraryGetResponse:
        """ライブラリの詳細（メタデータ・アシスタント・本文の有無）を取得する。

        Parameters
        ----------
        tenant_id : str
            テナントID。
        current_user : User
            認証済みユーザー。
        library_id : str
            対象のライブラリID。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        LibraryGetResponse
            ライブラリの詳細。

        Raises
        ------
        HTTPException
            閲覧できない場合404を返す。
        """
        library = await LibraryService._require_readable_library(
            tenant_id, current_user, library_id, session
        )
        message = await MessageRepository.find_by_tenant_id_and_id(
            tenant_id, library.message_id, session
        )
        assistant = (
            await LibraryService._build_assistant_response(
                tenant_id, message.assistant_id, session
            )
            if message is not None and message.assistant_id
            else None
        )
        has_naw_content = (
            await LibraryContentRepository.exists_by_library_id_and_tenant_id(
                library.id, tenant_id, session
            )
        )
        return LibraryGetResponse(
            id=str(library.id),
            title=library.title,
            messageId=library.message_id,
            userId=str(library.user_id),
            createdAt=library.created_at,
            updatedAt=library.updated_at,
            assistant=assistant,
            hasNawContent=has_naw_content,
        )

    @staticmethod
    async def get_library_content(
        tenant_id: str, current_user: User, library_id: str, session: AsyncSession
    ) -> LibraryContentResponse:
        """ライブラリの本文を取得する（移植元`LibraryService#getLibraryContent`）。

        Parameters
        ----------
        tenant_id : str
            テナントID。
        current_user : User
            認証済みユーザー。
        library_id : str
            対象のライブラリID。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        LibraryContentResponse
            ライブラリの本文。

        Raises
        ------
        HTTPException
            閲覧できない場合、または本文が無い場合404を返す。
        """
        library = await LibraryService._require_readable_library(
            tenant_id, current_user, library_id, session
        )
        content = await LibraryContentRepository.find_by_library_id_and_tenant_id(
            library.id, tenant_id, session
        )
        if content is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Library content not found",
            )
        return LibraryContentResponse(data=content.content)

    @staticmethod
    async def create_library_stub(
        tenant_id: str,
        current_user: User,
        message_id: str,
        session: AsyncSession,
    ) -> LibraryUpdateResponse:
        """タイトル・本文の無いライブラリ（スタブ）を作成する。

        ローカルサーバーが生成したライブラリのメタデータを先に登録するために使う。

        Parameters
        ----------
        tenant_id : str
            テナントID。
        current_user : User
            認証済みユーザー。
        message_id : str
            紐づけるメッセージID。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        LibraryUpdateResponse
            作成したライブラリのID。

        Raises
        ------
        HTTPException
            メッセージが存在しない場合404（`Message not found`）、ルームが存在しない
            場合404、ルームの所有者でない場合403を返す。
        """
        message = await MessageRepository.find_by_tenant_id_and_id(
            tenant_id, message_id, session
        )
        if message is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Message not found"
            )
        await require_owned_room(tenant_id, current_user, message.room_id, session)
        library = await LibraryRepository.save(
            Library(
                tenant_id=tenant_id,
                message_id=message_id,
                user_id=current_user.id,
                title=None,
            ),
            session,
        )
        return LibraryUpdateResponse(id=str(library.id))

    @staticmethod
    async def update_library_title(
        tenant_id: str,
        current_user: User,
        library_id: str,
        title: str,
        session: AsyncSession,
    ) -> LibraryUpdateResponse:
        """ライブラリのタイトルだけを更新する。

        Parameters
        ----------
        tenant_id : str
            テナントID。
        current_user : User
            認証済みユーザー。
        library_id : str
            更新対象のライブラリID。
        title : str
            新しいタイトル。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        LibraryUpdateResponse
            更新したライブラリのID。

        Raises
        ------
        HTTPException
            ライブラリ・紐づくメッセージが存在しない場合404、所有者でない場合403を返す。
        """
        library = await LibraryService._get_library_or_404(
            library_id, tenant_id, session
        )
        await LibraryService._require_owned_room_for_library(
            tenant_id, current_user, library, session
        )
        library.title = title
        saved = await LibraryRepository.save(library, session)
        return LibraryUpdateResponse(id=str(saved.id))

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

        Parameters
        ----------
        tenant_id : str
            テナントID。
        current_user : User
            認証済みユーザー。
        library_id : str
            更新対象のライブラリID。
        req : LibraryUpdateRequest
            更新リクエスト。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        LibraryUpdateResponse
            更新したライブラリのID。

        Raises
        ------
        HTTPException
            ライブラリ・紐づくルームが存在しない場合404、所有者で
            ない場合403、指定グループ・タグの一部が存在しない場合、またはタグIDが
            ハイフンなし32桁・UUID標準形式のどちらでもない場合400。
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

        # 移植元と同じく共有グループの確認の後にタグIDの形式を確認する（不正なら400）。
        # 保存形式に揃えてから重複を除き、表記違いの同じタグを1件として扱う。
        tag_ids = list(dict.fromkeys(normalize_library_tag_ids(req.tags or [])))
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

        Parameters
        ----------
        tenant_id : str
            テナントID。
        current_user : User
            認証済みユーザー。
        library_id : str
            削除対象のライブラリID。
        session : AsyncSession
            非同期DBセッション。

        Raises
        ------
        HTTPException
            ライブラリ・紐づくルームが存在しない場合404、
            所有者でない場合403。
        """
        library = await LibraryService._get_library_or_404(
            library_id, tenant_id, session
        )
        await LibraryService._require_owned_room_for_library(
            tenant_id, current_user, library, session
        )
        await LibraryRepository.delete(library, session)
