from datetime import datetime
from typing import Annotated

from fastapi import Query
from pydantic import BaseModel, Field, field_validator

from app.core.validation_messages import RequestModel, ValidationMessages
from app.schemas.message import EndpointResponse

NAME_MAX_LENGTH = 255
_NAME_REQUIRED_MESSAGE = "ライブラリ名は必須です"
_MESSAGE_ID_REQUIRED_MESSAGE = "メッセージIDは必須です"
PAGE_SIZE_MIN = 1
PAGE_SIZE_MAX = 100

# ライブラリ一覧のクエリパラメータ。移植元`LibraryListPageRequest`の制約と文言。
LibraryPageNumber = Annotated[
    int,
    Query(ge=0),
    ValidationMessages(min_value="ページ番号は0以上である必要があります"),
]
LibraryPageSize = Annotated[
    int,
    Query(ge=PAGE_SIZE_MIN, le=PAGE_SIZE_MAX),
    ValidationMessages(
        min_value=f"ページサイズは{PAGE_SIZE_MIN}以上である必要があります",
        max_value=f"ページサイズは{PAGE_SIZE_MAX}以下である必要があります",
    ),
]


class LibraryUpdateRequest(RequestModel):
    """ライブラリ更新リクエスト。

    リクエストに含まれた内容で既存ライブラリを上書きする（完全置換）。
    `groups`・`tags`は空配列またはNoneで全解除する。
    """

    name: Annotated[
        str,
        Field(max_length=NAME_MAX_LENGTH),
        ValidationMessages(
            not_blank=_NAME_REQUIRED_MESSAGE,
            size=f"ライブラリ名は{NAME_MAX_LENGTH}文字以内で入力してください",
        ),
    ]
    groups: list[str] | None = Field(default=None)
    tags: list[str] | None = Field(default=None)

    @field_validator("name")
    @classmethod
    def _validate_name_not_blank(cls, value: str) -> str:
        """ライブラリ名が空白のみでないことを検証する。

        Parameters
        ----------
        value : str
            検証対象のライブラリ名。`Field()`の長さ制約を通過済み。

        Returns
        -------
        str
            検証済みのライブラリ名。

        Raises
        ------
        ValueError
            空白のみの場合。
        """
        if not value.strip():
            raise ValueError(_NAME_REQUIRED_MESSAGE)
        return value


class LibraryCreateRequest(RequestModel):
    """ライブラリスタブ作成リクエスト（移植元`LibraryCreateRequest`）。"""

    messageId: Annotated[
        str, ValidationMessages(not_blank=_MESSAGE_ID_REQUIRED_MESSAGE)
    ]

    @field_validator("messageId")
    @classmethod
    def _validate_message_id_not_blank(cls, value: str) -> str:
        """メッセージIDが空白のみでないことを検証する。

        Parameters
        ----------
        value : str
            検証対象のメッセージID。

        Returns
        -------
        str
            検証済みのメッセージID。

        Raises
        ------
        ValueError
            空白のみの場合。
        """
        if not value.strip():
            raise ValueError(_MESSAGE_ID_REQUIRED_MESSAGE)
        return value


class LibraryTitleUpdateRequest(RequestModel):
    """ライブラリタイトル更新リクエスト（移植元`LibraryTitleUpdateRequest`）。"""

    title: Annotated[
        str,
        Field(max_length=NAME_MAX_LENGTH),
        ValidationMessages(
            not_blank=_NAME_REQUIRED_MESSAGE,
            size=f"ライブラリ名は{NAME_MAX_LENGTH}文字以内で入力してください",
        ),
    ]

    @field_validator("title")
    @classmethod
    def _validate_title_not_blank(cls, value: str) -> str:
        """タイトルが空白のみでないことを検証する。

        Parameters
        ----------
        value : str
            検証対象のタイトル。

        Returns
        -------
        str
            検証済みのタイトル。

        Raises
        ------
        ValueError
            空白のみの場合。
        """
        if not value.strip():
            raise ValueError(_NAME_REQUIRED_MESSAGE)
        return value


class LibraryTagInfo(BaseModel):
    """ライブラリに付与されたタグの情報。"""

    id: str
    name: str


class LibrarySharedGroupInfo(BaseModel):
    """ライブラリの共有先グループの情報。"""

    id: str
    name: str


class LibraryPageItemResponse(BaseModel):
    """ライブラリ一覧（ページ）の1件分のレスポンス。"""

    id: str
    # 一覧にはタイトル未確定のスタブを含めないため実際にはNoneにならない
    title: str | None
    userId: str
    createdAt: datetime
    updatedAt: datetime
    tags: list[LibraryTagInfo]
    sharedGroups: list[LibrarySharedGroupInfo]


class LibraryPageResponse(BaseModel):
    """ライブラリ一覧（ページ）のレスポンス。"""

    content: list[LibraryPageItemResponse]
    totalElements: int
    number: int
    size: int


class LibraryListItemResponse(BaseModel):
    """ルームのライブラリ一覧の1件分のレスポンス。"""

    id: str
    title: str | None


class LibraryAssistantResponse(BaseModel):
    """ライブラリ詳細の本文の取得先を決めるためのアシスタント情報。"""

    id: str
    type: str
    includeHistory: bool
    model: str | None
    endpoints: list[EndpointResponse]


class LibraryGetResponse(BaseModel):
    """ライブラリ詳細（GET /api/libraries/{libraryId}）のレスポンス。"""

    id: str
    title: str | None
    messageId: str
    userId: str
    createdAt: datetime
    updatedAt: datetime
    assistant: LibraryAssistantResponse | None
    hasNawContent: bool


class LibraryContentResponse(BaseModel):
    """ライブラリ本文取得（GET /api/libraries/{libraryId}/content）のレスポンス。"""

    data: str


class LibraryUpdateResponse(BaseModel):
    """ライブラリID（作成・更新の共通レスポンス）。"""

    id: str
