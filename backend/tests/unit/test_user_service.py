import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy.dialects import postgresql

from app.core.security import hash_password
from app.core.sort import parse_sort
from app.services.user_service import UserService
from app.models.user import User, UserRole
from app.models.tenant import Tenant
from app.schemas.user import (
    UserCreateRequest,
    UserUpdateRequest,
    UserProfileUpdateRequest,
)

REPO_PATH = "app.services.user_service.PasswordHistoryRepository"


@pytest.fixture
def admin_user(test_tenant):
    """テスト用管理者ユーザー（DB なし）"""
    return User(
        id=uuid4(),
        tenant_id=test_tenant.id,
        login_id="admin",
        name="Admin User",
        role=UserRole.ADMIN,
        is_required_password_reset=False,
    )


class TestGetUsers:
    """UserService.get_users のテスト"""

    async def test_returns_paged_users(self, test_tenant, test_user):
        """テナント内ユーザーを返すこと"""
        session = AsyncMock()

        mock_count = MagicMock()
        mock_count.scalar.return_value = 1
        mock_users = MagicMock()
        mock_users.scalars.return_value.all.return_value = [test_user]
        session.execute = AsyncMock(side_effect=[mock_count, mock_users])

        result = await UserService.get_users(
            test_tenant.id,
            0,
            20,
            parse_sort("created_at,desc"),
            None,
            None,
            None,
            session,
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
            test_tenant.id,
            0,
            20,
            parse_sort("created_at,desc"),
            "test",
            None,
            None,
            session,
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
            test_tenant.id,
            0,
            20,
            parse_sort("created_at,desc"),
            None,
            "USER",
            None,
            session,
        )

        assert result.totalElements == 1


class TestCreateUser:
    """UserService.create_user のテスト"""

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
        assert result.loginKey is None
        assert result.hasLoginKey is False

    async def test_returns_login_key_set_in_request(self, test_tenant):
        """作成で設定したログインキーを loginKey と hasLoginKey で返すこと"""
        session = AsyncMock()

        mock_dup = MagicMock()
        mock_dup.scalars.return_value.first.return_value = None
        mock_tenant = MagicMock()
        mock_tenant.scalars.return_value.first.return_value = test_tenant
        session.execute = AsyncMock(side_effect=[mock_dup, mock_tenant])
        session.flush = AsyncMock()
        session.commit = AsyncMock()
        session.refresh = AsyncMock()

        req = UserCreateRequest(
            loginId="keyuser", name="Key User", role=UserRole.USER, loginKey="new-key"
        )

        with patch(f"{REPO_PATH}.save", new=AsyncMock()):
            result = await UserService.create_user(req, test_tenant.id, session)

        assert result.loginKey == "new-key"
        assert result.hasLoginKey is True

    async def test_raises_400_on_duplicate_login_id(self, test_tenant, test_user):
        """同一 loginId が存在する場合 400 を返すこと"""
        session = AsyncMock()

        mock_dup = MagicMock()
        mock_dup.scalars.return_value.first.return_value = test_user
        session.execute = AsyncMock(return_value=mock_dup)

        req = UserCreateRequest(
            loginId=test_user.login_id, name="Dup", role=UserRole.USER
        )

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
    """UserService.update_user のテスト"""

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

    async def test_does_not_return_stored_login_key(self, test_tenant, test_user):
        """ログインキーを設定しない更新では保存済みのキーを返さず hasLoginKey だけ返すこと"""
        test_user.login_key = "stored-key"
        session = AsyncMock()

        mock_user = MagicMock()
        mock_user.scalars.return_value.first.return_value = test_user
        session.execute = AsyncMock(return_value=mock_user)
        session.commit = AsyncMock()
        session.refresh = AsyncMock()

        result = await UserService.update_user(
            test_user.login_id, UserUpdateRequest(name="N"), test_tenant.id, session
        )

        assert result.loginKey is None
        assert result.hasLoginKey is True

    async def test_returns_login_key_set_in_request(self, test_tenant, test_user):
        """更新で設定したログインキーを loginKey で返すこと"""
        session = AsyncMock()

        mock_user = MagicMock()
        mock_user.scalars.return_value.first.return_value = test_user
        session.execute = AsyncMock(return_value=mock_user)
        session.commit = AsyncMock()
        session.refresh = AsyncMock()

        result = await UserService.update_user(
            test_user.login_id,
            UserUpdateRequest(loginKey="changed-key"),
            test_tenant.id,
            session,
        )

        assert test_user.login_key == "changed-key"
        assert result.loginKey == "changed-key"
        assert result.hasLoginKey is True

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
            result = await UserService.update_user(
                test_user.login_id, req, test_tenant.id, session
            )

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
            await UserService.update_user(
                "nonexistent", UserUpdateRequest(), test_tenant.id, session
            )

        assert exc_info.value.status_code == 404


