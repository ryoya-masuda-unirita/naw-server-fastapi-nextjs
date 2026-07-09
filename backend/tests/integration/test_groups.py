from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.security import create_access_token
from app.main import app
from app.models.assistant import (
    Assistant,
    AssistantCategoryMapping,
    AssistantType,
    GroupAssistant,
)
from app.models.assistant_category import AssistantCategory
from app.models.group import Group, GroupUser
from app.models.prompt_template import GroupPromptTemplate, PromptTemplate
from app.models.tenant import Tenant
from app.models.user import User, UserRole


@pytest.fixture
async def tenant(session):
    """テスト用テナント"""
    t = Tenant(
        id="tenant-groups-test",
        name="Groups Test Tenant",
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
async def other_user(session, tenant):
    """テスト用一般ユーザー（未所属想定）"""
    u = User(
        id=uuid4(),
        tenant_id=tenant.id,
        login_id="other-test",
        name="Other",
        role=UserRole.USER,
        is_required_password_reset=False,
    )
    session.add(u)
    await session.commit()
    await session.refresh(u)
    return u


@pytest.fixture
async def group(session, tenant):
    """テスト用グループ"""
    g = Group(tenant_id=tenant.id, name="Test Group")
    session.add(g)
    await session.commit()
    await session.refresh(g)
    return g


@pytest.fixture
async def group_with_admin_member(session, tenant, group, member_user):
    """member_userをグループ内管理者として所属させたグループ"""
    gu = GroupUser(
        group_id=group.id, tenant_id=tenant.id, user_id=member_user.id, is_admin=True
    )
    session.add(gu)
    await session.commit()
    return group


def _headers(login_id, tenant_id):
    token = create_access_token(login_id, tenant_id)
    return {"Authorization": f"Bearer {token}", "X-Tenant-ID": tenant_id}


@pytest.fixture
def admin_headers(admin_user, tenant):
    return _headers(admin_user.login_id, tenant.id)


@pytest.fixture
def member_headers(member_user, tenant):
    return _headers(member_user.login_id, tenant.id)


@pytest.fixture
def other_headers(other_user, tenant):
    return _headers(other_user.login_id, tenant.id)


@pytest.fixture
def client(override_get_session):
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
class TestGetGroups:
    """GET /api/groups"""

    async def test_returns_all_groups_when_not_belonged(
        self, client, admin_headers, group
    ):
        """isBelonged未指定の場合テナント内の全グループが返ること"""
        async with client as c:
            response = await c.get("/api/groups", headers=admin_headers)

        assert response.status_code == 200
        ids = [g["id"] for g in response.json()]
        assert group.id in ids

    async def test_returns_only_belonging_groups(
        self, client, member_headers, group_with_admin_member, tenant, session
    ):
        """isBelonged=trueの場合、所属するグループのみ返ること"""
        other_group = Group(tenant_id=tenant.id, name="Not Belonging")
        session.add(other_group)
        await session.commit()

        async with client as c:
            response = await c.get(
                "/api/groups", params={"isBelonged": "true"}, headers=member_headers
            )

        assert response.status_code == 200
        ids = [g["id"] for g in response.json()]
        assert group_with_admin_member.id in ids
        assert other_group.id not in ids


@pytest.mark.asyncio
class TestListAdminGroups:
    """GET /api/admin/groups"""

    async def test_tenant_admin_sees_all_groups(self, client, admin_headers, group):
        """テナント管理者は全グループを取得できること"""
        async with client as c:
            response = await c.get("/api/admin/groups", headers=admin_headers)

        assert response.status_code == 200
        body = response.json()
        assert "data" in body and "total" in body and "page" in body and "size" in body
        assert any(g["id"] == group.id for g in body["data"])

    async def test_group_admin_sees_only_managed_groups(
        self, client, member_headers, group_with_admin_member, tenant, session
    ):
        """グループ管理者は自分が管理するグループのみ取得できること"""
        other_group = Group(tenant_id=tenant.id, name="Not Managed")
        session.add(other_group)
        await session.commit()

        async with client as c:
            response = await c.get("/api/admin/groups", headers=member_headers)

        assert response.status_code == 200
        ids = [g["id"] for g in response.json()["data"]]
        assert group_with_admin_member.id in ids
        assert other_group.id not in ids

    async def test_non_group_admin_sees_no_groups(self, client, other_headers, group):
        """いずれのグループも管理していない一般ユーザーは0件になること（403にはならない）"""
        async with client as c:
            response = await c.get("/api/admin/groups", headers=other_headers)

        assert response.status_code == 200
        assert response.json()["data"] == []


@pytest.mark.asyncio
class TestAllGroups:
    """GET /api/admin/all-groups"""

    async def test_tenant_admin_can_access(self, client, admin_headers, group):
        """テナント管理者は全グループ一覧を取得できること"""
        async with client as c:
            response = await c.get("/api/admin/all-groups", headers=admin_headers)

        assert response.status_code == 200

    async def test_group_admin_gets_403(
        self, client, member_headers, group_with_admin_member
    ):
        """グループ管理者（テナント管理者でない）は403になること"""
        async with client as c:
            response = await c.get("/api/admin/all-groups", headers=member_headers)

        assert response.status_code == 403


@pytest.mark.asyncio
class TestGroupCrud:
    """POST/GET/PATCH/DELETE /api/admin/groups/{id}"""

    async def test_tenant_admin_creates_group(self, client, admin_headers):
        """テナント管理者はグループを作成できること"""
        async with client as c:
            response = await c.post(
                "/api/admin/groups", json={"name": "New Group"}, headers=admin_headers
            )

        assert response.status_code == 200
        assert response.json()["name"] == "New Group"

    async def test_group_admin_cannot_create_group(self, client, member_headers):
        """グループ管理者はグループを作成できないこと"""
        async with client as c:
            response = await c.post(
                "/api/admin/groups", json={"name": "New Group"}, headers=member_headers
            )

        assert response.status_code == 403

    async def test_get_nonexistent_group_returns_404(self, client, admin_headers):
        """存在しないグループの取得は404になること"""
        async with client as c:
            response = await c.get(
                "/api/admin/groups/nonexistent", headers=admin_headers
            )

        assert response.status_code == 404

    async def test_group_admin_updates_own_group(
        self, client, member_headers, group_with_admin_member
    ):
        """グループ管理者は自分の管理グループを更新できること"""
        async with client as c:
            response = await c.patch(
                f"/api/admin/groups/{group_with_admin_member.id}",
                json={"name": "Renamed"},
                headers=member_headers,
            )

        assert response.status_code == 200
        assert response.json()["name"] == "Renamed"

    async def test_unrelated_user_cannot_update_group(
        self, client, other_headers, group
    ):
        """無関係な一般ユーザーはグループを更新できないこと"""
        async with client as c:
            response = await c.patch(
                f"/api/admin/groups/{group.id}",
                json={"name": "Renamed"},
                headers=other_headers,
            )

        assert response.status_code == 403

    async def test_tenant_admin_deletes_group(self, client, admin_headers, group):
        """テナント管理者はグループを削除できること"""
        async with client as c:
            response = await c.delete(
                f"/api/admin/groups/{group.id}", headers=admin_headers
            )

        assert response.status_code == 204

    async def test_group_admin_cannot_delete_group(
        self, client, member_headers, group_with_admin_member
    ):
        """グループ管理者はグループを削除できないこと"""
        async with client as c:
            response = await c.delete(
                f"/api/admin/groups/{group_with_admin_member.id}",
                headers=member_headers,
            )

        assert response.status_code == 403


@pytest.mark.asyncio
class TestGroupUsers:
    """GET/POST/DELETE/PATCH /api/admin/groups/{groupId}/users"""

    async def test_get_group_users_returns_spring_page_shape(
        self, client, admin_headers, group_with_admin_member
    ):
        """所属ユーザー一覧がcontent/totalElements/number/size形式で返ること"""
        async with client as c:
            response = await c.get(
                f"/api/admin/groups/{group_with_admin_member.id}/users",
                headers=admin_headers,
            )

        assert response.status_code == 200
        body = response.json()
        assert {"content", "totalElements", "number", "size"}.issubset(body.keys())
        assert len(body["content"]) == 1
        assert body["content"][0]["groupAdmin"] is True

    async def test_add_user_to_group(self, client, admin_headers, group, other_user):
        """ユーザーをグループに追加できること"""
        async with client as c:
            response = await c.post(
                f"/api/admin/groups/{group.id}/users",
                json={"userIds": [str(other_user.id)]},
                headers=admin_headers,
            )

        assert response.status_code == 204

    async def test_add_already_member_is_idempotent(
        self, client, admin_headers, group_with_admin_member, member_user
    ):
        """既に所属済みのユーザーを追加してもエラーにならないこと"""
        async with client as c:
            response = await c.post(
                f"/api/admin/groups/{group_with_admin_member.id}/users",
                json={"userIds": [str(member_user.id)]},
                headers=admin_headers,
            )

        assert response.status_code == 204

    async def test_add_nonexistent_user_returns_404(self, client, admin_headers, group):
        """存在しないユーザーIDの追加は404になること"""
        async with client as c:
            response = await c.post(
                f"/api/admin/groups/{group.id}/users",
                json={"userIds": [str(uuid4())]},
                headers=admin_headers,
            )

        assert response.status_code == 404

    async def test_add_malformed_user_id_returns_404(
        self, client, admin_headers, group
    ):
        """UUID形式でないユーザーIDの追加は404になること（500にならない）"""
        async with client as c:
            response = await c.post(
                f"/api/admin/groups/{group.id}/users",
                json={"userIds": ["not-a-uuid"]},
                headers=admin_headers,
            )

        assert response.status_code == 404

    async def test_remove_malformed_user_id_returns_404(
        self, client, admin_headers, group
    ):
        """UUID形式でないユーザーIDの削除は404になること（500にならない）"""
        async with client as c:
            response = await c.delete(
                f"/api/admin/groups/{group.id}/users/not-a-uuid", headers=admin_headers
            )

        assert response.status_code == 404

    async def test_update_role_malformed_user_id_returns_404(
        self, client, admin_headers, group
    ):
        """UUID形式でないユーザーIDのロール更新は404になること（500にならない）"""
        async with client as c:
            response = await c.patch(
                f"/api/admin/groups/{group.id}/users/not-a-uuid",
                json={"groupAdmin": True},
                headers=admin_headers,
            )

        assert response.status_code == 404

    async def test_search_with_percent_is_treated_as_literal(
        self, client, admin_headers, group_with_admin_member, member_user
    ):
        """検索文字列の%が特殊文字として展開されずリテラル扱いされること"""
        async with client as c:
            response = await c.get(
                f"/api/admin/groups/{group_with_admin_member.id}/users",
                params={"searchText": "%"},
                headers=admin_headers,
            )

        assert response.status_code == 200
        assert response.json()["totalElements"] == 0

    async def test_remove_user_from_group(
        self, client, admin_headers, group_with_admin_member, member_user
    ):
        """ユーザーをグループから削除できること"""
        async with client as c:
            response = await c.delete(
                f"/api/admin/groups/{group_with_admin_member.id}/users/{member_user.id}",
                headers=admin_headers,
            )

        assert response.status_code == 204

    async def test_remove_non_member_is_idempotent(
        self, client, admin_headers, group, other_user
    ):
        """既に非所属のユーザーを削除してもエラーにならないこと"""
        async with client as c:
            response = await c.delete(
                f"/api/admin/groups/{group.id}/users/{other_user.id}",
                headers=admin_headers,
            )

        assert response.status_code == 204

    async def test_update_group_user_role(
        self, client, admin_headers, group_with_admin_member, member_user
    ):
        """グループ内管理者フラグを更新できること"""
        async with client as c:
            response = await c.patch(
                f"/api/admin/groups/{group_with_admin_member.id}/users/{member_user.id}",
                json={"groupAdmin": False},
                headers=admin_headers,
            )

        assert response.status_code == 204

    async def test_group_admin_cannot_remove_self(
        self, client, member_headers, group_with_admin_member, member_user
    ):
        """グループ管理者は自分自身をグループから削除できないこと"""
        async with client as c:
            response = await c.delete(
                f"/api/admin/groups/{group_with_admin_member.id}/users/{member_user.id}",
                headers=member_headers,
            )

        assert response.status_code == 403

    async def test_group_admin_cannot_change_own_role(
        self, client, member_headers, group_with_admin_member, member_user
    ):
        """グループ管理者は自分自身のロールを変更できないこと"""
        async with client as c:
            response = await c.patch(
                f"/api/admin/groups/{group_with_admin_member.id}/users/{member_user.id}",
                json={"groupAdmin": False},
                headers=member_headers,
            )

        assert response.status_code == 403

    async def test_tenant_admin_can_remove_self_from_group(
        self, client, admin_headers, admin_user, tenant, session, group
    ):
        """テナント管理者は自分自身をグループから削除できること（自己操作禁止の対象外）"""
        gu = GroupUser(
            group_id=group.id, tenant_id=tenant.id, user_id=admin_user.id, is_admin=True
        )
        session.add(gu)
        await session.commit()

        async with client as c:
            response = await c.delete(
                f"/api/admin/groups/{group.id}/users/{admin_user.id}",
                headers=admin_headers,
            )

        assert response.status_code == 204


@pytest.fixture
async def prompt_template(session, tenant):
    """テスト用プロンプトテンプレート"""
    t = PromptTemplate(
        tenant_id=tenant.id,
        name="Test Template",
        description="A test template",
        system_prompt="You are a helpful assistant.",
    )
    session.add(t)
    await session.commit()
    await session.refresh(t)
    return t


@pytest.fixture
async def other_prompt_template(session, tenant):
    """テスト用プロンプトテンプレート（未紐付け想定）"""
    t = PromptTemplate(
        tenant_id=tenant.id,
        name="Other Template",
        description="Another template",
        system_prompt="You are another assistant.",
    )
    session.add(t)
    await session.commit()
    await session.refresh(t)
    return t


@pytest.fixture
async def group_with_prompt_template(session, tenant, group, prompt_template):
    """prompt_templateを紐付けたグループ"""
    gpt = GroupPromptTemplate(
        group_id=group.id, tenant_id=tenant.id, prompt_template_id=prompt_template.id
    )
    session.add(gpt)
    await session.commit()
    return group


@pytest.mark.asyncio
class TestGroupPromptTemplates:
    """GET/POST/DELETE /api/admin/groups/{groupId}/prompt-templates"""

    async def test_get_group_prompt_templates_returns_spring_page_shape(
        self, client, admin_headers, group_with_prompt_template, prompt_template
    ):
        """所属テンプレート一覧がcontent/totalElements/number/size形式で返り、addedAtを含むこと"""
        async with client as c:
            response = await c.get(
                f"/api/admin/groups/{group_with_prompt_template.id}/prompt-templates",
                headers=admin_headers,
            )

        assert response.status_code == 200
        body = response.json()
        assert {"content", "totalElements", "number", "size"}.issubset(body.keys())
        assert len(body["content"]) == 1
        assert body["content"][0]["id"] == prompt_template.id
        assert body["content"][0]["addedAt"] is not None

    async def test_search_filters_by_name(
        self,
        client,
        admin_headers,
        group_with_prompt_template,
        tenant,
        session,
        group,
        other_prompt_template,
    ):
        """search指定時、名前・説明でフィルタされること"""
        gpt = GroupPromptTemplate(
            group_id=group.id,
            tenant_id=tenant.id,
            prompt_template_id=other_prompt_template.id,
        )
        session.add(gpt)
        await session.commit()

        async with client as c:
            response = await c.get(
                f"/api/admin/groups/{group.id}/prompt-templates",
                params={"search": "Other"},
                headers=admin_headers,
            )

        assert response.status_code == 200
        body = response.json()
        assert body["totalElements"] == 1
        assert body["content"][0]["id"] == other_prompt_template.id

    async def test_add_template_to_group(
        self, client, admin_headers, group, prompt_template
    ):
        """テンプレートをグループに追加できること"""
        async with client as c:
            response = await c.post(
                f"/api/admin/groups/{group.id}/prompt-templates",
                json={"templateIds": [prompt_template.id]},
                headers=admin_headers,
            )

        assert response.status_code == 204

    async def test_add_already_linked_is_idempotent(
        self,
        client,
        admin_headers,
        group_with_prompt_template,
        prompt_template,
    ):
        """既に紐付け済みのテンプレートを追加してもエラーにならないこと"""
        async with client as c:
            response = await c.post(
                f"/api/admin/groups/{group_with_prompt_template.id}/prompt-templates",
                json={"templateIds": [prompt_template.id]},
                headers=admin_headers,
            )

        assert response.status_code == 204

    async def test_add_empty_template_ids_returns_400(
        self, client, admin_headers, group
    ):
        """templateIdsが空の場合400になること"""
        async with client as c:
            response = await c.post(
                f"/api/admin/groups/{group.id}/prompt-templates",
                json={"templateIds": []},
                headers=admin_headers,
            )

        assert response.status_code == 400

    async def test_add_nonexistent_template_returns_404(
        self, client, admin_headers, group
    ):
        """存在しないテンプレートIDの追加は404になること"""
        async with client as c:
            response = await c.post(
                f"/api/admin/groups/{group.id}/prompt-templates",
                json={"templateIds": ["nonexistent"]},
                headers=admin_headers,
            )

        assert response.status_code == 404

    async def test_remove_template_from_group(
        self, client, admin_headers, group_with_prompt_template, prompt_template
    ):
        """テンプレートをグループから削除できること"""
        async with client as c:
            response = await c.delete(
                f"/api/admin/groups/{group_with_prompt_template.id}"
                f"/prompt-templates/{prompt_template.id}",
                headers=admin_headers,
            )

        assert response.status_code == 204

    async def test_remove_non_linked_is_idempotent(
        self, client, admin_headers, group, prompt_template
    ):
        """既に非紐付けのテンプレートを削除してもエラーにならないこと"""
        async with client as c:
            response = await c.delete(
                f"/api/admin/groups/{group.id}/prompt-templates/{prompt_template.id}",
                headers=admin_headers,
            )

        assert response.status_code == 204

    async def test_remove_nonexistent_template_returns_404(
        self, client, admin_headers, group
    ):
        """存在しないテンプレートIDの削除は404になること"""
        async with client as c:
            response = await c.delete(
                f"/api/admin/groups/{group.id}/prompt-templates/nonexistent",
                headers=admin_headers,
            )

        assert response.status_code == 404

    async def test_group_admin_can_manage_own_group_templates(
        self, client, member_headers, group_with_admin_member, prompt_template
    ):
        """グループ管理者は自分の管理グループのテンプレートを追加できること"""
        async with client as c:
            response = await c.post(
                f"/api/admin/groups/{group_with_admin_member.id}/prompt-templates",
                json={"templateIds": [prompt_template.id]},
                headers=member_headers,
            )

        assert response.status_code == 204

    async def test_unrelated_user_cannot_manage_templates(
        self, client, other_headers, group, prompt_template
    ):
        """無関係な一般ユーザーはテンプレートを追加できないこと"""
        async with client as c:
            response = await c.post(
                f"/api/admin/groups/{group.id}/prompt-templates",
                json={"templateIds": [prompt_template.id]},
                headers=other_headers,
            )

        assert response.status_code == 403


@pytest.fixture
async def assistant(session, tenant):
    """テスト用アシスタント"""
    a = Assistant(
        tenant_id=tenant.id,
        type=AssistantType.SAAS_CHAT,
        name="Test Assistant",
        description="A test assistant",
        include_history=False,
        icon_color="#112233",
    )
    session.add(a)
    await session.commit()
    await session.refresh(a)
    return a


@pytest.fixture
async def other_assistant(session, tenant):
    """テスト用アシスタント（未紐付け想定）"""
    a = Assistant(
        tenant_id=tenant.id,
        type=AssistantType.SAAS_CHAT,
        name="Other Assistant",
        description="Another assistant",
        include_history=True,
        icon_color="#445566",
    )
    session.add(a)
    await session.commit()
    await session.refresh(a)
    return a


@pytest.fixture
async def secure_assistant(session, tenant):
    """種別フィルタ用SECUREアシスタント"""
    a = Assistant(
        tenant_id=tenant.id,
        type=AssistantType.SECURE,
        name="Secure Assistant",
        description="Secure assistant",
        include_history=False,
        icon_color="#778899",
    )
    session.add(a)
    await session.commit()
    await session.refresh(a)
    return a


@pytest.fixture
async def assistant_category(session, tenant, admin_user):
    """テスト用アシスタントカテゴリ"""
    c = AssistantCategory(
        tenant_id=tenant.id,
        name="Category A",
        description="Category for assistants",
        updated_user_id=admin_user.id,
    )
    session.add(c)
    await session.commit()
    await session.refresh(c)
    return c


@pytest.fixture
async def categorized_assistant(session, tenant, assistant_category):
    """カテゴリを持つアシスタント"""
    a = Assistant(
        tenant_id=tenant.id,
        type=AssistantType.SAAS_RAG,
        name="Categorized Assistant",
        description="Assistant with category",
        include_history=True,
        icon_color="#AABBCC",
    )
    session.add(a)
    await session.flush()
    session.add(
        AssistantCategoryMapping(
            assistant_id=a.id,
            category_id=assistant_category.id,
            tenant_id=tenant.id,
        )
    )
    await session.commit()
    await session.refresh(a)
    return a


@pytest.fixture
async def group_with_assistant(session, tenant, group, assistant):
    """assistantを紐付けたグループ"""
    ga = GroupAssistant(
        group_id=group.id, tenant_id=tenant.id, assistant_id=assistant.id
    )
    session.add(ga)
    await session.commit()
    return group


@pytest.mark.asyncio
class TestGroupAssistants:
    """GET/POST/DELETE /api/admin/groups/{groupId}/assistants"""

    async def test_get_group_assistants_returns_spring_page_shape(
        self, client, admin_headers, group_with_assistant, assistant
    ):
        """所属アシスタント一覧がcontent/totalElements/number/size形式で返り、addedAtを含むこと"""
        async with client as c:
            response = await c.get(
                f"/api/admin/groups/{group_with_assistant.id}/assistants",
                headers=admin_headers,
            )

        assert response.status_code == 200
        body = response.json()
        assert {"content", "totalElements", "number", "size"}.issubset(body.keys())
        assert len(body["content"]) == 1
        assert body["content"][0]["id"] == assistant.id
        assert body["content"][0]["addedAt"] is not None

    async def test_search_filters_by_name_or_description(
        self,
        client,
        admin_headers,
        group,
        tenant,
        session,
        assistant,
        other_assistant,
    ):
        """search指定時、名前・説明でフィルタされること"""
        session.add(
            GroupAssistant(
                group_id=group.id, tenant_id=tenant.id, assistant_id=assistant.id
            )
        )
        session.add(
            GroupAssistant(
                group_id=group.id, tenant_id=tenant.id, assistant_id=other_assistant.id
            )
        )
        await session.commit()

        async with client as c:
            response = await c.get(
                f"/api/admin/groups/{group.id}/assistants",
                params={"search": "Other"},
                headers=admin_headers,
            )

        assert response.status_code == 200
        body = response.json()
        assert body["totalElements"] == 1
        assert body["content"][0]["id"] == other_assistant.id

    async def test_type_filter_returns_matching_assistants(
        self,
        client,
        admin_headers,
        group,
        tenant,
        session,
        assistant,
        secure_assistant,
    ):
        """type指定時、指定種別のアシスタントのみ返ること"""
        session.add(
            GroupAssistant(
                group_id=group.id, tenant_id=tenant.id, assistant_id=assistant.id
            )
        )
        session.add(
            GroupAssistant(
                group_id=group.id,
                tenant_id=tenant.id,
                assistant_id=secure_assistant.id,
            )
        )
        await session.commit()

        async with client as c:
            response = await c.get(
                f"/api/admin/groups/{group.id}/assistants",
                params={"type": "SECURE"},
                headers=admin_headers,
            )

        assert response.status_code == 200
        body = response.json()
        assert body["totalElements"] == 1
        assert body["content"][0]["id"] == secure_assistant.id

    async def test_category_none_filter_returns_uncategorized_assistants(
        self,
        client,
        admin_headers,
        group,
        tenant,
        session,
        assistant,
        categorized_assistant,
    ):
        """categoryId=NONE指定時、カテゴリ未設定のアシスタントのみ返ること"""
        session.add(
            GroupAssistant(
                group_id=group.id, tenant_id=tenant.id, assistant_id=assistant.id
            )
        )
        session.add(
            GroupAssistant(
                group_id=group.id,
                tenant_id=tenant.id,
                assistant_id=categorized_assistant.id,
            )
        )
        await session.commit()

        async with client as c:
            response = await c.get(
                f"/api/admin/groups/{group.id}/assistants",
                params={"categoryId": "NONE"},
                headers=admin_headers,
            )

        assert response.status_code == 200
        body = response.json()
        assert body["totalElements"] == 1
        assert body["content"][0]["id"] == assistant.id

    async def test_add_assistant_to_group(
        self, client, admin_headers, group, assistant
    ):
        """アシスタントをグループに追加できること"""
        async with client as c:
            response = await c.post(
                f"/api/admin/groups/{group.id}/assistants",
                json={"assistantIds": [assistant.id]},
                headers=admin_headers,
            )

        assert response.status_code == 204

    async def test_add_already_linked_is_idempotent(
        self, client, admin_headers, group_with_assistant, assistant
    ):
        """既に紐付け済みのアシスタントを追加してもエラーにならないこと"""
        async with client as c:
            response = await c.post(
                f"/api/admin/groups/{group_with_assistant.id}/assistants",
                json={"assistantIds": [assistant.id]},
                headers=admin_headers,
            )

        assert response.status_code == 204

    async def test_add_empty_assistant_ids_returns_400(
        self, client, admin_headers, group
    ):
        """assistantIdsが空の場合400になること"""
        async with client as c:
            response = await c.post(
                f"/api/admin/groups/{group.id}/assistants",
                json={"assistantIds": []},
                headers=admin_headers,
            )

        assert response.status_code == 400

    async def test_add_nonexistent_assistant_returns_404(
        self, client, admin_headers, group
    ):
        """存在しないアシスタントIDの追加は404になること"""
        async with client as c:
            response = await c.post(
                f"/api/admin/groups/{group.id}/assistants",
                json={"assistantIds": ["nonexistent"]},
                headers=admin_headers,
            )

        assert response.status_code == 404

    async def test_remove_assistant_from_group(
        self, client, admin_headers, group_with_assistant, assistant
    ):
        """アシスタントをグループから削除できること"""
        async with client as c:
            response = await c.delete(
                f"/api/admin/groups/{group_with_assistant.id}/assistants/{assistant.id}",
                headers=admin_headers,
            )

        assert response.status_code == 204

    async def test_remove_non_linked_is_idempotent(
        self, client, admin_headers, group, assistant
    ):
        """既に非紐付けのアシスタントを削除してもエラーにならないこと"""
        async with client as c:
            response = await c.delete(
                f"/api/admin/groups/{group.id}/assistants/{assistant.id}",
                headers=admin_headers,
            )

        assert response.status_code == 204

    async def test_remove_nonexistent_assistant_returns_404(
        self, client, admin_headers, group
    ):
        """存在しないアシスタントIDの削除は404になること"""
        async with client as c:
            response = await c.delete(
                f"/api/admin/groups/{group.id}/assistants/nonexistent",
                headers=admin_headers,
            )

        assert response.status_code == 404

    async def test_group_admin_can_manage_own_group_assistants(
        self, client, member_headers, group_with_admin_member, assistant
    ):
        """グループ管理者は自分の管理グループのアシスタントを追加できること"""
        async with client as c:
            response = await c.post(
                f"/api/admin/groups/{group_with_admin_member.id}/assistants",
                json={"assistantIds": [assistant.id]},
                headers=member_headers,
            )

        assert response.status_code == 204

    async def test_unrelated_user_cannot_manage_assistants(
        self, client, other_headers, group, assistant
    ):
        """無関係な一般ユーザーはアシスタントを追加できないこと"""
        async with client as c:
            response = await c.post(
                f"/api/admin/groups/{group.id}/assistants",
                json={"assistantIds": [assistant.id]},
                headers=other_headers,
            )

        assert response.status_code == 403
