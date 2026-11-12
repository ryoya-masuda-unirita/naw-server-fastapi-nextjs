"""移植元 IndexController（`/api/admin/indexes/{indexId}`）。

multipart の項目は移植元の @ModelAttribute（record の項目名）と同じ名前で受け取る。
"""

from typing import Annotated, Any

from fastapi import (
    APIRouter,
    Depends,
    File,
    Header,
    Query,
    Request,
    Response,
    status,
)
from fastapi import UploadFile as FastAPIUploadFile
from fastapi.exceptions import RequestValidationError

from app.core.config import MAX_FILE_SIZE_BYTES
from app.core.deps import SessionDep, WahaDep
from app.core.errors import BadRequestError, PayloadTooLargeError
from app.models import FileStatus
from app.repositories.file_repository import FileSearchCondition
from app.schemas.index import DeleteIndexFileRequest, SyncIndexFilesRequest
from app.schemas.message import UploadedFile
from app.services import file_service

router = APIRouter(prefix="/api/admin/indexes/{indexId}", tags=["indexes"])

TenantHeader = Annotated[str, Header(alias="X-Tenant-ID")]
OptionalFile = Annotated[FastAPIUploadFile | None, File()]


def form_text(name: str) -> Any:
    """multipart の文字列項目を、空文字は空文字のまま受け取る依存。

    FastAPI の Form() は空文字を未指定（None）にするが、移植元の @ModelAttribute は
    空文字をそのまま渡す（PATCH で `displayName=` を送ると表示名が空になる）ため。
    """

    async def dependency(request: Request) -> str | None:
        value = (await request.form()).get(name)
        return value if isinstance(value, str) else None

    return Depends(dependency)


CreationServiceNameForm = Annotated[str | None, form_text("creationServiceName")]
DeletionServiceNameForm = Annotated[str | None, form_text("deletionServiceName")]
NameForm = Annotated[str | None, form_text("name")]
DisplayNameForm = Annotated[str | None, form_text("displayName")]
ReferenceForm = Annotated[str | None, form_text("reference")]
SplitLengthForm = Annotated[str | None, form_text("splitLength")]
UserIdForm = Annotated[str | None, form_text("userId")]
FeedbackIdForm = Annotated[str | None, form_text("feedbackId")]
RoomIdForm = Annotated[str | None, form_text("roomId")]


def _require_fields(**fields: str | None) -> None:
    """登録するファイルの必須項目（name・userId）を確かめる。

    移植元は未指定だと DB の NOT NULL 制約で失敗する（500）が、それは Waha! への
    登録が終わった後になる。入力不備なので、Waha! を呼ぶ前に 400 で返す。
    """
    for field, value in fields.items():
        if value is None:
            raise BadRequestError(f"{field} が指定されていません")


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
    # Spring は空文字の列挙型パラメーターを未指定（null）として扱う
    if status_:
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
    creationServiceName: CreationServiceNameForm,
    name: NameForm,
    displayName: DisplayNameForm,
    reference: ReferenceForm,
    splitLength: SplitLengthForm,
    userId: UserIdForm,
    file: OptionalFile = None,
) -> dict[str, Any]:
    _require_fields(name=name, userId=userId)
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
    creationServiceName: CreationServiceNameForm,
    deletionServiceName: DeletionServiceNameForm,
    name: NameForm,
    displayName: DisplayNameForm,
    reference: ReferenceForm,
    splitLength: SplitLengthForm,
    userId: UserIdForm,
    file: OptionalFile = None,
) -> dict[str, Any]:
    upload = await _to_uploaded(file)
    if upload is not None and not upload.is_empty():
        # ファイルを差し替えるときは登録し直すため、新規登録と同じ項目が必要
        _require_fields(name=name, userId=userId)
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
        upload=upload,
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
    creationServiceName: CreationServiceNameForm,
    feedbackId: FeedbackIdForm,
    roomId: RoomIdForm,
    userId: UserIdForm,
    content: OptionalFile = None,
) -> Response:
    _require_fields(userId=userId)
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
