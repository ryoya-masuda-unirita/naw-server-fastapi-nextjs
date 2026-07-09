from datetime import datetime
from urllib.parse import quote

from fastapi import APIRouter, Depends, File as FastAPIFile, Query, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.file_storage import FileStorage, get_file_storage
from app.core.security import get_verified_tenant_id, require_admin_or_group_admin
from app.models.user import User
from app.schemas.file import (
    FileResponse,
    FileUpdateForm,
    FileUploadForm,
    PagedFileResponse,
)
from app.services.file_service import FileService

admin_router = APIRouter(
    prefix="/api/admin/indexes/{index_id}/files", tags=["admin-files"]
)


@admin_router.get("", response_model=PagedFileResponse)
async def get_files(
    index_id: str,
    userId: str | None = Query(None),
    updatedAtFrom: datetime | None = Query(None),
    updatedAtTo: datetime | None = Query(None),
    displayName: str | None = Query(None),
    fileName: str | None = Query(None),
    status_: str | None = Query(None, alias="status"),
    page: int = Query(0, ge=0),
    size: int = Query(20, ge=1, le=100),
    sort: str = Query("updatedAt,desc"),
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(require_admin_or_group_admin),
    session: AsyncSession = Depends(get_session),
) -> PagedFileResponse:
    """ファイル一覧を取得する"""
    return await FileService.list_files(
        index_id,
        x_tenant_id,
        userId,
        updatedAtFrom,
        updatedAtTo,
        displayName,
        fileName,
        status_,
        sort,
        page,
        size,
        session,
    )


@admin_router.post("", response_model=FileResponse)
async def upload_file(
    index_id: str,
    file: UploadFile = FastAPIFile(...),
    form: FileUploadForm = Depends(),
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(require_admin_or_group_admin),
    storage: FileStorage = Depends(get_file_storage),
    session: AsyncSession = Depends(get_session),
) -> FileResponse:
    """ファイルをアップロードする"""
    return await FileService.create_file(
        index_id, x_tenant_id, current_user, form, file, storage, session
    )


@admin_router.get("/{id}")
async def download_file(
    index_id: str,
    id: str,
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(require_admin_or_group_admin),
    storage: FileStorage = Depends(get_file_storage),
    session: AsyncSession = Depends(get_session),
) -> Response:
    """ファイルをダウンロードする"""
    file, content = await FileService.get_file_for_download(
        index_id, id, x_tenant_id, storage, session
    )
    filename = file.display_name or file.name
    # 日本語等の非ASCII文字を含むファイル名はlatin-1で符号化できずヘッダー生成が
    # 失敗するため、RFC 5987（filename*=UTF-8''...）形式でパーセントエンコードする。
    encoded_filename = quote(filename)
    return Response(
        content=content,
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": (
                f'attachment; filename="{filename.encode("ascii", "replace").decode("ascii")}"; '
                f"filename*=UTF-8''{encoded_filename}"
            )
        },
    )


@admin_router.patch("/{id}", response_model=FileResponse)
async def update_file(
    index_id: str,
    id: str,
    file: UploadFile | None = FastAPIFile(None),
    form: FileUpdateForm = Depends(),
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(require_admin_or_group_admin),
    storage: FileStorage = Depends(get_file_storage),
    session: AsyncSession = Depends(get_session),
) -> FileResponse:
    """ファイルを更新する"""
    return await FileService.update_file(
        index_id, id, x_tenant_id, current_user, form, file, storage, session
    )


@admin_router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_file(
    index_id: str,
    id: str,
    physicalDelete: bool = Query(False),
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(require_admin_or_group_admin),
    storage: FileStorage = Depends(get_file_storage),
    session: AsyncSession = Depends(get_session),
) -> None:
    """ファイルを削除する"""
    await FileService.delete_file(
        index_id, id, x_tenant_id, physicalDelete, storage, session
    )
