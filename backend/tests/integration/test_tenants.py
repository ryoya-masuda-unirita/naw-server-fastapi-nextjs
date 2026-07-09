from datetime import date, datetime, timezone
from unittest.mock import patch
from uuid import uuid4

import pytest

from app.core.azure_cost_client import AzureCostQueryResult
from app.core.security import create_access_token
from app.models.plan import Plan
from app.models.subscription import Subscription, SubscriptionStatus
from app.models.tenant import Tenant
from app.models.tenant_resource import TenantResource, TenantResourceType
from app.models.token_usage import TokenUsage
from app.models.user import User, UserRole


def _tenant(tenant_id: str, max_usage_based_credits_per_month: int = 500) -> Tenant:
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
async def tenant(session):
    """テスト用テナント"""
    t = _tenant("tenants-test-tenant")
    session.add(t)
    await session.commit()
    await session.refresh(t)
    return t


@pytest.fixture
async def other_tenant(session):
    """テスト用の別テナント"""
    t = _tenant("tenants-test-other-tenant")
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
        login_id="tenants-admin-test",
        name="Admin",
        role=UserRole.ADMIN,
        is_required_password_reset=False,
    )
    session.add(u)
    await session.commit()
    await session.refresh(u)
    return u


@pytest.fixture
async def normal_user(session, tenant):
    """テスト用一般ユーザー"""
    u = User(
        id=uuid4(),
        tenant_id=tenant.id,
        login_id="tenants-user-test",
        name="User",
        role=UserRole.USER,
        is_required_password_reset=False,
    )
    session.add(u)
    await session.commit()
    await session.refresh(u)
    return u


@pytest.fixture
async def other_tenant_admin_user(session, other_tenant):
    """別テナントの管理者ユーザー"""
    u = User(
        id=uuid4(),
        tenant_id=other_tenant.id,
        login_id="tenants-other-admin-test",
        name="Other Admin",
        role=UserRole.ADMIN,
        is_required_password_reset=False,
    )
    session.add(u)
    await session.commit()
    await session.refresh(u)
    return u


