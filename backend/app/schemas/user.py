import math
from datetime import datetime

from pydantic import BaseModel

from app.models.user import User, UserRole


class UserCreateRequest(BaseModel):
    loginId: str
    name: str
    role: UserRole
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

    @classmethod
    def from_user(cls, user: User) -> "UserResponse":
        return cls(
            id=str(user.id),
            loginId=user.login_id,
            name=user.name,
            role=user.role,
            loginKey=user.login_key,
            isRequiredPasswordReset=user.is_required_password_reset,
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
