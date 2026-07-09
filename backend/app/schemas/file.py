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
        """アップロードフォームの各フィールドを保持する。

        Args:
            name: ファイルの内部名。
            displayName: 表示名。
            reference: 参照情報。
            splitLength: コンテンツ分割・埋め込み登録（Issue #88スコープ）で使用する値。
                本Issueでは受理のみ行い未使用とする。
            status: ステータス文字列（`ENABLE`・`DISABLE`・`DELETED`）。
        """
        self.name = name
        self.display_name = displayName
        self.reference = reference
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
        """更新フォームの各フィールドを保持する。

        `file`が未添付ならメタデータ更新のみに使われ、添付時は置換更新の新規メタデータ
        として使われる（置換更新時は`name`が必須。`FileService.update_file`で検証する）。

        Args:
            name: ファイルの内部名。
            displayName: 表示名。
            reference: 参照情報。
            splitLength: コンテンツ分割・埋め込み登録（Issue #88スコープ）で使用する値。
                本Issueでは受理のみ行い未使用とする。
            status: ステータス文字列（`ENABLE`・`DISABLE`・`DELETED`）。
        """
        self.name = name
        self.display_name = displayName
        self.reference = reference
        self.split_length = splitLength
        self.status = status
