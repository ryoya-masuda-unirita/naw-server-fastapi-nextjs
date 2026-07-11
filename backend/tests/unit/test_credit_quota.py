from datetime import date
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.core.credit_quota import (
    CREDIT_QUOTA_EXCEEDED_MESSAGE,
    enforce_within_quota,
    is_sort_by_total_credits,
    validate_total_credits_sort,
)
from app.models.plan import Plan
from app.models.subscription import Subscription, SubscriptionStatus
from app.models.tenant import Tenant


def _tenant(max_usage_based_credits_per_month: int = 100) -> Tenant:
    return Tenant(
        id="tenant-1",
        name="tenant-1",
        owner="admin",
        max_usage_based_credits_per_month=max_usage_based_credits_per_month,
    )


def _plan(max_credits_per_month: int | None = 1000) -> Plan:
    return Plan(
        id="plan-1",
        name="plan-1",
        max_users=10,
        max_credits_per_month=max_credits_per_month,
    )


def _subscription() -> Subscription:
    return Subscription(
        id="sub-1",
        tenant_id="tenant-1",
        plan_id="plan-1",
        status=SubscriptionStatus.ACTIVE,
        start_date=date(2024, 1, 1),
    )


def _summary_row(input_credits=0, output_credits=0, embedding_credits=0) -> MagicMock:
    row = MagicMock()
    row.input_credits = input_credits
    row.output_credits = output_credits
    row.embedding_credits = embedding_credits
    return row


class TestEnforceWithinQuota:
    """enforce_within_quota のテスト"""

    @patch(
        "app.core.credit_quota.SubscriptionRepository.find_active_by_tenant_id_with_plan",
        new_callable=AsyncMock,
    )
    async def test_skips_when_no_active_subscription(self, mock_find_active):
        """有効なサブスクリプションが存在しない場合チェックをスキップすること"""
        mock_find_active.return_value = None

        await enforce_within_quota("tenant-1", session=None)

    @patch(
        "app.core.credit_quota.SubscriptionRepository.find_active_by_tenant_id_with_plan",
        new_callable=AsyncMock,
    )
    async def test_skips_when_plan_has_no_credit_limit(self, mock_find_active):
        """プランのクレジット枠が未設定の場合チェックをスキップすること"""
        mock_find_active.return_value = (
            _subscription(),
            _plan(max_credits_per_month=None),
        )

        await enforce_within_quota("tenant-1", session=None)

    @patch(
        "app.core.credit_quota.TokenUsageRepository.summarize", new_callable=AsyncMock
    )
    @patch("app.core.credit_quota.TenantRepository.find_by_id", new_callable=AsyncMock)
    @patch(
        "app.core.credit_quota.SubscriptionRepository.find_active_by_tenant_id_with_plan",
        new_callable=AsyncMock,
    )
    async def test_passes_when_usage_below_limit(
        self, mock_find_active, mock_find_tenant, mock_summarize
    ):
        """当月利用量が上限未満の場合チェックを通過すること"""
        mock_find_active.return_value = (
            _subscription(),
            _plan(max_credits_per_month=1000),
        )
        mock_find_tenant.return_value = _tenant(max_usage_based_credits_per_month=0)
        mock_summarize.return_value = _summary_row(input_credits=500)

        await enforce_within_quota("tenant-1", session=None)

    @patch(
        "app.core.credit_quota.TokenUsageRepository.summarize", new_callable=AsyncMock
    )
    @patch("app.core.credit_quota.TenantRepository.find_by_id", new_callable=AsyncMock)
    @patch(
        "app.core.credit_quota.SubscriptionRepository.find_active_by_tenant_id_with_plan",
        new_callable=AsyncMock,
    )
    async def test_raises_429_when_usage_reaches_limit(
        self, mock_find_active, mock_find_tenant, mock_summarize
    ):
        """当月利用量が上限以上の場合429エラーになること"""
        mock_find_active.return_value = (
            _subscription(),
            _plan(max_credits_per_month=1000),
        )
        mock_find_tenant.return_value = _tenant(max_usage_based_credits_per_month=0)
        mock_summarize.return_value = _summary_row(input_credits=1000)

        with pytest.raises(HTTPException) as exc_info:
            await enforce_within_quota("tenant-1", session=None)

        assert exc_info.value.status_code == 429
        assert exc_info.value.detail == CREDIT_QUOTA_EXCEEDED_MESSAGE

    @patch(
        "app.core.credit_quota.TokenUsageRepository.summarize", new_callable=AsyncMock
    )
    @patch("app.core.credit_quota.TenantRepository.find_by_id", new_callable=AsyncMock)
    @patch(
        "app.core.credit_quota.SubscriptionRepository.find_active_by_tenant_id_with_plan",
        new_callable=AsyncMock,
    )
    async def test_treats_missing_tenant_as_no_usage_based_limit(
        self, mock_find_active, mock_find_tenant, mock_summarize
    ):
        """テナントが見つからない場合は利用ベース上限0として計算すること"""
        mock_find_active.return_value = (
            _subscription(),
            _plan(max_credits_per_month=1000),
        )
        mock_find_tenant.return_value = None
        mock_summarize.return_value = _summary_row(input_credits=1000)

        with pytest.raises(HTTPException) as exc_info:
            await enforce_within_quota("tenant-1", session=None)

        assert exc_info.value.status_code == 429


class TestIsSortByTotalCredits:
    """is_sort_by_total_credits のテスト（NAW-1172）"""

    def test_true_when_sort_property_is_total_credits(self):
        """sort=totalCredits,descの場合Trueを返すこと"""
        assert is_sort_by_total_credits("totalCredits,desc") is True

    def test_false_for_other_sort_property(self):
        """totalCredits以外のsortの場合Falseを返すこと"""
        assert is_sort_by_total_credits("name,asc") is False


class TestValidateTotalCreditsSort:
    """validate_total_credits_sort のテスト（NAW-1172）"""

    def test_raises_400_when_sort_total_credits_without_include_usage(self):
        """sort=totalCreditsかつinclude_usage=Falseの場合400を返すこと"""
        with pytest.raises(HTTPException) as exc_info:
            validate_total_credits_sort("totalCredits,desc", False)

        assert exc_info.value.status_code == 400
        assert exc_info.value.detail == "sort=totalCredits requires includeUsage=true"

    def test_allows_sort_total_credits_with_include_usage(self):
        """sort=totalCreditsかつinclude_usage=Trueの場合例外にならないこと"""
        validate_total_credits_sort("totalCredits,desc", True)

    def test_allows_other_sort_without_include_usage(self):
        """totalCredits以外のsortの場合include_usage=Falseでも例外にならないこと"""
        validate_total_credits_sort("name,asc", False)