@pytest.fixture
async def plan(session):
    plan = Plan(
        id="tenants-test-plan",
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


@pytest.fixture
async def tenant_resource(session, tenant):
    resource = TenantResource(
        tenant_id=tenant.id,
        type=TenantResourceType.AZURE_OPENAI,
        description="test resource",
    )
    session.add(resource)
    await session.commit()
    await session.refresh(resource)
    return resource


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


class TestTenantsRouter:
    class TestGetTenantDetails:
        async def test_get_tenant_details_with_subscription_and_resources(
            self, client, session, tenant, admin_user, plan, tenant_resource
        ):
            """サブスクリプション・リソースを持つテナントを管理者が取得すると、詳細情報が正しく返ること"""
            await _create_active_subscription(session, tenant.id, plan.id)

            async with client as ac:
                response = await ac.get(
                    "/api/admin/tenants",
                    headers=_headers(admin_user.login_id, tenant.id),
                )

            assert response.status_code == 200
            body = response.json()
            assert body["tenantId"] == tenant.id
            assert body["tenantName"] == tenant.name
            assert body["maxUsageBasedCreditsPerMonth"] == 500
            assert len(body["resources"]) == 1
            assert body["resources"][0]["id"] == tenant_resource.id
            assert body["resources"][0]["type"] == "AZURE_OPENAI"
            assert body["subscription"]["plan"]["id"] == plan.id
            assert body["subscription"]["plan"]["maxCreditsPerMonth"] == 1000

        async def test_get_tenant_details_without_active_subscription(
            self, client, tenant, admin_user
        ):
            """有効なサブスクリプションがない場合subscriptionがnullになること"""
            async with client as ac:
                response = await ac.get(
                    "/api/admin/tenants",
                    headers=_headers(admin_user.login_id, tenant.id),
                )

            assert response.status_code == 200
            assert response.json()["subscription"] is None

        async def test_get_tenant_details_without_authentication(self, client, tenant):
            """未認証で401になること"""
            async with client as ac:
                response = await ac.get(
                    "/api/admin/tenants", headers={"X-Tenant-ID": tenant.id}
                )

            assert response.status_code == 401

        async def test_get_tenant_details_forbidden_for_non_admin(
            self, client, tenant, normal_user
        ):
            """一般ユーザーで403になること"""
            async with client as ac:
                response = await ac.get(
                    "/api/admin/tenants",
                    headers=_headers(normal_user.login_id, tenant.id),
                )

            assert response.status_code == 403

        async def test_get_tenant_details_forbidden_when_tenant_header_mismatch(
            self, client, tenant, admin_user, other_tenant
        ):
            """JWTと異なるX-Tenant-IDヘッダーで403になること"""
            token = create_access_token(admin_user.login_id, tenant.id)
            async with client as ac:
                response = await ac.get(
                    "/api/admin/tenants",
                    headers={
                        "Authorization": f"Bearer {token}",
                        "X-Tenant-ID": other_tenant.id,
                    },
                )

            assert response.status_code == 403

    class TestPatchAdminTenant:
        async def test_patch_tenant_name_only(self, client, tenant, admin_user):
            """tenantNameのみ送信すると、名前のみ更新されクレジット上限は変化しないこと"""
            async with client as ac:
                response = await ac.patch(
                    f"/api/admin/tenants/{tenant.id}",
                    json={"tenantName": "New Name"},
                    headers=_headers(admin_user.login_id, tenant.id),
                )

            assert response.status_code == 200
            body = response.json()
            assert body["tenantName"] == "New Name"
            assert body["maxUsageBasedCreditsPerMonth"] == 500

        async def test_patch_max_usage_based_credits_only(
            self, client, tenant, admin_user
        ):
            """maxUsageBasedCreditsPerMonthのみ送信すると上限のみ更新されること"""
            async with client as ac:
                response = await ac.patch(
                    f"/api/admin/tenants/{tenant.id}",
                    json={"maxUsageBasedCreditsPerMonth": 999},
                    headers=_headers(admin_user.login_id, tenant.id),
                )

            assert response.status_code == 200
            body = response.json()
            assert body["tenantName"] == tenant.name
            assert body["maxUsageBasedCreditsPerMonth"] == 999

        async def test_patch_max_usage_based_credits_null_resets_to_zero(
            self, client, tenant, admin_user
        ):
            """maxUsageBasedCreditsPerMonthにnullを指定すると0にリセットされること"""
            async with client as ac:
                response = await ac.patch(
                    f"/api/admin/tenants/{tenant.id}",
                    json={"maxUsageBasedCreditsPerMonth": None},
                    headers=_headers(admin_user.login_id, tenant.id),
                )

            assert response.status_code == 200
            assert response.json()["maxUsageBasedCreditsPerMonth"] == 0

        async def test_patch_both_fields(self, client, tenant, admin_user):
            """両キーを送信すると両方更新されること"""
            async with client as ac:
                response = await ac.patch(
                    f"/api/admin/tenants/{tenant.id}",
                    json={
                        "tenantName": "Both Name",
                        "maxUsageBasedCreditsPerMonth": 42,
                    },
                    headers=_headers(admin_user.login_id, tenant.id),
                )

            assert response.status_code == 200
            body = response.json()
            assert body["tenantName"] == "Both Name"
            assert body["maxUsageBasedCreditsPerMonth"] == 42

        async def test_patch_empty_body_does_not_update(
            self, client, tenant, admin_user
        ):
            """空ボディの場合更新されず現状が返ること"""
            async with client as ac:
                response = await ac.patch(
                    f"/api/admin/tenants/{tenant.id}",
                    json={},
                    headers=_headers(admin_user.login_id, tenant.id),
                )

            assert response.status_code == 200
            body = response.json()
            assert body["tenantName"] == tenant.name
            assert body["maxUsageBasedCreditsPerMonth"] == 500

        async def test_patch_returns_400_when_usage_exceeds_new_limit(
            self, client, session, tenant, admin_user, plan
        ):
            """請求期間内利用クレジットが新上限以上のとき400になること"""
            await _create_active_subscription(session, tenant.id, plan.id)
            session.add(_token_usage(tenant.id, admin_user.id, input_credits=1500))
            await session.commit()

            async with client as ac:
                response = await ac.patch(
                    f"/api/admin/tenants/{tenant.id}",
                    # plan.max_credits_per_month(1000) + 0 = 1000 <= usage(1500)
                    json={"maxUsageBasedCreditsPerMonth": 0},
                    headers=_headers(admin_user.login_id, tenant.id),
                )

            assert response.status_code == 400

        async def test_patch_returns_422_for_negative_credits(
            self, client, tenant, admin_user
        ):
            """負の値で422になること"""
            async with client as ac:
                response = await ac.patch(
                    f"/api/admin/tenants/{tenant.id}",
                    json={"maxUsageBasedCreditsPerMonth": -1},
                    headers=_headers(admin_user.login_id, tenant.id),
                )

            assert response.status_code == 422

        async def test_patch_returns_422_for_null_tenant_name(
            self, client, tenant, admin_user
        ):
            """tenantNameキーの値がnullの場合422になること（DB列がNOT NULLのため）"""
            async with client as ac:
                response = await ac.patch(
                    f"/api/admin/tenants/{tenant.id}",
                    json={"tenantName": None},
                    headers=_headers(admin_user.login_id, tenant.id),
                )

            assert response.status_code == 422

        async def test_patch_returns_422_for_too_long_tenant_name(
            self, client, tenant, admin_user
        ):
            """tenantNameがDB列の上限(32文字)を超える場合422になること"""
            async with client as ac:
                response = await ac.patch(
                    f"/api/admin/tenants/{tenant.id}",
                    json={"tenantName": "a" * 33},
                    headers=_headers(admin_user.login_id, tenant.id),
                )

            assert response.status_code == 422

        async def test_patch_forbidden_when_tenant_path_mismatch(
            self, client, tenant, admin_user, other_tenant
        ):
            """パスのtenantIdと認証テナントが異なる場合403になること"""
            async with client as ac:
                response = await ac.patch(
                    f"/api/admin/tenants/{other_tenant.id}",
                    json={"tenantName": "New Name"},
                    headers=_headers(admin_user.login_id, tenant.id),
                )

            assert response.status_code == 403

        async def test_patch_forbidden_for_non_admin(self, client, tenant, normal_user):
            """一般ユーザーで403になること"""
            async with client as ac:
                response = await ac.patch(
                    f"/api/admin/tenants/{tenant.id}",
                    json={"tenantName": "New Name"},
                    headers=_headers(normal_user.login_id, tenant.id),
                )

            assert response.status_code == 403

    class TestGetTenantResourceCost:
        """GET /api/admin/tenants/resources/{resourceId}/cost のテスト

        Azure Cost Management APIへの実際の接続は行わず、
        `AzureCostClient.get_cost_by_resource_id` をモックして検証する。
        """

        async def test_returns_cost_list_for_owned_resource(
            self, client, tenant, admin_user, tenant_resource
        ):
            """自テナントに紐づくリソースのコスト一覧を取得できること"""
            with patch(
                "app.services.tenant_service.AzureCostClient.get_cost_by_resource_id",
                return_value=[
                    AzureCostQueryResult(
                        resource_type="AZURE_OPENAI",
                        usage_date=date(2024, 1, 1),
                        pre_tax_cost=12.5,
                        currency="JPY",
                    )
                ],
            ) as mock_get_cost:
                async with client as ac:
                    response = await ac.get(
                        f"/api/admin/tenants/resources/{tenant_resource.id}/cost",
                        headers=_headers(admin_user.login_id, tenant.id),
                    )

            assert response.status_code == 200
            assert response.json() == [
                {
                    "resourceType": "AZURE_OPENAI",
                    "usageDate": "2024-01-01",
                    "preTaxCost": 12.5,
                    "currency": "JPY",
                }
            ]
            mock_get_cost.assert_called_once_with(tenant_resource.id, None, None)

        async def test_forwards_from_and_to_query_params(
            self, client, tenant, admin_user, tenant_resource
        ):
            """from/toクエリパラメータがISO8601日時としてパースされ渡されること"""
            with patch(
                "app.services.tenant_service.AzureCostClient.get_cost_by_resource_id",
                return_value=[],
            ) as mock_get_cost:
                async with client as ac:
                    response = await ac.get(
                        f"/api/admin/tenants/resources/{tenant_resource.id}/cost",
                        params={
                            "from": "2024-01-01T00:00:00Z",
                            "to": "2024-02-01T00:00:00Z",
                        },
                        headers=_headers(admin_user.login_id, tenant.id),
                    )

            assert response.status_code == 200
            mock_get_cost.assert_called_once_with(
                tenant_resource.id,
                datetime(2024, 1, 1, tzinfo=timezone.utc),
                datetime(2024, 2, 1, tzinfo=timezone.utc),
            )

        async def test_returns_400_when_resource_belongs_to_other_tenant(
            self,
            client,
            tenant,
            other_tenant,
            other_tenant_admin_user,
            tenant_resource,
        ):
            """他テナントのリソースIDを指定した場合400になること"""
            async with client as ac:
                response = await ac.get(
                    f"/api/admin/tenants/resources/{tenant_resource.id}/cost",
                    headers=_headers(other_tenant_admin_user.login_id, other_tenant.id),
                )

            assert response.status_code == 400

        async def test_returns_400_when_resource_id_does_not_exist(
            self, client, tenant, admin_user
        ):
            """存在しないリソースIDを指定した場合400になること"""
            async with client as ac:
                response = await ac.get(
                    "/api/admin/tenants/resources/not-exist/cost",
                    headers=_headers(admin_user.login_id, tenant.id),
                )

            assert response.status_code == 400

        async def test_returns_400_for_invalid_date_format(
            self, client, tenant, admin_user, tenant_resource
        ):
            """from/toがISO8601形式でない場合400になること"""
            async with client as ac:
                response = await ac.get(
                    f"/api/admin/tenants/resources/{tenant_resource.id}/cost",
                    params={"from": "not-a-date"},
                    headers=_headers(admin_user.login_id, tenant.id),
                )

            assert response.status_code == 400

        async def test_forbidden_for_non_admin(
            self, client, tenant, normal_user, tenant_resource
        ):
            """一般ユーザーで403になること"""
            async with client as ac:
                response = await ac.get(
                    f"/api/admin/tenants/resources/{tenant_resource.id}/cost",
                    headers=_headers(normal_user.login_id, tenant.id),
                )

            assert response.status_code == 403
