import pytest
from unittest.mock import AsyncMock, MagicMock
from fastapi import HTTPException
from uuid import uuid4

from app.services.password_service import PasswordService
from app.core.security import hash_password, verify_password
from app.models.password_history import PasswordHistory


class TestPasswordService:
    """パスワードサービステスト（モック使用）"""

    async def test_get_current_password_hash_when_exists(self, test_user_with_password):
        """最新のパスワードハッシュを取得できること"""
        session = AsyncMock()
        password_history = PasswordHistory(
            tenant_id="test-tenant",
            user_id=test_user_with_password["user"].id,
            password=test_user_with_password["hashed_password"],
        )
        
        # モックセッション設定
        mock_result = MagicMock()
        mock_result.scalars.return_value.first.return_value = password_history
        session.execute = AsyncMock(return_value=mock_result)

        hash_result = await PasswordService.get_current_password_hash(
            test_user_with_password["user"].id, session
        )
        assert hash_result == test_user_with_password["hashed_password"]

    async def test_get_current_password_hash_when_not_exists(self, test_user):
        """パスワード履歴がない場合、HTTPException 403 を返すこと"""
        session = AsyncMock()
        
        # パスワード履歴なし
        mock_result = MagicMock()
        mock_result.scalars.return_value.first.return_value = None
        session.execute = AsyncMock(return_value=mock_result)

        with pytest.raises(HTTPException) as exc_info:
            await PasswordService.get_current_password_hash(test_user.id, session)

        assert exc_info.value.status_code == 403

    async def test_verify_password_strength_when_valid(self, test_tenant):
        """8文字以上のパスワードは検証が通ること"""
        session = AsyncMock()
        
        # テナント取得のモック
        mock_result = MagicMock()
        mock_result.scalars.return_value.first.return_value = test_tenant
        session.execute = AsyncMock(return_value=mock_result)

        result = await PasswordService.verify_password_strength(
            "ValidPassword123", test_tenant.id, session
        )
        assert result is True

    async def test_verify_password_strength_when_too_short(self, test_tenant):
        """8文字未満のパスワードはHTTPException 400 を返すこと"""
        session = AsyncMock()
        
        # テナント取得のモック
        mock_result = MagicMock()
        mock_result.scalars.return_value.first.return_value = test_tenant
        session.execute = AsyncMock(return_value=mock_result)

        with pytest.raises(HTTPException) as exc_info:
            await PasswordService.verify_password_strength("short", test_tenant.id, session)

        assert exc_info.value.status_code == 400

    async def test_verify_password_strength_when_tenant_not_found(self):
        """テナントが存在しない場合、HTTPException 400 を返すこと"""
        session = AsyncMock()
        
        # テナント取得なし
        mock_result = MagicMock()
        mock_result.scalars.return_value.first.return_value = None
        session.execute = AsyncMock(return_value=mock_result)

        with pytest.raises(HTTPException) as exc_info:
            await PasswordService.verify_password_strength(
                "ValidPassword123", "nonexistent-tenant", session
            )

        assert exc_info.value.status_code == 400

    async def test_check_password_history_when_not_duplicate(self, test_tenant, test_user):
        """過去パスワードを使用していない場合、検証が通ること"""
        session = AsyncMock()
        
        # テナント取得のモック
        mock_tenant_result = MagicMock()
        mock_tenant_result.scalars.return_value.first.return_value = test_tenant
        
        # パスワード履歴取得のモック（1つの過去パスワード）
        mock_history_result = MagicMock()
        mock_history_result.scalars.return_value.all.return_value = [
            hash_password("OldPassword123")
        ]
        
        # 複数回の execute 呼び出しに対応
        session.execute = AsyncMock(side_effect=[mock_tenant_result, mock_history_result])

        result = await PasswordService.check_password_history(
            test_user.id, "NewPassword123", test_tenant.id, session
        )
        assert result is True

    async def test_check_password_history_when_duplicate(self, test_tenant, test_user_with_password):
        """過去パスワードを再利用した場合、HTTPException 400 を返すこと"""
        session = AsyncMock()
        
        # テナント取得のモック
        mock_tenant_result = MagicMock()
        mock_tenant_result.scalars.return_value.first.return_value = test_tenant
        
        # パスワード履歴取得のモック（同じパスワードハッシュ）
        mock_history_result = MagicMock()
        mock_history_result.scalars.return_value.all.return_value = [
            test_user_with_password["hashed_password"]
        ]
        
        session.execute = AsyncMock(side_effect=[mock_tenant_result, mock_history_result])

        with pytest.raises(HTTPException) as exc_info:
            await PasswordService.check_password_history(
                test_user_with_password["user"].id,
                test_user_with_password["plain_password"],
                test_tenant.id,
                session,
            )

        assert exc_info.value.status_code == 400

    async def test_reset_password_creates_new_history(self, test_tenant, test_user):
        """新しいパスワードが password_histories に追加されること"""
        session = AsyncMock()
        
        new_password = "NewPassword123"
        await PasswordService.reset_password(
            test_user.id, new_password, test_tenant.id, session
        )

        # session.add と session.flush が呼ばれたことを確認
        session.add.assert_called()
        session.flush.assert_called()