class TestDeleteUser:
    """UserService.delete_user のテスト"""

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
    """UserService.get_profile のテスト"""

    async def test_returns_user_profile(self, test_tenant, test_user):
        """自分のプロフィールを取得できること"""
        session = AsyncMock()

        mock_user = MagicMock()
        mock_user.scalars.return_value.first.return_value = test_user
        session.execute = AsyncMock(return_value=mock_user)

        result = await UserService.get_profile(
            test_user.login_id, test_tenant.id, session
        )

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
    """UserService.update_profile のテスト"""

    async def test_updates_password_and_clears_reset_flag(self, test_tenant, test_user):
        """パスワード変更後 is_required_password_reset が false になること"""
        session = AsyncMock()
        test_user.is_required_password_reset = True

        mock_user = MagicMock()
        mock_user.scalars.return_value.first.return_value = test_user
        mock_tenant = MagicMock()
        mock_tenant.scalars.return_value.first.return_value = test_tenant
        session.execute = AsyncMock(side_effect=[mock_user, mock_tenant])
        session.commit = AsyncMock()
        session.refresh = AsyncMock()

        req = UserProfileUpdateRequest(password="NewPassword123!")

        with (
            patch(f"{REPO_PATH}.save", new=AsyncMock()),
            patch(
                "app.core.password_policy.PasswordHistoryRepository.get_recent_hashes",
                new=AsyncMock(return_value=[]),
            ),
        ):
            await UserService.update_profile(
                test_user.login_id, req, test_tenant.id, session
            )

        assert test_user.is_required_password_reset is False

    async def test_returns_user_without_update_when_password_is_none(
        self, test_tenant, test_user
    ):
        """password が None の場合ユーザー情報をそのまま返すこと"""
        session = AsyncMock()

        mock_user = MagicMock()
        mock_user.scalars.return_value.first.return_value = test_user
        session.execute = AsyncMock(return_value=mock_user)

        req = UserProfileUpdateRequest(password=None)
        result = await UserService.update_profile(
            test_user.login_id, req, test_tenant.id, session
        )

        assert result.loginId == test_user.login_id
        session.commit.assert_not_called()

    async def test_raises_400_when_password_too_short(self, test_tenant, test_user):
        """最小長未満のパスワードは HTTPException 400 を返すこと"""
        session = AsyncMock()

        mock_user = MagicMock()
        mock_user.scalars.return_value.first.return_value = test_user
        mock_tenant = MagicMock()
        mock_tenant.scalars.return_value.first.return_value = test_tenant
        session.execute = AsyncMock(side_effect=[mock_user, mock_tenant])

        req = UserProfileUpdateRequest(password="short")

        with pytest.raises(HTTPException) as exc_info:
            await UserService.update_profile(
                test_user.login_id, req, test_tenant.id, session
            )

        assert exc_info.value.status_code == 400

    async def test_raises_400_when_password_reused(self, test_tenant, test_user):
        """過去パスワードを再利用した場合 HTTPException 400 を返すこと"""
        session = AsyncMock()

        mock_user = MagicMock()
        mock_user.scalars.return_value.first.return_value = test_user
        mock_tenant = MagicMock()
        mock_tenant.scalars.return_value.first.return_value = test_tenant
        session.execute = AsyncMock(side_effect=[mock_user, mock_tenant])

        req = UserProfileUpdateRequest(password="ReusedPassword123!")

        with patch(
            "app.core.password_policy.PasswordHistoryRepository.get_recent_hashes",
            new=AsyncMock(return_value=[hash_password("ReusedPassword123!")]),
        ):
            with pytest.raises(HTTPException) as exc_info:
                await UserService.update_profile(
                    test_user.login_id, req, test_tenant.id, session
                )

        assert exc_info.value.status_code == 400


