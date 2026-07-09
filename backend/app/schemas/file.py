from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import Form
from pydantic import BaseModel

from app.models.file import FileStatus


class FileResponse(BaseModel):
    """ファイルのレスポンス（移植元`FileResponse`相当）。"""

    id: str
    tenantId: str
    fileName: str
    displayName: str | None
    reference: str | None
    status: FileStatus
    userId: UUID
    indexId: str
    storageUrl: str | None
    feedbackId: str | None
    roomId: str | None
    createdAt: datetime
    updatedAt: datetime
    updatedBy: str | None


class PagedFileResponse(BaseModel):
    content: list[FileResponse]
    totalElements: int
    number: int
    size: int


class FileUploadForm:
    """ファイルアップロード（POST）用のmultipart/form-dataを受け取る依存クラス。

    移植元`UpdateFileRequest`（`@ModelAttribute`）相当。`file`は必須。
    """

    def __init__(
        self,
        name: Annotated[str, Form()],
        displayName: Annotated[str | None, Form()] = None,
        reference: Annotated[str | None, Form()] = None,
        splitLength: Annotated[str | None, Form()] = None,
        status: Annotated[str | None, Form()] = None,
    ) -> None:
        self.name = name
        self.display_name = displayName
        self.reference = reference
        # splitLength はコンテンツ分割・埋め込み登録（Issue #88 スコープ）で使用する値
        # であり、本Issueでは受理のみ行い未使用とする。
        self.split_length = splitLength
        self.status = status


class FileUpdateForm:
    """ファイル更新（PATCH）用のmultipart/form-dataを受け取る依存クラス。

    移植元`UpdateFileRequest`（`@ModelAttribute`）相当。全フィールド任意（`file`未添付なら
    メタデータ更新のみ、添付ありなら置換更新）。
    """

    def __init__(
        self,
        name: Annotated[str | None, Form()] = None,
        displayName: Annotated[str | None, Form()] = None,
        reference: Annotated[str | None, Form()] = None,
        splitLength: Annotated[str | None, Form()] = None,
        status: Annotated[str | None, Form()] = None,
    ) -> None:
        self.name = name
        self.display_name = displayName
        self.reference = reference
        self.split_length = splitLength
        self.status = status
