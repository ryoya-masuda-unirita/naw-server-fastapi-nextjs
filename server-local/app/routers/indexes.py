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
NAME_NOT_SPECIFIED_MESSAGE = "name が指定されていません"


def form_text(name: str) -> Any:
    """multipart の文字列項目を、空文字は空文字のまま受け取る依存。

    FastAPI の Form() は空文字を未指定（None）にするが、移植元の @ModelAttribute は
    空文字をそのまま渡す（PATCH で `displayName=` を送ると表示名が空になる）ため。

    Parameters
    ----------
    name : str
        multipart の項目名。

    Returns
    -------
    Any
        ``Annotated`` に付ける ``Depends``。項目の値（未指定やファイルなら None）を渡す。
    """

    async def dependency(request: Request) -> str | None:
        """リクエストの multipart から ``name`` の項目を文字列で取り出す。

        Parameters
        ----------
        request : Request
            処理中のリクエスト。

        Returns
        -------
        str | None
            項目の値。未指定、またはファイルが送られた場合は None。
        """
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


def _require_name(name: str | None) -> None:
    """登録するファイルの name を確かめる。

    移植元は未指定だと DB の NOT NULL 制約で必ず失敗する（500）が、それは Waha! への
    登録が終わった後になる。入力不備なので、Waha! を呼ぶ前に 400 で返す。
    userId は既存のファイルの更新なら未指定でも成功するため、保存時に確かめる。

    Parameters
    ----------
    name : str | None
        multipart の ``name`` 項目の値。

    Raises
    ------
    BadRequestError
        ``name`` が指定されていない場合（400）。
    """
    if name is None:
        raise BadRequestError(NAME_NOT_SPECIFIED_MESSAGE)


async def _to_uploaded(upload: FastAPIUploadFile | None) -> UploadedFile | None:
    """受け取ったファイルを、サイズを確かめてサービス用の形に読み込む。

    リクエスト全体の上限とは別に、移植元の max-file-size と同じく 1 ファイルの
    上限を超えていれば 413 にする。

    Parameters
    ----------
    upload : FastAPIUploadFile | None
        multipart で受け取ったファイル。

    Returns
    -------
    UploadedFile | None
        ファイル名・Content-Type・中身を読み込んだもの。ファイルがなければ None。

    Raises
    ------
    PayloadTooLargeError
        ファイルのサイズが上限を超えている場合（413）。
    """
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
    """インデックスの学習ファイルを条件で絞り込み、1 ページ分を返す。

    Parameters
    ----------
    indexId : str
        インデックス ID（パス）。
    session : AsyncSession
        DB セッション。
    tenant_id : str
        ``X-Tenant-ID`` ヘッダーのテナント ID。
    page : int
        ページ番号（0 始まり）。
    size : int
        1 ページの件数。
    userId : str | None, optional
        登録したユーザー ID で絞り込む。
    updatedAtFrom : str | None, optional
        更新日の下限（``yyyy-MM-dd``）。
    updatedAtTo : str | None, optional
        更新日の上限（``yyyy-MM-dd``）。
    displayName : str | None, optional
        表示名で絞り込む。
    status_ : str | None, optional
        ファイルの状態（クエリ名は ``status``）。``FileStatus`` の名前で指定する。
        空文字は Spring と同じく未指定とみなす。

    Returns
    -------
    dict[str, Any]
        移植元の Page と同じ形の応答。

    Raises
    ------
    RequestValidationError
        ``status`` が ``FileStatus`` の名前でない場合（Spring の型変換失敗と同じ 400）。
    BadRequestError
        日付の形式が正しくない、または page・size が範囲外の場合（400）。
    """
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
    """ファイルを Waha! で学習させ、インデックスの学習ファイルとして登録する。

    Parameters
    ----------
    indexId : str
        インデックス ID（パス）。
    session : AsyncSession
        DB セッション。
    waha : WahaClient
        Waha! クライアント。
    tenant_id : str
        ``X-Tenant-ID`` ヘッダーのテナント ID。
    creationServiceName : str | None
        学習に使う Waha! のサービス名。
    name : str | None
        ファイル名。必須。
    displayName : str | None
        表示名。
    reference : str | None
        参照元。DB に保存し、Waha! の学習に ``filepath`` として渡す。
    splitLength : str | None
        文書を分割する長さ。
    userId : str | None
        登録するユーザー ID。
    file : FastAPIUploadFile | None, optional
        学習させるファイル。

    Returns
    -------
    dict[str, Any]
        登録した学習ファイル（パート付き）。

    Raises
    ------
    BadRequestError
        ``name`` などの入力が足りない場合（400）。
    PayloadTooLargeError
        ファイルのサイズが上限を超えている場合（413）。
    ExternalServiceError
        Waha! の呼び出しに失敗した場合（500）。
    RuntimeError
        Waha! の学習結果の TSV からファイルの登録内容を読み取れない場合（500）。
    """
    _require_name(name)
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
    """学習ファイルを更新する。ファイルが送られれば Waha! で学習し直す。

    Parameters
    ----------
    indexId : str
        インデックス ID（パス）。
    fileId : str
        更新するファイル ID（パス）。
    session : AsyncSession
        DB セッション。
    waha : WahaClient
        Waha! クライアント。
    tenant_id : str
        ``X-Tenant-ID`` ヘッダーのテナント ID。
    creationServiceName : str | None
        再学習に使う Waha! のサービス名。
    deletionServiceName : str | None
        旧データの削除に使う Waha! のサービス名。
    name : str | None
        ファイル名。ファイルを差し替えるときは必須。
    displayName : str | None
        表示名。空文字なら表示名を空にする。
    reference : str | None
        参照元。
    splitLength : str | None
        文書を分割する長さ。
    userId : str | None
        ファイルを差し替えるときに、新しいファイルの登録者として使うユーザー ID。
        メタデータだけの更新では使われない。差し替えるのに未指定だと、Waha! の
        処理が済んだ後の保存時に 400 になる。
    file : FastAPIUploadFile | None, optional
        差し替えるファイル。

    Returns
    -------
    dict[str, Any]
        更新後の学習ファイル（パート付き）。

    Raises
    ------
    BadRequestError
        ファイルを差し替えるのに ``name`` がないなど、入力が足りない場合（400）。
    PayloadTooLargeError
        ファイルのサイズが上限を超えている場合（413）。
    EntityNotFoundError
        ファイルが存在しない場合（404）。
    ExternalServiceError
        Waha! の呼び出しに失敗した場合（500）。
    """
    upload = await _to_uploaded(file)
    if upload is not None and not upload.is_empty():
        # ファイルを差し替えるときは登録し直すため、新規登録と同じく name が必要
        _require_name(name)
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
    """学習ファイルを Waha! と DB から削除する。

    Parameters
    ----------
    indexId : str
        インデックス ID（パス）。
    fileId : str
        削除するファイル ID（パス）。
    body : DeleteIndexFileRequest
        削除に使う Waha! のサービス名と、物理削除するかの指定。
    session : AsyncSession
        DB セッション。
    waha : WahaClient
        Waha! クライアント。

    Returns
    -------
    Response
        本文なしの 204 応答。

    Raises
    ------
    EntityNotFoundError
        ファイルが存在しない場合（404）。
    ExternalServiceError
        Waha! の呼び出しに失敗した場合（500）。
    """
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
    """学習ファイルをダウンロードする（移植元が未実装のため常に失敗する）。

    移植元は Waha! からの取り出しが未実装で常に例外になるため、同じく 500 を返す。

    Parameters
    ----------
    indexId : str
        インデックス ID（パス。使わない）。
    fileId : str
        ファイル ID（パス。使わない）。

    Raises
    ------
    RuntimeError
        常に送出する（想定外のエラーとして 500 になる）。
    """
    file_service.download_file()


