from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

from app.core.security import create_access_token
from app.models.plan import Plan
from app.models.subscription import Subscription, SubscriptionStatus
from app.models.tenant import Tenant
from app.models.token_usage import TokenUsage
from app.models.user import User, UserRole
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID


def _tenant(tenant_id: str, max_usage_based_credits_per_month: int = 0) -> Tenant:
    """テスト用のテナントを組み立てる。

    Parameters
    ----------
    tenant_id : str
        テナントID。
    max_usage_based_credits_per_month : int
        月あたりの従量課金クレジット上限。

    Returns
    -------
    Tenant
        未登録のテナント。
    """
    return Tenant(
        id=tenant_id,
        name=tenant_id,
        owner="admin",
        max_usage_based_credits_per_month=max_usage_based_credits_per_month,
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
    """認証ヘッダーとテナントIDヘッダーを組み立てる。

    Parameters
    ----------
    login_id : str
        ログインID。
    tenant_id : str
        テナントID。

    Returns
    -------
    dict[str, str]
        `Authorization` と `X-Tenant-ID` を含むヘッダー。
    """
    token = create_access_token(login_id, tenant_id)
    return {"Authorization": f"Bearer {token}", "X-Tenant-ID": tenant_id}


@pytest.fixture
async def credit_usage_tenant(session: AsyncSession) -> Tenant:
    """クレジット使用状況テスト用のテナントを登録して返す。"""
    tenant = _tenant("tenant-credit-usage-test", max_usage_based_credits_per_month=500)
    session.add(tenant)
    await session.commit()
    await session.refresh(tenant)
    return tenant


@pytest.fixture
async def credit_usage_user(session: AsyncSession, credit_usage_tenant: Tenant) -> User:
    """クレジット使用状況テスト用の一般ユーザーを登録して返す。"""
    user = User(
        id=uuid4(),
        tenant_id=credit_usage_tenant.id,
        login_id="credit-usage-user",
        name="Credit Usage User",
        role=UserRole.USER,
        is_required_password_reset=False,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@pytest.fixture
async def other_user(session: AsyncSession, credit_usage_tenant: Tenant) -> User:
    """同一テナントに属する別の一般ユーザーを登録して返す。"""
    user = User(
        id=uuid4(),
        tenant_id=credit_usage_tenant.id,
        login_id="credit-usage-other-user",
        name="Credit Usage Other User",
        role=UserRole.USER,
        is_required_password_reset=False,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@pytest.fixture
def credit_usage_headers(
    credit_usage_user: User, credit_usage_tenant: Tenant
) -> dict[str, str]:
    """クレジット使用状況テスト用ユーザーのリクエスト用ヘッダーを返す。"""
    return _headers(credit_usage_user.login_id, credit_usage_tenant.id)


@pytest.fixture
async def credit_usage_plan(session: AsyncSession) -> Plan:
    """クレジット使用状況テスト用のプランを登録して返す。"""
    plan = Plan(
        id="plan-credit-usage-test",
        name="Standard",
        max_users=10,
        max_credits_per_month=1000,
    )
    session.add(plan)
    await session.commit()
    await session.refresh(plan)
    return plan


async def _create_active_subscription(
    session: AsyncSession, tenant_id: str, plan_id: str
) -> Subscription:
    """本日（UTC）を契約開始日とする有効なサブスクリプションを作成する（常にテスト実行時点で有効になる）。"""
    subscription = Subscription(
        tenant_id=tenant_id,
        plan_id=plan_id,
        status=SubscriptionStatus.ACTIVE,
        start_date=datetime.now(timezone.utc).date(),
        end_date=None,
    )
    session.add(subscription)
    await session.commit()
    await session.refresh(subscription)
    return subscription


def _token_usage(
    tenant_id: str,
    user_id: UUID,
    input_credits: int = 0,
    output_credits: int = 0,
    embedding_credits: int = 0,
) -> TokenUsage:
    """テスト用のトークン使用量レコードを組み立てる。

    Parameters
    ----------
    tenant_id : str
        テナントID。
    user_id : UUID
        ユーザーID。
    input_credits : int
        入力トークンのクレジット。
    output_credits : int
        出力トークンのクレジット。
    embedding_credits : int
        埋め込みのクレジット。

    Returns
    -------
    TokenUsage
        未登録のトークン使用量。
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


class TestCreditUsageRouter:
    """クレジット使用状況APIのテスト。"""

    class TestGetMyCreditUsage:
        """自分のクレジット使用状況取得APIのテスト。"""

        async def test_get_my_credit_usage_with_active_subscription(
            self,
            client: AsyncClient,
            session: AsyncSession,
            credit_usage_tenant: Tenant,
            credit_usage_plan: Plan,
            credit_usage_user: User,
            other_user: User,
            credit_usage_headers: dict[str, str],
        ) -> None:
            """有効サブスクリプションと自分の利用実績がある場合、totalCredits等が正しく返ること"""
            await _create_active_subscription(
                session, credit_usage_tenant.id, credit_usage_plan.id
            )
            session.add(
                _token_usage(
                    credit_usage_tenant.id,
                    credit_usage_user.id,
                    input_credits=10,
                    output_credits=20,
                    embedding_credits=5,
                )
            )
            # 他人の利用実績は集計に含めない
            session.add(
                _token_usage(credit_usage_tenant.id, other_user.id, input_credits=1000)
            )
            await session.commit()

            async with client as ac:
                response = await ac.get(
                    "/api/credit-usage/me", headers=credit_usage_headers
                )

            assert response.status_code == 200
            body = response.json()
            assert body["totalCredits"] == 35
            assert "periodFrom" in body
            assert "periodTo" in body
            assert "nextBillingResetAt" in body

        async def test_get_my_credit_usage_without_active_subscription(
            self, client: AsyncClient, credit_usage_headers: dict[str, str]
        ) -> None:
            """有効サブスクリプションがない場合、空の{}が返ること"""
            async with client as ac:
                response = await ac.get(
                    "/api/credit-usage/me", headers=credit_usage_headers
                )

            assert response.status_code == 200
            assert response.json() == {}

        async def test_get_my_credit_usage_without_tenant_header(
            self, client: AsyncClient, credit_usage_user: User
        ) -> None:
            """X-Tenant-ID未指定でエラーになること"""
            token = create_access_token(
                credit_usage_user.login_id, credit_usage_user.tenant_id
            )
            async with client as ac:
                response = await ac.get(
                    "/api/credit-usage/me",
                    headers={"Authorization": f"Bearer {token}"},
                )

            assert response.status_code == 400

        async def test_get_my_credit_usage_without_authentication(
            self, client: AsyncClient, credit_usage_tenant: Tenant
        ) -> None:
            """未認証で401になること"""
            async with client as ac:
                response = await ac.get(
                    "/api/credit-usage/me",
                    headers={"X-Tenant-ID": credit_usage_tenant.id},
                )

            assert response.status_code == 401

    class TestGetWorkspaceCreditUsage:
        """ワークスペースのクレジット使用状況取得APIのテスト。"""

        async def test_get_workspace_credit_usage_with_active_subscription(
            self,
            client: AsyncClient,
            session: AsyncSession,
            credit_usage_tenant: Tenant,
            credit_usage_plan: Plan,
            credit_usage_user: User,
            other_user: User,
            credit_usage_headers: dict[str, str],
        ) -> None:
            """有効サブスクリプションがある場合、テナント全体のtotalCreditsとcreditLimitが正しく返ること"""
            await _create_active_subscription(
                session, credit_usage_tenant.id, credit_usage_plan.id
            )
            session.add(
                _token_usage(
                    credit_usage_tenant.id, credit_usage_user.id, input_credits=10
                )
            )
            session.add(
                _token_usage(credit_usage_tenant.id, other_user.id, input_credits=20)
            )
            await session.commit()

            async with client as ac:
                response = await ac.get(
                    "/api/credit-usage/workspace", headers=credit_usage_headers
                )

            assert response.status_code == 200
            body = response.json()
            assert body["totalCredits"] == 30
            # plan.max_credits_per_month(1000) + tenant.max_usage_based_credits_per_month(500)
            assert body["creditLimit"] == 1500

        async def test_get_workspace_credit_usage_credit_limit_omitted_when_plan_limit_is_null(
            self,
            client: AsyncClient,
            session: AsyncSession,
            credit_usage_tenant: Tenant,
            credit_usage_headers: dict[str, str],
        ) -> None:
            """Plan.maxCreditsPerMonthがNULLの場合、creditLimitがレスポンスに含まれないこと"""
            plan = Plan(
                id="plan-null-limit",
                name="Unlimited",
                max_users=10,
                max_credits_per_month=None,
            )
            session.add(plan)
            await session.commit()
            await session.refresh(plan)
            await _create_active_subscription(session, credit_usage_tenant.id, plan.id)

            async with client as ac:
                response = await ac.get(
                    "/api/credit-usage/workspace", headers=credit_usage_headers
                )

            assert response.status_code == 200
            body = response.json()
            assert "creditLimit" not in body

        async def test_get_workspace_credit_usage_without_active_subscription(
            self, client: AsyncClient, credit_usage_headers: dict[str, str]
        ) -> None:
            """有効サブスクリプションがない場合、空の{}が返ること"""
            async with client as ac:
                response = await ac.get(
                    "/api/credit-usage/workspace", headers=credit_usage_headers
                )

            assert response.status_code == 200
            assert response.json() == {}

        async def test_get_workspace_credit_usage_expired_subscription_is_treated_as_inactive(
            self,
            client: AsyncClient,
            session: AsyncSession,
            credit_usage_tenant: Tenant,
            credit_usage_plan: Plan,
            credit_usage_headers: dict[str, str],
        ) -> None:
            """end_dateが過去のサブスクリプションは有効として扱われず空レスポンスになること"""
            today_utc = datetime.now(timezone.utc).date()
            subscription = Subscription(
                tenant_id=credit_usage_tenant.id,
                plan_id=credit_usage_plan.id,
                status=SubscriptionStatus.ACTIVE,
                start_date=today_utc - timedelta(days=60),
                end_date=today_utc - timedelta(days=1),
            )
            session.add(subscription)
            await session.commit()

            async with client as ac:
                response = await ac.get(
                    "/api/credit-usage/workspace", headers=credit_usage_headers
                )

            assert response.status_code == 200
            assert response.json() == {}
