from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import uuid4

from app.core.security import create_access_token, hash_password
from app.main import app
from app.models.group import Group, GroupUser
from app.models.plan import Plan
from app.models.subscription import Subscription, SubscriptionStatus
from app.models.tenant import Tenant
from app.models.token_usage import TokenUsage
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
    """管理者のアクセストークン"""
    return create_access_token(admin_user.login_id, tenant.id)


@pytest.fixture
def user_token(normal_user, tenant):
    """一般ユーザーのアクセストークン"""
    return create_access_token(normal_user.login_id, tenant.id)


@pytest.fixture
def admin_headers(admin_token, tenant):
    """管理者の認証ヘッダー"""
    return {"Authorization": f"Bearer {admin_token}", "X-Tenant-ID": tenant.id}


@pytest.fixture
def user_headers(user_token, tenant):
    """一般ユーザーの認証ヘッダー"""
    return {"Authorization": f"Bearer {user_token}", "X-Tenant-ID": tenant.id}


@pytest.fixture
def client(override_get_session, override_get_redis_client):
    """テスト用の HTTP クライアント"""
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.fixture
async def credit_plan(session):
    """テスト用プラン（NAW-1172: includeUsage検証用）"""
    plan = Plan(
        id="plan-users-usage-test",
        name="Standard",
        max_users=10,
        max_credits_per_month=1000,
    )
    session.add(plan)
    await session.commit()
    await session.refresh(plan)
    return plan


async def _create_active_subscription(session, tenant_id: str, plan_id: str) -> None:
    """本日（UTC）を契約開始日とする有効なサブスクリプションを作成する。

    請求期間解決ロジックはUTCの日付で判定するため、契約開始日もUTCの日付で作る
    （ローカル日付で作るとUTCと日付が異なる時間帯に有効な契約として扱われない）。
    """
    session.add(
        Subscription(
            tenant_id=tenant_id,
            plan_id=plan_id,
            status=SubscriptionStatus.ACTIVE,
            start_date=datetime.now(timezone.utc).date(),
            end_date=None,
        )
    )
    await session.commit()


def _token_usage(
    tenant_id: str,
    user_id,
    input_credits: int = 0,
    output_credits: int = 0,
    embedding_credits: int = 0,
) -> TokenUsage:
    """テスト用のトークン使用量を作る。

    Parameters
    ----------
    tenant_id : str
        テナントID。
    user_id : UUID
        使用したユーザーのID。
    input_credits : int
        入力のクレジット。
    output_credits : int
        出力のクレジット。
    embedding_credits : int
        埋め込みのクレジット。

    Returns
    -------
    TokenUsage
        テスト用のトークン使用量。
    """
    return TokenUsage(
        tenant_id=tenant_id,
        user_id=user_id,
        model="gpt-4",
        input_tokens=100,
        output_tokens=100,
        input_credits=input_credits,
        output_credits=output_credits,
        embedding_credits=embedding_credits,
        created_at=datetime.now(timezone.utc),
    )


