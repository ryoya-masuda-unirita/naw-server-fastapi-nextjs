import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import HTTPException
from uuid import uuid4

from app.services.user_service import UserService
from app.models.user import User, UserRole
from app.models.tenant import Tenant
from app.schemas.user import UserCreateRequest, UserUpdateRequest, UserProfileUpdateRequest

REPO_PATH = "app.services.user_service.PasswordHistoryRepository"


@pytest.fixture
def admin_user(test_tenant):
    return User(
        id=uuid4(),
        tenant_id=test_tenant.id,
        login_id="admin",
        name="Admin User",
        role=UserRole.ADMIN,
        is_required_password_reset=False,
    )


class TestGetUsers:

    async def test_returns_paged_users(self, test_tenant, test_user):
        """テナント内ユーザーを返すこと"""
        session = AsyncMock()

        mock_count = MagicMock()
        mock_count.scalar.return_value = 1
        mock_users = MagicMock()
        mock_users.scalars.return_value.all.return_value = [test_user]
        session.execute = AsyncMock(side_effect=[mock_count, mock_users])

        result = await UserService.get_users(
            test_tenant.id, 0, 20, "created_at,desc", None, None, None, session
        )

        assert result.totalElements == 1
        assert len(result.content) == 1
        assert result.content[0].loginId == test_user.login_id

    async def test_filters_by_search_text(self, test_tenant, test_user):
        """searchText で login_id / name を部分一致検索できること"""
        session = AsyncMock()

        mock_count = MagicMock()
        mock_count.scalar.return_value = 1
        mock_users = MagicMock()
        mock_users.scalars.return_value.all.return_value = [test_user]
        session.execute = AsyncMock(side_effect=[mock_count, mock_users])

        result = await UserService.get_users(
            test_tenant.id, 0, 20, "created_at,desc", "test", None, None, session
        )

        assert result.totalElements == 1

    async def test_filters_by_role(self, test_tenant, test_user):
        """role でフィルタできること"""
        session = AsyncMock()

        mock_count = MagicMock()
        mock_count.scalar.return_value = 1
        mock_users = MagicMock()
        mock_users.scalars.return_value.all.return_value = [test_user]
        session.execute = AsyncMock(side_effect=[mock_count, mock_users])

        result = await UserService.get_users(
            test_tenant.id, 0, 20, "created_at,desc", None, "USER", None, session
        )

        assert result.totalElements == 1


class TestCreateUser:

    async def test_creates_user_with_initial_password(self, test_tenant):
        """ユーザーを作成し初期パスワードが返ること"""
        session = AsyncMock()

        mock_dup = MagicMock()
        mock_dup.scalars.return_value.first.return_value = None
        mock_tenant = MagicMock()
        mock_tenant.scalars.return_value.first.return_value = test_tenant
        session.execute = AsyncMock(side_effect=[mock_dup, mock_tenant])
        session.flush = AsyncMock()
        session.commit = AsyncMock()
        session.refresh = AsyncMock()

        req = UserCreateRequest(loginId="newuser", name="New User", role=UserRole.USER)

        with patch(f"{REPO_PATH}.save", new=AsyncMock()):
            result = await UserService.create_user(req, test_tenant.id, session)

        assert result.initialPassword is not None
        assert len(result.initialPassword) >= test_tenant.pw_policy_min_length

    async def test_raises_400_on_duplicate_login_id(self, test_tenant, test_user):
        """同一 loginId が存在する場合 400 を返すこと"""
        session = AsyncMock()

        mock_dup = MagicMock()
        mock_dup.scalars.return_value.first.return_value = test_user
        session.execute = AsyncMock(return_value=mock_dup)

        req = UserCreateRequest(loginId=test_user.login_id, name="Dup", role=UserRole.USER)

        with pytest.raises(HTTPException) as exc_info:
            await UserService.create_user(req, test_tenant.id, session)

        assert exc_info.value.status_code == 400

    async def test_raises_400_when_tenant_not_found(self):
        """テナントが存在しない場合 400 を返すこと"""
        session = AsyncMock()

        mock_dup = MagicMock()
        mock_dup.scalars.return_value.first.return_value = None
        mock_tenant = MagicMock()
        mock_tenant.scalars.return_value.first.return_value = None
        session.execute = AsyncMock(side_effect=[mock_dup, mock_tenant])

        req = UserCreateRequest(loginId="x", name="x", role=UserRole.USER)

        with pytest.raises(HTTPException) as exc_info:
            await UserService.create_user(req, "nonexistent", session)

        assert exc_info.value.status_code == 400


