from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.models.user import User, UserRole
from app.services.group_service import GroupService
from unittest.mock import MagicMock


def _user(role: UserRole) -> User:
    """指定したロールのユーザーを作る。

    Parameters
    ----------
    role : UserRole
        ユーザーのロール。

    Returns
    -------
    User
        永続化していないユーザー。
    """
    return User(
        id=uuid4(),
        tenant_id="tenant-1",
        login_id="u",
        name="U",
        role=role,
        is_required_password_reset=False,
    )


class TestAssertCanManageGroup:
    """GroupService._assert_can_manage_group のテスト"""

    async def test_tenant_admin_is_allowed(self) -> None:
        """テナント管理者は常に許可されること"""
        await GroupService._assert_can_manage_group(
            "g1",
            "tenant-1",
            _user(UserRole.ADMIN),
            session=None,  # type: ignore[arg-type]
        )

    @patch(
        "app.services.group_service.GroupUserRepository.is_group_admin",
        new_callable=AsyncMock,
    )
    async def test_group_admin_is_allowed(self, mock_is_admin: MagicMock) -> None:
        """グループ内管理者は許可されること"""
        mock_is_admin.return_value = True
        await GroupService._assert_can_manage_group(
            "g1",
            "tenant-1",
            _user(UserRole.USER),
            session=None,  # type: ignore[arg-type]
        )

    @patch(
        "app.services.group_service.GroupUserRepository.is_group_admin",
        new_callable=AsyncMock,
    )
    async def test_non_manager_raises_403(self, mock_is_admin: MagicMock) -> None:
        """いずれの権限も持たない場合403相当の例外になること"""
        mock_is_admin.return_value = False

        with pytest.raises(HTTPException) as exc_info:
            await GroupService._assert_can_manage_group(
                "g1",
                "tenant-1",
                _user(UserRole.USER),
                session=None,  # type: ignore[arg-type]
            )

        assert exc_info.value.status_code == 403


class TestAssertNotSelf:
    """GroupService._assert_not_self のテスト"""

    def test_tenant_admin_can_target_self(self) -> None:
        """テナント管理者は自分自身を対象にしても例外にならないこと"""
        user = _user(UserRole.ADMIN)
        GroupService._assert_not_self(user.id, user)

    def test_group_admin_cannot_target_self(self) -> None:
        """グループ管理者（一般ユーザー）が自分自身を対象にすると403になること"""
        user = _user(UserRole.USER)

        with pytest.raises(HTTPException) as exc_info:
            GroupService._assert_not_self(user.id, user)

        assert exc_info.value.status_code == 403

    def test_group_admin_can_target_other_user(self) -> None:
        """グループ管理者が他ユーザーを対象にする場合は例外にならないこと"""
        user = _user(UserRole.USER)
        GroupService._assert_not_self(uuid4(), user)
