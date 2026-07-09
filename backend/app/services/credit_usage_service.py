from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.billing_cycle import (
    current_billing_reset_instant_utc,
    next_billing_reset_instant_utc,
)
from app.models.plan import Plan
from app.models.subscription import Subscription
from app.models.user import User
from app.repositories.subscription_repository import SubscriptionRepository
from app.repositories.tenant_repository import TenantRepository
from app.repositories.token_usage_repository import TokenUsageRepository
from app.schemas.credit_usage import (
    MyCreditUsageResponse,
    WorkspaceCreditUsageResponse,
)


class CreditUsageService:
    @staticmethod
    async def _resolve_active_billing_period(
        tenant_id: str, session: AsyncSession
    ) -> tuple[Subscription, Plan, datetime, datetime] | None:
        """テナントの有効な請求期間を解決する。

        Args:
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            `(subscription, plan, period_from, period_to)`のタプル。有効なサブスクリプション
            が存在しない場合、または請求サイクルの起算日が算出できない場合は`None`。
        """
        now = datetime.now(timezone.utc)
        result = await SubscriptionRepository.find_active_by_tenant_id_with_plan(
            tenant_id, now.date(), session
        )
        if result is None:
            return None

        subscription, plan = result
        period_from = current_billing_reset_instant_utc(subscription.start_date, now)
        if period_from is None:
            return None

        return subscription, plan, period_from, now

    @staticmethod
    async def get_my_credit_usage(
        tenant_id: str, current_user: User, session: AsyncSession
    ) -> MyCreditUsageResponse:
        """ログインユーザー本人の請求期間内クレジット利用状況を取得する。

        Args:
            tenant_id: テナントID。
            current_user: 認証済みユーザー。
            session: 非同期DBセッション。

        Returns:
            本人のクレジット利用状況レスポンス。有効なサブスクリプションが存在しない
            場合は全フィールドが`None`のレスポンスを返す。
        """
        billing_period = await CreditUsageService._resolve_active_billing_period(
            tenant_id, session
        )
        if billing_period is None:
            return MyCreditUsageResponse()

        subscription, _plan, period_from, period_to = billing_period

        row = await TokenUsageRepository.summarize(
            tenant_id, period_from, period_to, current_user.id, session
        )
        total_credits = row.input_credits + row.output_credits + row.embedding_credits

        return MyCreditUsageResponse(
            totalCredits=total_credits,
            periodFrom=period_from,
            periodTo=period_to,
            nextBillingResetAt=next_billing_reset_instant_utc(
                subscription.start_date, period_to
            ),
        )

    @staticmethod
    async def get_workspace_credit_usage(
        tenant_id: str, session: AsyncSession
    ) -> WorkspaceCreditUsageResponse:
        """テナント全体の請求期間内クレジット利用状況を取得する。

        Args:
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            テナント全体のクレジット利用状況レスポンス。有効なサブスクリプションが
            存在しない場合は全フィールドが`None`のレスポンスを返す。
        """
        billing_period = await CreditUsageService._resolve_active_billing_period(
            tenant_id, session
        )
        if billing_period is None:
            return WorkspaceCreditUsageResponse()

        subscription, plan, period_from, period_to = billing_period

        row = await TokenUsageRepository.summarize(
            tenant_id, period_from, period_to, None, session
        )
        total_credits = row.input_credits + row.output_credits + row.embedding_credits

        credit_limit = await CreditUsageService._resolve_credit_limit(
            tenant_id, plan, session
        )

        return WorkspaceCreditUsageResponse(
            totalCredits=total_credits,
            creditLimit=credit_limit,
            periodFrom=period_from,
            periodTo=period_to,
            nextBillingResetAt=next_billing_reset_instant_utc(
                subscription.start_date, period_to
            ),
        )

    @staticmethod
    async def _resolve_credit_limit(
        tenant_id: str, plan: Plan, session: AsyncSession
    ) -> int | None:
        """プランの月間クレジット上限とテナントの従量課金上限からクレジット上限を算出する。

        Args:
            tenant_id: テナントID。
            plan: 契約中のプラン。
            session: 非同期DBセッション。

        Returns:
            クレジット上限。`plan.max_credits_per_month`が未設定の場合は`None`。
        """
        if plan.max_credits_per_month is None:
            return None

        tenant = await TenantRepository.find_by_id(tenant_id, session)
        tenant_usage_based_limit = (
            tenant.max_usage_based_credits_per_month if tenant is not None else 0
        )
        return plan.max_credits_per_month + tenant_usage_based_limit
