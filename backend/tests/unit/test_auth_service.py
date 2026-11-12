import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import HTTPException
from uuid import uuid4

from app.core import password_mismatch_store
from app.core.config import get_password_reset_settings
from app.services.auth_service import (
    INVALID_CREDENTIALS_MESSAGE,
    PASSWORD_RESET_LOCKED_MESSAGE,
    AuthService,
)
from app.models.user import User, UserRole
from app.core.security import hash_password

REPO_PATH = "app.services.auth_service.PasswordHistoryRepository"

# サービスと同じ設定から取り、.env で上限を変えてもテストが実装とずれないようにする
MAX_FAILURE_ATTEMPTS = get_password_reset_settings().max_failure_attempts
LOCKOUT_MINUTES = get_password_reset_settings().lockout_minutes


def _mismatch_key(user: User) -> str:
    return f"password_mismatch:{user.tenant_id}:{user.id}"


async def _record_failures(user: User, count: int, redis_client) -> None:
    """事前に失敗を count 回記録する。"""
    for _ in range(count):
        await password_mismatch_store.record_failure_and_check_lockout(
            user.id, user.tenant_id, MAX_FAILURE_ATTEMPTS, LOCKOUT_MINUTES, redis_client
        )


def _session_returning_user(user: User) -> AsyncMock:
    """ユーザー検索で user を返すモックの DB セッションを作る。"""
    session = AsyncMock()
    mock_user_result = MagicMock()
    mock_user_result.scalars.return_value.first.return_value = user
    session.execute = AsyncMock(return_value=mock_user_result)
    return session


class TestAuthServiceLogin:
    """ログイン処理テスト（モック使用）"""

    async def test_login_with_valid_credentials(
        self, test_tenant, test_user_with_password
    ):
        """有効な認証情報でログインできること"""
        session = AsyncMock()
        mock_user_result = MagicMock()
        mock_user_result.scalars.return_value.first.return_value = (
            test_user_with_password["user"]
        )
        session.execute = AsyncMock(return_value=mock_user_result)

        with patch(
            f"{REPO_PATH}.get_latest",
            new=AsyncMock(
                return_value=MagicMock(
                    password=test_user_with_password["hashed_password"],
                    expired_at=None,
                )
            ),
        ):
            response = await AuthService.login(
                test_user_with_password["user"].login_id,
                test_user_with_password["plain_password"],
                test_tenant.id,
                session,
            )

        assert response.id == test_user_with_password["user"].login_id
        assert response.loginStatus == "SUCCESS"
        assert response.token is not None

    async def test_login_with_invalid_password(
        self, test_tenant, test_user_with_password
    ):
        """パスワード不一致でHTTPException 401 を返すこと"""
        session = AsyncMock()
        mock_user_result = MagicMock()
        mock_user_result.scalars.return_value.first.return_value = (
            test_user_with_password["user"]
        )
        session.execute = AsyncMock(return_value=mock_user_result)

        with patch(
            f"{REPO_PATH}.get_latest",
            new=AsyncMock(
                return_value=MagicMock(
                    password=test_user_with_password["hashed_password"]
                )
            ),
        ):
            with pytest.raises(HTTPException) as exc_info:
                await AuthService.login(
                    test_user_with_password["user"].login_id,
                    "WrongPassword",
                    test_tenant.id,
                    session,
                )

        assert exc_info.value.status_code == 401

    async def test_login_with_nonexistent_user(self, test_tenant):
        """ユーザーが存在しない場合、HTTPException 401 を返すこと"""
        session = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalars.return_value.first.return_value = None
        session.execute = AsyncMock(return_value=mock_result)

        with pytest.raises(HTTPException) as exc_info:
            await AuthService.login("nonexistent", "password", test_tenant.id, session)

        assert exc_info.value.status_code == 401

    async def test_login_with_no_password_history(self, test_tenant, test_user):
        """パスワード履歴が0件の場合、HTTPException 401 を返すこと"""
        session = AsyncMock()
        mock_user_result = MagicMock()
        mock_user_result.scalars.return_value.first.return_value = test_user
        session.execute = AsyncMock(return_value=mock_user_result)

        with patch(f"{REPO_PATH}.get_latest", new=AsyncMock(return_value=None)):
            with pytest.raises(HTTPException) as exc_info:
                await AuthService.login(
                    test_user.login_id, "AnyPassword123!", test_tenant.id, session
                )

        assert exc_info.value.status_code == 401

    def _build_login_session(
        self,
        test_tenant,
        login_id: str,
        is_required_password_reset: bool,
        expired_at: datetime | None,
    ):
        """パスワードリセット系のログインテストで共通のsession/user/get_latestパッチを組み立てる。"""
        session = AsyncMock()
        user = User(
            id=uuid4(),
            tenant_id=test_tenant.id,
            login_id=login_id,
            name=login_id,
            role=UserRole.USER,
            is_required_password_reset=is_required_password_reset,
        )
        mock_user_result = MagicMock()
        mock_user_result.scalars.return_value.first.return_value = user
        session.execute = AsyncMock(return_value=mock_user_result)
        get_latest_patch = patch(
            f"{REPO_PATH}.get_latest",
            new=AsyncMock(
                return_value=MagicMock(
                    password=hash_password("TestPassword123!"), expired_at=expired_at
                )
            ),
        )
        return session, user, get_latest_patch

    async def test_login_when_password_reset_required(self, test_tenant):
        """is_required_password_reset=true の場合、REQUIRES_PASSWORD_RESET を返すこと"""
        session, user, get_latest_patch = self._build_login_session(
            test_tenant, "resetuser", is_required_password_reset=True, expired_at=None
        )

        with get_latest_patch:
            response = await AuthService.login(
                user.login_id, "TestPassword123!", test_tenant.id, session
            )

        assert response.loginStatus == "REQUIRES_PASSWORD_RESET"
        assert response.reason == "INITIAL"
        assert response.token is None

    async def test_login_when_password_expired(self, test_tenant):
        """パスワード有効期限切れの場合、reason=EXPIREDでREQUIRES_PASSWORD_RESETを返すこと"""
        expired_at = datetime.now(timezone.utc) - timedelta(days=1)
        session, user, get_latest_patch = self._build_login_session(
            test_tenant,
            "expireduser",
            is_required_password_reset=False,
            expired_at=expired_at,
        )

        with get_latest_patch:
            response = await AuthService.login(
                user.login_id, "TestPassword123!", test_tenant.id, session
            )

        assert response.loginStatus == "REQUIRES_PASSWORD_RESET"
        assert response.reason == "EXPIRED"
        assert response.token is None

    async def test_login_when_expired_and_reset_required_returns_expired(
        self, test_tenant
    ):
        """有効期限切れと初回ログインが両方該当する場合、EXPIREDが優先されること"""
        expired_at = datetime.now(timezone.utc) - timedelta(days=1)
        session, user, get_latest_patch = self._build_login_session(
            test_tenant,
            "bothuser",
            is_required_password_reset=True,
            expired_at=expired_at,
        )

        with get_latest_patch:
            response = await AuthService.login(
                user.login_id, "TestPassword123!", test_tenant.id, session
            )

        assert response.reason == "EXPIRED"


