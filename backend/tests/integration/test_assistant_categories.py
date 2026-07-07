from uuid import uuid4

import pytest

from app.core.security import create_access_token
from app.models.assistant_category import AssistantCategory
from app.models.tenant import Tenant
from app.models.user import User, UserRole


@pytest.fixture
async def tenant(session):
    """テスト用テナント"""
    t = Tenant(
        id="tenant-assistant-categories-test",
        name="Assistant Categories Test Tenant",
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
    """他テナント（テナント分離確認用）"""
    t = Tenant(
        id="tenant-assistant-categories-other",
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
async def member_user(session, tenant):
    """テスト用一般ユーザー"""
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
async def category(session, tenant, admin_user):
    """テスト用アシスタントカテゴリ"""
    c = AssistantCategory(
        tenant_id=tenant.id,
        name="orig",
        description="orig desc",
        updated_user_id=admin_user.id,
    )
    session.add(c)
    await session.commit()
    await session.refresh(c)
    return c


@pytest.fixture
async def second_category(session, tenant, admin_user):
    """同一テナント内の別名アシスタントカテゴリ（重複名チェックの確認用）"""
    c = AssistantCategory(
        tenant_id=tenant.id,
        name="second",
        description="second desc",
        updated_user_id=admin_user.id,
    )
    session.add(c)
    await session.commit()
    await session.refresh(c)
    return c


@pytest.fixture
async def other_tenant_category(session, other_tenant, admin_user):
    """他テナントのアシスタントカテゴリ"""
    c = AssistantCategory(
        tenant_id=other_tenant.id,
        name="other",
        description="other desc",
        updated_user_id=admin_user.id,
    )
    session.add(c)
    await session.commit()
    await session.refresh(c)
    return c


def _headers(login_id, tenant_id):
    token = create_access_token(login_id, tenant_id)
    return {"Authorization": f"Bearer {token}", "X-Tenant-ID": tenant_id}


@pytest.fixture
def admin_headers(admin_user, tenant):
    return _headers(admin_user.login_id, tenant.id)


@pytest.fixture
def member_headers(member_user, tenant):
    return _headers(member_user.login_id, tenant.id)


class TestCreateAssistantCategory:
    """POST /api/admin/assistant-categories"""

    async def test_create_assistant_category(self, client, admin_headers):
        """正しいリクエストで作成でき、DBにレコードが作成されること"""
        async with client as c:
            response = await c.post(
                "/api/admin/assistant-categories",
                json={"name": "New Category", "description": "desc"},
                headers=admin_headers,
            )

        assert response.status_code == 201
        body = response.json()
        assert body["name"] == "New Category"
        assert body["description"] == "desc"
        assert "id" in body

    async def test_create_with_blank_name_returns_422(self, client, admin_headers):
        """名前が空白のみだと422になり作成されないこと"""
        async with client as c:
            response = await c.post(
                "/api/admin/assistant-categories",
                json={"name": "   ", "description": "desc"},
                headers=admin_headers,
            )

        assert response.status_code == 422

    async def test_create_with_name_17_chars_returns_422(self, client, admin_headers):
        """名前が17文字だと422になり作成されないこと"""
        async with client as c:
            response = await c.post(
                "/api/admin/assistant-categories",
                json={"name": "a" * 17, "description": None},
                headers=admin_headers,
            )

        assert response.status_code == 422

    async def test_create_with_description_256_chars_returns_422(
        self, client, admin_headers
    ):
        """説明が256文字だと422になり作成されないこと"""
        async with client as c:
            response = await c.post(
                "/api/admin/assistant-categories",
                json={"name": "valid", "description": "d" * 256},
                headers=admin_headers,
            )

        assert response.status_code == 422

    async def test_create_as_non_admin_returns_403(self, client, member_headers):
        """テナント管理者以外は作成できないこと"""
        async with client as c:
            response = await c.post(
                "/api/admin/assistant-categories",
                json={"name": "New Category", "description": None},
                headers=member_headers,
            )

        assert response.status_code == 403

    async def test_create_with_duplicate_name_returns_400(
        self, client, admin_headers, category
    ):
        """同一テナント内に同名のカテゴリが既に存在する場合400になり作成されないこと"""
        async with client as c:
            response = await c.post(
                "/api/admin/assistant-categories",
                json={"name": category.name, "description": "別の説明"},
                headers=admin_headers,
            )

        assert response.status_code == 400


class TestListAssistantCategories:
    """GET /api/admin/assistant-categories"""

    async def test_list_assistant_categories(
        self, client, admin_headers, category, other_tenant_category
    ):
        """自テナント分のみ返ること"""
        async with client as c:
            response = await c.get(
                "/api/admin/assistant-categories", headers=admin_headers
            )

        assert response.status_code == 200
        body = response.json()
        assert [item["id"] for item in body] == [category.id]

    async def test_list_assistant_categories_empty(self, client, admin_headers):
        """カテゴリが0件の場合空リストが返ること"""
        async with client as c:
            response = await c.get(
                "/api/admin/assistant-categories", headers=admin_headers
            )

        assert response.status_code == 200
        assert response.json() == []

    async def test_list_as_non_admin_returns_403(self, client, member_headers):
        """テナント管理者以外は一覧取得できないこと"""
        async with client as c:
            response = await c.get(
                "/api/admin/assistant-categories", headers=member_headers
            )

        assert response.status_code == 403


class TestGetAssistantCategory:
    """GET /api/admin/assistant-categories/{id}"""

    async def test_get_assistant_category(self, client, admin_headers, category):
        """存在するIDで取得できること"""
        async with client as c:
            response = await c.get(
                f"/api/admin/assistant-categories/{category.id}",
                headers=admin_headers,
            )

        assert response.status_code == 200
        assert response.json()["id"] == category.id

    async def test_get_not_found_returns_404(self, client, admin_headers):
        """存在しないIDだと404になること"""
        async with client as c:
            response = await c.get(
                "/api/admin/assistant-categories/nonexistent",
                headers=admin_headers,
            )

        assert response.status_code == 404

    async def test_get_other_tenant_category_returns_404(
        self, client, admin_headers, other_tenant_category
    ):
        """他テナントのIDだと404になること"""
        async with client as c:
            response = await c.get(
                f"/api/admin/assistant-categories/{other_tenant_category.id}",
                headers=admin_headers,
            )

        assert response.status_code == 404

    async def test_get_as_non_admin_returns_403(self, client, member_headers, category):
        """テナント管理者以外は単体取得できないこと"""
        async with client as c:
            response = await c.get(
                f"/api/admin/assistant-categories/{category.id}",
                headers=member_headers,
            )

        assert response.status_code == 403


class TestUpdateAssistantCategory:
    """PATCH /api/admin/assistant-categories/{id}"""

    async def test_update_assistant_category(self, client, admin_headers, category):
        """正しいリクエストで更新でき、DBの内容が更新されること"""
        async with client as c:
            response = await c.patch(
                f"/api/admin/assistant-categories/{category.id}",
                json={"name": "updated", "description": "updated desc"},
                headers=admin_headers,
            )

        assert response.status_code == 200
        body = response.json()
        assert body["name"] == "updated"
        assert body["description"] == "updated desc"

    async def test_update_keeping_same_name_succeeds(
        self, client, admin_headers, category
    ):
        """自分自身の既存の名前のまま更新しても重複エラーにならないこと"""
        async with client as c:
            response = await c.patch(
                f"/api/admin/assistant-categories/{category.id}",
                json={"name": category.name, "description": "changed"},
                headers=admin_headers,
            )

        assert response.status_code == 200

    async def test_update_with_duplicate_name_returns_400(
        self, client, admin_headers, category, second_category
    ):
        """更新後の名前が同一テナント内の別カテゴリと重複する場合400になること"""
        async with client as c:
            response = await c.patch(
                f"/api/admin/assistant-categories/{category.id}",
                json={"name": second_category.name},
                headers=admin_headers,
            )

        assert response.status_code == 400

    async def test_update_not_found_returns_404(self, client, admin_headers):
        """存在しないIDだと404になること"""
        async with client as c:
            response = await c.patch(
                "/api/admin/assistant-categories/nonexistent",
                json={"name": "updated"},
                headers=admin_headers,
            )

        assert response.status_code == 404

    async def test_update_other_tenant_category_returns_404(
        self, client, admin_headers, other_tenant_category
    ):
        """他テナントのIDだと404になり対象データは変更されないこと"""
        async with client as c:
            response = await c.patch(
                f"/api/admin/assistant-categories/{other_tenant_category.id}",
                json={"name": "updated"},
                headers=admin_headers,
            )

        assert response.status_code == 404

    async def test_update_with_description_256_chars_returns_422(
        self, client, admin_headers, category
    ):
        """説明が256文字だと422になりDBの内容が変更されないこと"""
        async with client as c:
            response = await c.patch(
                f"/api/admin/assistant-categories/{category.id}",
                json={"name": "orig", "description": "d" * 256},
                headers=admin_headers,
            )

        assert response.status_code == 422

    async def test_update_as_non_admin_returns_403(
        self, client, member_headers, category
    ):
        """テナント管理者以外は更新できないこと"""
        async with client as c:
            response = await c.patch(
                f"/api/admin/assistant-categories/{category.id}",
                json={"name": "updated"},
                headers=member_headers,
            )

        assert response.status_code == 403


class TestDeleteAssistantCategory:
    """DELETE /api/admin/assistant-categories/{id}"""

    async def test_delete_assistant_category(self, client, admin_headers, category):
        """存在するIDを削除でき204が返ること"""
        async with client as c:
            response = await c.delete(
                f"/api/admin/assistant-categories/{category.id}",
                headers=admin_headers,
            )

        assert response.status_code == 204

    async def test_delete_not_found_returns_404(self, client, admin_headers):
        """存在しないIDだと404になること"""
        async with client as c:
            response = await c.delete(
                "/api/admin/assistant-categories/nonexistent",
                headers=admin_headers,
            )

        assert response.status_code == 404

    async def test_delete_as_non_admin_returns_403(
        self, client, member_headers, category
    ):
        """テナント管理者以外は削除できないこと"""
        async with client as c:
            response = await c.delete(
                f"/api/admin/assistant-categories/{category.id}",
                headers=member_headers,
            )

        assert response.status_code == 403
