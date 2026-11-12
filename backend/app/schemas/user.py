from datetime import datetime
from typing import Annotated, Any

from pydantic import BaseModel

from app.core.validation_messages import (
    NOT_BLANK_DEFAULT_MESSAGE,
    NOT_NULL_DEFAULT_MESSAGE,
    RequestModel,
    ValidationMessages,
)
from app.models.user import User, UserRole


class UserCreateRequest(RequestModel):
    """ユーザー作成のリクエスト（移植元 `UserCreateRequest`）。"""

    # 移植元は`@NotBlank`・`@NotNull`（メッセージ指定なし）のため既定文言を返す。
    loginId: Annotated[str, ValidationMessages(not_blank=NOT_BLANK_DEFAULT_MESSAGE)]
    name: Annotated[str, ValidationMessages(not_blank=NOT_BLANK_DEFAULT_MESSAGE)]
    role: Annotated[UserRole, ValidationMessages(not_null=NOT_NULL_DEFAULT_MESSAGE)]
    loginKey: str | None = None


class UserUpdateRequest(BaseModel):
    """ユーザー更新のリクエスト（移植元 `UserUpdateRequest`）。"""

    name: str | None = None
    role: UserRole | None = None
    loginKey: str | None = None
    resetPassword: bool | None = None


class UserProfileUpdateRequest(BaseModel):
    """プロフィール更新のリクエスト（移植元 `UserProfileUpdateRequest`）。"""

    password: str | None = None


class UserResponse(BaseModel):
    """ユーザー一覧・プロフィールの1件分（移植元 `UserResponse`）。

    ログインキーは秘密情報のため値を返さず、設定済みかどうかだけを `hasLoginKey` で返す
    （移植元 NAW-1342 AC-03）。
    """

    id: str
    loginId: str
    name: str
    role: UserRole
    hasLoginKey: bool
    isRequiredPasswordReset: bool
    # NAW-1172: includeUsage=true時のみ設定される請求期間内クレジット利用量合計。
    # includeUsage未指定・falseの場合は常にNone。
    totalCredits: int | None = None

    @classmethod
    def from_user(cls, user: User, total_credits: int | None = None) -> "UserResponse":
        """ユーザーのDBモデルから応答を作る。

        Parameters
        ----------
        user : User
            ユーザーのDBモデル。
        total_credits : int | None
            請求期間内のクレジット利用量。includeUsage=true のときだけ渡す。

        Returns
        -------
        UserResponse
            ユーザーの応答。
        """
        return cls(
            id=str(user.id),
            loginId=user.login_id,
            name=user.name,
            role=user.role,
            hasLoginKey=user.login_key is not None,
            isRequiredPasswordReset=user.is_required_password_reset,
            totalCredits=total_credits,
        )


class _UserMutationResponse(BaseModel):
    """ユーザー作成・更新の応答に共通する項目（移植元 `UserCreateResponse`・`UserUpdateResponse`）。

    `loginKey` には、このリクエストで設定したログインキーだけを入れる。設定していない
    ときは None にし、保存済みのキーは返さない（移植元 NAW-1342 AC-03）。
    """

    id: str
    loginId: str
    name: str
    role: UserRole
    loginKey: str | None
    hasLoginKey: bool
    isRequiredPasswordReset: bool

    @staticmethod
    def _base_fields(user: User, login_key: str | None) -> dict[str, Any]:
        """ユーザーのDBモデルから共通項目を取り出す。

        Parameters
        ----------
        user : User
            作成・更新したユーザーのDBモデル。
        login_key : str | None
            このリクエストで設定したログインキー。設定していなければ None。

        Returns
        -------
        dict[str, Any]
            共通項目の値。
        """
        return {
            "id": str(user.id),
            "loginId": user.login_id,
            "name": user.name,
            "role": user.role,
            "loginKey": login_key,
            "hasLoginKey": user.login_key is not None,
            "isRequiredPasswordReset": user.is_required_password_reset,
        }


class UserCreateResponse(_UserMutationResponse):
    """ユーザー作成の応答（移植元 `UserCreateResponse`）。"""

    initialPassword: str
    passwordExpiredAt: datetime

    @classmethod
    def from_user(
        cls,
        user: User,
        initial_password: str,
        password_expired_at: datetime,
        login_key: str | None,
    ) -> "UserCreateResponse":
        """作成したユーザーから応答を作る。

        Parameters
        ----------
        user : User
            作成したユーザーのDBモデル。
        initial_password : str
            発行した初期パスワード（平文）。
        password_expired_at : datetime
            初期パスワードの有効期限。
        login_key : str | None
            このリクエストで設定したログインキー。設定していなければ None。

        Returns
        -------
        UserCreateResponse
            ユーザー作成の応答。
        """
        return cls(
            **cls._base_fields(user, login_key),
            initialPassword=initial_password,
            passwordExpiredAt=password_expired_at,
        )


class UserUpdateResponse(_UserMutationResponse):
    """ユーザー更新の応答（移植元 `UserUpdateResponse`）。"""

    initialPassword: str | None = None
    passwordExpiredAt: datetime | None = None

    @classmethod
    def from_user(
        cls,
        user: User,
        initial_password: str | None,
        password_expired_at: datetime | None,
        login_key: str | None,
    ) -> "UserUpdateResponse":
        """更新したユーザーから応答を作る。

        Parameters
        ----------
        user : User
            更新したユーザーのDBモデル。
        initial_password : str | None
            パスワードを再発行したときの初期パスワード（平文）。再発行しなければ None。
        password_expired_at : datetime | None
            再発行した初期パスワードの有効期限。再発行しなければ None。
        login_key : str | None
            このリクエストで設定したログインキー。設定していなければ None。

        Returns
        -------
        UserUpdateResponse
            ユーザー更新の応答。
        """
        return cls(
            **cls._base_fields(user, login_key),
            initialPassword=initial_password,
            passwordExpiredAt=password_expired_at,
        )


class PagedUserResponse(BaseModel):
    """ユーザー一覧のページ応答。"""

    content: list[UserResponse]
    totalElements: int
    totalPages: int
    page: int
    size: int
