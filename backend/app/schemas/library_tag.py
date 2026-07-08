from datetime import datetime

from pydantic import BaseModel, Field, field_validator

NAME_MAX_LENGTH = 255


class LibraryTagCreateRequest(BaseModel):
    name: str = Field(max_length=NAME_MAX_LENGTH)
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
            raise ValueError("タグ名は必須です")
        return value


class LibraryTagUpdateRequest(BaseModel):
    """name・descriptionともに未指定(None)または空白のみの場合は現状維持する。"""

    name: str | None = Field(default=None, max_length=NAME_MAX_LENGTH)
    description: str | None = Field(default=None)


class LibraryTagDeleteRequest(BaseModel):
    ids: list[str] = Field(min_length=1)


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
