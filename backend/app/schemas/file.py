from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import Form, Query
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


def _prefer_form(form_value: str | None, query_value: str | None) -> str | None:
    """フォーム項目の値を優先し、無ければクエリパラメータの値を返す。

    移植元`@ModelAttribute`はクエリ文字列とmultipart/フォームのボディのどちらのリクエスト
    パラメータからも値をバインドする。画面（`training-api.service.ts`）は`file`だけを
    ボディに入れ、それ以外をクエリで送るため、FastAPI側でも両方を受け付ける。

    Args:
        form_value: multipart/フォームのボディ項目の値。
        query_value: クエリパラメータの値。

    Returns:
        採用する値。どちらも未指定ならNone。
    """
    return form_value if form_value is not None else query_value


class FileUpdateForm:
    """ファイル更新（PATCH）の項目を受け取る依存クラス。

    移植元`UpdateFileRequest`（`@ModelAttribute`）相当。全項目任意（`file`未添付なら
    メタデータ更新のみ、添付ありなら置換更新）。各項目はmultipart/フォームのボディ・
    クエリパラメータのどちらで送ってもよい（フォーム優先）。
    """

    def __init__(
        self,
        name_form: Annotated[str | None, Form(alias="name")] = None,
        name_query: Annotated[str | None, Query(alias="name")] = None,
        display_name_form: Annotated[str | None, Form(alias="displayName")] = None,
        display_name_query: Annotated[str | None, Query(alias="displayName")] = None,
        reference_form: Annotated[str | None, Form(alias="reference")] = None,
        reference_query: Annotated[str | None, Query(alias="reference")] = None,
        split_length_form: Annotated[str | None, Form(alias="splitLength")] = None,
        split_length_query: Annotated[str | None, Query(alias="splitLength")] = None,
        status_form: Annotated[str | None, Form(alias="status")] = None,
        status_query: Annotated[str | None, Query(alias="status")] = None,
    ) -> None:
        """更新の各項目を保持する。

        `file`が未添付ならメタデータ更新のみに使われ、添付時は置換更新の新規メタデータ
        として使われる（置換更新時は`name`が必須。`FileService.update_file`で検証する）。

        Args:
            name_form: ファイルの内部名（ボディ）。
            name_query: ファイルの内部名（クエリ）。
            display_name_form: 表示名（ボディ）。
            display_name_query: 表示名（クエリ）。
            reference_form: 参照情報（ボディ）。
            reference_query: 参照情報（クエリ）。
            split_length_form: 分割長（ボディ）。コンテンツ分割・埋め込み登録
                （Issue #88スコープ）で使用する値で、本スキーマでは受理のみ行う。
            split_length_query: 分割長（クエリ）。
            status_form: ステータス文字列（ボディ。`ENABLE`・`DISABLE`・`DELETED`）。
            status_query: ステータス文字列（クエリ）。
        """
        self.name = _prefer_form(name_form, name_query)
        self.display_name = _prefer_form(display_name_form, display_name_query)
        self.reference = _prefer_form(reference_form, reference_query)
        self.split_length = _prefer_form(split_length_form, split_length_query)
        self.status = _prefer_form(status_form, status_query)


class FileUploadForm(FileUpdateForm):
    """ファイルアップロード（POST）の項目を受け取る依存クラス。

    移植元`UpdateFileRequest`（`@ModelAttribute`）相当で、受け取る項目・方法は更新と同じ。
    `name`は必須だが、依存関係の解決中に例外を送出すると認証（401/403）より先に
    エラーが返ってしまうため、必須チェックは`FileService.create_file`で行う。
    """