class TestGetUsersWithUsage:
    """GET /api/admin/users?includeUsage=true (NAW-1172)"""

    async def test_include_usage_false_omits_total_credits(
        self, client, admin_headers, admin_user
    ):
        """includeUsage未指定時はtotalCreditsがレスポンスに含まれないこと"""
        async with client as c:
            response = await c.get("/api/admin/users", headers=admin_headers)

        assert response.status_code == 200
        assert "totalCredits" not in response.json()["content"][0]

    async def test_include_usage_true_returns_total_credits(
        self,
        client,
        admin_headers,
        session,
        tenant,
        credit_plan,
        admin_user,
        normal_user,
    ):
        """includeUsage=trueの場合、請求期間内のtotalCreditsが返ること"""
        await _create_active_subscription(session, tenant.id, credit_plan.id)
        session.add(
            _token_usage(
                tenant.id,
                admin_user.id,
                input_credits=10,
                output_credits=20,
                embedding_credits=5,
            )
        )
        await session.commit()

        async with client as c:
            response = await c.get(
                "/api/admin/users",
                headers=admin_headers,
                params={"includeUsage": "true"},
            )

        assert response.status_code == 200
        body = {u["loginId"]: u["totalCredits"] for u in response.json()["content"]}
        assert body[admin_user.login_id] == 35
        assert body[normal_user.login_id] == 0

    async def test_include_usage_true_without_subscription_omits_total_credits(
        self, client, admin_headers, admin_user
    ):
        """有効なサブスクリプションがない場合、totalCreditsがレスポンスに含まれないこと

        （None値はレスポンスからexclude_noneで除外されるため、キー自体が存在しない）
        """
        async with client as c:
            response = await c.get(
                "/api/admin/users",
                headers=admin_headers,
                params={"includeUsage": "true"},
            )

        assert response.status_code == 200
        assert "totalCredits" not in response.json()["content"][0]

    async def test_sort_total_credits_without_include_usage_returns_400(
        self, client, admin_headers
    ):
        """includeUsage未指定でsort=totalCreditsを指定すると400になること"""
        async with client as c:
            response = await c.get(
                "/api/admin/users",
                headers=admin_headers,
                params={"sort": "totalCredits,desc"},
            )

        assert response.status_code == 400

    async def test_sort_total_credits_orders_by_credit_amount(
        self,
        client,
        admin_headers,
        session,
        tenant,
        credit_plan,
        admin_user,
        normal_user,
    ):
        """includeUsage=trueかつsort=totalCreditsで利用クレジット降順に並ぶこと"""
        await _create_active_subscription(session, tenant.id, credit_plan.id)
        session.add(_token_usage(tenant.id, admin_user.id, input_credits=5))
        session.add(_token_usage(tenant.id, normal_user.id, input_credits=50))
        await session.commit()

        async with client as c:
            response = await c.get(
                "/api/admin/users",
                headers=admin_headers,
                params={"includeUsage": "true", "sort": "totalCredits,desc"},
            )

        assert response.status_code == 200
        login_ids = [u["loginId"] for u in response.json()["content"]]
        assert login_ids.index(normal_user.login_id) < login_ids.index(
            admin_user.login_id
        )

    async def test_expired_subscription_is_treated_as_no_usage(
        self, client, admin_headers, session, tenant, credit_plan, admin_user
    ):
        """期限切れサブスクリプションの場合、有効な契約なしとしてtotalCreditsが省略されること"""
        today_utc = datetime.now(timezone.utc).date()
        session.add(
            Subscription(
                tenant_id=tenant.id,
                plan_id=credit_plan.id,
                status=SubscriptionStatus.ACTIVE,
                start_date=today_utc - timedelta(days=60),
                end_date=today_utc - timedelta(days=3),
            )
        )
        await session.commit()

        async with client as c:
            response = await c.get(
                "/api/admin/users",
                headers=admin_headers,
                params={"includeUsage": "true"},
            )

        assert response.status_code == 200
        assert "totalCredits" not in response.json()["content"][0]


