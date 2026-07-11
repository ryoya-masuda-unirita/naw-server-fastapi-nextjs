import pytest
from httpx import AsyncClient, ASGITransport
from uuid import uuid4

from app.core.security import create_access_token, hash_password
from app.main import app
from app.models.tenant import Tenant
from app.models.user import User, UserRole
from app.models.password_history import PasswordHistory


@pytest.fixture
async def tenant(session):
    """テスト用テナント"""
    t = Tenant(
        id="tenant-users-test",
        name="Users Test Tenant",
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
    """テスト用管理者ユーザー"""
    u = User(
        id=uuid4(),
        tenant_id=tenant.id,
        login_id="admin-test",
        name="Admin",
        role=UserRole.ADMIN,
        is_required_password_reset=False,
    )
    session.add(u)
    await session.flush()
    pw = PasswordHistory(
        tenant_id=tenant.id,
        user_id=u.id,
        password=hash_password("AdminPass1!"),
    )
    session.add(pw)
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
    await session.flush()
    pw = PasswordHistory(
        tenant_id=tenant.id,
        user_id=u.id,
        password=hash_password("UserPass1!"),
    )
    session.add(pw)
    await session.commit()
    await session.refresh(u)
    return u


@pytest.fixture
def admin_token(admin_user, tenant):
    return create_access_token(admin_user.login_id, tenant.id)


@pytest.fixture
def user_token(normal_user, tenant):
    return create_access_token(normal_user.login_id, tenant.id)


@pytest.fixture
def admin_headers(admin_token, tenant):
    return {"Authorization": f"Bearer {admin_token}", "X-Tenant-ID": tenant.id}


@pytest.fixture
def user_headers(user_token, tenant):
    return {"Authorization": f"Bearer {user_token}", "X-Tenant-ID": tenant.id}


@pytest.fixture
def client(override_get_session):
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


class TestGetUsers:
    async def test_admin_can_get_users(self, client, admin_headers, admin_user):
        """管理者がユーザー一覧を取得できること"""
        async with client as c:
            response = await c.get("/api/admin/users", headers=admin_headers)

        assert response.status_code == 200
        body = response.json()
        assert "content" in body
        assert body["totalElements"] >= 1

    async def test_user_gets_403(self, client, user_headers):
        """一般ユーザーは 403 になること"""
        async with client as c:
            response = await c.get("/api/admin/users", headers=user_headers)

        assert response.status_code == 403

    async def test_tenant_header_mismatch_gets_403(self, client, admin_token):
        """JWT と異なる X-Tenant-ID を指定すると 403 になること"""
        headers = {
            "Authorization": f"Bearer {admin_token}",
            "X-Tenant-ID": "other-tenant",
        }
        async with client as c:
            response = await c.get("/api/admin/users", headers=headers)

        assert response.status_code == 403


class TestGetUsersSearchAndSort:
    async def test_percent_in_search_text_is_treated_as_literal(
        self, client, admin_headers, session, tenant
    ):
        """検索文字列中の%がワイルドカードとして機能しないこと"""
        literal_user = User(
            id=uuid4(),
            tenant_id=tenant.id,
            login_id="literal-user",
            name="ab%c",
            role=UserRole.USER,
            is_required_password_reset=False,
        )
        plain_user = User(
            id=uuid4(),
            tenant_id=tenant.id,
            login_id="plain-user",
            name="abc",
            role=UserRole.USER,
            is_required_password_reset=False,
        )
        session.add_all([literal_user, plain_user])
        await session.commit()

        async with client as c:
            response = await c.get(
                "/api/admin/users", headers=admin_headers, params={"searchText": "b%c"}
            )

        assert response.status_code == 200
        names = [u["name"] for u in response.json()["content"]]
        assert "ab%c" in names
        assert "abc" not in names

    async def test_sort_by_camel_case_field(
        self, client, admin_headers, session, tenant
    ):
        """移植元フロントエンドが実際に送信するキャメルケースのsort値でソートできること"""
        user_a = User(
            id=uuid4(),
            tenant_id=tenant.id,
            login_id="user-a",
            name="Alpha",
            role=UserRole.USER,
            is_required_password_reset=False,
        )
        user_z = User(
            id=uuid4(),
            tenant_id=tenant.id,
            login_id="user-z",
            name="Zulu",
            role=UserRole.USER,
            is_required_password_reset=False,
        )
        session.add_all([user_z, user_a])
        await session.commit()

        async with client as c:
            response = await c.get(
                "/api/admin/users", headers=admin_headers, params={"sort": "name,asc"}
            )

        assert response.status_code == 200
        names = [u["name"] for u in response.json()["content"]]
        assert names.index("Alpha") < names.index("Zulu")

    async def test_sort_with_disallowed_column_falls_back(self, client, admin_headers):
        """許可リスト外のsort値を指定してもエラーにならず既定列にフォールバックすること"""
        async with client as c:
            response = await c.get(
                "/api/admin/users",
                headers=admin_headers,
                params={"sort": "login_key,asc"},
            )

        assert response.status_code == 200


class TestGetUsersExcludesSystemRole:
    async def test_excludes_system_role_users(
        self, client, admin_headers, session, tenant, admin_user
    ):
        """SYSTEMロールのユーザーが一覧・件数から除外されること"""
        system_user = User(
            id=uuid4(),
            tenant_id=tenant.id,
            login_id="system-test",
            name="System User",
            role=UserRole.SYSTEM,
            is_required_password_reset=False,
        )
        session.add(system_user)
        await session.commit()

        async with client as c:
            response = await c.get("/api/admin/users", headers=admin_headers)

        assert response.status_code == 200
        body = response.json()
        login_ids = [u["loginId"] for u in body["content"]]
        assert "system-test" not in login_ids
        assert body["totalElements"] == 1

    async def test_role_filter_with_system_returns_empty(
        self, client, admin_headers, session, tenant, admin_user
    ):
        """role=SYSTEMを指定しても除外条件が外れず0件になること"""
        system_user = User(
            id=uuid4(),
            tenant_id=tenant.id,
            login_id="system-test-2",
            name="System User 2",
            role=UserRole.SYSTEM,
            is_required_password_reset=False,
        )
        session.add(system_user)
        await session.commit()

        async with client as c:
            response = await c.get(
                "/api/admin/users", headers=admin_headers, params={"role": "SYSTEM"}
            )

        assert response.status_code == 200
        body = response.json()
        assert body["content"] == []
        assert body["totalElements"] == 0


class TestCreateUser:
    async def test_creates_user_with_initial_password(self, client, admin_headers):
        """ユーザーを作成でき initialPassword が返ること"""
        async with client as c:
            response = await c.post(
                "/api/admin/users",
                headers=admin_headers,
                json={"loginId": "newuser", "name": "New User", "role": "USER"},
            )

        assert response.status_code == 200
        body = response.json()
        assert body["loginId"] == "newuser"
        assert body["initialPassword"] is not None

    async def test_raises_400_on_duplicate_login_id(
        self, client, admin_headers, admin_user
    ):
        """重複 loginId で 400 になること"""
        async with client as c:
            response = await c.post(
                "/api/admin/users",
                headers=admin_headers,
                json={"loginId": admin_user.login_id, "name": "Dup", "role": "USER"},
            )

        assert response.status_code == 400


class TestUpdateUser:
    async def test_updates_user(self, client, admin_headers, normal_user):
        """ユーザーを更新できること"""
        async with client as c:
            response = await c.patch(
                f"/api/admin/users/{normal_user.login_id}",
                headers=admin_headers,
                json={"name": "Updated Name"},
            )

        assert response.status_code == 200
        assert response.json()["name"] == "Updated Name"

    async def test_resets_password(self, client, admin_headers, normal_user):
        """resetPassword=true でパスワードリセットできること"""
        async with client as c:
            response = await c.patch(
                f"/api/admin/users/{normal_user.login_id}",
                headers=admin_headers,
                json={"resetPassword": True},
            )

        assert response.status_code == 200
        assert response.json()["initialPassword"] is not None


class TestDeleteUser:
    async def test_deletes_user(self, client, admin_headers, normal_user):
        """ユーザーを削除できること"""
        async with client as c:
            response = await c.delete(
                f"/api/admin/users/{normal_user.login_id}",
                headers=admin_headers,
            )

        assert response.status_code == 204


class TestProfile:
    async def test_get_profile(self, client, user_headers, normal_user):
        """認証ユーザーが自分のプロフィールを取得できること"""
        async with client as c:
            response = await c.get("/api/users/profile", headers=user_headers)

        assert response.status_code == 200
        assert response.json()["loginId"] == normal_user.login_id

    async def test_update_profile_password(self, client, user_headers, normal_user):
        """パスワードを変更できること"""
        async with client as c:
            response = await c.patch(
                "/api/users/profile",
                headers=user_headers,
                json={"password": "NewPassword1!"},
            )

        assert response.status_code == 200

    async def test_get_profile_with_cookie_only(
        self, client, user_token, tenant, normal_user
    ):
        """GET /api/users/profile をCookieのみで認証できること"""
        async with client as c:
            c.cookies.set("access_token", user_token)
            response = await c.get(
                "/api/users/profile",
                headers={"X-Tenant-ID": tenant.id},
            )

        assert response.status_code == 200
        assert response.json()["loginId"] == normal_user.login_id
