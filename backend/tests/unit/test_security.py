import pytest
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Response

from app.core.security import (
    ACCESS_TOKEN_COOKIE_NAME,
    clear_access_token_cookie,
    create_access_token,
    decode_token,
    hash_password,
    set_access_token_cookie,
    verify_password,
    verify_password_async,
    SECRET_KEY,
    ALGORITHM,
)


class TestSecurityUtilities:
    """JWT・パスワードハッシュユーティリティテスト"""

    def test_create_and_decode_token(self):
        """JWT エンコード・デコード正常"""
        login_id = "testuser"
        tenant_id = "test-tenant"

        token = create_access_token(login_id, tenant_id)
        payload = decode_token(token)

        assert payload["sub"] == login_id
        assert payload["tenantId"] == tenant_id

    def test_decode_expired_token(self):
        """有効期限切れ JWT デコード"""
        now = datetime.now(timezone.utc)
        payload = {
            "sub": "testuser",
            "tenantId": "test-tenant",
            "exp": int((now - timedelta(hours=1)).timestamp()),
            "iat": int(now.timestamp()),
        }
        token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

        with pytest.raises(Exception):
            decode_token(token)

    def test_decode_invalid_token(self):
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

    def test_token_contains_correct_payload(self):
        """JWT ペイロード正確性"""
        login_id = "admin"
        tenant_id = "tenant-123"

        token = create_access_token(login_id, tenant_id)
        payload = decode_token(token)

        assert payload["sub"] == "admin"
        assert payload["tenantId"] == "tenant-123"
        assert "exp" in payload
        assert "iat" in payload

    def test_hash_and_verify_correct_password(self):
        """bcrypt ハッシュ・検証"""
        password = "TestPassword123!"

        hashed = hash_password(password)

        assert verify_password(password, hashed)

    def test_verify_incorrect_password(self):
        """bcrypt 検証失敗"""
        password = "TestPassword123!"
        hashed = hash_password(password)

        assert not verify_password("WrongPassword", hashed)

    def test_hash_produces_different_hash(self):
        """bcrypt 毎回異なるハッシュ生成"""
        password = "TestPassword123!"

        hash1 = hash_password(password)
        hash2 = hash_password(password)

        assert hash1 != hash2
        assert verify_password(password, hash1)
        assert verify_password(password, hash2)


class TestVerifyPasswordAsync:
    """パスワード非同期検証テスト"""

    async def test_returns_true_for_correct_password(self):
        """正しいパスワードでTrueを返すこと"""
        password = "TestPassword123!"
        hashed = hash_password(password)

        assert await verify_password_async(password, hashed) is True

    async def test_returns_false_for_incorrect_password(self):
        """誤ったパスワードでFalseを返すこと"""
        password = "TestPassword123!"
        hashed = hash_password(password)

        assert await verify_password_async("WrongPassword", hashed) is False


class TestAccessTokenCookie:
    """認証トークンCookie発行・削除テスト"""

    def test_set_access_token_cookie_sets_httponly_cookie(self):
        """Cookieがhttponly・samesite=laxで設定されること"""
        response = Response()

        set_access_token_cookie(response, "dummy-token")

        set_cookie_header = response.headers["set-cookie"]
        assert f"{ACCESS_TOKEN_COOKIE_NAME}=dummy-token" in set_cookie_header
        assert "HttpOnly" in set_cookie_header
        assert "samesite=lax" in set_cookie_header.lower()

    def test_clear_access_token_cookie_expires_cookie(self):
        """Cookie削除時に即時失効するSet-Cookieが設定されること"""
        response = Response()

        clear_access_token_cookie(response)

        set_cookie_header = response.headers["set-cookie"]
        assert ACCESS_TOKEN_COOKIE_NAME in set_cookie_header
        assert "Max-Age=0" in set_cookie_header or "01 Jan 1970" in set_cookie_header