class TestAuthServiceLoginWithLoginKey:
    """ログインキー認証処理テスト（モック使用）"""

    REPO_USER_PATH = "app.services.auth_service.UserRepository"

    async def test_login_with_valid_login_key(self, test_tenant, test_user):
        """有効なログインキーで認証に成功しトークンが発行されること"""
        with patch(
            f"{self.REPO_USER_PATH}.find_by_login_key",
            new=AsyncMock(return_value=test_user),
        ):
            response = await AuthService.login_with_login_key(
                "any-login-key", test_tenant.id, AsyncMock()
            )

        assert response.id == test_user.login_id
        assert response.loginStatus == "SUCCESS"
        assert response.token is not None

    async def test_login_with_nonexistent_login_key(self, test_tenant):
        """存在しないログインキーの場合、HTTPException 401 を返すこと"""
        with patch(
            f"{self.REPO_USER_PATH}.find_by_login_key",
            new=AsyncMock(return_value=None),
        ):
            with pytest.raises(HTTPException) as exc_info:
                await AuthService.login_with_login_key(
                    "nonexistent-key", test_tenant.id, AsyncMock()
                )

        assert exc_info.value.status_code == 401

    async def test_login_with_login_key_of_different_tenant(self, test_tenant):
        """別テナントのログインキーの場合、存在しない場合と同じ401を返すこと"""
        # find_by_login_key はテナントIDも条件に含むため、別テナントのキーはNoneを返す
        with patch(
            f"{self.REPO_USER_PATH}.find_by_login_key",
            new=AsyncMock(return_value=None),
        ):
            with pytest.raises(HTTPException) as exc_info:
                await AuthService.login_with_login_key(
                    "other-tenant-key", test_tenant.id, AsyncMock()
                )

        assert exc_info.value.status_code == 401


