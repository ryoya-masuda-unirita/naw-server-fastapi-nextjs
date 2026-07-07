from datetime import datetime

from pydantic import BaseModel, Field, field_validator

# 移植元Java（`@Size(max=16)`）に合わせたAPIバリデーション用の上限。
# DBカラム（AssistantCategory.name）は移植元Liquibaseに合わせてvarchar(32)だが、
# API側は将来の拡張余地としてDBより厳しい16文字を維持する（意図的な差分）。
NAME_MAX_LENGTH = 16
DESCRIPTION_MAX_LENGTH = 255


class _AssistantCategoryRequestBase(BaseModel):
    """作成・更新リクエストで共通のフィールド・バリデーション。"""

    name: str = Field(max_length=NAME_MAX_LENGTH)
    description: str | None = Field(default=None, max_length=DESCRIPTION_MAX_LENGTH)

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
            raise ValueError("カテゴリ名は必須です")
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
