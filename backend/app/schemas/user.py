from datetime import datetime
from typing import Annotated

from pydantic import BaseModel

from app.core.validation_messages import (
    NOT_BLANK_DEFAULT_MESSAGE,
    NOT_NULL_DEFAULT_MESSAGE,
    RequestModel,
    ValidationMessages,
)
from app.models.user import User, UserRole


class UserCreateRequest(RequestModel):
    # 移植元は`@NotBlank`・`@NotNull`（メッセージ指定なし）のため既定文言を返す。
    loginId: Annotated[str, ValidationMessages(not_blank=NOT_BLANK_DEFAULT_MESSAGE)]
    name: Annotated[str, ValidationMessages(not_blank=NOT_BLANK_DEFAULT_MESSAGE)]
    role: Annotated[UserRole, ValidationMessages(not_null=NOT_NULL_DEFAULT_MESSAGE)]
    loginKey: str | None = None


class UserUpdateRequest(BaseModel):
    name: str | None = None
    role: UserRole | None = None
    loginKey: str | None = None
    resetPassword: bool | None = None


class UserProfileUpdateRequest(BaseModel):
    password: str | None = None


class UserResponse(BaseModel):
    id: str
    loginId: str
    name: str
    role: UserRole
    loginKey: str | None
    isRequiredPasswordReset: bool
    # NAW-1172: includeUsage=true時のみ設定される請求期間内クレジット利用量合計。
    # includeUsage未指定・falseの場合は常にNone。
    totalCredits: int | None = None

    @classmethod
    def from_user(cls, user: User, total_credits: int | None = None) -> "UserResponse":
        return cls(
            id=str(user.id),
            loginId=user.login_id,
            name=user.name,
            role=user.role,
            loginKey=user.login_key,
            isRequiredPasswordReset=user.is_required_password_reset,
            totalCredits=total_credits,
        )


class UserCreateResponse(UserResponse):
    initialPassword: str
    passwordExpiredAt: datetime


class UserUpdateResponse(UserResponse):
    initialPassword: str | None = None
    passwordExpiredAt: datetime | None = None


class PagedUserResponse(BaseModel):
    content: list[UserResponse]
    totalElements: int
    totalPages: int
    page: int
    size: int
