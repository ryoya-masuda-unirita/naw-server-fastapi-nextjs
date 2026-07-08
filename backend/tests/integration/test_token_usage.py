from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

from app.core.security import create_access_token
from app.models.group import Group, GroupUser
from app.models.tenant import Tenant
from app.models.token_usage import TokenUsage
from app.models.user import User, UserRole


def _tenant(tenant_id: str) -> Tenant:
    return Tenant(
        id=tenant_id,
        name=tenant_id,
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


def _headers(login_id: str, tenant_id: str) -> dict[str, str]:
    token = create_access_token(login_id, tenant_id)
    return {"Authorization": f"Bearer {token}", "X-Tenant-ID": tenant_id}


@pytest.fixture
async def token_usage_tenant(session):
    tenant = _tenant("tenant-token-usage-test")
    session.add(tenant)
    await session.commit()
    await session.refresh(tenant)
    return tenant


@pytest.fixture
async def other_tenant(session):
    tenant = _tenant("tenant-token-usage-other")
    session.add(tenant)
    await session.commit()
    await session.refresh(tenant)
    return tenant


@pytest.fixture
async def tenant_admin_user(session, token_usage_tenant):
    user = User(
        id=uuid4(),
        tenant_id=token_usage_tenant.id,
        login_id="token-usage-admin",
        name="Token Usage Admin",
        role=UserRole.ADMIN,
        is_required_password_reset=False,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@pytest.fixture
async def group_admin_user(session, token_usage_tenant):
    user = User(
        id=uuid4(),
        tenant_id=token_usage_tenant.id,
        login_id="token-usage-group-admin",
        name="Token Usage Group Admin",
        role=UserRole.USER,
        is_required_password_reset=False,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@pytest.fixture
async def general_user(session, token_usage_tenant):
    user = User(
        id=uuid4(),
        tenant_id=token_usage_tenant.id,
        login_id="token-usage-general",
        name="Token Usage General",
        role=UserRole.USER,
        is_required_password_reset=False,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@pytest.fixture
async def target_user(session, token_usage_tenant):
    user = User(
        id=uuid4(),
        tenant_id=token_usage_tenant.id,
        login_id="token-usage-target",
        name="Token Usage Target",
        role=UserRole.USER,
        is_required_password_reset=False,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@pytest.fixture
async def token_usage_group(session, token_usage_tenant, group_admin_user):
    group = Group(tenant_id=token_usage_tenant.id, name="Token Usage Admin Group")
    session.add(group)
    await session.commit()
    await session.refresh(group)
    session.add(
        GroupUser(
            group_id=group.id,
            tenant_id=token_usage_tenant.id,
            user_id=group_admin_user.id,
            is_admin=True,
        )
    )
    await session.commit()
    return group


@pytest.fixture
def admin_headers(tenant_admin_user, token_usage_tenant):
    return _headers(tenant_admin_user.login_id, token_usage_tenant.id)


@pytest.fixture
def group_admin_headers(group_admin_user, token_usage_tenant):
    return _headers(group_admin_user.login_id, token_usage_tenant.id)


@pytest.fixture
def general_user_headers(general_user, token_usage_tenant):
    return _headers(general_user.login_id, token_usage_tenant.id)


BASE_TIME = datetime(2026, 6, 15, 0, 0, 0, tzinfo=timezone.utc)


def _record(
    tenant_id: str,
    user_id,
    input_tokens: int,
    output_tokens: int,
    embedding_tokens: int = 0,
    input_credits: int = 0,
    output_credits: int = 0,
    embedding_credits: int = 0,
    created_at: datetime = BASE_TIME,
) -> TokenUsage:
    return TokenUsage(
        tenant_id=tenant_id,
        user_id=user_id,
        model="gpt-4",
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        embedding_tokens=embedding_tokens,
        input_credits=input_credits,
        output_credits=output_credits,
        embedding_credits=embedding_credits,
        created_at=created_at,
    )


@pytest.fixture
async def token_usage_dataset(
    session, token_usage_tenant, other_tenant, target_user, general_user
):
    records = [
        _record(
            token_usage_tenant.id,
            target_user.id,
            input_tokens=10,
            output_tokens=20,
            input_credits=1,
            output_credits=2,
            created_at=BASE_TIME,
        ),
        _record(
            token_usage_tenant.id,
            target_user.id,
            input_tokens=30,
            output_tokens=40,
            input_credits=3,
            output_credits=4,
            created_at=BASE_TIME + timedelta(hours=1),
        ),
        _record(
            token_usage_tenant.id,
            general_user.id,
            input_tokens=100,
            output_tokens=200,
            embedding_tokens=5,
            embedding_credits=1,
            created_at=BASE_TIME + timedelta(hours=2),
        ),
        # 期間外（絞り込みで除外されるべき）
        _record(
            token_usage_tenant.id,
            target_user.id,
            input_tokens=999,
            output_tokens=999,
            created_at=BASE_TIME - timedelta(days=10),
        ),
        # 他テナント（絞り込みで除外されるべき）
        _record(
            other_tenant.id,
            None,
            input_tokens=999,
            output_tokens=999,
            created_at=BASE_TIME,
        ),
    ]
    session.add_all(records)
    await session.commit()
    return {"target_user": target_user, "general_user": general_user}


def _quote_datetime(value: datetime) -> str:
    """クエリ文字列に埋め込むためISO8601文字列の`+`を`%2B`にエンコードする。

    `+`はURLクエリ文字列では半角スペースと解釈されるため、そのまま埋め込むと
    タイムゾーンオフセット(`+00:00`)が壊れる。
    """
    return value.isoformat().replace("+", "%2B")


def _period_query(days_from: int = 0, days_to: int = 1) -> str:
    from_ = _quote_datetime(BASE_TIME - timedelta(days=days_from))
    to = _quote_datetime(BASE_TIME + timedelta(days=days_to))
    return f"from={from_}&to={to}"


@pytest.mark.asyncio
class TestGetTokenUsages:
    async def test_admin_can_get_token_usages(
        self, client, admin_headers, token_usage_dataset
    ):
        """期間内のトークン消費量一覧を取得できること"""
        async with client as c:
            response = await c.get(
                f"/api/admin/token-usages?{_period_query()}",
                headers=admin_headers,
            )

        assert response.status_code == 200
        body = response.json()
        assert body["totalCount"] == 3
        assert body["hasNext"] is False
        assert len(body["contents"]) == 3

    async def test_filters_by_user_id(self, client, admin_headers, token_usage_dataset):
        """userId指定で該当ユーザーのレコードのみ返ること"""
        target_user = token_usage_dataset["target_user"]
        async with client as c:
            response = await c.get(
                f"/api/admin/token-usages?{_period_query()}&userId={target_user.id}",
                headers=admin_headers,
            )

        assert response.status_code == 200
        body = response.json()
        assert body["totalCount"] == 2
        assert all(item["userId"] == str(target_user.id) for item in body["contents"])

    async def test_pagination_has_next(
        self, client, admin_headers, token_usage_dataset
    ):
        """size指定でページングされ、hasNextが正しく計算されること"""
        async with client as c:
            first_page = await c.get(
                f"/api/admin/token-usages?{_period_query()}&size=2&page=0",
                headers=admin_headers,
            )
            second_page = await c.get(
                f"/api/admin/token-usages?{_period_query()}&size=2&page=1",
                headers=admin_headers,
            )

        assert first_page.status_code == 200
        assert second_page.status_code == 200
        assert len(first_page.json()["contents"]) == 2
        assert first_page.json()["hasNext"] is True
        assert len(second_page.json()["contents"]) == 1
        assert second_page.json()["hasNext"] is False

    async def test_order_by_total_tokens_ascending(
        self, client, admin_headers, token_usage_dataset
    ):
        """orderBy=totalTokens&reverse=falseで昇順に並ぶこと"""
        async with client as c:
            response = await c.get(
                f"/api/admin/token-usages?{_period_query()}"
                "&orderBy=totalTokens&reverse=false",
                headers=admin_headers,
            )

        assert response.status_code == 200
        totals = [item["totalTokens"] for item in response.json()["contents"]]
        assert totals == sorted(totals)

    async def test_normal_user_gets_403(
        self, client, general_user_headers, token_usage_dataset
    ):
        """一般ユーザーはアクセスできないこと"""
        async with client as c:
            response = await c.get(
                f"/api/admin/token-usages?{_period_query()}",
                headers=general_user_headers,
            )

        assert response.status_code == 403

    async def test_unauthenticated_gets_401(self, client, token_usage_dataset):
        """未認証ではアクセスできないこと"""
        async with client as c:
            response = await c.get(f"/api/admin/token-usages?{_period_query()}")

        assert response.status_code == 401

    async def test_period_over_31_days_returns_422(
        self, client, admin_headers, token_usage_dataset
    ):
        """期間が31日を超えるとバリデーションエラーになること"""
        async with client as c:
            response = await c.get(
                f"/api/admin/token-usages?{_period_query(days_from=32)}",
                headers=admin_headers,
            )

        assert response.status_code == 422

    async def test_from_after_to_returns_422(
        self, client, admin_headers, token_usage_dataset
    ):
        """fromがtoより後だとバリデーションエラーになること"""
        from_ = _quote_datetime(BASE_TIME + timedelta(days=1))
        to = _quote_datetime(BASE_TIME)
        async with client as c:
            response = await c.get(
                f"/api/admin/token-usages?from={from_}&to={to}",
                headers=admin_headers,
            )

        assert response.status_code == 422

    async def test_unknown_user_id_returns_404(
        self, client, admin_headers, token_usage_dataset
    ):
        """テナント内に存在しないuserIdを指定すると404になること"""
        async with client as c:
            response = await c.get(
                f"/api/admin/token-usages?{_period_query()}&userId={uuid4()}",
                headers=admin_headers,
            )

        assert response.status_code == 404

    async def test_size_zero_returns_422(
        self, client, admin_headers, token_usage_dataset
    ):
        """size=0だとバリデーションエラーになること（hasNextが常にTrueになる不具合を防ぐ）"""
        async with client as c:
            response = await c.get(
                f"/api/admin/token-usages?{_period_query()}&size=0",
                headers=admin_headers,
            )

        assert response.status_code == 422

    async def test_negative_page_returns_422(
        self, client, admin_headers, token_usage_dataset
    ):
        """page=-1だとバリデーションエラーになること（負のOFFSETによるDBエラーを防ぐ）"""
        async with client as c:
            response = await c.get(
                f"/api/admin/token-usages?{_period_query()}&page=-1",
                headers=admin_headers,
            )

        assert response.status_code == 422

    async def test_naive_and_aware_datetime_mixed_does_not_raise_500(
        self, client, admin_headers, token_usage_dataset
    ):
        """fromがtz無し・toがtz付きの混在でも500にならず正常に処理されること"""
        from_ = (BASE_TIME - timedelta(days=1)).replace(tzinfo=None).isoformat()
        to = _quote_datetime(BASE_TIME + timedelta(days=1))
        async with client as c:
            response = await c.get(
                f"/api/admin/token-usages?from={from_}&to={to}",
                headers=admin_headers,
            )

        assert response.status_code == 200

    async def test_group_admin_can_get_token_usages(
        self,
        client,
        group_admin_headers,
        token_usage_dataset,
        token_usage_group,
    ):
        """グループ管理者もアクセスできること"""
        async with client as c:
            response = await c.get(
                f"/api/admin/token-usages?{_period_query()}",
                headers=group_admin_headers,
            )

        assert response.status_code == 200


@pytest.mark.asyncio
class TestGetTokenUsageSummary:
    async def test_admin_can_get_summary(
        self, client, admin_headers, token_usage_dataset
    ):
        """期間内のトークン数・クレジット数の合計が正しく計算されること"""
        async with client as c:
            response = await c.get(
                f"/api/admin/token-usages/summary?{_period_query()}",
                headers=admin_headers,
            )

        assert response.status_code == 200
        body = response.json()
        assert body["inputTokens"] == 10 + 30 + 100
        assert body["outputTokens"] == 20 + 40 + 200
        assert body["embeddingTokens"] == 5
        assert body["totalTokens"] == (10 + 20) + (30 + 40) + (100 + 200 + 5)
        assert body["inputCredits"] == 1 + 3
        assert body["outputCredits"] == 2 + 4
        assert body["embeddingCredits"] == 1
        assert body["totalCredits"] == (1 + 2) + (3 + 4) + 1

    async def test_summary_filters_by_user_id(
        self, client, admin_headers, token_usage_dataset
    ):
        """userId指定でそのユーザーのみの合計になること"""
        target_user = token_usage_dataset["target_user"]
        async with client as c:
            response = await c.get(
                f"/api/admin/token-usages/summary?{_period_query()}"
                f"&userId={target_user.id}",
                headers=admin_headers,
            )

        assert response.status_code == 200
        body = response.json()
        assert body["inputTokens"] == 10 + 30
        assert body["outputTokens"] == 20 + 40
