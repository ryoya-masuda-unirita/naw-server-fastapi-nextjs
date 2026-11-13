from datetime import datetime, timezone
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient


from app.core.security import create_access_token
from app.main import app
from app.models.ai_model import AIModel, AIModelEndpointType
from app.models.assistant import (
    Assistant,
    AssistantCategoryMapping,
    AssistantEndpoint,
    AssistantType,
    GroupAssistant,
)
from app.models.message import Message
from app.models.room import Room
from app.models.assistant_category import AssistantCategory
from app.models.group import Group, GroupUser
from app.models.tenant import Tenant
from app.models.tenant_endpoint import EndpointType, TenantEndpoint
from app.models.user import User, UserRole
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Any


@pytest.fixture
async def tenant(session: AsyncSession) -> Tenant:
    """テスト用テナント"""
    t = Tenant(
        id="tenant-assistants-test",
        name="Assistants Test Tenant",
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
async def member_user(session: AsyncSession, tenant: Tenant) -> User:
    """テスト用一般ユーザー（グループ所属想定）"""
    u = User(
        id=uuid4(),
        tenant_id=tenant.id,
        login_id="member-test",
        name="Member",
        role=UserRole.USER,
        is_required_password_reset=False,
    )
    session.add(u)
    await session.commit()
    await session.refresh(u)
    return u


@pytest.fixture
async def unaffiliated_user(session: AsyncSession, tenant: Tenant) -> User:
    """テスト用一般ユーザー（どのグループにも未所属）"""
    u = User(
        id=uuid4(),
        tenant_id=tenant.id,
        login_id="unaffiliated-test",
        name="Unaffiliated",
        role=UserRole.USER,
        is_required_password_reset=False,
    )
    session.add(u)
    await session.commit()
    await session.refresh(u)
    return u


@pytest.fixture
async def admin_user(session: AsyncSession, tenant: Tenant) -> User:
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
async def group_admin_user(session: AsyncSession, tenant: Tenant) -> User:
    """テスト用グループ管理者（テナント管理者ロールではない）"""
    u = User(
        id=uuid4(),
        tenant_id=tenant.id,
        login_id="group-admin-test",
        name="GroupAdmin",
        role=UserRole.USER,
        is_required_password_reset=False,
    )
    session.add(u)
    await session.commit()
    await session.refresh(u)
    return u


@pytest.fixture
async def assistant(session: AsyncSession, tenant: Tenant) -> Assistant:
    """テスト用アシスタント"""
    a = Assistant(
        tenant_id=tenant.id,
        type=AssistantType.SAAS_CHAT,
        name="Assistant1",
        include_history=True,
    )
    session.add(a)
    await session.commit()
    await session.refresh(a)
    return a


@pytest.fixture
async def group_with_assistant(
    session: AsyncSession, tenant: Tenant, member_user: User, assistant: Assistant
) -> Group:
    """member_userが所属し、assistantが紐づくグループ"""
    g = Group(tenant_id=tenant.id, name="Group1")
    session.add(g)
    await session.commit()
    await session.refresh(g)

    session.add(
        GroupUser(
            group_id=g.id, tenant_id=tenant.id, user_id=member_user.id, is_admin=False
        )
    )
    session.add(
        GroupAssistant(group_id=g.id, tenant_id=tenant.id, assistant_id=assistant.id)
    )
    await session.commit()
    return g


@pytest.fixture
async def managed_group(
    session: AsyncSession, tenant: Tenant, group_admin_user: User, assistant: Assistant
) -> Group:
    """group_admin_userがグループ内管理者として所属し、assistantが紐づくグループ"""
    g = Group(tenant_id=tenant.id, name="ManagedGroup")
    session.add(g)
    await session.commit()
    await session.refresh(g)

    session.add(
        GroupUser(
            group_id=g.id,
            tenant_id=tenant.id,
            user_id=group_admin_user.id,
            is_admin=True,
        )
    )
    session.add(
        GroupAssistant(group_id=g.id, tenant_id=tenant.id, assistant_id=assistant.id)
    )
    await session.commit()
    return g


@pytest.fixture
async def assistant_category(
    session: AsyncSession, tenant: Tenant, admin_user: User
) -> AssistantCategory:
    """テスト用アシスタントカテゴリ"""
    c = AssistantCategory(
        tenant_id=tenant.id,
        name="カテゴリ1",
        description="desc",
        updated_user_id=admin_user.id,
    )
    session.add(c)
    await session.commit()
    await session.refresh(c)
    return c


@pytest.fixture
async def ai_model(session: AsyncSession) -> AIModel:
    """テスト用AIモデル"""
    m = AIModel(
        endpoint_type=AIModelEndpointType.OPENAI_CHAT,
        name="gpt-4o",
        max_tokens=128000,
        active=True,
    )
    session.add(m)
    await session.commit()
    await session.refresh(m)
    return m


@pytest.fixture
async def tenant_endpoint(session: AsyncSession, tenant: Tenant) -> TenantEndpoint:
    """テスト用テナントエンドポイント"""
    e = TenantEndpoint(
        tenant_id=tenant.id,
        type=EndpointType.AZURE_OPENAI_CHAT,
        endpoint_name="Azure",
        endpoint="https://example.openai.azure.com",
        api_key="secret-key",
    )
    session.add(e)
    await session.commit()
    await session.refresh(e)
    return e


@pytest.fixture
async def assistant_with_endpoint(
    session: AsyncSession,
    tenant: Tenant,
    assistant: Assistant,
    tenant_endpoint: TenantEndpoint,
) -> Assistant:
    """assistantにtenant_endpointを紐付ける"""
    ae = AssistantEndpoint(
        assistant_id=assistant.id,
        endpoint_id=tenant_endpoint.id,
        tenant_id=tenant.id,
        model="gpt-4o",
    )
    session.add(ae)
    await session.commit()
    return assistant


def _headers(login_id: str, tenant_id: str) -> dict[str, str]:
    """認証済みリクエスト用のヘッダーを作る

    Parameters
    ----------
    login_id : str
        アクセストークンの対象ユーザーのログインID
    tenant_id : str
        テナントID（トークンと X-Tenant-ID ヘッダーに使う）

    Returns
    -------
    dict[str, str]
        Authorization と X-Tenant-ID を含むヘッダー
    """
    token = create_access_token(login_id, tenant_id)
    return {"Authorization": f"Bearer {token}", "X-Tenant-ID": tenant_id}


@pytest.fixture
def member_headers(member_user: User, tenant: Tenant) -> dict[str, str]:
    """一般メンバーの認証ヘッダー"""
    return _headers(member_user.login_id, tenant.id)


@pytest.fixture
def unaffiliated_headers(unaffiliated_user: User, tenant: Tenant) -> dict[str, str]:
    """グループに所属しないユーザーの認証ヘッダー"""
    return _headers(unaffiliated_user.login_id, tenant.id)


@pytest.fixture
def admin_headers(admin_user: User, tenant: Tenant) -> dict[str, str]:
    """テナント管理者の認証ヘッダー"""
    return _headers(admin_user.login_id, tenant.id)


@pytest.fixture
def group_admin_headers(group_admin_user: User, tenant: Tenant) -> dict[str, str]:
    """グループ管理者の認証ヘッダー"""
    return _headers(group_admin_user.login_id, tenant.id)


@pytest.fixture
def client(override_get_session: None) -> AsyncClient:
    """テスト用の非同期 HTTP クライアント"""
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
class TestGetAssistants:
    """GET /api/assistants"""

    async def test_returns_assistant_belonging_to_users_group(
        self,
        client: AsyncClient,
        member_headers: dict[str, str],
        group_with_assistant: Group,
        assistant: Assistant,
    ) -> None:
        """所属グループに紐づくアシスタントが返ること"""
        async with client as c:
            response = await c.get("/api/assistants", headers=member_headers)

        assert response.status_code == 200
        body = response.json()
        assert len(body) == 1
        assert body[0]["id"] == assistant.id
        assert body[0]["endpoints"] == []
        assert body[0]["category"] is None
        assert body[0]["categories"] == []
        assert body[0]["groups"] == [group_with_assistant.id]

    async def test_returns_empty_when_no_group_membership(
        self,
        client: AsyncClient,
        unaffiliated_headers: dict[str, str],
        group_with_assistant: Group,
    ) -> None:
        """どのグループにも所属していない場合空配列が返ること"""
        async with client as c:
            response = await c.get("/api/assistants", headers=unaffiliated_headers)

        assert response.status_code == 200
        assert response.json() == []

    async def test_deduplicates_assistant_shared_by_two_groups(
        self,
        client: AsyncClient,
        session: AsyncSession,
        tenant: Tenant,
        member_headers: dict[str, str],
        member_user: User,
        assistant: Assistant,
        group_with_assistant: Group,
    ) -> None:
        """同じアシスタントが2つのグループ経由で見えても重複排除されること"""
        second_group = Group(tenant_id=tenant.id, name="Group2")
        session.add(second_group)
        await session.commit()
        await session.refresh(second_group)

        session.add(
            GroupUser(
                group_id=second_group.id,
                tenant_id=tenant.id,
                user_id=member_user.id,
                is_admin=False,
            )
        )
        session.add(
            GroupAssistant(
                group_id=second_group.id, tenant_id=tenant.id, assistant_id=assistant.id
            )
        )
        await session.commit()

        async with client as c:
            response = await c.get("/api/assistants", headers=member_headers)

        assert response.status_code == 200
        body = response.json()
        assert len(body) == 1
        assert sorted(body[0]["groups"]) == sorted(
            [group_with_assistant.id, second_group.id]
        )

    async def test_excludes_assistant_from_unrelated_group(
        self,
        client: AsyncClient,
        session: AsyncSession,
        tenant: Tenant,
        member_headers: dict[str, str],
        group_with_assistant: Group,
    ) -> None:
        """所属していないグループに紐づくアシスタントは含まれないこと"""
        other_group = Group(tenant_id=tenant.id, name="OtherGroup")
        session.add(other_group)
        await session.commit()
        await session.refresh(other_group)

        other_assistant = Assistant(
            tenant_id=tenant.id,
            type=AssistantType.SAAS_CHAT,
            name="Other",
            include_history=False,
        )
        session.add(other_assistant)
        await session.commit()
        await session.refresh(other_assistant)

        session.add(
            GroupAssistant(
                group_id=other_group.id,
                tenant_id=tenant.id,
                assistant_id=other_assistant.id,
            )
        )
        await session.commit()

        async with client as c:
            response = await c.get("/api/assistants", headers=member_headers)

        ids = [a["id"] for a in response.json()]
        assert other_assistant.id not in ids

    async def test_unauthenticated_returns_401(
        self, client: AsyncClient, tenant: Tenant
    ) -> None:
        """未認証は401になること"""
        async with client as c:
            response = await c.get(
                "/api/assistants", headers={"X-Tenant-ID": tenant.id}
            )

        assert response.status_code == 401


@pytest.mark.asyncio
class TestGetAssistantsEndpoints:
    """GET /api/assistants のendpoints項目"""

    async def test_returns_endpoint_details(
        self,
        client: AsyncClient,
        member_headers: dict[str, str],
        group_with_assistant: Group,
        assistant_with_endpoint: Assistant,
        tenant_endpoint: TenantEndpoint,
    ) -> None:
        """紐づくエンドポイント情報が返ること"""
        async with client as c:
            response = await c.get("/api/assistants", headers=member_headers)

        assert response.status_code == 200
        body = response.json()
        endpoints = body[0]["endpoints"]
        assert len(endpoints) == 1
        assert endpoints[0]["id"] == tenant_endpoint.id
        assert endpoints[0]["model"] == "gpt-4o"
        assert endpoints[0]["type"] == "AZURE_OPENAI_CHAT"
        assert endpoints[0]["url"] == "https://example.openai.azure.com"
        # 移植元は label を管理者向け一覧だけに入れる（それ以外は null で項目は出る）
        assert endpoints[0]["label"] is None
        assert "apiKey" not in endpoints[0]

    async def test_returns_empty_endpoints_when_not_linked(
        self,
        client: AsyncClient,
        member_headers: dict[str, str],
        group_with_assistant: Group,
    ) -> None:
        """エンドポイントが紐づいていない場合は空配列が返ること（issue-26の既存挙動を維持）"""
        async with client as c:
            response = await c.get("/api/assistants", headers=member_headers)

        assert response.status_code == 200
        assert response.json()[0]["endpoints"] == []

    async def test_returns_multiple_endpoints(
        self,
        client: AsyncClient,
        session: AsyncSession,
        tenant: Tenant,
        member_headers: dict[str, str],
        group_with_assistant: Group,
        assistant: Assistant,
        tenant_endpoint: TenantEndpoint,
    ) -> None:
        """複数エンドポイントが紐づく場合すべて返ること"""
        second_endpoint = TenantEndpoint(
            tenant_id=tenant.id,
            type=EndpointType.CLAUDE_CHAT,
            endpoint_name="Claude",
            endpoint="https://api.anthropic.com",
            api_key="claude-key",
        )
        session.add(second_endpoint)
        await session.commit()
        await session.refresh(second_endpoint)

        session.add(
            AssistantEndpoint(
                assistant_id=assistant.id,
                endpoint_id=tenant_endpoint.id,
                tenant_id=tenant.id,
                model="gpt-4o",
            )
        )
        session.add(
            AssistantEndpoint(
                assistant_id=assistant.id,
                endpoint_id=second_endpoint.id,
                tenant_id=tenant.id,
                model="claude-3-opus",
            )
        )
        await session.commit()

        async with client as c:
            response = await c.get("/api/assistants", headers=member_headers)

        assert len(response.json()[0]["endpoints"]) == 2

    async def test_excludes_endpoint_belonging_to_different_tenant(
        self,
        client: AsyncClient,
        session: AsyncSession,
        tenant: Tenant,
        member_headers: dict[str, str],
        group_with_assistant: Group,
        assistant: Assistant,
    ) -> None:
        """assistants_endpointsのtenant_idとtenant_endpointsのtenant_idが食い違う場合、
        他テナントのエンドポイントが結果に含まれないこと（テナント分離の防御的チェック）"""
        other_tenant = Tenant(
            id="tenant-assistants-other",
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
        session.add(other_tenant)
        await session.commit()

        other_tenant_endpoint = TenantEndpoint(
            tenant_id=other_tenant.id,
            type=EndpointType.OPENAI_CHAT,
            endpoint_name="Other Tenant Endpoint",
            endpoint="https://api.openai.com",
            api_key="other-tenant-key",
        )
        session.add(other_tenant_endpoint)
        await session.commit()
        await session.refresh(other_tenant_endpoint)

        # assistants_endpoints.tenant_id は自テナントだが、endpoint_id は他テナントのエンドポイントを指す不整合データ
        session.add(
            AssistantEndpoint(
                assistant_id=assistant.id,
                endpoint_id=other_tenant_endpoint.id,
                tenant_id=tenant.id,
                model="gpt-4o",
            )
        )
        await session.commit()

        async with client as c:
            response = await c.get("/api/assistants", headers=member_headers)

        assert response.json()[0]["endpoints"] == []


@pytest.mark.asyncio
class TestGetAssistantsCategory:
    """GET /api/assistants のcategory/categories項目"""

    async def test_returns_linked_category(
        self,
        client: AsyncClient,
        session: AsyncSession,
        tenant: Tenant,
        member_headers: dict[str, str],
        group_with_assistant: Group,
        assistant: Assistant,
        assistant_category: AssistantCategory,
    ) -> None:
        """紐づくカテゴリが実データとして返ること"""
        session.add(
            AssistantCategoryMapping(
                assistant_id=assistant.id,
                category_id=assistant_category.id,
                tenant_id=tenant.id,
            )
        )
        await session.commit()

        async with client as c:
            response = await c.get("/api/assistants", headers=member_headers)

        body = response.json()
        assert body[0]["category"]["id"] == assistant_category.id
        assert body[0]["categories"][0]["id"] == assistant_category.id
        # 移植元は updatedAt を設定しないため、項目は出るが常に null
        assert body[0]["category"]["updatedAt"] is None


@pytest.mark.asyncio
class TestCreateAssistant:
    """POST /api/admin/assistants"""

    async def test_create_assistant_as_tenant_admin_succeeds(
        self,
        client: AsyncClient,
        admin_headers: dict[str, str],
        tenant_endpoint: TenantEndpoint,
    ) -> None:
        """テナント管理者がアシスタントを作成できること"""
        async with client as c:
            response = await c.post(
                "/api/admin/assistants",
                json={
                    "type": "SAAS_CHAT",
                    "endpoints": [{"id": tenant_endpoint.id, "model": "gpt-4o"}],
                    "name": "New Assistant",
                    "includeHistory": True,
                },
                headers=admin_headers,
            )

        assert response.status_code == 200
        body = response.json()
        assert body["name"] == "New Assistant"
        assert body["iconColor"] is not None
        assert body["endpoints"][0]["id"] == tenant_endpoint.id

    async def test_create_assistant_as_group_admin_succeeds(
        self,
        client: AsyncClient,
        group_admin_headers: dict[str, str],
        tenant_endpoint: TenantEndpoint,
        managed_group: Group,
    ) -> None:
        """テナント管理者でないグループ管理者もアシスタントを作成できること"""
        async with client as c:
            response = await c.post(
                "/api/admin/assistants",
                json={
                    "type": "SAAS_CHAT",
                    "endpoints": [{"id": tenant_endpoint.id, "model": "gpt-4o"}],
                    "name": "By Group Admin",
                    "includeHistory": False,
                },
                headers=group_admin_headers,
            )

        assert response.status_code == 200

    async def test_create_assistant_as_normal_user_returns_403(
        self,
        client: AsyncClient,
        member_headers: dict[str, str],
        tenant_endpoint: TenantEndpoint,
    ) -> None:
        """管理者権限もグループ管理者権限もない一般ユーザーは403になること"""
        async with client as c:
            response = await c.post(
                "/api/admin/assistants",
                json={
                    "type": "SAAS_CHAT",
                    "endpoints": [{"id": tenant_endpoint.id, "model": "gpt-4o"}],
                    "name": "Denied",
                    "includeHistory": False,
                },
                headers=member_headers,
            )

        assert response.status_code == 403

    async def test_create_assistant_without_endpoints_returns_400(
        self, client: AsyncClient, admin_headers: dict[str, str]
    ) -> None:
        """エンドポイントが1件もない場合400になること"""
        async with client as c:
            response = await c.post(
                "/api/admin/assistants",
                json={
                    "type": "SAAS_CHAT",
                    "endpoints": [],
                    "name": "NoEndpoints",
                    "includeHistory": False,
                },
                headers=admin_headers,
            )

        assert response.status_code == 400

    async def test_create_assistant_with_blank_name_returns_400(
        self,
        client: AsyncClient,
        admin_headers: dict[str, str],
        tenant_endpoint: TenantEndpoint,
    ) -> None:
        """名前が空白のみの場合400になること"""
        async with client as c:
            response = await c.post(
                "/api/admin/assistants",
                json={
                    "type": "SAAS_CHAT",
                    "endpoints": [{"id": tenant_endpoint.id, "model": "gpt-4o"}],
                    "name": "   ",
                    "includeHistory": False,
                },
                headers=admin_headers,
            )

        assert response.status_code == 400

    async def test_create_secure_assistant_with_non_local_server_endpoint_returns_400(
        self,
        client: AsyncClient,
        admin_headers: dict[str, str],
        tenant_endpoint: TenantEndpoint,
    ) -> None:
        """SECUREアシスタントにLOCAL_SERVER以外のエンドポイントを指定すると400になること"""
        async with client as c:
            response = await c.post(
                "/api/admin/assistants",
                json={
                    "type": "SECURE",
                    "endpoints": [{"id": tenant_endpoint.id, "model": "gpt-4o"}],
                    "name": "SecureAssistant",
                    "includeHistory": False,
                },
                headers=admin_headers,
            )

        assert response.status_code == 400

    async def test_create_saas_rag_assistant_with_two_endpoints_returns_400(
        self,
        client: AsyncClient,
        session: AsyncSession,
        tenant: Tenant,
        admin_headers: dict[str, str],
        tenant_endpoint: TenantEndpoint,
    ) -> None:
        """SAAS_RAGアシスタントにチャット用エンドポイントを2件指定すると400になること"""
        second_endpoint = TenantEndpoint(
            tenant_id=tenant.id,
            type=EndpointType.CLAUDE_CHAT,
            endpoint_name="Claude",
            endpoint="https://api.anthropic.com",
            api_key="claude-key",
        )
        session.add(second_endpoint)
        await session.commit()
        await session.refresh(second_endpoint)

        async with client as c:
            response = await c.post(
                "/api/admin/assistants",
                json={
                    "type": "SAAS_RAG",
                    "endpoints": [
                        {"id": tenant_endpoint.id, "model": "gpt-4o"},
                        {"id": second_endpoint.id, "model": "claude-3-opus"},
                    ],
                    "name": "RagAssistant",
                    "includeHistory": False,
                },
                headers=admin_headers,
            )

        assert response.status_code == 400

    async def test_create_assistant_saves_category_and_group(
        self,
        client: AsyncClient,
        admin_headers: dict[str, str],
        tenant_endpoint: TenantEndpoint,
        assistant_category: AssistantCategory,
        group_with_assistant: Group,
    ) -> None:
        """カテゴリ・グループを指定して作成できること"""
        async with client as c:
            response = await c.post(
                "/api/admin/assistants",
                json={
                    "type": "SAAS_CHAT",
                    "endpoints": [{"id": tenant_endpoint.id, "model": "gpt-4o"}],
                    "name": "WithRelations",
                    "includeHistory": False,
                    "categoryIds": [assistant_category.id],
                    "groups": [group_with_assistant.id],
                },
                headers=admin_headers,
            )

        assert response.status_code == 200
        body = response.json()
        assert body["category"]["id"] == assistant_category.id
        assert body["groups"] == [group_with_assistant.id]


@pytest.mark.asyncio
class TestUpdateAssistant:
    """PATCH /api/admin/assistants/{id}"""

    async def test_update_name_and_description(
        self,
        client: AsyncClient,
        admin_headers: dict[str, str],
        assistant: Assistant,
        tenant_endpoint: TenantEndpoint,
    ) -> None:
        """名前・説明を更新できること"""
        async with client as c:
            response = await c.patch(
                f"/api/admin/assistants/{assistant.id}",
                json={
                    "type": "SAAS_CHAT",
                    "endpoints": [{"id": tenant_endpoint.id, "model": "gpt-4o"}],
                    "name": "Renamed",
                    "description": "new desc",
                    "includeHistory": True,
                },
                headers=admin_headers,
            )

        assert response.status_code == 200
        body = response.json()
        assert body["name"] == "Renamed"
        assert body["description"] == "new desc"

    async def test_update_without_name_keeps_existing_name(
        self,
        client: AsyncClient,
        admin_headers: dict[str, str],
        assistant: Assistant,
        tenant_endpoint: TenantEndpoint,
    ) -> None:
        """nameを送信しない場合、既存の名前が維持されること"""
        async with client as c:
            response = await c.patch(
                f"/api/admin/assistants/{assistant.id}",
                json={
                    "type": "SAAS_CHAT",
                    "endpoints": [{"id": tenant_endpoint.id, "model": "gpt-4o"}],
                    "includeHistory": True,
                },
                headers=admin_headers,
            )

        assert response.status_code == 200
        assert response.json()["name"] == assistant.name

    async def test_update_with_empty_name_keeps_existing_name(
        self,
        client: AsyncClient,
        admin_headers: dict[str, str],
        assistant: Assistant,
        tenant_endpoint: TenantEndpoint,
    ) -> None:
        """nameを空文字で送信した場合も、既存の名前が維持されること（移植元isNotBlank相当）"""
        async with client as c:
            response = await c.patch(
                f"/api/admin/assistants/{assistant.id}",
                json={
                    "type": "SAAS_CHAT",
                    "endpoints": [{"id": tenant_endpoint.id, "model": "gpt-4o"}],
                    "name": "",
                    "includeHistory": True,
                },
                headers=admin_headers,
            )

        assert response.status_code == 200
        assert response.json()["name"] == assistant.name

    async def test_update_with_empty_description_keeps_existing_description(
        self,
        client: AsyncClient,
        admin_headers: dict[str, str],
        assistant: Assistant,
        tenant_endpoint: TenantEndpoint,
    ) -> None:
        """descriptionを空文字で送信した場合、既存の説明が維持されること（移植元isNotBlank相当）"""
        async with client as c:
            response = await c.patch(
                f"/api/admin/assistants/{assistant.id}",
                json={
                    "type": "SAAS_CHAT",
                    "endpoints": [{"id": tenant_endpoint.id, "model": "gpt-4o"}],
                    "description": "",
                    "includeHistory": True,
                },
                headers=admin_headers,
            )

        assert response.status_code == 200
        assert response.json()["description"] == assistant.description

    async def test_update_with_duplicate_endpoint_ids_returns_400(
        self,
        client: AsyncClient,
        admin_headers: dict[str, str],
        assistant: Assistant,
        tenant_endpoint: TenantEndpoint,
    ) -> None:
        """同じテナントエンドポイントIDを重複して指定すると400になること"""
        async with client as c:
            response = await c.patch(
                f"/api/admin/assistants/{assistant.id}",
                json={
                    "type": "SAAS_CHAT",
                    "endpoints": [
                        {"id": tenant_endpoint.id, "model": "gpt-4o"},
                        {"id": tenant_endpoint.id, "model": "gpt-4o-mini"},
                    ],
                    "includeHistory": True,
                },
                headers=admin_headers,
            )

        assert response.status_code == 400

    async def test_update_with_empty_category_ids_clears_categories(
        self,
        client: AsyncClient,
        session: AsyncSession,
        tenant: Tenant,
        admin_headers: dict[str, str],
        assistant: Assistant,
        tenant_endpoint: TenantEndpoint,
        assistant_category: AssistantCategory,
    ) -> None:
        """categoryIdsを空配列で送信すると既存のカテゴリ紐付けが解除されること"""
        session.add(
            AssistantCategoryMapping(
                assistant_id=assistant.id,
                category_id=assistant_category.id,
                tenant_id=tenant.id,
            )
        )
        await session.commit()

        async with client as c:
            response = await c.patch(
                f"/api/admin/assistants/{assistant.id}",
                json={
                    "type": "SAAS_CHAT",
                    "endpoints": [{"id": tenant_endpoint.id, "model": "gpt-4o"}],
                    "includeHistory": True,
                    "categoryIds": [],
                },
                headers=admin_headers,
            )

        assert response.status_code == 200
        assert response.json()["categories"] == []

    async def test_update_not_found_returns_404(
        self,
        client: AsyncClient,
        admin_headers: dict[str, str],
        tenant_endpoint: TenantEndpoint,
    ) -> None:
        """存在しないアシスタントIDの場合404になること"""
        async with client as c:
            response = await c.patch(
                "/api/admin/assistants/does-not-exist",
                json={
                    "type": "SAAS_CHAT",
                    "endpoints": [{"id": tenant_endpoint.id, "model": "gpt-4o"}],
                    "includeHistory": True,
                },
                headers=admin_headers,
            )

        assert response.status_code == 404


@pytest.mark.asyncio
class TestDeleteAssistant:
    """DELETE /api/admin/assistants/{assistant_id}"""

    async def test_delete_assistant_returns_409_when_used_as_default_assistant_of_room(
        self,
        client: AsyncClient,
        session: AsyncSession,
        admin_headers: dict[str, str],
        tenant: Tenant,
        member_user: User,
        assistant: Assistant,
    ) -> None:
        """デフォルトアシスタントとして参照中のルームがある場合409になること"""
        session.add(
            Room(
                tenant_id=tenant.id,
                name="Referenced Room",
                default_assistant_id=assistant.id,
                user_id=member_user.id,
            )
        )
        await session.commit()

        async with client as c:
            response = await c.delete(
                f"/api/admin/assistants/{assistant.id}", headers=admin_headers
            )

        assert response.status_code == 409
        assert (
            response.json()["message"]
            == "このアシスタントはルームのデフォルトアシスタントとして使用されているため削除できません。"
        )

    async def test_delete_assistant_succeeds_when_no_room_references_it(
        self, client: AsyncClient, admin_headers: dict[str, str], assistant: Assistant
    ) -> None:
        """参照されていないアシスタントは削除できること"""
        async with client as c:
            response = await c.delete(
                f"/api/admin/assistants/{assistant.id}", headers=admin_headers
            )

        assert response.status_code == 204

    async def test_delete_assistant_keeps_messages_and_sets_assistant_id_null(
        self,
        client: AsyncClient,
        session: AsyncSession,
        admin_headers: dict[str, str],
        tenant: Tenant,
        member_user: User,
        assistant: Assistant,
    ) -> None:
        """アシスタント削除時、そのアシスタントを使用したメッセージは削除されず、assistant_idがNULLになること（NAW-1192）"""
        # メッセージのルームは削除対象と別のアシスタントをデフォルトにし、
        # rooms.default_assistant_id の RESTRICT 制約で削除自体がブロックされないようにする。
        other_assistant = Assistant(
            tenant_id=tenant.id,
            type=AssistantType.SAAS_CHAT,
            name="OtherAssistant",
            include_history=True,
        )
        session.add(other_assistant)
        await session.commit()
        await session.refresh(other_assistant)

        room = Room(
            tenant_id=tenant.id,
            name="Room used by deleted assistant",
            default_assistant_id=other_assistant.id,
            user_id=member_user.id,
        )
        session.add(room)
        await session.commit()
        await session.refresh(room)

        message = Message(
            tenant_id=tenant.id,
            room_id=room.id,
            assistant_id=assistant.id,
        )
        session.add(message)
        await session.commit()
        await session.refresh(message)

        async with client as c:
            response = await c.delete(
                f"/api/admin/assistants/{assistant.id}", headers=admin_headers
            )

        assert response.status_code == 204

        await session.refresh(message)
        assert message.assistant_id is None

    """DELETE /api/admin/assistants/{id}"""

    async def test_delete_assistant_succeeds(
        self, client: AsyncClient, admin_headers: dict[str, str], assistant: Assistant
    ) -> None:
        """アシスタントを削除できること"""
        async with client as c:
            response = await c.delete(
                f"/api/admin/assistants/{assistant.id}", headers=admin_headers
            )

        assert response.status_code == 204

    async def test_delete_not_found_returns_404(
        self, client: AsyncClient, admin_headers: dict[str, str]
    ) -> None:
        """存在しないアシスタントIDの場合404になること"""
        async with client as c:
            response = await c.delete(
                "/api/admin/assistants/does-not-exist", headers=admin_headers
            )

        assert response.status_code == 404


@pytest.mark.asyncio
class TestListAdminAssistants:
    """GET /api/admin/assistants"""

    async def test_endpoints_include_label(
        self,
        client: AsyncClient,
        admin_headers: dict[str, str],
        assistant_with_endpoint: Assistant,
        tenant_endpoint: TenantEndpoint,
    ) -> None:
        """管理者向け一覧の endpoints[].label にテナントエンドポイント名が入ること（Issue #309）"""
        async with client as c:
            response = await c.get("/api/admin/assistants", headers=admin_headers)

        assert response.status_code == 200
        endpoint = response.json()["content"][0]["endpoints"][0]
        assert endpoint["label"] == tenant_endpoint.endpoint_name
        assert endpoint["id"] == tenant_endpoint.id

    async def test_tenant_admin_sees_all_assistants(
        self,
        client: AsyncClient,
        session: AsyncSession,
        tenant: Tenant,
        admin_headers: dict[str, str],
        assistant: Assistant,
    ) -> None:
        """テナント管理者は全アシスタントを取得できること"""
        other = Assistant(
            tenant_id=tenant.id,
            type=AssistantType.SAAS_CHAT,
            name="Other",
            include_history=False,
        )
        session.add(other)
        await session.commit()

        async with client as c:
            response = await c.get("/api/admin/assistants", headers=admin_headers)

        assert response.status_code == 200
        body = response.json()
        assert body["totalElements"] == 2

    async def test_group_admin_sees_only_managed_group_assistants(
        self,
        client: AsyncClient,
        session: AsyncSession,
        tenant: Tenant,
        group_admin_headers: dict[str, str],
        managed_group: Group,
        assistant: Assistant,
    ) -> None:
        """テナント管理者でないグループ管理者は、自分の管理グループのアシスタントのみ取得できること"""
        unmanaged = Assistant(
            tenant_id=tenant.id,
            type=AssistantType.SAAS_CHAT,
            name="Unmanaged",
            include_history=False,
        )
        session.add(unmanaged)
        await session.commit()

        async with client as c:
            response = await c.get("/api/admin/assistants", headers=group_admin_headers)

        assert response.status_code == 200
        body = response.json()
        assert body["totalElements"] == 1
        assert body["content"][0]["id"] == assistant.id

    async def test_normal_user_returns_403(
        self, client: AsyncClient, member_headers: dict[str, str]
    ) -> None:
        """管理者権限もグループ管理者権限もない一般ユーザーは403になること"""
        async with client as c:
            response = await c.get("/api/admin/assistants", headers=member_headers)

        assert response.status_code == 403

    async def test_filters_by_category_id_none(
        self,
        client: AsyncClient,
        session: AsyncSession,
        tenant: Tenant,
        admin_headers: dict[str, str],
        assistant: Assistant,
        assistant_category: AssistantCategory,
    ) -> None:
        """categoryId=NONEでカテゴリ未設定のアシスタントのみに絞り込めること"""
        categorized = Assistant(
            tenant_id=tenant.id,
            type=AssistantType.SAAS_CHAT,
            name="Categorized",
            include_history=False,
        )
        session.add(categorized)
        await session.commit()
        await session.refresh(categorized)
        session.add(
            AssistantCategoryMapping(
                assistant_id=categorized.id,
                category_id=assistant_category.id,
                tenant_id=tenant.id,
            )
        )
        await session.commit()

        async with client as c:
            response = await c.get(
                "/api/admin/assistants",
                params={"categoryId": "NONE"},
                headers=admin_headers,
            )

        body = response.json()
        ids = [item["id"] for item in body["content"]]
        assert assistant.id in ids
        assert categorized.id not in ids

    async def test_search_by_name(
        self,
        client: AsyncClient,
        session: AsyncSession,
        tenant: Tenant,
        admin_headers: dict[str, str],
        assistant: Assistant,
    ) -> None:
        """名前の部分一致検索ができること"""
        other = Assistant(
            tenant_id=tenant.id,
            type=AssistantType.SAAS_CHAT,
            name="ZZZ",
            include_history=False,
        )
        session.add(other)
        await session.commit()

        async with client as c:
            response = await c.get(
                "/api/admin/assistants",
                params={"search": assistant.name},
                headers=admin_headers,
            )

        assert response.status_code == 200
        body = response.json()
        ids = [item["id"] for item in body["content"]]
        assert assistant.id in ids
        assert other.id not in ids

    async def test_search_by_description_case_insensitive(
        self,
        client: AsyncClient,
        session: AsyncSession,
        tenant: Tenant,
        admin_headers: dict[str, str],
        assistant: Assistant,
    ) -> None:
        """説明の部分一致検索が大文字小文字を区別せずにできること"""
        described = Assistant(
            tenant_id=tenant.id,
            type=AssistantType.SAAS_CHAT,
            name="Described",
            description="Translation Helper",
            include_history=False,
        )
        session.add(described)
        await session.commit()

        async with client as c:
            response = await c.get(
                "/api/admin/assistants",
                params={"search": "translation"},
                headers=admin_headers,
            )

        assert response.status_code == 200
        body = response.json()
        ids = [item["id"] for item in body["content"]]
        assert described.id in ids
        assert assistant.id not in ids

    async def test_search_empty_returns_all(
        self,
        client: AsyncClient,
        session: AsyncSession,
        tenant: Tenant,
        admin_headers: dict[str, str],
        assistant: Assistant,
    ) -> None:
        """searchが空文字の場合は絞り込まれず全件取得できること"""
        other = Assistant(
            tenant_id=tenant.id,
            type=AssistantType.SAAS_CHAT,
            name="ZZZ",
            include_history=False,
        )
        session.add(other)
        await session.commit()

        async with client as c:
            response = await c.get(
                "/api/admin/assistants",
                params={"search": ""},
                headers=admin_headers,
            )

        assert response.status_code == 200
        body = response.json()
        ids = [item["id"] for item in body["content"]]
        assert assistant.id in ids
        assert other.id in ids

    async def test_legacy_q_param_is_ignored(
        self, client: AsyncClient, admin_headers: dict[str, str], assistant: Assistant
    ) -> None:
        """移植元に存在しない旧パラメータ名qでは絞り込まれないこと"""
        async with client as c:
            response = await c.get(
                "/api/admin/assistants",
                params={"q": "no-match-keyword"},
                headers=admin_headers,
            )

        assert response.status_code == 200
        body = response.json()
        ids = [item["id"] for item in body["content"]]
        assert assistant.id in ids

    async def test_sort_by_assistant_type_alias(
        self,
        client: AsyncClient,
        session: AsyncSession,
        tenant: Tenant,
        admin_headers: dict[str, str],
    ) -> None:
        """フロントエンド（secuaigent-client）が送信するsort=assistantTypeで種別ソートできること。

        SECUREを先に作成（updated_atが古い）、SAAS_CHATを後に作成（updated_atが新しい）することで、
        "assistantType"エイリアスが無視されupdatedAtへフォールバックした場合と、
        正しくtype昇順でソートされた場合とで結果順序が変わるようにする。
        """
        secure_assistant = Assistant(
            tenant_id=tenant.id,
            type=AssistantType.SECURE,
            name="SecureOne",
            include_history=False,
        )
        session.add(secure_assistant)
        await session.commit()

        chat_assistant = Assistant(
            tenant_id=tenant.id,
            type=AssistantType.SAAS_CHAT,
            name="ChatOne",
            include_history=False,
        )
        session.add(chat_assistant)
        await session.commit()

        async with client as c:
            response = await c.get(
                "/api/admin/assistants",
                params={"sort": "assistantType,asc"},
                headers=admin_headers,
            )

        assert response.status_code == 200
        body = response.json()
        types = [item["type"] for item in body["content"]]
        # SAAS_CHAT < SECURE（辞書順）なので、正しくtype昇順ならchat_assistantが先に来る
        assert types.index("SAAS_CHAT") < types.index("SECURE")


@pytest.mark.asyncio
class TestGetAssistantEndpoints:
    """GET /api/admin/assistants/endpoints/{type}"""

    async def test_secure_returns_local_server_only(
        self,
        client: AsyncClient,
        session: AsyncSession,
        tenant: Tenant,
        admin_headers: dict[str, str],
        tenant_endpoint: TenantEndpoint,
    ) -> None:
        """SECURE種別ではLOCAL_SERVERエンドポイントのみ返ること"""
        local_server = TenantEndpoint(
            tenant_id=tenant.id,
            type=EndpointType.LOCAL_SERVER,
            endpoint_name="Local",
            endpoint="http://localhost:8080",
            api_key="key",
        )
        session.add(local_server)
        await session.commit()

        async with client as c:
            response = await c.get(
                "/api/admin/assistants/endpoints/SECURE", headers=admin_headers
            )

        assert response.status_code == 200
        types = {e["type"] for e in response.json()}
        assert types == {"LOCAL_SERVER"}

    async def test_saas_chat_returns_chat_types_only(
        self,
        client: AsyncClient,
        admin_headers: dict[str, str],
        tenant_endpoint: TenantEndpoint,
    ) -> None:
        """SAAS_CHAT種別ではチャット系エンドポイントのみ返ること"""
        async with client as c:
            response = await c.get(
                "/api/admin/assistants/endpoints/SAAS_CHAT", headers=admin_headers
            )

        assert response.status_code == 200
        body = response.json()
        assert any(e["id"] == tenant_endpoint.id for e in body)
        assert all(e["type"].endswith("CHAT") for e in body)


@pytest.mark.asyncio
class TestGetAIModels:
    """GET /api/admin/assistants/AIModels"""

    async def test_returns_all_ai_models(
        self, client: AsyncClient, admin_headers: dict[str, str], ai_model: AIModel
    ) -> None:
        """AIモデル一覧が返ること"""
        async with client as c:
            response = await c.get(
                "/api/admin/assistants/AIModels", headers=admin_headers
            )

        assert response.status_code == 200
        body = response.json()
        assert body[0]["id"] == ai_model.id
        assert body[0]["name"] == "gpt-4o"


async def _add_assistants(
    session: AsyncSession, tenant_id: str, specs: list[tuple[str, AssistantType]]
) -> None:
    """(名前, 種別) の組からアシスタントを作成する。"""
    for name, assistant_type in specs:
        session.add(
            Assistant(
                tenant_id=tenant_id,
                type=assistant_type,
                name=name,
                include_history=False,
            )
        )
    await session.commit()


async def _list_admin_assistants(
    c: AsyncClient, headers: dict[str, str], sort: str | list[str]
) -> list[dict[str, Any]]:
    """管理者向けアシスタント一覧を取得して content を返す

    Parameters
    ----------
    c : AsyncClient
        テスト用の HTTP クライアント
    headers : dict[str, str]
        認証ヘッダー
    sort : str | list[str]
        sort クエリパラメータの値

    Returns
    -------
    list[dict]
        レスポンスの content（アシスタントの一覧）
    """
    response = await c.get(
        "/api/admin/assistants", params={"sort": sort}, headers=headers
    )
    assert response.status_code == 200
    return response.json()["content"]


async def _add_categorized_assistants(
    session: AsyncSession, tenant_id: str, user_id: UUID, group_id: str | None = None
) -> dict[str, str]:
    """カテゴリ順の並べ替え確認用に、カテゴリ付きのアシスタントを3件作る。

    カテゴリ名は ID の昇順に Charlie・Alpha・Bravo とする。a3 は Charlie と Alpha の2つを持ち、
    表示用の先頭カテゴリ（ID 昇順）は Charlie になる。

    Parameters
    ----------
    session : AsyncSession
        テスト用の DB セッション。
    tenant_id : str
        テナント ID。
    user_id : UUID
        カテゴリの更新ユーザー ID。
    group_id : str | None
        指定した場合、3件をこのグループに追加日時の順（a1, a2, a3）で所属させる。

    Returns
    -------
    dict[str, str]
        アシスタント名（a1〜a3）からアシスタント ID への対応。
    """
    category_names = {"cat-1": "Charlie", "cat-2": "Alpha", "cat-3": "Bravo"}
    for category_id, name in category_names.items():
        session.add(
            AssistantCategory(
                id=category_id,
                tenant_id=tenant_id,
                name=name,
                updated_user_id=user_id,
            )
        )
    categories_by_assistant = {
        "a1": ["cat-2"],
        "a2": ["cat-3"],
        "a3": ["cat-1", "cat-2"],
    }
    ids: dict[str, str] = {}
    for index, (name, category_ids) in enumerate(categories_by_assistant.items()):
        assistant = Assistant(
            tenant_id=tenant_id,
            type=AssistantType.SAAS_CHAT,
            name=name,
            include_history=False,
        )
        session.add(assistant)
        await session.flush()
        ids[name] = assistant.id
        for category_id in category_ids:
            session.add(
                AssistantCategoryMapping(
                    assistant_id=assistant.id,
                    category_id=category_id,
                    tenant_id=tenant_id,
                )
            )
        if group_id is not None:
            session.add(
                GroupAssistant(
                    group_id=group_id,
                    tenant_id=tenant_id,
                    assistant_id=assistant.id,
                    updated_at=datetime(2026, 1, 1 + index, tzinfo=timezone.utc),
                )
            )
    await session.commit()
    return ids


@pytest.mark.asyncio
class TestListAdminAssistantsSort:
    """GET /api/admin/assistants の並べ替え（Issue #225）"""

    async def test_sort_by_name_reverses_rows_with_same_name(
        self,
        client: AsyncClient,
        session: AsyncSession,
        tenant: Tenant,
        admin_headers: dict[str, str],
    ) -> None:
        """同名のアシスタントがいても昇順と降順で並びが完全に反転すること"""
        await _add_assistants(
            session, tenant.id, [("Same", AssistantType.SAAS_CHAT)] * 3
        )

        async with client as c:
            asc = await _list_admin_assistants(c, admin_headers, "name,asc")
            desc = await _list_admin_assistants(c, admin_headers, "name,desc")

        asc_ids = [a["id"] for a in asc]
        assert len(asc_ids) == 3
        assert [a["id"] for a in desc] == list(reversed(asc_ids))

    async def test_sort_by_category_uses_first_category_name(
        self,
        client: AsyncClient,
        session: AsyncSession,
        tenant: Tenant,
        admin_user: User,
        admin_headers: dict[str, str],
    ) -> None:
        """sort=category で先頭カテゴリ（ID昇順）の名前順になり、行が重複しないこと"""
        ids = await _add_categorized_assistants(session, tenant.id, admin_user.id)

        async with client as c:
            asc = await _list_admin_assistants(c, admin_headers, "category,asc")
            desc = await _list_admin_assistants(c, admin_headers, "category,desc")

        # Alpha(a1)・Bravo(a2)・Charlie(a3)。a3 は Alpha も持つが先頭は Charlie
        assert [a["id"] for a in asc] == [ids["a1"], ids["a2"], ids["a3"]]
        assert [a["id"] for a in desc] == [ids["a3"], ids["a2"], ids["a1"]]

    async def test_sort_direction_is_case_insensitive(
        self,
        client: AsyncClient,
        session: AsyncSession,
        tenant: Tenant,
        admin_headers: dict[str, str],
    ) -> None:
        """ソート方向を大文字(DESC)で指定しても降順になること"""
        await _add_assistants(
            session,
            tenant.id,
            [("alpha", AssistantType.SAAS_CHAT), ("zulu", AssistantType.SAAS_CHAT)],
        )

        async with client as c:
            content = await _list_admin_assistants(c, admin_headers, "name,DESC")

        assert [a["name"] for a in content] == ["zulu", "alpha"]

    async def test_multiple_sort_params_are_applied_in_order(
        self,
        client: AsyncClient,
        session: AsyncSession,
        tenant: Tenant,
        admin_headers: dict[str, str],
    ) -> None:
        """sortを複数指定すると、第1キーが同値の行を第2キーで並べること"""
        await _add_assistants(
            session,
            tenant.id,
            [
                ("Same", AssistantType.SAAS_CHAT),
                ("Same", AssistantType.SECURE),
                ("Other", AssistantType.SAAS_CHAT),
            ],
        )

        async with client as c:
            content = await _list_admin_assistants(
                c, admin_headers, ["name,asc", "assistantType,desc"]
            )

        assert [(a["name"], a["type"]) for a in content] == [
            ("Other", "SAAS_CHAT"),
            ("Same", "SECURE"),
            ("Same", "SAAS_CHAT"),
        ]