class TestGetUsers:
    """GET /api/admin/users のテスト"""

    async def test_admin_can_get_users(self, client, admin_headers, admin_user):
        """管理者がユーザー一覧を取得できること"""
        async with client as c:
            response = await c.get("/api/admin/users", headers=admin_headers)

        assert response.status_code == 200
        body = response.json()
        assert "content" in body
        assert body["totalElements"] >= 1

    async def test_page_fields_follow_spring_page(
        self, client, admin_headers, admin_user, normal_user
    ):
        """ページ情報が移植元（Spring の Page）と同じ number などで返ること（Issue #309）"""
        async with client as c:
            response = await c.get(
                "/api/admin/users", headers=admin_headers, params={"size": 1}
            )

        body = response.json()
        assert response.status_code == 200
        assert "page" not in body
        assert body["number"] == 0
        assert body["size"] == 1
        assert body["totalElements"] == 2
        assert body["totalPages"] == 2
        assert body["numberOfElements"] == 1
        assert body["first"] is True
        assert body["last"] is False
        assert body["empty"] is False

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
    """GET /api/admin/users の検索・並べ替えのテスト"""

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

    async def test_sort_direction_reverses_rows_with_same_sort_key(
        self, client, admin_headers, session, tenant, admin_user
    ):
        """更新日時が同値のユーザーでも昇順と降順で並びが完全に反転すること"""
        same_time = datetime(2026, 1, 1, tzinfo=timezone.utc)
        admin_user.updated_at = same_time
        session.add(admin_user)
        for i in range(4):
            session.add(
                User(
                    id=uuid4(),
                    tenant_id=tenant.id,
                    login_id=f"same-time-{i}",
                    name=f"SameTime{i}",
                    role=UserRole.USER,
                    is_required_password_reset=False,
                    updated_at=same_time,
                )
            )
        await session.commit()

        async with client as c:
            asc_res = await c.get(
                "/api/admin/users",
                headers=admin_headers,
                params={"sort": "updatedAt,asc"},
            )
            desc_res = await c.get(
                "/api/admin/users",
                headers=admin_headers,
                params={"sort": "updatedAt,desc"},
            )

        assert asc_res.status_code == 200
        assert desc_res.status_code == 200
        asc_ids = [u["id"] for u in asc_res.json()["content"]]
        desc_ids = [u["id"] for u in desc_res.json()["content"]]
        assert len(asc_ids) == 5
        assert desc_ids == list(reversed(asc_ids))

    async def test_sort_by_role_switches_first_row_by_direction(
        self, client, admin_headers, session, tenant, admin_user
    ):
        """権限順の昇順は管理者が先頭、降順は一般ユーザーが先頭になり並びが反転すること"""
        for i in range(3):
            session.add(
                User(
                    id=uuid4(),
                    tenant_id=tenant.id,
                    login_id=f"role-sort-{i}",
                    name=f"RoleSort{i}",
                    role=UserRole.USER,
                    is_required_password_reset=False,
                )
            )
        await session.commit()

        async with client as c:
            asc_res = await c.get(
                "/api/admin/users", headers=admin_headers, params={"sort": "role,asc"}
            )
            desc_res = await c.get(
                "/api/admin/users", headers=admin_headers, params={"sort": "role,desc"}
            )

        assert asc_res.status_code == 200
        assert desc_res.status_code == 200
        asc_content = asc_res.json()["content"]
        desc_content = desc_res.json()["content"]
        assert asc_content[0]["role"] == "ADMIN"
        assert desc_content[-1]["role"] == "ADMIN"
        assert [u["id"] for u in desc_content] == list(
            reversed([u["id"] for u in asc_content])
        )

    async def test_sort_direction_is_case_insensitive(
        self, client, admin_headers, session, tenant
    ):
        """ソート方向を大文字(DESC)で指定しても降順になること"""
        session.add_all(
            [
                User(
                    id=uuid4(),
                    tenant_id=tenant.id,
                    login_id=f"case-{name.lower()}",
                    name=name,
                    role=UserRole.USER,
                    is_required_password_reset=False,
                )
                for name in ["Alpha", "Zulu"]
            ]
        )
        await session.commit()

        async with client as c:
            response = await c.get(
                "/api/admin/users", headers=admin_headers, params={"sort": "name,DESC"}
            )

        assert response.status_code == 200
        names = [u["name"] for u in response.json()["content"]]
        assert names.index("Zulu") < names.index("Alpha")

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
    """GET /api/admin/users が SYSTEM ロールを除くことのテスト"""

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


async def _create_group(
    session: AsyncSession, tenant_id: str, name: str, members: list[User]
) -> Group:
    """グループを登録し、指定ユーザーを所属させる。"""
    group = Group(tenant_id=tenant_id, name=name)
    session.add(group)
    await session.flush()
    for member in members:
        session.add(
            GroupUser(group_id=group.id, tenant_id=tenant_id, user_id=member.id)
        )
    await session.commit()
    return group


