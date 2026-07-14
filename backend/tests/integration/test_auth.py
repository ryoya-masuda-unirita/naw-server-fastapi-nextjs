import json

import pytest

from app.core.session_store import SESSION_COOKIE_NAME


@pytest.mark.asyncio
class TestAuthAPI:
    """認証 API エンドポイントテスト"""

    async def test_post_auth_login_success(
        self, client, test_tenant, test_user_with_password
    ):
        """POST /auth/login 成功ケース"""
        async with client as c:
            response = await c.post(
                "/auth/login",
                json={
                    "username": test_user_with_password["user"].login_id,
                    "password": test_user_with_password["plain_password"],
                },
                headers={"X-Tenant-ID": test_tenant.id},
            )

        assert response.status_code == 200
        assert response.json()["loginStatus"] == "SUCCESS"
        assert response.json()["token"] is not None

    async def test_post_auth_login_missing_header(
        self, client, test_user_with_password
    ):
        """POST /auth/login X-Tenant-ID ヘッダーなし"""
        async with client as c:
            response = await c.post(
                "/auth/login",
                json={
                    "username": test_user_with_password["user"].login_id,
                    "password": test_user_with_password["plain_password"],
                },
            )

        assert response.status_code == 422

    async def test_post_auth_login_key_success(
        self, client, test_tenant, test_user_with_login_key
    ):
        """POST /auth/login-key 成功ケース"""
        async with client as c:
            response = await c.post(
                "/auth/login-key",
                json={"loginKey": test_user_with_login_key.login_key},
                headers={"X-Tenant-ID": test_tenant.id},
            )

        assert response.status_code == 200
        assert response.json()["loginStatus"] == "SUCCESS"
        assert response.json()["id"] == test_user_with_login_key.login_id
        assert response.json()["token"] is not None

    async def test_post_auth_login_key_with_nonexistent_key(self, client, test_tenant):
        """POST /auth/login-key 存在しないログインキー"""
        async with client as c:
            response = await c.post(
                "/auth/login-key",
                json={"loginKey": "nonexistent-key"},
                headers={"X-Tenant-ID": test_tenant.id},
            )

        assert response.status_code == 401

    async def test_post_auth_login_key_with_different_tenant(
        self, client, test_other_tenant, test_user_with_login_key
    ):
        """POST /auth/login-key 別テナントのログインキーは存在しない場合と同じ401になること"""
        async with client as c:
            response = await c.post(
                "/auth/login-key",
                json={"loginKey": test_user_with_login_key.login_key},
                headers={"X-Tenant-ID": test_other_tenant.id},
            )

        assert response.status_code == 401

    async def test_post_auth_login_key_missing_header(
        self, client, test_user_with_login_key
    ):
        """POST /auth/login-key X-Tenant-ID ヘッダーなし"""
        async with client as c:
            response = await c.post(
                "/auth/login-key",
                json={"loginKey": test_user_with_login_key.login_key},
            )

        assert response.status_code == 422

    async def test_post_auth_login_key_sets_session_cookie_and_creates_session(
        self, client, fake_redis, test_tenant, test_user_with_login_key
    ):
        """POST /auth/login-key 成功時にsession_id Cookieが発行され、Redisにセッションが作られること"""
        async with client as c:
            response = await c.post(
                "/auth/login-key",
                json={"loginKey": test_user_with_login_key.login_key},
                headers={"X-Tenant-ID": test_tenant.id},
            )

        assert SESSION_COOKIE_NAME in response.cookies
        session_id = response.cookies[SESSION_COOKIE_NAME]
        stored = await fake_redis.get(f"session:{session_id}")
        assert stored is not None
        payload = json.loads(stored)
        assert payload["login_id"] == test_user_with_login_key.login_id
        assert payload["tenant_id"] == test_tenant.id

    async def test_post_auth_logout(self, client):
        """POST /auth/logout"""
        async with client as c:
            response = await c.post("/auth/logout")

        assert response.status_code == 200
        assert "Logout successful" in response.json()["message"]

    async def test_post_auth_password_reset_success(
        self, client, test_tenant, test_user_with_password
    ):
        """POST /auth/password/reset 成功ケース"""
        async with client as c:
            response = await c.post(
                "/auth/password/reset",
                json={
                    "loginId": test_user_with_password["user"].login_id,
                    "oldPassword": test_user_with_password["plain_password"],
                    "newPassword": "NewPassword123!",
                },
                headers={"X-Tenant-ID": test_tenant.id},
            )

        assert response.status_code == 200
        assert response.json()["loginStatus"] == "SUCCESS"
        assert response.json()["token"] is not None

    async def test_get_api_auth_success(self, client, test_tenant, valid_jwt_token):
        """GET /api/auth 成功ケース"""
        async with client as c:
            response = await c.get(
                "/api/auth",
                headers={
                    "Authorization": f"Bearer {valid_jwt_token}",
                    "X-Tenant-ID": test_tenant.id,
                },
            )

        assert response.status_code == 200
        assert response.json()["loginStatus"] == "SUCCESS"
        assert response.json()["token"] is not None

    async def test_get_api_auth_without_token(self, client, test_tenant):
        """GET /api/auth Authorization ヘッダーなし"""
        async with client as c:
            response = await c.get(
                "/api/auth",
                headers={"X-Tenant-ID": test_tenant.id},
            )

        assert response.status_code == 401

    async def test_get_api_auth_with_expired_token(
        self, client, test_tenant, expired_jwt_token
    ):
        """GET /api/auth JWT 有効期限切れ"""
        async with client as c:
            response = await c.get(
                "/api/auth",
                headers={
                    "Authorization": f"Bearer {expired_jwt_token}",
                    "X-Tenant-ID": test_tenant.id,
                },
            )

        assert response.status_code == 401

    async def test_get_api_auth_with_invalid_token(
        self, client, test_tenant, invalid_jwt_token
    ):
        """GET /api/auth JWT が不正"""
        async with client as c:
            response = await c.get(
                "/api/auth",
                headers={
                    "Authorization": f"Bearer {invalid_jwt_token}",
                    "X-Tenant-ID": test_tenant.id,
                },
            )

        assert response.status_code == 401

    async def test_post_auth_login_sets_session_cookie_and_creates_session(
        self, client, fake_redis, test_tenant, test_user_with_password
    ):
        """POST /auth/login 成功時にsession_id Cookieが発行され、Redisにセッションが作られること"""
        async with client as c:
            response = await c.post(
                "/auth/login",
                json={
                    "username": test_user_with_password["user"].login_id,
                    "password": test_user_with_password["plain_password"],
                },
                headers={"X-Tenant-ID": test_tenant.id},
            )

        assert SESSION_COOKIE_NAME in response.cookies
        session_id = response.cookies[SESSION_COOKIE_NAME]
        stored = await fake_redis.get(f"session:{session_id}")
        assert stored is not None
        payload = json.loads(stored)
        assert payload["login_id"] == test_user_with_password["user"].login_id
        assert payload["tenant_id"] == test_tenant.id

    async def test_post_auth_login_requires_password_reset_does_not_create_session(
        self, client, test_tenant, test_user_with_password
    ):
        """初回パスワードリセットが必要な場合はsession_id Cookieもセッションも作られないこと"""
        test_user_with_password["user"].is_required_password_reset = True

        async with client as c:
            response = await c.post(
                "/auth/login",
                json={
                    "username": test_user_with_password["user"].login_id,
                    "password": test_user_with_password["plain_password"],
                },
                headers={"X-Tenant-ID": test_tenant.id},
            )

        assert response.json()["loginStatus"] == "REQUIRES_PASSWORD_RESET"
        assert SESSION_COOKIE_NAME not in response.cookies

    async def test_post_auth_logout_deletes_session_and_clears_cookie(
        self, client, fake_redis, test_tenant, test_user_with_password
    ):
        """ログアウトでRedis上のセッションが削除され、Cookieが失効すること"""
        async with client as c:
            login_response = await c.post(
                "/auth/login",
                json={
                    "username": test_user_with_password["user"].login_id,
                    "password": test_user_with_password["plain_password"],
                },
                headers={"X-Tenant-ID": test_tenant.id},
            )
            session_id = login_response.cookies[SESSION_COOKIE_NAME]

            logout_response = await c.post("/auth/logout")

        assert await fake_redis.get(f"session:{session_id}") is None
        set_cookie_header = logout_response.headers.get("set-cookie", "")
        assert f"{SESSION_COOKIE_NAME}=" in set_cookie_header

    async def test_get_api_auth_with_session_cookie_only(
        self, client, test_tenant, test_user_with_password
    ):
        """session_id Cookieのみで保護APIを認証できること"""
        async with client as c:
            login_response = await c.post(
                "/auth/login",
                json={
                    "username": test_user_with_password["user"].login_id,
                    "password": test_user_with_password["plain_password"],
                },
                headers={"X-Tenant-ID": test_tenant.id},
            )
            response = await c.get(
                "/api/auth",
                headers={"X-Tenant-ID": test_tenant.id},
            )

        assert login_response.status_code == 200
        assert response.status_code == 200

    async def test_get_api_auth_after_session_deleted_returns_401(
        self, client, fake_redis, test_tenant, test_user_with_password
    ):
        """Redis上のセッションが失効した場合、同じCookieでは401になること"""
        async with client as c:
            login_response = await c.post(
                "/auth/login",
                json={
                    "username": test_user_with_password["user"].login_id,
                    "password": test_user_with_password["plain_password"],
                },
                headers={"X-Tenant-ID": test_tenant.id},
            )
            session_id = login_response.cookies[SESSION_COOKIE_NAME]
            await fake_redis.delete(f"session:{session_id}")

            response = await c.get(
                "/api/auth",
                headers={"X-Tenant-ID": test_tenant.id},
            )

        assert response.status_code == 401

    async def test_get_api_auth_with_bearer_fallback_when_no_session_cookie(
        self, client, test_tenant, valid_jwt_token
    ):
        """session_id CookieなしでもAuthorizationヘッダーのJWTで認証できること（フォールバック）"""
        async with client as c:
            response = await c.get(
                "/api/auth",
                headers={
                    "Authorization": f"Bearer {valid_jwt_token}",
                    "X-Tenant-ID": test_tenant.id,
                },
            )

        assert response.status_code == 200

    async def test_post_auth_login_uses_configured_same_site(
        self, client, monkeypatch, test_tenant, test_user_with_password
    ):
        """COOKIE_SAME_SITE環境変数で設定した値がSet-CookieのSameSite属性に反映されること"""
        from app.core import config

        monkeypatch.setenv("COOKIE_SAME_SITE", "none")
        config.get_settings.cache_clear()

        async with client as c:
            response = await c.post(
                "/auth/login",
                json={
                    "username": test_user_with_password["user"].login_id,
                    "password": test_user_with_password["plain_password"],
                },
                headers={"X-Tenant-ID": test_tenant.id},
            )

        config.get_settings.cache_clear()
        set_cookie_header = response.headers.get("set-cookie", "")
        assert "samesite=none" in set_cookie_header.lower()

    async def test_get_api_auth_without_cookie_or_header_returns_401(
        self, client, test_tenant
    ):
        """GET /api/auth をCookie・Authorizationヘッダーどちらも無しで呼ぶと401になること"""
        async with client as c:
            response = await c.get(
                "/api/auth",
                headers={"X-Tenant-ID": test_tenant.id},
            )

        assert response.status_code == 401
