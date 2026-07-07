from datetime import datetime

from pydantic import BaseModel, field_validator

NAME_MAX_LENGTH = 16
DESCRIPTION_MAX_LENGTH = 255


def _validate_name(value: str) -> str:
    """カテゴリ名が空白のみでなく16文字以内であることを検証する。"""
    if not value.strip():
        raise ValueError("カテゴリ名は必須です")
    if len(value) > NAME_MAX_LENGTH:
        raise ValueError(f"カテゴリ名は{NAME_MAX_LENGTH}文字以内で入力してください")
    return value


def _validate_description(value: str | None) -> str | None:
    """説明が255文字以内であることを検証する。"""
    if value is not None and len(value) > DESCRIPTION_MAX_LENGTH:
        raise ValueError(f"説明は{DESCRIPTION_MAX_LENGTH}文字以内で入力してください")
    return value


class AssistantCategoryCreateRequest(BaseModel):
    name: str
    description: str | None = None

    _validate_name = field_validator("name")(_validate_name)
    _validate_description = field_validator("description")(_validate_description)


class AssistantCategoryUpdateRequest(BaseModel):
    name: str
    description: str | None = None

    _validate_name = field_validator("name")(_validate_name)
    _validate_description = field_validator("description")(_validate_description)


class AssistantCategoryResponse(BaseModel):
    id: str
    name: str
    description: str | None
    updatedAt: datetime