class TestGetUsersExcludeGroup:
    """GET /api/admin/users の excludeGroupId のテスト"""

    async def test_excludes_members_of_group(
        self, client, admin_headers, session, tenant, admin_user, normal_user
    ):
        """excludeGroupIdのグループに所属するユーザーだけが除外され、件数にも反映されること"""
        excluded_group = await _create_group(
            session, tenant.id, "Excluded", [normal_user]
        )
        # 別のグループにだけ所属するユーザーは除外されない
        await _create_group(session, tenant.id, "Other", [admin_user])

        async with client as c:
            response = await c.get(
                "/api/admin/users",
                headers=admin_headers,
                params={"excludeGroupId": excluded_group.id},
            )

        assert response.status_code == 200
        body = response.json()
        assert [u["loginId"] for u in body["content"]] == [admin_user.login_id]
        assert body["totalElements"] == 1

    async def test_excludes_members_with_usage_and_credit_sort(
        self,
        client,
        admin_headers,
        session,
        tenant,
        credit_plan,
        admin_user,
        normal_user,
    ):
        """利用量の付与・利用クレジット順の並べ替えと併用しても所属ユーザーが除外されること"""
        await _create_active_subscription(session, tenant.id, credit_plan.id)
        excluded_group = await _create_group(
            session, tenant.id, "Excluded", [normal_user]
        )

        async with client as c:
            response = await c.get(
                "/api/admin/users",
                headers=admin_headers,
                params={
                    "excludeGroupId": excluded_group.id,
                    "includeUsage": "true",
                    "sort": "totalCredits,desc",
                },
            )

        assert response.status_code == 200
        body = response.json()
        assert [u["loginId"] for u in body["content"]] == [admin_user.login_id]
        assert body["totalElements"] == 1

    async def test_unknown_group_id_excludes_nobody(
        self, client, admin_headers, admin_user, normal_user
    ):
        """存在しないグループIDを指定しても、移植元と同じくエラーにならず誰も除外されないこと"""
        async with client as c:
            response = await c.get(
                "/api/admin/users",
                headers=admin_headers,
                params={"excludeGroupId": "nonexistentgroupid"},
            )

        assert response.status_code == 200
        login_ids = {u["loginId"] for u in response.json()["content"]}
        assert login_ids == {admin_user.login_id, normal_user.login_id}

    async def test_other_tenant_group_id_excludes_nobody(
        self, client, admin_headers, session, admin_user, normal_user
    ):
        """他テナントのグループIDを指定しても、エラーにならず自テナントの誰も除外されないこと"""
        other_tenant = Tenant(id="tenant-users-other", name="Other", owner="admin")
        session.add(other_tenant)
        await session.commit()
        other_group = await _create_group(
            session, other_tenant.id, "Other Tenant Group", []
        )
        # 他テナントのグループの所属行で自テナントのユーザーが消えないことを確かめるため、
        # 本来は起きない「他テナントの所属行に自テナントのユーザーが入った」状態を作る
        session.add(
            GroupUser(
                group_id=other_group.id,
                tenant_id=other_tenant.id,
                user_id=normal_user.id,
            )
        )
        await session.commit()

        async with client as c:
            response = await c.get(
                "/api/admin/users",
                headers=admin_headers,
                params={"excludeGroupId": other_group.id},
            )

        assert response.status_code == 200
        login_ids = {u["loginId"] for u in response.json()["content"]}
        assert login_ids == {admin_user.login_id, normal_user.login_id}

    @pytest.mark.parametrize("exclude_group_id", ["", "  "])
    async def test_blank_group_id_excludes_nobody(
        self,
        client,
        admin_headers,
        session,
        tenant,
        admin_user,
        normal_user,
        exclude_group_id,
    ):
        """excludeGroupIdが空文字・空白だけの場合は除外しないこと"""
        await _create_group(session, tenant.id, "Group", [normal_user])

        async with client as c:
            response = await c.get(
                "/api/admin/users",
                headers=admin_headers,
                params={"excludeGroupId": exclude_group_id},
            )

        assert response.status_code == 200
        login_ids = {u["loginId"] for u in response.json()["content"]}
        assert login_ids == {admin_user.login_id, normal_user.login_id}


