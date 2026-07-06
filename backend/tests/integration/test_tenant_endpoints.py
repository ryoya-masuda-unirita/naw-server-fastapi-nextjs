import pytest
from httpx import ASGITransport, AsyncClient
from uuid import uuid4

from app.core.security import create_access_token
from app.main import app
from app.models.tenant import Tenant
from app.models.tenant_endpoint import EndpointType, TenantEndpoint
from app.models.user import User, UserRole


@pytest.fixture
async def tenant(session):
    """テスト用テナント"""
    t = Tenant(
        id="tenant-endpoints-test",
        name="Endpoints Test Tenant",
        owner="admin",
        pw_policy_min_length=8,
        pw_policy_use_uppercase=True,
        pw_policy_use_lowercase=True,
        pw_policy_use_digits=True,
        pw_policy_use_symbols=True,
        pw_policy_valid_symbols="!@#$",
        pw_validity_period_days=90,
        pw_histories_limit=3,
    )
    session.add(t)
    await session.commit()
    await session.refresh(t)
    return t


@pytest.fixture
async def other_tenant(session):
    """テスト用の別テナント"""
    t = Tenant(
        id="tenant-endpoints-other",
        name="Other Tenant",
        owner="admin",
        pw_policy_min_length=8,
        pw_policy_use_uppercase=True,
        pw_policy_use_lowercase=True,
        pw_policy_use_digits=True,
        pw_policy_use_symbols=True,
        pw_policy_valid_symbols="!@#$",
        pw_validity_period_days=90,
        pw_histories_limit=3,
    )
    session.add(t)
    await session.commit()
    await session.refresh(t)
    return t


@pytest.fixture
async def admin_user(session, tenant):
    """テスト用テナント管理者"""
    u = User(
        id=uuid4(),
        tenant_id=tenant.id,
        login_id="admin-test",
        name="Admin",
        role=UserRole.ADMIN,
        is_required_password_reset=False,
    )
    session.add(u)
    await session.commit()
    await session.refresh(u)
    return u


@pytest.fixture
async def normal_user(session, tenant):
    """テスト用一般ユーザー"""
    u = User(
        id=uuid4(),
        tenant_id=tenant.id,
        login_id="user-test",
        name="User",
        role=UserRole.USER,
        is_required_password_reset=False,
    )
    session.add(u)
    await session.commit()
    await session.refresh(u)
    return u


@pytest.fixture
async def local_server_endpoint(session, tenant):
    """テスト用LOCAL_SERVERエンドポイント"""
    e = TenantEndpoint(
        tenant_id=tenant.id,
        type=EndpointType.LOCAL_SERVER,
        endpoint_name="Local",
        endpoint="http://localhost:8080",
        api_key="secret-key",
    )
    session.add(e)
    await session.commit()
    await session.refresh(e)
    return e


@pytest.fixture
async def azure_endpoint(session, tenant):
    """テスト用AZURE_OPENAI_CHATエンドポイント（LOCAL_SERVER以外）"""
    e = TenantEndpoint(
        tenant_id=tenant.id,
        type=EndpointType.AZURE_OPENAI_CHAT,
        endpoint_name="Azure",
        endpoint="https://example.openai.azure.com",
        api_key="azure-key",
    )
    session.add(e)
    await session.commit()
    await session.refresh(e)
    return e


def _headers(login_id, tenant_id):
    token = create_access_token(login_id, tenant_id)
    return {"Authorization": f"Bearer {token}", "X-Tenant-ID": tenant_id}


@pytest.fixture
def admin_headers(admin_user, tenant):
    return _headers(admin_user.login_id, tenant.id)


@pytest.fixture
def user_headers(normal_user, tenant):
    return _headers(normal_user.login_id, tenant.id)


@pytest.fixture
def client(override_get_session):
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
class TestGetEndpoints:
    """GET /api/admin/tenants/{tenantId}/endpoints"""

    async def test_tenant_admin_gets_all_types(
        self, client, admin_headers, tenant, local_server_endpoint, azure_endpoint
    ):
        """テナント管理者は全タイプのエンドポイントを取得できること"""
        async with client as c:
            response = await c.get(
                f"/api/admin/tenants/{tenant.id}/endpoints", headers=admin_headers
            )

        assert response.status_code == 200
        body = response.json()
        assert len(body) == 2
        assert all("apiKey" not in item for item in body)

    async def test_normal_user_gets_403(self, client, user_headers, tenant):
        """一般ユーザーは403になること"""
        async with client as c:
            response = await c.get(
                f"/api/admin/tenants/{tenant.id}/endpoints", headers=user_headers
            )

        assert response.status_code == 403

    async def test_path_tenant_mismatch_returns_403(
        self, client, admin_headers, other_tenant
    ):
        """パスのtenantIdが自分のテナントと異なる場合403になること"""
        async with client as c:
            response = await c.get(
                f"/api/admin/tenants/{other_tenant.id}/endpoints", headers=admin_headers
            )

        assert response.status_code == 403


@pytest.mark.asyncio
class TestGetEndpointsByType:
    """GET /api/admin/tenants/endpoints/{type}"""

    async def test_returns_only_matching_type(
        self, client, admin_headers, local_server_endpoint, azure_endpoint
    ):
        """指定タイプのエンドポイントのみ返ること"""
        async with client as c:
            response = await c.get(
                "/api/admin/tenants/endpoints/AZURE_OPENAI_CHAT", headers=admin_headers
            )

        assert response.status_code == 200
        body = response.json()
        assert len(body) == 1
        assert body[0]["type"] == "AZURE_OPENAI_CHAT"


