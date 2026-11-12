from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select
from sqlmodel import col

from app.core.security import create_access_token
from app.main import app
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


def _headers(login_id: str, tenant_id: str) -> dict[str, str]:
    """認証ヘッダーとテナントIDヘッダーを作る。

    Parameters
    ----------
    login_id : str
        ログインID。
    tenant_id : str
        テナントID。

    Returns
    -------
    dict[str, str]
        `Authorization` と `X-Tenant-ID` のヘッダー。
    """
    token = create_access_token(login_id, tenant_id)
    return {"Authorization": f"Bearer {token}", "X-Tenant-ID": tenant_id}


@pytest.fixture
def admin_headers(admin_user, tenant):
    """テナント管理者のリクエストヘッダー"""
    return _headers(admin_user.login_id, tenant.id)


@pytest.fixture
def member_headers(member_user, tenant):
    """一般ユーザーのリクエストヘッダー"""
    return _headers(member_user.login_id, tenant.id)


@pytest.fixture
def server_error_client(override_get_session, override_get_redis_client):
    """未処理の例外を500の応答として受け取るテストクライアント

    既定の `client` は未処理の例外をテストへ送出するため、移植元と同じく
    DBの一意制約違反が500で返ることを応答で確かめるときに使う。
    """
    return AsyncClient(
        transport=ASGITransport(app=app, raise_app_exceptions=False),
        base_url="http://test",
    )