class TestUpdateUser:

    async def test_updates_name_and_role(self, test_tenant, test_user):
        """name・role・loginKey を更新できること"""
        session = AsyncMock()

        mock_user = MagicMock()
        mock_user.scalars.return_value.first.return_value = test_user
        session.execute = AsyncMock(return_value=mock_user)
        session.commit = AsyncMock()
        session.refresh = AsyncMock()

        req = UserUpdateRequest(name="Updated Name", role=UserRole.ADMIN)
        await UserService.update_user(test_user.login_id, req, test_tenant.id, session)

        assert test_user.name == "Updated Name"
        assert test_user.role == UserRole.ADMIN

    async def test_resets_password_when_flag_is_true(self, test_tenant, test_user):
        """resetPassword=true でパスワードリセットし initialPassword が返ること"""
        session = AsyncMock()

        mock_user = MagicMock()
        mock_user.scalars.return_value.first.return_value = test_user
        mock_tenant = MagicMock()
        mock_tenant.scalars.return_value.first.return_value = test_tenant
        session.execute = AsyncMock(side_effect=[mock_user, mock_tenant])
        session.commit = AsyncMock()
        session.refresh = AsyncMock()

        req = UserUpdateRequest(resetPassword=True)

        with patch(f"{REPO_PATH}.save", new=AsyncMock()):
            result = await UserService.update_user(test_user.login_id, req, test_tenant.id, session)

        assert result.initialPassword is not None
        assert result.passwordExpiredAt is not None
        assert test_user.is_required_password_reset is True

    async def test_raises_404_when_user_not_found(self, test_tenant):
        """存在しないユーザーは 404 を返すこと"""
        session = AsyncMock()

        mock_user = MagicMock()
        mock_user.scalars.return_value.first.return_value = None
        session.execute = AsyncMock(return_value=mock_user)

        with pytest.raises(HTTPException) as exc_info:
            await UserService.update_user("nonexistent", UserUpdateRequest(), test_tenant.id, session)

        assert exc_info.value.status_code == 404


class TestDeleteUser:

    async def test_deletes_existing_user(self, test_tenant, test_user):
        """存在するユーザーを削除できること"""
        session = AsyncMock()

        mock_user = MagicMock()
        mock_user.scalars.return_value.first.return_value = test_user
        session.execute = AsyncMock(return_value=mock_user)
        session.commit = AsyncMock()

        await UserService.delete_user(test_user.login_id, test_tenant.id, session)

        session.delete.assert_called_once_with(test_user)
        session.commit.assert_called_once()

    async def test_does_not_raise_when_user_not_found(self, test_tenant):
        """存在しないユーザーでもエラーにならないこと（冪等）"""
        session = AsyncMock()

        mock_user = MagicMock()
        mock_user.scalars.return_value.first.return_value = None
        session.execute = AsyncMock(return_value=mock_user)

        await UserService.delete_user("nonexistent", test_tenant.id, session)

        session.delete.assert_not_called()


class TestGetProfile:

    async def test_returns_user_profile(self, test_tenant, test_user):
        """自分のプロフィールを取得できること"""
        session = AsyncMock()

        mock_user = MagicMock()
        mock_user.scalars.return_value.first.return_value = test_user
        session.execute = AsyncMock(return_value=mock_user)

        result = await UserService.get_profile(test_user.login_id, test_tenant.id, session)

        assert result.loginId == test_user.login_id

    async def test_raises_404_when_user_not_found(self, test_tenant):
        """存在しないユーザーは 404 を返すこと"""
        session = AsyncMock()

        mock_user = MagicMock()
        mock_user.scalars.return_value.first.return_value = None
        session.execute = AsyncMock(return_value=mock_user)

        with pytest.raises(HTTPException) as exc_info:
            await UserService.get_profile("nonexistent", test_tenant.id, session)

        assert exc_info.value.status_code == 404


class TestUpdateProfile:

    async def test_updates_password_and_clears_reset_flag(self, test_tenant, test_user):
        """パスワード変更後 is_required_password_reset が false になること"""
        session = AsyncMock()
        test_user.is_required_password_reset = True

        mock_user = MagicMock()
        mock_user.scalars.return_value.first.return_value = test_user
        session.execute = AsyncMock(return_value=mock_user)
        session.commit = AsyncMock()
        session.refresh = AsyncMock()

        req = UserProfileUpdateRequest(password="NewPassword123!")

        with patch(f"{REPO_PATH}.save", new=AsyncMock()):
            await UserService.update_profile(test_user.login_id, req, test_tenant.id, session)

        assert test_user.is_required_password_reset is False

    async def test_returns_user_without_update_when_password_is_none(self, test_tenant, test_user):
        """password が None の場合ユーザー情報をそのまま返すこと"""
        session = AsyncMock()

        mock_user = MagicMock()
        mock_user.scalars.return_value.first.return_value = test_user
        session.execute = AsyncMock(return_value=mock_user)

        req = UserProfileUpdateRequest(password=None)
        result = await UserService.update_profile(test_user.login_id, req, test_tenant.id, session)

        assert result.loginId == test_user.login_id
        session.commit.assert_not_called()


class TestGenerateInitialPassword:

    def test_meets_policy_length(self, test_tenant):
        """生成パスワードがポリシーの最小長を満たすこと"""
        password = UserService._generate_initial_password(test_tenant)
        assert len(password) >= test_tenant.pw_policy_min_length

    def test_raises_when_no_policy(self):
        """全ポリシーが無効な場合 ValueError を返すこと"""
        tenant = Tenant(
            id="t",
            name="t",
            owner="t",
            pw_policy_use_uppercase=False,
            pw_policy_use_lowercase=False,
            pw_policy_use_digits=False,
            pw_policy_use_symbols=False,
            pw_policy_min_length=8,
        )
        with pytest.raises(ValueError):
            UserService._generate_initial_password(tenant)
