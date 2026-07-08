from datetime import datetime

from pydantic import BaseModel, Field, field_validator

NAME_MAX_LENGTH = 255


class LibraryUpdateRequest(BaseModel):
    """ライブラリ更新リクエスト。

    リクエストに含まれた内容で既存ライブラリを上書きする（完全置換）。
    `groups`・`tags`は空配列またはNoneで全解除する。
    """

    name: str = Field(max_length=NAME_MAX_LENGTH)
    groups: list[str] | None = Field(default=None)
    tags: list[str] | None = Field(default=None)

    @field_validator("name")
    @classmethod
    def _validate_name_not_blank(cls, value: str) -> str:
        """ライブラリ名が空白のみでないことを検証する。

        Args:
            value: 検証対象のライブラリ名。`Field()`の長さ制約を通過済み。

        Returns:
            検証済みのライブラリ名。

        Raises:
            ValueError: 空白のみの場合。
        """
        if not value.strip():
            raise ValueError("ライブラリ名は必須です")
        return value


class LibraryTagInfo(BaseModel):
    id: str
    name: str


class LibrarySharedGroupInfo(BaseModel):
    id: str
    name: str


class LibraryPageItemResponse(BaseModel):
    id: str
    title: str
    userId: str
    createdAt: datetime
    updatedAt: datetime
    tags: list[LibraryTagInfo]
    sharedGroups: list[LibrarySharedGroupInfo]


class LibraryPageResponse(BaseModel):
    content: list[LibraryPageItemResponse]
    totalElements: int
    number: int
    size: int


class LibraryListItemResponse(BaseModel):
    id: str
    title: str


class LibraryGetResponse(BaseModel):
    title: str
    data: str | None


class LibraryUpdateResponse(BaseModel):
    id: str