async def _count_categories(session, tenant_id: str, name: str) -> int:
    """テナント内の指定した名前のアシスタントカテゴリ件数を数える。

    Parameters
    ----------
    session : AsyncSession
        非同期DBセッション。
    tenant_id : str
        テナントID。
    name : str
        カテゴリ名。

    Returns
    -------
    int
        件数。
    """
    # 一意制約違反で中断したトランザクションを片付けてから数える
    await session.rollback()
    result = await session.execute(
        select(func.count())
        .select_from(AssistantCategory)
        .where(
            col(AssistantCategory.tenant_id) == tenant_id,
            col(AssistantCategory.name) == name,
        )
    )
    return int(result.scalar_one())


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

    async def test_create_with_blank_name_returns_400(self, client, admin_headers):
        """名前が空白のみだと400になり作成されないこと"""
        async with client as c:
            response = await c.post(
                "/api/admin/assistant-categories",
                json={"name": "   ", "description": "desc"},
                headers=admin_headers,
            )

        assert response.status_code == 400
        assert response.json()["message"] == "カテゴリ名は必須です"

    async def test_create_without_name_returns_400(self, client, admin_headers):
        """名前が無いと400になり、移植元と同じ文言が返ること"""
        async with client as c:
            response = await c.post(
                "/api/admin/assistant-categories",
                json={"description": "desc"},
                headers=admin_headers,
            )

        assert response.status_code == 400
        assert response.json()["message"] == "カテゴリ名は必須です"

    async def test_create_with_name_17_chars_returns_400(self, client, admin_headers):
        """名前が17文字だと400になり、移植元と同じ文言が返ること"""
        async with client as c:
            response = await c.post(
                "/api/admin/assistant-categories",
                json={"name": "a" * 17, "description": None},
                headers=admin_headers,
            )

        assert response.status_code == 400
        assert response.json()["message"] == "カテゴリ名は16文字以内で入力してください"

    async def test_create_with_description_256_chars_returns_400(
        self, client, admin_headers
    ):
        """説明が256文字だと400になり、移植元と同じ文言が返ること"""
        async with client as c:
            response = await c.post(
                "/api/admin/assistant-categories",
                json={"name": "valid", "description": "d" * 256},
                headers=admin_headers,
            )

        assert response.status_code == 400
        assert response.json()["message"] == "説明は255文字以内で入力してください"

    async def test_create_as_non_admin_returns_403(self, client, member_headers):
        """テナント管理者以外は作成できないこと"""
        async with client as c:
            response = await c.post(
                "/api/admin/assistant-categories",
                json={"name": "New Category", "description": None},
                headers=member_headers,
            )

        assert response.status_code == 403

    async def test_create_with_duplicate_name_returns_500(
        self, server_error_client, session, admin_headers, category
    ):
        """同一テナント内に同名のカテゴリがあると移植元と同じく一意制約違反の500になり作成されないこと"""
        # 一意制約違反の後はロールバックまで属性を読めないため、先に控える
        tenant_id, name = category.tenant_id, category.name
        async with server_error_client as c:
            response = await c.post(
                "/api/admin/assistant-categories",
                json={"name": name, "description": "別の説明"},
                headers=admin_headers,
            )

        assert response.status_code == 500
        assert await _count_categories(session, tenant_id, name) == 1

    async def test_create_with_other_tenant_category_name_succeeds(
        self, client, admin_headers, other_tenant_category
    ):
        """他テナントのカテゴリと同じ名前なら作成できること"""
        async with client as c:
            response = await c.post(
                "/api/admin/assistant-categories",
                json={"name": other_tenant_category.name},
                headers=admin_headers,
            )

        assert response.status_code == 201
        assert response.json()["name"] == other_tenant_category.name


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
        assert (
            response.json()["message"]
            == "AssistantCategory not found with id:nonexistent"
        )

    async def test_get_options_is_treated_as_id(self, client, admin_headers):
        """/optionsは移植元と同じく単体取得として扱われ404になること"""
        async with client as c:
            response = await c.get(
                "/api/admin/assistant-categories/options",
                headers=admin_headers,
            )

        assert response.status_code == 404
        assert (
            response.json()["message"] == "AssistantCategory not found with id:options"
        )

    async def test_get_options_as_non_admin_returns_403(self, client, member_headers):
        """/optionsもテナント管理者以外は取得できないこと"""
        async with client as c:
            response = await c.get(
                "/api/admin/assistant-categories/options",
                headers=member_headers,
            )

        assert response.status_code == 403

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
        # 他テナントに存在することを区別できないよう、存在しない場合と同じ文言になる
        assert (
            response.json()["message"]
            == f"AssistantCategory not found with id:{other_tenant_category.id}"
        )

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

    async def test_update_with_duplicate_name_returns_500(
        self, server_error_client, session, admin_headers, category, second_category
    ):
        """更新後の名前が別カテゴリと重複すると移植元と同じく一意制約違反の500になり変更されないこと"""
        # 一意制約違反の後はロールバックまで属性を読めないため、先に控える
        category_id, tenant_id = category.id, category.tenant_id
        second_name = second_category.name
        async with server_error_client as c:
            response = await c.patch(
                f"/api/admin/assistant-categories/{category_id}",
                json={"name": second_name},
                headers=admin_headers,
            )

        assert response.status_code == 500
        assert await _count_categories(session, tenant_id, "orig") == 1
        assert await _count_categories(session, tenant_id, second_name) == 1

    async def test_update_without_description_keeps_description(
        self, client, admin_headers, category
    ):
        """説明を送らずに更新すると元の説明が残ること"""
        async with client as c:
            response = await c.patch(
                f"/api/admin/assistant-categories/{category.id}",
                json={"name": "updated"},
                headers=admin_headers,
            )

        assert response.status_code == 200
        body = response.json()
        assert body["name"] == "updated"
        assert body["description"] == "orig desc"

    @pytest.mark.parametrize("description", [None, "", "   "])
    async def test_update_with_blank_description_keeps_description(
        self, client, session, admin_headers, category, description
    ):
        """説明がnull・空文字・空白だけなら元の説明がDBに残ること"""
        async with client as c:
            response = await c.patch(
                f"/api/admin/assistant-categories/{category.id}",
                json={"name": "updated", "description": description},
                headers=admin_headers,
            )

        assert response.status_code == 200
        assert response.json()["description"] == "orig desc"
        await session.refresh(category)
        assert category.description == "orig desc"

    async def test_update_not_found_returns_404(self, client, admin_headers):
        """存在しないIDだと404になること"""
        async with client as c:
            response = await c.patch(
                "/api/admin/assistant-categories/nonexistent",
                json={"name": "updated"},
                headers=admin_headers,
            )

        assert response.status_code == 404
        # 移植元は更新だけコロンの後に空白が入る
        assert (
            response.json()["message"]
            == "AssistantCategory not found with id: nonexistent"
        )

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
        assert (
            response.json()["message"]
            == f"AssistantCategory not found with id: {other_tenant_category.id}"
        )

    async def test_update_with_description_256_chars_returns_400(
        self, client, admin_headers, category
    ):
        """説明が256文字だと400になりDBの内容が変更されないこと"""
        async with client as c:
            response = await c.patch(
                f"/api/admin/assistant-categories/{category.id}",
                json={"name": "orig", "description": "d" * 256},
                headers=admin_headers,
            )

        assert response.status_code == 400

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
        assert (
            response.json()["message"]
            == "AssistantCategory not found with id:nonexistent"
        )

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
