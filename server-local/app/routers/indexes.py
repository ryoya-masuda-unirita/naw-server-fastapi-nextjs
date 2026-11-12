"""移植元 IndexController（`/api/admin/indexes/{indexId}`）。

multipart の項目は移植元の @ModelAttribute（record の項目名）と同じ名前で受け取る。
"""

from typing import Annotated, Any

from fastapi import APIRouter, File, Form, Header, Query, Response, status
from fastapi import UploadFile as FastAPIUploadFile
from fastapi.exceptions import RequestValidationError

from app.core.config import MAX_FILE_SIZE_BYTES
from app.core.deps import SessionDep, WahaDep
from app.core.errors import PayloadTooLargeError
from app.models import FileStatus
from app.repositories.file_repository import FileSearchCondition
from app.schemas.index import DeleteIndexFileRequest, SyncIndexFilesRequest
from app.schemas.message import UploadedFile
from app.services import file_service

router = APIRouter(prefix="/api/admin/indexes/{indexId}", tags=["indexes"])

TenantHeader = Annotated[str, Header(alias="X-Tenant-ID")]
OptionalForm = Annotated[str | None, Form()]
OptionalFile = Annotated[FastAPIUploadFile | None, File()]


async def _to_uploaded(upload: FastAPIUploadFile | None) -> UploadedFile | None:
    if upload is None:
        return None
    if upload.size is not None and upload.size > MAX_FILE_SIZE_BYTES:
        raise PayloadTooLargeError(upload.filename or "")
    return await UploadedFile.from_upload(upload)


@router.get("/files")
async def list_files(
    indexId: str,
    session: SessionDep,
    tenant_id: TenantHeader,
    page: Annotated[int, Query()],
    size: Annotated[int, Query()],
    userId: Annotated[str | None, Query()] = None,
    updatedAtFrom: Annotated[str | None, Query()] = None,
    updatedAtTo: Annotated[str | None, Query()] = None,
    displayName: Annotated[str | None, Query()] = None,
    status_: Annotated[str | None, Query(alias="status")] = None,
) -> dict[str, Any]:
    file_status = None
    if status_ is not None:
        if status_ not in FileStatus.__members__:
            # Spring の型変換失敗（MethodArgumentTypeMismatchException）は 400
            raise RequestValidationError(
                [{"type": "enum", "msg": "invalid status", "loc": ("query", "status")}]
            )
        file_status = FileStatus[status_]
    cond = FileSearchCondition(
        tenant_id=tenant_id,
        index_id=indexId,
        display_name=displayName,
        user_id=userId,
        status=file_status,
        updated_at_from=file_service.parse_date_param(updatedAtFrom),
        updated_at_to=file_service.parse_date_param(updatedAtTo),
    )
    return await file_service.search_files(session, cond, page, size)


@router.post("/files")
async def upload_file(
    indexId: str,
    session: SessionDep,
    waha: WahaDep,
    tenant_id: TenantHeader,
    creationServiceName: OptionalForm = None,
    name: OptionalForm = None,
    displayName: OptionalForm = None,
    reference: OptionalForm = None,
    splitLength: OptionalForm = None,
    userId: OptionalForm = None,
    file: OptionalFile = None,
) -> dict[str, Any]:
    return await file_service.create_file(
        session,
        waha,
        creation_service_name=creationServiceName,
        name=name,
        display_name=displayName,
        reference=reference,
        user_id=userId,
        index_id=indexId,
        upload=await _to_uploaded(file),
        split_length=splitLength,
        tenant_id=tenant_id,
    )


@router.patch("/files/{fileId}")
async def update_file(
    indexId: str,
    fileId: str,
    session: SessionDep,
    waha: WahaDep,
    tenant_id: TenantHeader,
    creationServiceName: OptionalForm = None,
    deletionServiceName: OptionalForm = None,
    name: OptionalForm = None,
    displayName: OptionalForm = None,
    reference: OptionalForm = None,
    splitLength: OptionalForm = None,
    userId: OptionalForm = None,
    file: OptionalFile = None,
) -> dict[str, Any]:
    return await file_service.update_file(
        session,
        waha,
        creation_service_name=creationServiceName,
        deletion_service_name=deletionServiceName,
        file_id=fileId,
        name=name,
        display_name=displayName,
        reference=reference,
        user_id=userId,
        index_id=indexId,
        upload=await _to_uploaded(file),
        split_length=splitLength,
        tenant_id=tenant_id,
    )


@router.delete("/files/{fileId}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_file(
    indexId: str,
    fileId: str,
    body: DeleteIndexFileRequest,
    session: SessionDep,
    waha: WahaDep,
) -> Response:
    await file_service.delete_file(
        session,
        waha,
        deletion_service_name=body.deletionServiceName,
        file_id=fileId,
        index_id=indexId,
        physical_delete=bool(body.physicalDelete),
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/files/{fileId}")
async def download_file(indexId: str, fileId: str) -> None:
    file_service.download_file()


@router.post("/sync", status_code=status.HTTP_204_NO_CONTENT)
async def sync_files(
    indexId: str,
    body: SyncIndexFilesRequest,
    session: SessionDep,
    waha: WahaDep,
    tenant_id: TenantHeader,
) -> Response:
    await file_service.sync_files(
        session,
        waha,
        sync_service_name=body.syncServiceName,
        index_id=indexId,
        tenant_id=tenant_id,
        user_id=body.userId,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/additionalLeaning", status_code=status.HTTP_204_NO_CONTENT)
async def additional_learning(
    indexId: str,
    session: SessionDep,
    waha: WahaDep,
    tenant_id: TenantHeader,
    creationServiceName: OptionalForm = None,
    feedbackId: OptionalForm = None,
    roomId: OptionalForm = None,
    userId: OptionalForm = None,
    content: OptionalFile = None,
) -> Response:
    await file_service.additional_learning(
        session,
        waha,
        creation_service_name=creationServiceName,
        index_id=indexId,
        feedback_id=feedbackId,
        room_id=roomId,
        user_id=userId,
        tenant_id=tenant_id,
        content=await _to_uploaded(content),
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
