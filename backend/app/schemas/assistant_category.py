from datetime import datetime

from pydantic import BaseModel, field_validator

# 移植元Java（`@Size(max=16)`）に合わせたAPIバリデーション用の上限。
# DBカラム（AssistantCategory.name）は移植元Liquibaseに合わせてvarchar(32)だが、
# API側は将来の拡張余地としてDBより厳しい16文字を維持する（意図的な差分）。
NAME_MAX_LENGTH = 16
DESCRIPTION_MAX_LENGTH = 255


class _AssistantCategoryRequestBase(BaseModel):
    """作成・更新リクエストで共通のフィールド・バリデーション。"""

    name: str
    description: str | None = None

    @field_validator("name")
    @classmethod
    def _validate_name(cls, value: str) -> str:
        """カテゴリ名が空白のみでなく指定文字数以内であることを検証する。

        Args:
            value: 検証対象のカテゴリ名。

        Returns:
            検証済みのカテゴリ名。

        Raises:
            ValueError: 空白のみ、または`NAME_MAX_LENGTH`を超える場合。
        """
        if not value.strip():
            raise ValueError("カテゴリ名は必須です")
        if len(value) > NAME_MAX_LENGTH:
            raise ValueError(f"カテゴリ名は{NAME_MAX_LENGTH}文字以内で入力してください")
        return value

    @field_validator("description")
    @classmethod
    def _validate_description(cls, value: str | None) -> str | None:
        """説明が指定文字数以内であることを検証する。

        Args:
            value: 検証対象の説明。Noneの場合は検証をスキップする。

        Returns:
            検証済みの説明。

        Raises:
            ValueError: `DESCRIPTION_MAX_LENGTH`を超える場合。
        """
        if value is not None and len(value) > DESCRIPTION_MAX_LENGTH:
            raise ValueError(
                f"説明は{DESCRIPTION_MAX_LENGTH}文字以内で入力してください"
            )
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
