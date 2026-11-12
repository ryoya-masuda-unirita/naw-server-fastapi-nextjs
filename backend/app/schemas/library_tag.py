from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, Field, field_validator

from app.core.validation_messages import RequestModel, ValidationMessages

NAME_MAX_LENGTH = 255
_NAME_REQUIRED_MESSAGE = "タグ名は必須です"
_NAME_SIZE_MESSAGE = f"タグ名は{NAME_MAX_LENGTH}文字以内で入力してください"


class LibraryTagCreateRequest(RequestModel):
    name: Annotated[
        str,
        Field(max_length=NAME_MAX_LENGTH),
        ValidationMessages(not_blank=_NAME_REQUIRED_MESSAGE, size=_NAME_SIZE_MESSAGE),
    ]
    description: str | None = Field(default=None)

    @field_validator("name")
    @classmethod
    def _validate_name_not_blank(cls, value: str) -> str:
        """タグ名が空白のみでないことを検証する。

        Args:
            value: 検証対象のタグ名。`Field()`の長さ制約を通過済み。

        Returns:
            検証済みのタグ名。

        Raises:
            ValueError: 空白のみの場合。
        """
        if not value.strip():
            raise ValueError(_NAME_REQUIRED_MESSAGE)
        return value


class LibraryTagUpdateRequest(RequestModel):
    """name・descriptionともに未指定(None)または空白のみの場合は現状維持する。"""

    name: Annotated[
        str | None,
        Field(max_length=NAME_MAX_LENGTH),
        ValidationMessages(size=_NAME_SIZE_MESSAGE),
    ] = None
    description: str | None = Field(default=None)


class LibraryTagDeleteRequest(RequestModel):
    ids: Annotated[
        list[str],
        Field(min_length=1),
        ValidationMessages(not_empty="削除対象のIDを1件以上指定してください"),
    ]


class LibraryTagResponse(BaseModel):
    id: str
    tenantId: str
    name: str
    description: str | None
    createdAt: datetime
    updatedAt: datetime


class LibraryTagListResponse(BaseModel):
    tags: list[LibraryTagResponse]


class LibraryTagPageResponse(BaseModel):
    content: list[LibraryTagResponse]
    totalElements: int
    number: int
    size: int
