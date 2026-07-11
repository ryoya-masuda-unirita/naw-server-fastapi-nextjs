import pytest
from httpx import ASGITransport, AsyncClient
from uuid import uuid4

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


@pytest.fixture
async def tenant(session):
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
async def member_user(session, tenant):
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
async def unaffiliated_user(session, tenant):
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
async def group_admin_user(session, tenant):
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
async def assistant(session, tenant):
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
async def group_with_assistant(session, tenant, member_user, assistant):
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
async def managed_group(session, tenant, group_admin_user, assistant):
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
async def assistant_category(session, tenant, admin_user):
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
async def ai_model(session):
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
async def tenant_endpoint(session, tenant):
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
async def assistant_with_endpoint(session, tenant, assistant, tenant_endpoint):
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


def _headers(login_id, tenant_id):
    token = create_access_token(login_id, tenant_id)
    return {"Authorization": f"Bearer {token}", "X-Tenant-ID": tenant_id}


@pytest.fixture
def member_headers(member_user, tenant):
    return _headers(member_user.login_id, tenant.id)


@pytest.fixture
def unaffiliated_headers(unaffiliated_user, tenant):
    return _headers(unaffiliated_user.login_id, tenant.id)


@pytest.fixture
def admin_headers(admin_user, tenant):
    return _headers(admin_user.login_id, tenant.id)


@pytest.fixture
def group_admin_headers(group_admin_user, tenant):
    return _headers(group_admin_user.login_id, tenant.id)


@pytest.fixture
def client(override_get_session):
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
class TestGetAssistants:
    """GET /api/assistants"""

    async def test_returns_assistant_belonging_to_users_group(
        self, client, member_headers, group_with_assistant, assistant
    ):
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
        self, client, unaffiliated_headers, group_with_assistant
    ):
        """どのグループにも所属していない場合空配列が返ること"""
        async with client as c:
            response = await c.get("/api/assistants", headers=unaffiliated_headers)

        assert response.status_code == 200
        assert response.json() == []

    async def test_deduplicates_assistant_shared_by_two_groups(
        self,
        client,
        session,
        tenant,
        member_headers,
        member_user,
        assistant,
        group_with_assistant,
    ):
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
        self, client, session, tenant, member_headers, group_with_assistant
    ):
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

    async def test_unauthenticated_returns_401(self, client, tenant):
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
        client,
        member_headers,
        group_with_assistant,
        assistant_with_endpoint,
        tenant_endpoint,
    ):
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
        assert "label" not in endpoints[0]
        assert "apiKey" not in endpoints[0]

    async def test_returns_empty_endpoints_when_not_linked(
        self, client, member_headers, group_with_assistant
    ):
        """エンドポイントが紐づいていない場合は空配列が返ること（issue-26の既存挙動を維持）"""
        async with client as c:
            response = await c.get("/api/assistants", headers=member_headers)

        assert response.status_code == 200
        assert response.json()[0]["endpoints"] == []

    async def test_returns_multiple_endpoints(
        self,
        client,
        session,
        tenant,
        member_headers,
        group_with_assistant,
        assistant,
        tenant_endpoint,
    ):
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
        self, client, session, tenant, member_headers, group_with_assistant, assistant
    ):
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
        client,
        session,
        tenant,
        member_headers,
        group_with_assistant,
        assistant,
        assistant_category,
    ):
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


