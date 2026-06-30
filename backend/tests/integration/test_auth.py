import pytest
from httpx import AsyncClient

from app.main import app
from app.database import get_session


@pytest.mark.asyncio
class TestAuthAPI:
    """認証 API エンドポイントテスト"""

    async def test_post_auth_login_success(self, session, test_tenant, test_user_with_password, override_get_session):
        """POST /auth/login 成功ケース"""
        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.post(
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

    async def test_post_auth_login_missing_header(self, session, test_user_with_password, override_get_session):
        """POST /auth/login X-Tenant-ID ヘッダーなし"""
        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.post(
                "/auth/login",
                json={
                    "username": test_user_with_password["user"].login_id,
                    "password": test_user_with_password["plain_password"],
                },
            )

        assert response.status_code == 422

    async def test_post_auth_logout(self, override_get_session):
        """POST /auth/logout"""
        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.post("/auth/logout")

        assert response.status_code == 200
        assert "Logout successful" in response.json()["message"]

    async def test_post_auth_password_reset_success(self, session, test_tenant, test_user_with_password, override_get_session):
        """POST /auth/password/reset 成功ケース"""
        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.post(
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

    async def test_get_api_auth_success(self, session, test_tenant, valid_jwt_token, override_get_session):
        """GET /api/auth 成功ケース"""
        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.get(
                "/api/auth",
                headers={
                    "Authorization": f"Bearer {valid_jwt_token}",
                    "X-Tenant-ID": test_tenant.id,
                },
            )

        assert response.status_code == 200
        assert response.json()["loginStatus"] == "SUCCESS"
        assert response.json()["token"] is not None

    async def test_get_api_auth_without_token(self, test_tenant, override_get_session):
        """GET /api/auth Authorization ヘッダーなし"""
        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.get(
                "/api/auth",
                headers={"X-Tenant-ID": test_tenant.id},
            )

        assert response.status_code == 403

    async def test_get_api_auth_with_expired_token(self, test_tenant, expired_jwt_token, override_get_session):
        """GET /api/auth JWT 有効期限切れ"""
        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.get(
                "/api/auth",
                headers={
                    "Authorization": f"Bearer {expired_jwt_token}",
                    "X-Tenant-ID": test_tenant.id,
                },
            )

        assert response.status_code == 401

    async def test_get_api_auth_with_invalid_token(self, test_tenant, invalid_jwt_token, override_get_session):
        """GET /api/auth JWT が不正"""
        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.get(
                "/api/auth",
                headers={
                    "Authorization": f"Bearer {invalid_jwt_token}",
                    "X-Tenant-ID": test_tenant.id,
                },
            )

        assert response.status_code == 401
