import pytest
from httpx import ASGITransport, AsyncClient
from uuid import uuid4

from app.core.security import create_access_token
from app.main import app
from app.models.assistant import Assistant, AssistantType, GroupAssistant
from app.models.group import Group, GroupUser
from app.models.tenant import Tenant
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
async def assistant(session, tenant):
    """テスト用アシスタント"""
    a = Assistant(tenant_id=tenant.id, type=AssistantType.SAAS_CHAT, name="Assistant1", include_history=True)
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

    session.add(GroupUser(group_id=g.id, tenant_id=tenant.id, user_id=member_user.id, is_admin=False))
    session.add(GroupAssistant(group_id=g.id, tenant_id=tenant.id, assistant_id=assistant.id))
    await session.commit()
    return g


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
        self, client, session, tenant, member_headers, member_user, assistant, group_with_assistant
    ):
        """同じアシスタントが2つのグループ経由で見えても重複排除されること"""
        second_group = Group(tenant_id=tenant.id, name="Group2")
        session.add(second_group)
        await session.commit()
        await session.refresh(second_group)

        session.add(
            GroupUser(group_id=second_group.id, tenant_id=tenant.id, user_id=member_user.id, is_admin=False)
        )
        session.add(GroupAssistant(group_id=second_group.id, tenant_id=tenant.id, assistant_id=assistant.id))
        await session.commit()

        async with client as c:
            response = await c.get("/api/assistants", headers=member_headers)

        assert response.status_code == 200
        body = response.json()
        assert len(body) == 1
        assert sorted(body[0]["groups"]) == sorted([group_with_assistant.id, second_group.id])

    async def test_excludes_assistant_from_unrelated_group(
        self, client, session, tenant, member_headers, group_with_assistant
    ):
        """所属していないグループに紐づくアシスタントは含まれないこと"""
        other_group = Group(tenant_id=tenant.id, name="OtherGroup")
        session.add(other_group)
        await session.commit()
        await session.refresh(other_group)

        other_assistant = Assistant(
            tenant_id=tenant.id, type=AssistantType.SAAS_CHAT, name="Other", include_history=False
        )
        session.add(other_assistant)
        await session.commit()
        await session.refresh(other_assistant)

        session.add(
            GroupAssistant(group_id=other_group.id, tenant_id=tenant.id, assistant_id=other_assistant.id)
        )
        await session.commit()

        async with client as c:
            response = await c.get("/api/assistants", headers=member_headers)

        ids = [a["id"] for a in response.json()]
        assert other_assistant.id not in ids

    async def test_unauthenticated_returns_401(self, client, tenant):
        """未認証は401になること"""
        async with client as c:
            response = await c.get("/api/assistants", headers={"X-Tenant-ID": tenant.id})

        assert response.status_code == 401
