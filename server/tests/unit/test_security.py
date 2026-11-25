import pytest
from types import SimpleNamespace
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import HTTPException, Response

from app.core.config import get_settings
from app.core.security import (
    clear_session_cookie,
    create_access_token,
    decode_token,
    hash_password,
    set_session_cookie,
    verify_password,
    verify_password_async,
    ALGORITHM,
)
from app.core.session_store import SESSION_COOKIE_NAME


class TestSecurityUtilities:
    """JWT・パスワードハッシュユーティリティテスト"""

    def test_create_and_decode_token(self) -> None:
        """JWT エンコード・デコード正常"""
        login_id = "testuser"
        tenant_id = "test-tenant"

        token = create_access_token(login_id, tenant_id)
        payload = decode_token(token)

        assert payload["sub"] == login_id
        assert payload["tenantId"] == tenant_id

    def test_decode_expired_token(self) -> None:
        """有効期限切れ JWT デコード"""
        now = datetime.now(timezone.utc)
        payload = {
            "sub": "testuser",
            "tenantId": "test-tenant",
            "exp": int((now - timedelta(hours=1)).timestamp()),
            "iat": int(now.timestamp()),
        }
        token = jwt.encode(payload, get_settings().secret_key, algorithm=ALGORITHM)

        with pytest.raises(Exception):
            decode_token(token)

    def test_decode_invalid_token(self) -> None:
        """不正な JWT デコード"""
        now = datetime.now(timezone.utc)
        payload = {
            "sub": "testuser",
            "tenantId": "test-tenant",
            "exp": int((now + timedelta(hours=5)).timestamp()),
            "iat": int(now.timestamp()),
        }
        token = jwt.encode(payload, "wrong-secret", algorithm=ALGORITHM)

        with pytest.raises(Exception):
            decode_token(token)

    def test_token_contains_correct_payload(self) -> None:
        """JWT ペイロード正確性"""
        login_id = "admin"
        tenant_id = "tenant-123"

        token = create_access_token(login_id, tenant_id)
        payload = decode_token(token)

        assert payload["sub"] == "admin"
        assert payload["tenantId"] == "tenant-123"
        assert "exp" in payload
        assert "iat" in payload

    def test_token_is_signed_with_the_configured_secret_key(self) -> None:
        """JWT が、設定の SECRET_KEY で署名されること（設定の鍵で検証できる）"""
        token = create_access_token("admin", "tenant-123")

        payload = jwt.decode(token, get_settings().secret_key, algorithms=[ALGORITHM])

        assert payload["sub"] == "admin"

    def test_token_signed_with_old_hardcoded_key_is_rejected(self) -> None:
        """以前ソースに直書きしていた鍵で署名した JWT は、受け付けないこと"""
        now = datetime.now(timezone.utc)
        payload = {
            "sub": "attacker",
            "tenantId": "test-tenant",
            "exp": int((now + timedelta(hours=5)).timestamp()),
            "iat": int(now.timestamp()),
        }
        forged = jwt.encode(
            payload, "your-secret-key-change-in-production", algorithm=ALGORITHM
        )

        with pytest.raises(HTTPException) as error:
            decode_token(forged)

        assert error.value.status_code == 401

    def test_changing_secret_key_invalidates_existing_tokens(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """SECRET_KEY を変えると、変える前に作った JWT は、検証に通らなくなること"""
        token = create_access_token("admin", "tenant-123")
        monkeypatch.setattr(
            "app.core.security.get_settings",
            lambda: SimpleNamespace(secret_key="another-secret-key-for-test-purposes"),
        )

        with pytest.raises(HTTPException) as error:
            decode_token(token)

        assert error.value.status_code == 401

    def test_hash_and_verify_correct_password(self) -> None:
        """bcrypt ハッシュ・検証"""
        password = "TestPassword123!"

        hashed = hash_password(password)

        assert verify_password(password, hashed)

    def test_verify_incorrect_password(self) -> None:
        """bcrypt 検証失敗"""
        password = "TestPassword123!"
        hashed = hash_password(password)

        assert not verify_password("WrongPassword", hashed)

    def test_hash_produces_different_hash(self) -> None:
        """bcrypt 毎回異なるハッシュ生成"""
        password = "TestPassword123!"

        hash1 = hash_password(password)
        hash2 = hash_password(password)

        assert hash1 != hash2
        assert verify_password(password, hash1)
        assert verify_password(password, hash2)


class TestVerifyPasswordAsync:
    """パスワード非同期検証テスト"""

    async def test_returns_true_for_correct_password(self) -> None:
        """正しいパスワードでTrueを返すこと"""
        password = "TestPassword123!"
        hashed = hash_password(password)

        assert await verify_password_async(password, hashed) is True

    async def test_returns_false_for_incorrect_password(self) -> None:
        """誤ったパスワードでFalseを返すこと"""
        password = "TestPassword123!"
        hashed = hash_password(password)

        assert await verify_password_async("WrongPassword", hashed) is False


class TestSessionCookie:
    """セッションCookie発行・削除テスト"""

    def test_set_session_cookie_sets_httponly_cookie(self) -> None:
        """Cookieがhttponly・samesite=laxで設定されること"""
        response = Response()

        set_session_cookie(response, "dummy-session-id")

        set_cookie_header = response.headers["set-cookie"]
        assert f"{SESSION_COOKIE_NAME}=dummy-session-id" in set_cookie_header
        assert "HttpOnly" in set_cookie_header
        assert "samesite=lax" in set_cookie_header.lower()

    def test_clear_session_cookie_expires_cookie(self) -> None:
        """Cookie削除時に即時失効するSet-Cookieが設定されること"""
        response = Response()

        clear_session_cookie(response)

        set_cookie_header = response.headers["set-cookie"]
        assert SESSION_COOKIE_NAME in set_cookie_header
        assert "Max-Age=0" in set_cookie_header or "01 Jan 1970" in set_cookie_header