@pytest.mark.asyncio
class TestCreateEndpoint:
    """POST /api/admin/tenants/{tenantId}/endpoints"""

    async def test_creates_local_server_endpoint(self, client, admin_headers, tenant):
        """LOCAL_SERVERタイプのエンドポイントを作成できること"""
        async with client as c:
            response = await c.post(
                f"/api/admin/tenants/{tenant.id}/endpoints",
                json={
                    "type": "LOCAL_SERVER",
                    "endpointName": "My Local",
                    "endpoint": "http://localhost:9000",
                    "apiKey": "key123",
                },
                headers=admin_headers,
            )

        assert response.status_code == 200
        assert "apiKey" not in response.json()

    async def test_rejects_non_local_server_type(self, client, admin_headers, tenant):
        """LOCAL_SERVER以外のタイプでの作成は400になること"""
        async with client as c:
            response = await c.post(
                f"/api/admin/tenants/{tenant.id}/endpoints",
                json={
                    "type": "AZURE_OPENAI_CHAT",
                    "endpointName": "Azure",
                    "endpoint": "https://example.openai.azure.com",
                    "apiKey": "key123",
                },
                headers=admin_headers,
            )

        assert response.status_code == 400

    async def test_rejects_invalid_url(self, client, admin_headers, tenant):
        """URL形式でないendpointは400になること"""
        async with client as c:
            response = await c.post(
                f"/api/admin/tenants/{tenant.id}/endpoints",
                json={
                    "type": "LOCAL_SERVER",
                    "endpointName": "Local",
                    "endpoint": "not-a-url",
                    "apiKey": "key123",
                },
                headers=admin_headers,
            )

        assert response.status_code == 400


@pytest.mark.asyncio
class TestUpdateEndpoint:
    """PATCH /api/admin/tenants/{tenantId}/endpoints/{endpointId}"""

    async def test_updates_local_server_endpoint(
        self, client, admin_headers, tenant, local_server_endpoint
    ):
        """LOCAL_SERVERエンドポイントを更新できること"""
        async with client as c:
            response = await c.patch(
                f"/api/admin/tenants/{tenant.id}/endpoints/{local_server_endpoint.id}",
                json={"endpointName": "Renamed"},
                headers=admin_headers,
            )

        assert response.status_code == 200
        assert response.json()["endpointName"] == "Renamed"

    async def test_keeps_existing_api_key_when_not_specified(
        self, client, session, admin_headers, tenant, local_server_endpoint
    ):
        """apiKeyを指定しない更新では既存の値が保持されること"""
        async with client as c:
            response = await c.patch(
                f"/api/admin/tenants/{tenant.id}/endpoints/{local_server_endpoint.id}",
                json={"endpointName": "Renamed"},
                headers=admin_headers,
            )

        assert response.status_code == 200
        await session.refresh(local_server_endpoint)
        assert local_server_endpoint.api_key == "secret-key"

    async def test_rejects_update_on_non_local_server_endpoint(
        self, client, admin_headers, tenant, azure_endpoint
    ):
        """LOCAL_SERVER以外のエンドポイントの更新は400になること"""
        async with client as c:
            response = await c.patch(
                f"/api/admin/tenants/{tenant.id}/endpoints/{azure_endpoint.id}",
                json={"endpointName": "Renamed"},
                headers=admin_headers,
            )

        assert response.status_code == 400

    async def test_rejects_type_change_to_non_local_server(
        self, client, admin_headers, tenant, local_server_endpoint
    ):
        """typeをLOCAL_SERVER以外に変更しようとすると400になること"""
        async with client as c:
            response = await c.patch(
                f"/api/admin/tenants/{tenant.id}/endpoints/{local_server_endpoint.id}",
                json={"type": "AZURE_OPENAI_CHAT"},
                headers=admin_headers,
            )

        assert response.status_code == 400

    async def test_update_nonexistent_endpoint_returns_404(
        self, client, admin_headers, tenant
    ):
        """存在しないエンドポイントの更新は404になること"""
        async with client as c:
            response = await c.patch(
                f"/api/admin/tenants/{tenant.id}/endpoints/nonexistent",
                json={"endpointName": "Renamed"},
                headers=admin_headers,
            )

        assert response.status_code == 404


@pytest.mark.asyncio
class TestDeleteEndpoint:
    """DELETE /api/admin/tenants/{tenantId}/endpoints/{endpointId}"""

    async def test_deletes_local_server_endpoint(
        self, client, admin_headers, tenant, local_server_endpoint
    ):
        """LOCAL_SERVERエンドポイントを削除できること"""
        async with client as c:
            response = await c.delete(
                f"/api/admin/tenants/{tenant.id}/endpoints/{local_server_endpoint.id}",
                headers=admin_headers,
            )

        assert response.status_code == 204

    async def test_rejects_delete_on_non_local_server_endpoint(
        self, client, admin_headers, tenant, azure_endpoint
    ):
        """LOCAL_SERVER以外のエンドポイントの削除は400になること"""
        async with client as c:
            response = await c.delete(
                f"/api/admin/tenants/{tenant.id}/endpoints/{azure_endpoint.id}",
                headers=admin_headers,
            )

        assert response.status_code == 400

    async def test_delete_nonexistent_endpoint_returns_404(
        self, client, admin_headers, tenant
    ):
        """存在しないエンドポイントの削除は404になること"""
        async with client as c:
            response = await c.delete(
                f"/api/admin/tenants/{tenant.id}/endpoints/nonexistent",
                headers=admin_headers,
            )

        assert response.status_code == 404
