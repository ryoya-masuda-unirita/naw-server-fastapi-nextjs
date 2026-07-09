from datetime import date, datetime, timedelta, timezone
from uuid import uuid4

import pytest

from app.core.security import create_access_token
from app.models.plan import Plan
from app.models.subscription import Subscription, SubscriptionStatus
from app.models.tenant import Tenant
from app.models.token_usage import TokenUsage
from app.models.user import User, UserRole


def _tenant(tenant_id: str, max_usage_based_credits_per_month: int = 0) -> Tenant:
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
    token = create_access_token(login_id, tenant_id)
    return {"Authorization": f"Bearer {token}", "X-Tenant-ID": tenant_id}


@pytest.fixture
async def credit_usage_tenant(session):
    tenant = _tenant("tenant-credit-usage-test", max_usage_based_credits_per_month=500)
    session.add(tenant)
    await session.commit()
    await session.refresh(tenant)
    return tenant


@pytest.fixture
async def credit_usage_user(session, credit_usage_tenant):
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
async def other_user(session, credit_usage_tenant):
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
def credit_usage_headers(credit_usage_user, credit_usage_tenant):
    return _headers(credit_usage_user.login_id, credit_usage_tenant.id)


@pytest.fixture
async def credit_usage_plan(session):
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
    session, tenant_id: str, plan_id: str
) -> Subscription:
    """本日を契約開始日とする有効なサブスクリプションを作成する（常にテスト実行時点で有効になる）。"""
    subscription = Subscription(
        tenant_id=tenant_id,
        plan_id=plan_id,
        status=SubscriptionStatus.ACTIVE,
        start_date=date.today(),
        end_date=None,
    )
    session.add(subscription)
    await session.commit()
    await session.refresh(subscription)
    return subscription


def _token_usage(
    tenant_id: str,
    user_id,
    input_credits: int = 0,
    output_credits: int = 0,
    embedding_credits: int = 0,
) -> TokenUsage:
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
    class TestGetMyCreditUsage:
        async def test_get_my_credit_usage_with_active_subscription(
            self,
            client,
            session,
            credit_usage_tenant,
            credit_usage_plan,
            credit_usage_user,
            other_user,
            credit_usage_headers,
        ):
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
            self, client, credit_usage_headers
        ):
            """有効サブスクリプションがない場合、空の{}が返ること"""
            async with client as ac:
                response = await ac.get(
                    "/api/credit-usage/me", headers=credit_usage_headers
                )

            assert response.status_code == 200
            assert response.json() == {}

        async def test_get_my_credit_usage_without_tenant_header(
            self, client, credit_usage_user
        ):
            """X-Tenant-ID未指定でエラーになること"""
            token = create_access_token(
                credit_usage_user.login_id, credit_usage_user.tenant_id
            )
            async with client as ac:
                response = await ac.get(
                    "/api/credit-usage/me",
                    headers={"Authorization": f"Bearer {token}"},
                )

            assert response.status_code == 422

        async def test_get_my_credit_usage_without_authentication(
            self, client, credit_usage_tenant
        ):
            """未認証で401になること"""
            async with client as ac:
                response = await ac.get(
                    "/api/credit-usage/me",
                    headers={"X-Tenant-ID": credit_usage_tenant.id},
                )

            assert response.status_code == 401

    class TestGetWorkspaceCreditUsage:
        async def test_get_workspace_credit_usage_with_active_subscription(
            self,
            client,
            session,
            credit_usage_tenant,
            credit_usage_plan,
            credit_usage_user,
            other_user,
            credit_usage_headers,
        ):
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
            self, client, session, credit_usage_tenant, credit_usage_headers
        ):
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
            self, client, credit_usage_headers
        ):
            """有効サブスクリプションがない場合、空の{}が返ること"""
            async with client as ac:
                response = await ac.get(
                    "/api/credit-usage/workspace", headers=credit_usage_headers
                )

            assert response.status_code == 200
            assert response.json() == {}

        async def test_get_workspace_credit_usage_expired_subscription_is_treated_as_inactive(
            self,
            client,
            session,
            credit_usage_tenant,
            credit_usage_plan,
            credit_usage_headers,
        ):
            """end_dateが過去のサブスクリプションは有効として扱われず空レスポンスになること"""
            subscription = Subscription(
                tenant_id=credit_usage_tenant.id,
                plan_id=credit_usage_plan.id,
                status=SubscriptionStatus.ACTIVE,
                start_date=date.today() - timedelta(days=60),
                end_date=date.today() - timedelta(days=1),
            )
            session.add(subscription)
            await session.commit()

            async with client as ac:
                response = await ac.get(
                    "/api/credit-usage/workspace", headers=credit_usage_headers
                )

            assert response.status_code == 200
            assert response.json() == {}
