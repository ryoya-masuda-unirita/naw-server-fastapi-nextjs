import pytest
from unittest.mock import AsyncMock, MagicMock
from fastapi import HTTPException
from uuid import uuid4

from app.services.auth_service import AuthService
from app.models.user import User
from app.core.security import hash_password


class TestAuthServiceLogin:
    """ログイン処理テスト（モック使用）"""

    async def test_login_with_valid_credentials(self, test_tenant, test_user_with_password):
        """有効な認証情報でログインできること"""
        session = AsyncMock()
        
        # ユーザー取得のモック
        mock_user_result = MagicMock()
        mock_user_result.scalars.return_value.first.return_value = test_user_with_password["user"]
        
        # パスワード取得のモック
        mock_password_result = MagicMock()
        mock_password_result.scalars.return_value.first.return_value = MagicMock(
            password=test_user_with_password["hashed_password"]
        )
        
        session.execute = AsyncMock(side_effect=[mock_user_result, mock_password_result])

        response = await AuthService.login(
            test_user_with_password["user"].login_id,
            test_user_with_password["plain_password"],
            test_tenant.id,
            session,
        )

        assert response.id == test_user_with_password["user"].login_id
        assert response.loginStatus == "SUCCESS"
        assert response.token is not None

    async def test_login_with_invalid_password(self, test_tenant, test_user_with_password):
        """パスワード不一致でHTTPException 401 を返すこと"""
        session = AsyncMock()
        
        # ユーザー取得のモック
        mock_user_result = MagicMock()
        mock_user_result.scalars.return_value.first.return_value = test_user_with_password["user"]
        
        # パスワード取得のモック
        mock_password_result = MagicMock()
        mock_password_result.scalars.return_value.first.return_value = MagicMock(
            password=test_user_with_password["hashed_password"]
        )
        
        session.execute = AsyncMock(side_effect=[mock_user_result, mock_password_result])

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
        
        # ユーザーなし
        mock_result = MagicMock()
        mock_result.scalars.return_value.first.return_value = None
        session.execute = AsyncMock(return_value=mock_result)

        with pytest.raises(HTTPException) as exc_info:
            await AuthService.login("nonexistent", "password", test_tenant.id, session)

        assert exc_info.value.status_code == 401

    async def test_login_when_password_reset_required(self, test_tenant):
        """is_required_password_reset=true の場合、REQUIRES_PASSWORD_RESET を返すこと"""
        session = AsyncMock()
        
        user = User(
            id=uuid4(),
            tenant_id=test_tenant.id,
            login_id="resetuser",
            name="Reset User",
            is_required_password_reset=True,
        )
        
        # ユーザー取得のモック
        mock_user_result = MagicMock()
        mock_user_result.scalars.return_value.first.return_value = user
        
        # パスワード取得のモック
        mock_password_result = MagicMock()
        mock_password_result.scalars.return_value.first.return_value = MagicMock(
            password=hash_password("TestPassword123!")
        )
        
        session.execute = AsyncMock(side_effect=[mock_user_result, mock_password_result])

        response = await AuthService.login(
            user.login_id, "TestPassword123!", test_tenant.id, session
        )

        assert response.loginStatus == "REQUIRES_PASSWORD_RESET"
        assert response.reason == "INITIAL"
        assert response.token is None


class TestAuthServicePasswordReset:
    """パスワードリセット処理テスト（モック使用）"""

    async def test_reset_password_with_valid_credentials(self, test_tenant, test_user_with_password):
        """有効な認証情報でパスワードリセットできること"""
        session = AsyncMock()
        
        # ユーザー取得のモック
        mock_user_result = MagicMock()
        mock_user_result.scalars.return_value.first.return_value = test_user_with_password["user"]
        
        # パスワード取得のモック
        mock_password_result = MagicMock()
        mock_password_result.scalars.return_value.first.return_value = MagicMock(
            password=test_user_with_password["hashed_password"]
        )
        mock_password_result2 = MagicMock()
        mock_password_result2.scalars.return_value.all.return_value = []
        
        session.execute = AsyncMock(side_effect=[
            mock_user_result, 
            mock_password_result,
            mock_user_result,  # テナント取得
            mock_password_result2  # パスワード履歴
        ])

        response = await AuthService.reset_password(
            test_user_with_password["user"].login_id,
            test_user_with_password["plain_password"],
            "NewPassword123!",
            test_tenant.id,
            session,
        )

        assert response.id == test_user_with_password["user"].login_id
        assert response.loginStatus == "SUCCESS"
        assert response.token is not None

    async def test_reset_password_with_invalid_old_password(self, test_tenant, test_user_with_password):
        """旧パスワード不一致でHTTPException 403 を返すこと"""
        session = AsyncMock()
        
        # ユーザー取得のモック
        mock_user_result = MagicMock()
        mock_user_result.scalars.return_value.first.return_value = test_user_with_password["user"]
        
        # パスワード取得のモック
        mock_password_result = MagicMock()
        mock_password_result.scalars.return_value.first.return_value = MagicMock(
            password=test_user_with_password["hashed_password"]
        )
        
        session.execute = AsyncMock(side_effect=[mock_user_result, mock_password_result])

        with pytest.raises(HTTPException) as exc_info:
            await AuthService.reset_password(
                test_user_with_password["user"].login_id,
                "WrongOldPassword",
                "NewPassword123!",
                test_tenant.id,
                session,
            )

        assert exc_info.value.status_code == 403

    async def test_reset_password_with_nonexistent_user(self, test_tenant):
        """ユーザーが存在しない場合、HTTPException 403 を返すこと"""
        session = AsyncMock()
        
        # ユーザーなし
        mock_result = MagicMock()
        mock_result.scalars.return_value.first.return_value = None
        session.execute = AsyncMock(return_value=mock_result)

        with pytest.raises(HTTPException) as exc_info:
            await AuthService.reset_password(
                "nonexistent", "OldPassword", "NewPassword123!", test_tenant.id, session
            )

        assert exc_info.value.status_code == 403