@pytest.mark.asyncio
class TestCreateAssistant:
    """POST /api/admin/assistants"""

    async def test_create_assistant_as_tenant_admin_succeeds(
        self, client, admin_headers, tenant_endpoint
    ):
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
        self, client, group_admin_headers, tenant_endpoint, managed_group
    ):
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
        self, client, member_headers, tenant_endpoint
    ):
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

    async def test_create_assistant_without_endpoints_returns_422(
        self, client, admin_headers
    ):
        """エンドポイントが1件もない場合422になること"""
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

        assert response.status_code == 422

    async def test_create_assistant_with_blank_name_returns_422(
        self, client, admin_headers, tenant_endpoint
    ):
        """名前が空白のみの場合422になること"""
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

        assert response.status_code == 422

    async def test_create_secure_assistant_with_non_local_server_endpoint_returns_400(
        self, client, admin_headers, tenant_endpoint
    ):
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
        self, client, session, tenant, admin_headers, tenant_endpoint
    ):
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
        client,
        admin_headers,
        tenant_endpoint,
        assistant_category,
        group_with_assistant,
    ):
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
        self, client, admin_headers, assistant, tenant_endpoint
    ):
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
        self, client, admin_headers, assistant, tenant_endpoint
    ):
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
        self, client, admin_headers, assistant, tenant_endpoint
    ):
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
        self, client, admin_headers, assistant, tenant_endpoint
    ):
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
        self, client, admin_headers, assistant, tenant_endpoint
    ):
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
        client,
        session,
        tenant,
        admin_headers,
        assistant,
        tenant_endpoint,
        assistant_category,
    ):
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
        self, client, admin_headers, tenant_endpoint
    ):
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
        client,
        session,
        admin_headers,
        tenant,
        member_user,
        assistant,
    ):
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
            response.json()["detail"]
            == "このアシスタントはルームのデフォルトアシスタントとして使用されているため削除できません。"
        )

    async def test_delete_assistant_succeeds_when_no_room_references_it(
        self, client, admin_headers, assistant
    ):
        """参照されていないアシスタントは削除できること"""
        async with client as c:
            response = await c.delete(
                f"/api/admin/assistants/{assistant.id}", headers=admin_headers
            )

        assert response.status_code == 204

    async def test_delete_assistant_keeps_messages_and_sets_assistant_id_null(
        self,
        client,
        session,
        admin_headers,
        tenant,
        member_user,
        assistant,
    ):
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

    async def test_delete_assistant_succeeds(self, client, admin_headers, assistant):
        """アシスタントを削除できること"""
        async with client as c:
            response = await c.delete(
                f"/api/admin/assistants/{assistant.id}", headers=admin_headers
            )

        assert response.status_code == 204

    async def test_delete_not_found_returns_404(self, client, admin_headers):
        """存在しないアシスタントIDの場合404になること"""
        async with client as c:
            response = await c.delete(
                "/api/admin/assistants/does-not-exist", headers=admin_headers
            )

        assert response.status_code == 404


@pytest.mark.asyncio
class TestListAdminAssistants:
    """GET /api/admin/assistants"""

    async def test_tenant_admin_sees_all_assistants(
        self, client, session, tenant, admin_headers, assistant
    ):
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
        client,
        session,
        tenant,
        group_admin_headers,
        managed_group,
        assistant,
    ):
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

    async def test_normal_user_returns_403(self, client, member_headers):
        """管理者権限もグループ管理者権限もない一般ユーザーは403になること"""
        async with client as c:
            response = await c.get("/api/admin/assistants", headers=member_headers)

        assert response.status_code == 403

    async def test_filters_by_category_id_none(
        self,
        client,
        session,
        tenant,
        admin_headers,
        assistant,
        assistant_category,
    ):
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
        self, client, session, tenant, admin_headers, assistant
    ):
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
                params={"q": assistant.name},
                headers=admin_headers,
            )

        body = response.json()
        ids = [item["id"] for item in body["content"]]
        assert assistant.id in ids
        assert other.id not in ids

    async def test_sort_by_assistant_type_alias(
        self, client, session, tenant, admin_headers
    ):
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
        self, client, session, tenant, admin_headers, tenant_endpoint
    ):
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
        self, client, admin_headers, tenant_endpoint
    ):
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

    async def test_returns_all_ai_models(self, client, admin_headers, ai_model):
        """AIモデル一覧が返ること"""
        async with client as c:
            response = await c.get(
                "/api/admin/assistants/AIModels", headers=admin_headers
            )

        assert response.status_code == 200
        body = response.json()
        assert body[0]["id"] == ai_model.id
        assert body[0]["name"] == "gpt-4o"
