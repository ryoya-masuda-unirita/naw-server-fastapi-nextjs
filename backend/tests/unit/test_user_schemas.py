"""ユーザー応答のスキーマ（ログインキーを返さないこと）の単体テスト（Issue #309）。"""

from datetime import datetime, timezone
from uuid import uuid4

import pytest

from app.models.user import User, UserRole
from app.schemas.user import UserCreateResponse, UserResponse, UserUpdateResponse
from typing import Any

STORED_LOGIN_KEY = "stored-login-key"
EXPIRED_AT = datetime(2026, 12, 1, tzinfo=timezone.utc)


def _user(login_key: str | None) -> User:
    """テスト用のユーザーを作る。

    Parameters
    ----------
    login_key : str | None
        保存済みのログインキー。

    Returns
    -------
    User
        テスト用のユーザー。
    """
    return User(
        id=uuid4(),
        tenant_id="tenant-1",
        login_id="user-1",
        name="User 1",
        role=UserRole.USER,
        login_key_hash=login_key,
        is_required_password_reset=True,
    )


class TestUserResponse:
    """UserResponse のテスト"""

    @pytest.mark.parametrize(
        ("login_key", "expected"), [(STORED_LOGIN_KEY, True), (None, False)]
    )
    def test_has_login_key_reflects_stored_key(
        self, login_key: Any, expected: bool
    ) -> None:
        """hasLoginKey がログインキーの有無を表すこと"""
        response = UserResponse.from_user(_user(login_key))

        assert response.hasLoginKey is expected

    def test_does_not_expose_login_key(self) -> None:
        """保存済みのログインキーを応答に含めないこと"""
        body = UserResponse.from_user(_user(STORED_LOGIN_KEY)).model_dump()

        assert "loginKey" not in body
        assert STORED_LOGIN_KEY not in body.values()


class TestUserCreateResponse:
    """UserCreateResponse のテスト"""

    def test_returns_login_key_set_in_request(self) -> None:
        """作成で設定したログインキーだけを loginKey に入れること"""
        response = UserCreateResponse.from_user(
            _user(STORED_LOGIN_KEY), "InitPass1!", EXPIRED_AT, STORED_LOGIN_KEY
        )

        assert response.loginKey == STORED_LOGIN_KEY
        assert response.hasLoginKey is True
        assert response.initialPassword == "InitPass1!"
        assert response.passwordExpiredAt == EXPIRED_AT

    def test_omits_total_credits(self) -> None:
        """移植元 UserCreateResponse と同じく totalCredits を持たないこと"""
        body = UserCreateResponse.from_user(
            _user(None), "InitPass1!", EXPIRED_AT, None
        ).model_dump()

        assert "totalCredits" not in body
        assert body["loginKey"] is None
        assert body["hasLoginKey"] is False


class TestUserUpdateResponse:
    """UserUpdateResponse のテスト"""

    def test_does_not_return_stored_key_when_not_set_in_request(self) -> None:
        """更新で設定していなければ保存済みのキーを loginKey に入れないこと"""
        response = UserUpdateResponse.from_user(
            _user(STORED_LOGIN_KEY), None, None, None
        )

        assert response.loginKey is None
        assert response.hasLoginKey is True
        assert response.initialPassword is None
        assert response.passwordExpiredAt is None