class TestAuthServicePasswordReset:
    """パスワードリセット処理テスト（モック使用）"""

    async def test_reset_password_with_invalid_old_password(
        self, test_tenant, test_user_with_password, fake_redis
    ):
        """旧パスワード不一致でHTTPException 403 を返すこと"""
        session = AsyncMock()
        mock_user_result = MagicMock()
        mock_user_result.scalars.return_value.first.return_value = (
            test_user_with_password["user"]
        )
        session.execute = AsyncMock(return_value=mock_user_result)

        with patch(
            f"{REPO_PATH}.get_latest",
            new=AsyncMock(
                return_value=MagicMock(
                    password=test_user_with_password["hashed_password"]
                )
            ),
        ):
            with pytest.raises(HTTPException) as exc_info:
                await AuthService.reset_password(
                    test_user_with_password["user"].login_id,
                    "WrongOldPassword",
                    "NewPassword123!",
                    test_tenant.id,
                    session,
                    fake_redis,
                )

        assert exc_info.value.status_code == 403
        assert exc_info.value.detail == INVALID_CREDENTIALS_MESSAGE
        assert (
            await fake_redis.zcard(_mismatch_key(test_user_with_password["user"])) == 1
        )

    async def test_reset_password_with_nonexistent_user(self, test_tenant, fake_redis):
        """ユーザーが存在しない場合、HTTPException 403 を返すこと"""
        session = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalars.return_value.first.return_value = None
        session.execute = AsyncMock(return_value=mock_result)

        with pytest.raises(HTTPException) as exc_info:
            await AuthService.reset_password(
                "nonexistent",
                "OldPassword",
                "NewPassword123!",
                test_tenant.id,
                session,
                fake_redis,
            )

        assert exc_info.value.status_code == 403
        assert exc_info.value.detail == INVALID_CREDENTIALS_MESSAGE
        # 移植元どおり、存在しないユーザーの失敗は記録しない
        assert await fake_redis.keys("password_mismatch:*") == []

    async def test_reset_password_without_password_history(
        self, test_tenant, test_user_with_password, fake_redis
    ):
        """パスワード履歴がない場合、失敗を記録せず HTTPException 403 を返すこと"""
        session = _session_returning_user(test_user_with_password["user"])

        with patch(f"{REPO_PATH}.get_latest", new=AsyncMock(return_value=None)):
            with pytest.raises(HTTPException) as exc_info:
                await AuthService.reset_password(
                    test_user_with_password["user"].login_id,
                    "AnyPassword1!",
                    "NewPassword123!",
                    test_tenant.id,
                    session,
                    fake_redis,
                )

        assert exc_info.value.status_code == 403
        assert exc_info.value.detail == INVALID_CREDENTIALS_MESSAGE
        assert await fake_redis.keys("password_mismatch:*") == []

    async def test_reset_password_when_locked_out(
        self, test_tenant, test_user_with_password, fake_redis
    ):
        """ロック中は旧パスワードが正しくても HTTPException 429 を返すこと"""
        user = test_user_with_password["user"]
        await _record_failures(user, MAX_FAILURE_ATTEMPTS, fake_redis)
        session = _session_returning_user(user)

        with patch(
            f"{REPO_PATH}.get_latest",
            new=AsyncMock(
                return_value=MagicMock(
                    password=test_user_with_password["hashed_password"]
                )
            ),
        ):
            with pytest.raises(HTTPException) as exc_info:
                await AuthService.reset_password(
                    user.login_id,
                    test_user_with_password["plain_password"],
                    "NewPassword123!",
                    test_tenant.id,
                    session,
                    fake_redis,
                )

        assert exc_info.value.status_code == 429
        assert exc_info.value.detail == PASSWORD_RESET_LOCKED_MESSAGE

    async def test_reset_password_locks_on_max_failed_attempt(
        self, test_tenant, test_user_with_password, fake_redis
    ):
        """旧パスワード誤りで失敗が上限に達したら HTTPException 429 を返すこと"""
        user = test_user_with_password["user"]
        await _record_failures(user, MAX_FAILURE_ATTEMPTS - 1, fake_redis)
        session = _session_returning_user(user)

        with patch(
            f"{REPO_PATH}.get_latest",
            new=AsyncMock(
                return_value=MagicMock(
                    password=test_user_with_password["hashed_password"]
                )
            ),
        ):
            with pytest.raises(HTTPException) as exc_info:
                await AuthService.reset_password(
                    user.login_id,
                    "WrongOldPassword",
                    "NewPassword123!",
                    test_tenant.id,
                    session,
                    fake_redis,
                )

        assert exc_info.value.status_code == 429
        assert exc_info.value.detail == PASSWORD_RESET_LOCKED_MESSAGE

    async def test_reset_password_when_too_short(
        self, test_tenant, test_user_with_password, fake_redis
    ):
        """最小長未満の新パスワードはHTTPException 400 を返すこと"""
        session = AsyncMock()
        mock_user_result = MagicMock()
        mock_user_result.scalars.return_value.first.return_value = (
            test_user_with_password["user"]
        )
        mock_tenant_result = MagicMock()
        mock_tenant_result.scalars.return_value.first.return_value = test_tenant
        session.execute = AsyncMock(side_effect=[mock_user_result, mock_tenant_result])

        with patch(
            f"{REPO_PATH}.get_latest",
            new=AsyncMock(
                return_value=MagicMock(
                    password=test_user_with_password["hashed_password"]
                )
            ),
        ):
            with pytest.raises(HTTPException) as exc_info:
                await AuthService.reset_password(
                    test_user_with_password["user"].login_id,
                    test_user_with_password["plain_password"],
                    "short",
                    test_tenant.id,
                    session,
                    fake_redis,
                )

        assert exc_info.value.status_code == 400

    async def test_reset_password_when_new_password_reused(
        self, test_tenant, test_user_with_password, fake_redis
    ):
        """過去パスワードを再利用した場合、HTTPException 400 を返すこと"""
        session = AsyncMock()
        mock_user_result = MagicMock()
        mock_user_result.scalars.return_value.first.return_value = (
            test_user_with_password["user"]
        )
        mock_tenant_result = MagicMock()
        mock_tenant_result.scalars.return_value.first.return_value = test_tenant
        session.execute = AsyncMock(side_effect=[mock_user_result, mock_tenant_result])

        with (
            patch(
                f"{REPO_PATH}.get_latest",
                new=AsyncMock(
                    return_value=MagicMock(
                        password=test_user_with_password["hashed_password"]
                    )
                ),
            ),
            patch(
                f"{REPO_PATH}.get_recent_hashes",
                new=AsyncMock(
                    return_value=[test_user_with_password["hashed_password"]]
                ),
            ),
        ):
            with pytest.raises(HTTPException) as exc_info:
                await AuthService.reset_password(
                    test_user_with_password["user"].login_id,
                    test_user_with_password["plain_password"],
                    test_user_with_password["plain_password"],
                    test_tenant.id,
                    session,
                    fake_redis,
                )

        assert exc_info.value.status_code == 400
        assert (
            exc_info.value.detail
            == "新パスワードは過去のパスワードと異なるものを設定してください。"
        )

    async def test_reset_password_calls_save(
        self, test_tenant, test_user_with_password, fake_redis
    ):
        """パスワードリセット成功時に新パスワードの履歴が保存されること"""
        session = AsyncMock()
        mock_user_result = MagicMock()
        mock_user_result.scalars.return_value.first.return_value = (
            test_user_with_password["user"]
        )
        mock_tenant_result = MagicMock()
        mock_tenant_result.scalars.return_value.first.return_value = test_tenant
        session.execute = AsyncMock(side_effect=[mock_user_result, mock_tenant_result])

        with (
            patch(
                f"{REPO_PATH}.get_latest",
                new=AsyncMock(
                    return_value=MagicMock(
                        password=test_user_with_password["hashed_password"]
                    )
                ),
            ),
            patch(f"{REPO_PATH}.get_recent_hashes", new=AsyncMock(return_value=[])),
            patch(f"{REPO_PATH}.save", new=AsyncMock()) as mock_save,
        ):
            await AuthService.reset_password(
                test_user_with_password["user"].login_id,
                test_user_with_password["plain_password"],
                "NewPassword123!",
                test_tenant.id,
                session,
                fake_redis,
            )

        mock_save.assert_called_once()
        args, kwargs = mock_save.call_args
        assert args[0] == test_user_with_password["user"].id
        assert kwargs.get("expired_at") is not None

    async def test_reset_password_clears_failures_on_success(
        self, test_tenant, test_user_with_password, fake_redis
    ):
        """パスワードリセット成功時に失敗記録が削除されること"""
        user = test_user_with_password["user"]
        await _record_failures(user, MAX_FAILURE_ATTEMPTS - 1, fake_redis)
        session = AsyncMock()
        mock_user_result = MagicMock()
        mock_user_result.scalars.return_value.first.return_value = user
        mock_tenant_result = MagicMock()
        mock_tenant_result.scalars.return_value.first.return_value = test_tenant
        session.execute = AsyncMock(side_effect=[mock_user_result, mock_tenant_result])

        with (
            patch(
                f"{REPO_PATH}.get_latest",
                new=AsyncMock(
                    return_value=MagicMock(
                        password=test_user_with_password["hashed_password"]
                    )
                ),
            ),
            patch(f"{REPO_PATH}.get_recent_hashes", new=AsyncMock(return_value=[])),
            patch(f"{REPO_PATH}.save", new=AsyncMock()),
        ):
            await AuthService.reset_password(
                user.login_id,
                test_user_with_password["plain_password"],
                "NewPassword123!",
                test_tenant.id,
                session,
                fake_redis,
            )

        assert await fake_redis.exists(_mismatch_key(user)) == 0