class TestGenerateInitialPassword:
    """初期パスワード生成のテスト"""

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


class TestEscapeLikePattern:
    """LIKE パターンのエスケープのテスト"""

    def test_escapes_percent(self):
        """%をエスケープすること"""
        result = UserService._escape_like_pattern("100%")
        assert result == "%100\\%%"

    def test_escapes_underscore(self):
        """_をエスケープすること"""
        result = UserService._escape_like_pattern("a_b")
        assert result == "%a\\_b%"

    def test_escapes_backslash(self):
        """\\を二重にエスケープすること（バックスラッシュを最初に処理し二重エスケープを防ぐ）"""
        result = UserService._escape_like_pattern("a\\b")
        assert result == "%a\\\\b%"


class TestSortableColumns:
    """並べ替えできる列の解決のテスト"""

    def test_resolves_snake_case(self):
        """スネークケースの許可列名を解決できること"""
        assert UserService._SORTABLE_COLUMNS["created_at"] is User.created_at

    def test_resolves_camel_case(self):
        """キャメルケースの許可列名（フロントエンドが実際に送信する形式）を解決できること"""
        assert UserService._SORTABLE_COLUMNS["updatedAt"] is User.updated_at

    def test_role_sort_column_is_cast_to_string_on_postgresql(self):
        """権限順ソートがPostgreSQL上でenumの宣言順ではなく文字列順になるようキャストされること"""
        col = UserService._SORTABLE_COLUMNS["role"]

        sql = str(col.compile(dialect=postgresql.dialect()))

        assert sql == "CAST(users.role AS VARCHAR)"


class TestParseRole:
    """ロール文字列の解釈のテスト"""

    @pytest.mark.parametrize("role", ["USER", "ADMIN", "SYSTEM"])
    def test_returns_user_role_for_valid_value(self, role):
        """定義済みの権限名はUserRoleに変換されること"""
        assert UserService._parse_role(role) is UserRole(role)

    @pytest.mark.parametrize("role", [None, "", "   "])
    def test_returns_none_when_blank(self, role):
        """未指定・空文字・空白のみは絞り込みなし（None）になること（移植元と同じ）"""
        assert UserService._parse_role(role) is None

    @pytest.mark.parametrize("role", ["foo", "admin"])
    def test_raises_400_for_unknown_value(self, role):
        """未定義の値・小文字の権限名は400になること（移植元のvalueOfと同じく大文字小文字を区別）"""
        with pytest.raises(HTTPException) as exc_info:
            UserService._parse_role(role)

        assert exc_info.value.status_code == 400
        assert exc_info.value.detail == f"不正なroleです: {role}"


class TestIssueInitialPassword:
    """初期パスワード発行のテスト"""

    async def test_generates_password_and_saves_history(self, test_tenant, test_user):
        """初期パスワードを生成し、パスワード履歴が1回保存されること"""
        session = AsyncMock()

        with patch(f"{REPO_PATH}.save", new=AsyncMock()) as mock_save:
            plain_password, expired_at = await UserService._issue_initial_password(
                test_user, test_tenant, session
            )

        assert len(plain_password) >= test_tenant.pw_policy_min_length
        assert expired_at is not None
        mock_save.assert_called_once()