@router.post("/sync", status_code=status.HTTP_204_NO_CONTENT)
async def sync_files(
    indexId: str,
    body: SyncIndexFilesRequest,
    session: SessionDep,
    waha: WahaDep,
    tenant_id: TenantHeader,
) -> Response:
    """Waha! に登録済みで DB にないファイルを、学習ファイルとして取り込む。

    Parameters
    ----------
    indexId : str
        インデックス ID（パス）。
    body : SyncIndexFilesRequest
        同期に使う Waha! のサービス名と、登録するユーザー ID。
    session : AsyncSession
        DB セッション。
    waha : WahaClient
        Waha! クライアント。
    tenant_id : str
        ``X-Tenant-ID`` ヘッダーのテナント ID。

    Returns
    -------
    Response
        本文なしの 204 応答。

    Raises
    ------
    BadRequestError
        ユーザー ID がない場合（400）。
    ExternalServiceError
        Waha! の呼び出しに失敗した場合（500）。
    """
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
    """フィードバックまたはルームの会話を Waha! で追加学習させる。

    パスの ``additionalLeaning`` は移植元の綴りのまま（呼び出し側と合わせるため）。

    Parameters
    ----------
    indexId : str
        インデックス ID（パス）。
    session : AsyncSession
        DB セッション。
    waha : WahaClient
        Waha! クライアント。
    tenant_id : str
        ``X-Tenant-ID`` ヘッダーのテナント ID。
    creationServiceName : str | None
        学習に使う Waha! のサービス名。
    feedbackId : str | None
        学習させるフィードバックの ID。``roomId`` とどちらか一方を指定する。
    roomId : str | None
        学習させるルームの ID。``feedbackId`` とどちらか一方を指定する。
    userId : str | None
        登録するユーザー ID。
    content : FastAPIUploadFile | None, optional
        学習させる会話の内容のファイル。

    Returns
    -------
    Response
        本文なしの 204 応答。

    Raises
    ------
    BadRequestError
        ``feedbackId``・``roomId`` の指定が正しくないなど、入力が足りない場合（400）。
    PayloadTooLargeError
        ファイルのサイズが上限を超えている場合（413）。
    ExternalServiceError
        Waha! の呼び出しに失敗した場合（500）。
    """
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