class TestCreateUser:
    """POST /api/admin/users のテスト"""

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
    """PATCH /api/admin/users/{userId} のテスト"""

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
    """DELETE /api/admin/users/{userId} のテスト"""

    async def test_deletes_user(self, client, admin_headers, normal_user):
        """ユーザーを削除できること"""
        async with client as c:
            response = await c.delete(
                f"/api/admin/users/{normal_user.login_id}",
                headers=admin_headers,
            )

        assert response.status_code == 204


class TestProfile:
    """GET・PATCH /api/users/profile のテスト"""

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

    async def test_get_profile_with_cookie_only(self, client, tenant, normal_user):
        """GET /api/users/profile をセッションCookieのみで認証できること"""
        async with client as c:
            login_response = await c.post(
                "/auth/login",
                json={"username": normal_user.login_id, "password": "UserPass1!"},
                headers={"X-Tenant-ID": tenant.id},
            )
            response = await c.get(
                "/api/users/profile",
                headers={"X-Tenant-ID": tenant.id},
            )

        assert login_response.status_code == 200
        assert response.status_code == 200
        assert response.json()["loginId"] == normal_user.login_id


STORED_LOGIN_KEY = "stored-login-key-309"


class TestLoginKeyIsNotExposed:
    """ログインキーを応答に出さないこと（Issue #309、移植元 NAW-1342 AC-03）"""

    async def _set_login_key(self, session, user: User) -> None:
        """ユーザーにログインキーを保存する。

        Parameters
        ----------
        session : AsyncSession
            テスト用のDBセッション。
        user : User
            ログインキーを保存するユーザー。
        """
        user.login_key = STORED_LOGIN_KEY
        session.add(user)
        await session.commit()

    async def test_profile_returns_has_login_key_only(
        self, client, session, user_headers, normal_user
    ):
        """プロフィールは loginKey を返さず hasLoginKey だけを返し、null の totalCredits を省くこと"""
        await self._set_login_key(session, normal_user)

        async with client as c:
            response = await c.get("/api/users/profile", headers=user_headers)

        assert response.status_code == 200
        body = response.json()
        assert body["hasLoginKey"] is True
        assert "loginKey" not in body
        assert "totalCredits" not in body
        assert STORED_LOGIN_KEY not in response.text

    async def test_profile_without_login_key(self, client, user_headers, normal_user):
        """ログインキーが無いユーザーのプロフィールは hasLoginKey が false になること"""
        async with client as c:
            response = await c.get("/api/users/profile", headers=user_headers)

        assert response.status_code == 200
        assert response.json()["hasLoginKey"] is False

    async def test_admin_user_list_does_not_return_login_key(
        self, client, session, admin_headers, normal_user
    ):
        """ユーザー一覧の行は loginKey を返さず hasLoginKey を返すこと"""
        await self._set_login_key(session, normal_user)

        async with client as c:
            response = await c.get("/api/admin/users", headers=admin_headers)

        assert response.status_code == 200
        rows = {row["loginId"]: row for row in response.json()["content"]}
        assert rows[normal_user.login_id]["hasLoginKey"] is True
        assert rows["admin-test"]["hasLoginKey"] is False
        assert all("loginKey" not in row for row in rows.values())
        assert STORED_LOGIN_KEY not in response.text

    async def test_create_returns_key_set_in_request_with_no_store(
        self, client, admin_headers
    ):
        """作成は設定したキーを loginKey で返し、Cache-Control: no-store を付けること"""
        async with client as c:
            response = await c.post(
                "/api/admin/users",
                headers=admin_headers,
                json={
                    "loginId": "key-user",
                    "name": "Key User",
                    "role": "USER",
                    "loginKey": "created-key",
                },
            )

        assert response.status_code == 200
        assert response.headers["cache-control"] == "no-store"
        body = response.json()
        assert body["loginKey"] == "created-key"
        assert body["hasLoginKey"] is True
        assert "totalCredits" not in body

    async def test_update_does_not_return_stored_key(
        self, client, session, admin_headers, normal_user
    ):
        """キーを設定しない更新は保存済みのキーを返さず、Cache-Control: no-store を付けること"""
        await self._set_login_key(session, normal_user)

        async with client as c:
            response = await c.patch(
                f"/api/admin/users/{normal_user.login_id}",
                headers=admin_headers,
                json={"name": "Renamed"},
            )

        assert response.status_code == 200
        assert response.headers["cache-control"] == "no-store"
        body = response.json()
        assert body["loginKey"] is None
        assert body["hasLoginKey"] is True
        assert STORED_LOGIN_KEY not in response.text


