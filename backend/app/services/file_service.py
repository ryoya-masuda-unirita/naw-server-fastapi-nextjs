import uuid
from datetime import datetime

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import credit_quota, file_creation
from app.core.file_storage import FileStorage
from app.models.file import File, FileStatus
from app.models.index import Index
from app.models.user import User
from app.repositories.file_repository import FileRepository
from app.repositories.index_repository import IndexRepository
from app.repositories.user_repository import UserRepository
from app.schemas.file import (
    FileResponse,
    FileUpdateForm,
    FileUploadForm,
    PagedFileResponse,
)

_VALID_STATUS_NAMES = {s.name for s in FileStatus}


class FileService:
    @staticmethod
    async def _get_index_or_404(
        index_id: str, tenant_id: str, session: AsyncSession
    ) -> Index:
        """インデックスを取得する。存在しない場合は404を返す。

        移植元は`indexRepository.findByTenantIdAndId`の結果がnullでも
        `index.getType()`を呼び出しNPEになりうる潜在バグがあるため、FastAPI版では
        明示的に404を返すよう修正する。

        Args:
            index_id: インデックスID。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            該当するIndex。

        Raises:
            HTTPException: インデックスが存在しない場合404を返す。
        """
        index = await IndexRepository.find_by_id_and_tenant_id(
            index_id, tenant_id, session
        )
        if index is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="インデックスが存在しません。",
            )
        return index

    @staticmethod
    def _parse_status(status_str: str | None) -> FileStatus | None:
        """クエリ・フォームの`status`文字列を`FileStatus`に変換する。

        Args:
            status_str: `ENABLE`・`DISABLE`・`DELETED`のいずれか、またはNone。

        Returns:
            変換後の`FileStatus`。`status_str`がNoneまたは空文字の場合はNone。

        Raises:
            HTTPException: 未知の値が指定された場合400を返す。
        """
        if not status_str:
            return None
        if status_str not in _VALID_STATUS_NAMES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"不正なstatusです: {status_str}",
            )
        return FileStatus[status_str]

    @staticmethod
    async def _resolve_user_id_filter(
        user_id_filter: str | None, tenant_id: str, session: AsyncSession
    ) -> uuid.UUID | None:
        """一覧検索の`userId`絞り込み条件を解決する（loginIdまたはUUIDの両対応）。

        移植元`FileService.resolveUserIdFilter`相当。

        Args:
            user_id_filter: クエリで指定された`userId`（loginIdまたはUUID文字列）。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            解決済みのユーザーUUID。指定なし、または該当ユーザーがいない場合はNone。
        """
        if not user_id_filter:
            return None
        try:
            parsed_uuid = uuid.UUID(user_id_filter)
        except ValueError:
            user = await UserRepository.find_by_login_id(
                user_id_filter, tenant_id, session
            )
            return user.id if user is not None else None

        user = await UserRepository.find_by_id_and_tenant_id(
            parsed_uuid, tenant_id, session
        )
        return user.id if user is not None else None

    @staticmethod
    async def _to_response(file: File, updated_by: str | None) -> FileResponse:
        """`File`エンティティをレスポンススキーマに変換する。

        Args:
            file: 変換対象のFile。
            updated_by: 解決済みの更新者名（呼び出し側で一括解決したものを渡す）。

        Returns:
            変換後のFileResponse。
        """
        return FileResponse(
            id=file.id,
            tenantId=file.tenant_id,
            fileName=file.name,
            displayName=file.display_name,
            reference=file.reference,
            status=file.status,
            userId=file.user_id,
            indexId=file.index_id,
            storageUrl=file.storage_url,
            feedbackId=file.feedback_id,
            roomId=file.room_id,
            createdAt=file.created_at,
            updatedAt=file.updated_at,
            updatedBy=updated_by,
        )

    @staticmethod
    async def _to_single_response(
        file: File, tenant_id: str, session: AsyncSession
    ) -> FileResponse:
        updated_by = None
        if file.user_id is not None:
            user = await UserRepository.find_by_id_and_tenant_id(
                file.user_id, tenant_id, session
            )
            updated_by = user.name if user is not None else None
        return await FileService._to_response(file, updated_by)

    @staticmethod
    async def _to_paged_response(
        files: list[File],
        total: int,
        tenant_id: str,
        page: int,
        size: int,
        session: AsyncSession,
    ) -> PagedFileResponse:
        user_ids = {f.user_id for f in files if f.user_id is not None}
        users_by_id = await UserRepository.find_by_ids(user_ids, tenant_id, session)
        content = [
            await FileService._to_response(
                f,
                users_by_id[f.user_id].name if f.user_id in users_by_id else None,
            )
            for f in files
        ]
        return PagedFileResponse(
            content=content, totalElements=total, number=page, size=size
        )

    @staticmethod
    async def list_files(
        index_id: str,
        tenant_id: str,
        user_id_filter: str | None,
        updated_at_from: datetime | None,
        updated_at_to: datetime | None,
        display_name: str | None,
        file_name: str | None,
        status_str: str | None,
        sort: str,
        page: int,
        size: int,
        session: AsyncSession,
    ) -> PagedFileResponse:
        """ファイル一覧をページネーションで取得する。

        Args:
            index_id: インデックスID。
            tenant_id: テナントID。
            user_id_filter: 絞り込み対象のユーザー（loginIdまたはUUID）。
            updated_at_from: 更新日時の範囲開始。
            updated_at_to: 更新日時の範囲終了。
            display_name: 表示名の部分一致検索文字列。
            file_name: ファイル名の部分一致検索文字列。
            status_str: 絞り込み対象のステータス文字列。
            sort: ソート指定（"列名,方向"形式。既定は"updatedAt,desc"）。
            page: ページ番号（0始まり）。
            size: 1ページあたりの件数。
            session: 非同期DBセッション。

        Returns:
            ページネーション済みファイル一覧。
        """
        resolved_user_id = await FileService._resolve_user_id_filter(
            user_id_filter, tenant_id, session
        )
        resolved_status = FileService._parse_status(status_str)

        sort_parts = sort.split(",")
        sort_col_name = sort_parts[0]
        sort_dir = sort_parts[1] if len(sort_parts) > 1 else "asc"

        files, total = await FileRepository.find_page(
            index_id,
            tenant_id,
            display_name,
            file_name,
            resolved_user_id,
            resolved_status,
            updated_at_from,
            updated_at_to,
            sort_col_name,
            sort_dir,
            page,
            size,
            session,
        )
        return await FileService._to_paged_response(
            files, total, tenant_id, page, size, session
        )

    @staticmethod
    async def create_file(
        index_id: str,
        tenant_id: str,
        current_user: User,
        form: FileUploadForm,
        upload: UploadFile,
        storage: FileStorage,
        session: AsyncSession,
    ) -> FileResponse:
        """ファイルをアップロードする。

        Args:
            index_id: インデックスID。
            tenant_id: テナントID。
            current_user: アップロードを行うユーザー。
            form: アップロードフォーム（`name`・`displayName`・`reference`等）。
            upload: アップロードされたファイル。
            storage: ファイルストレージ。
            session: 非同期DBセッション。

        Returns:
            作成されたファイルのレスポンス。

        Raises:
            HTTPException: インデックスが存在しない場合404、`LOCAL`インデックスの場合400、
                当月クレジット上限超過の場合429を返す。
        """
        index = await FileService._get_index_or_404(index_id, tenant_id, session)
        file_creation.ensure_not_local(index)
        await credit_quota.enforce_within_quota(tenant_id, session)

        file = await file_creation.create_file_record(
            index,
            form.name,
            form.display_name,
            form.reference,
            current_user,
            upload,
            tenant_id,
            storage,
            session,
        )
        return await FileService._to_single_response(file, tenant_id, session)

    @staticmethod
    async def get_file_for_download(
        index_id: str,
        file_id: str,
        tenant_id: str,
        storage: FileStorage,
        session: AsyncSession,
    ) -> tuple[File, bytes]:
        """ファイルをダウンロードする。

        移植元にはない`index_id`とのクロスチェックを行い、別インデックス配下の
        ファイルIDを誤って（あるいは意図的に）指定してもダウンロードできないようにする。

        Args:
            index_id: インデックスID。
            file_id: ファイルID。
            tenant_id: テナントID。
            storage: ファイルストレージ。
            session: 非同期DBセッション。

        Returns:
            (ファイルのメタデータ, ファイルの内容) のタプル。

        Raises:
            HTTPException: ファイルが存在しない、または保存先の実体が見つからない場合404を返す。
        """
        file = await FileRepository.find_by_id_and_tenant_id(
            file_id, tenant_id, session
        )
        if file is None or file.index_id != index_id or file.storage_url is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="ファイルが存在しません。"
            )
        content = await storage.download(file.storage_url)
        return file, content

    @staticmethod
    async def update_file(
        index_id: str,
        file_id: str,
        tenant_id: str,
        current_user: User,
        form: FileUpdateForm,
        upload: UploadFile | None,
        storage: FileStorage,
        session: AsyncSession,
    ) -> FileResponse:
        """ファイルを更新する。

        `upload`が指定されていない（または空）場合はメタデータ（表示名・参照・ステータス）
        のみ更新する。`upload`が指定されている場合は、移植元同様に既存ファイルを物理削除
        した上で新規ファイルとして再作成する（置換更新）。

        Args:
            index_id: インデックスID。
            file_id: ファイルID。
            tenant_id: テナントID。
            current_user: 更新を行うユーザー。
            form: 更新フォーム。
            upload: 添付ファイル（未添付ならNone）。
            storage: ファイルストレージ。
            session: 非同期DBセッション。

        Returns:
            更新後のファイルのレスポンス。

        Raises:
            HTTPException: ファイルが存在しない場合404、`status=DELETED`をPATCHで指定した
                場合400、ファイル添付時に当月クレジット上限を超過している場合429を返す。
        """
        if upload is None or not upload.filename:
            file = await FileRepository.find_by_id_and_tenant_id(
                file_id, tenant_id, session
            )
            if file is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="ファイルが存在しません。",
                )
            if form.display_name is not None:
                file.display_name = form.display_name
            if form.reference is not None:
                file.reference = form.reference
            if form.status is not None:
                parsed_status = FileService._parse_status(form.status)
                if parsed_status is not None:
                    if parsed_status == FileStatus.DELETED:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail="status=DELETED は PATCH では指定できません。DELETE API を使用してください。",
                        )
                    file.status = parsed_status
            file = await FileRepository.save(file, session)
            return await FileService._to_single_response(file, tenant_id, session)

        if not form.name:
            # `name`が未指定のまま置換すると、旧ファイル削除後に空文字の`name`で
            # 新規レコードが作成されてしまい復旧できなくなる。旧ファイルを削除する前に
            # 検証する。
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="ファイルを添付して更新する場合、nameは必須です。",
            )

        index = await FileService._get_index_or_404(index_id, tenant_id, session)
        file_creation.ensure_not_local(index)
        await credit_quota.enforce_within_quota(tenant_id, session)

        await FileService.delete_file(
            index_id, file_id, tenant_id, True, storage, session
        )
        file = await file_creation.create_file_record(
            index,
            form.name,
            form.display_name,
            form.reference,
            current_user,
            upload,
            tenant_id,
            storage,
            session,
        )
        return await FileService._to_single_response(file, tenant_id, session)

    @staticmethod
    async def delete_file(
        index_id: str,
        file_id: str,
        tenant_id: str,
        physical_delete: bool,
        storage: FileStorage,
        session: AsyncSession,
    ) -> None:
        """ファイルを削除する。

        Args:
            index_id: インデックスID。
            file_id: ファイルID。
            tenant_id: テナントID。
            physical_delete: Trueならレコードごと物理削除、falseなら論理削除
                （`status = DELETED`）。いずれもストレージ上の実体は削除する。
            storage: ファイルストレージ。
            session: 非同期DBセッション。

        Raises:
            HTTPException: インデックスが存在しない場合404、`LOCAL`インデックスの場合400、
                ファイルが存在しない場合404を返す。
        """
        index = await FileService._get_index_or_404(index_id, tenant_id, session)
        file_creation.ensure_not_local(index)

        file = await FileRepository.find_by_id_and_tenant_id(
            file_id, tenant_id, session
        )
        if file is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="ファイルが存在しません。"
            )

        if file.storage_url is not None:
            await storage.delete(file.storage_url)

        if physical_delete:
            await FileRepository.delete(file, session)
        else:
            file.status = FileStatus.DELETED
            await FileRepository.save(file, session)
