from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, Field, field_validator

from app.core.validation_messages import RequestModel, ValidationMessages

# 移植元Java（`@Size(max=16)`）に合わせたAPIバリデーション用の上限。
# DBカラム（AssistantCategory.name）は移植元Liquibaseに合わせてvarchar(32)だが、
# API側は将来の拡張余地としてDBより厳しい16文字を維持する（意図的な差分）。
NAME_MAX_LENGTH = 16
DESCRIPTION_MAX_LENGTH = 255
_NAME_REQUIRED_MESSAGE = "カテゴリ名は必須です"


class _AssistantCategoryRequestBase(RequestModel):
    """作成・更新リクエストで共通のフィールド・バリデーション。"""

    name: Annotated[
        str,
        Field(max_length=NAME_MAX_LENGTH),
        ValidationMessages(
            not_blank=_NAME_REQUIRED_MESSAGE,
            size="カテゴリ名は16文字以内で入力してください",
        ),
    ]
    description: Annotated[
        str | None,
        Field(max_length=DESCRIPTION_MAX_LENGTH),
        ValidationMessages(size="説明は255文字以内で入力してください"),
    ] = None

    @field_validator("name")
    @classmethod
    def _validate_name_not_blank(cls, value: str) -> str:
        """カテゴリ名が空白のみでないことを検証する（文字数は`Field(max_length=...)`で検証済み）。

        Args:
            value: 検証対象のカテゴリ名。`Field()`の長さ制約を通過済み。

        Returns:
            検証済みのカテゴリ名。

        Raises:
            ValueError: 空白のみの場合。
        """
        if not value.strip():
            raise ValueError(_NAME_REQUIRED_MESSAGE)
        return value


class AssistantCategoryCreateRequest(_AssistantCategoryRequestBase):
    pass


class AssistantCategoryUpdateRequest(_AssistantCategoryRequestBase):
    pass


class AssistantCategoryResponse(BaseModel):
    id: str
    name: str
    description: str | None
    updatedAt: datetime