class TestGetUsersPageSize:
    """GET /api/admin/users のページサイズ上限（issue-154）"""

    async def test_size_1000_is_accepted(self, client, admin_headers, admin_user):
        """size=1000（frontendが送る全件取得サイズ）が200で受理されること"""
        async with client as c:
            response = await c.get("/api/admin/users?size=1000", headers=admin_headers)

        assert response.status_code == 200

    async def test_size_over_limit_returns_400(self, client, admin_headers, admin_user):
        """上限（1000）を超えるsize=1001は400になること"""
        async with client as c:
            response = await c.get("/api/admin/users?size=1001", headers=admin_headers)

        assert response.status_code == 400


@pytest.mark.asyncio
class TestGetUsersRoleFilterAndMultiSort:
    """GET /api/admin/users の権限の絞り込みと複数の並べ替え指定（Issue #225）"""

    @pytest.mark.parametrize("role", ["foo", "admin"])
    async def test_unknown_role_returns_400(self, client, admin_headers, role):
        """未定義の権限・小文字の権限名は500ではなく400になること（移植元と同じ）"""
        async with client as c:
            response = await c.get(
                "/api/admin/users", headers=admin_headers, params={"role": role}
            )

        assert response.status_code == 400
        assert response.json()["message"] == f"不正なroleです: {role}"

    async def test_blank_role_is_not_filtered(
        self, client, admin_headers, session, tenant
    ):
        """空白のみの権限指定は絞り込みなしとして扱われること（移植元と同じ）"""
        session.add(
            User(
                id=uuid4(),
                tenant_id=tenant.id,
                login_id="blank-role-user",
                name="BlankRoleUser",
                role=UserRole.USER,
                is_required_password_reset=False,
            )
        )
        await session.commit()

        async with client as c:
            response = await c.get(
                "/api/admin/users", headers=admin_headers, params={"role": " "}
            )

        assert response.status_code == 200
        roles = {u["role"] for u in response.json()["content"]}
        assert roles == {"ADMIN", "USER"}

    async def test_multiple_sort_params_are_applied_in_order(
        self, client, admin_headers, session, tenant
    ):
        """sortを複数指定すると、権限順で同値の行を表示名の降順で並べること"""
        specs = [("u-a", "a", UserRole.USER), ("u-b", "b", UserRole.USER)]
        specs.append(("a-x", "x", UserRole.ADMIN))
        session.add_all(
            [
                User(
                    id=uuid4(),
                    tenant_id=tenant.id,
                    login_id=login_id,
                    name=name,
                    role=role,
                    is_required_password_reset=False,
                )
                for login_id, name, role in specs
            ]
        )
        await session.commit()

        async with client as c:
            response = await c.get(
                "/api/admin/users",
                headers=admin_headers,
                params=[("sort", "role,asc"), ("sort", "name,desc")],
            )

        assert response.status_code == 200
        names = [
            u["name"]
            for u in response.json()["content"]
            if u["name"] in {"a", "b", "x"}
        ]
        assert names == ["x", "b", "a"]
