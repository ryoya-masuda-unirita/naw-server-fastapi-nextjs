from sqlalchemy.ext.asyncio import AsyncSession

from app.core import credit_quota
from app.core.billing_cycle import next_billing_reset_instant_utc
from app.models.user import User
from app.repositories.token_usage_repository import TokenUsageRepository
from app.schemas.credit_usage import (
    MyCreditUsageResponse,
    WorkspaceCreditUsageResponse,
)


class CreditUsageService:
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
        billing_period = await credit_quota.resolve_active_billing_period(
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
        billing_period = await credit_quota.resolve_active_billing_period(
            tenant_id, session
        )
        if billing_period is None:
            return WorkspaceCreditUsageResponse()

        subscription, plan, period_from, period_to = billing_period

        row = await TokenUsageRepository.summarize(
            tenant_id, period_from, period_to, None, session
        )
        total_credits = row.input_credits + row.output_credits + row.embedding_credits

        credit_limit = await credit_quota.resolve_credit_limit(tenant_id, plan, session)

        return WorkspaceCreditUsageResponse(
            totalCredits=total_credits,
            creditLimit=credit_limit,
            periodFrom=period_from,
            periodTo=period_to,
            nextBillingResetAt=next_billing_reset_instant_utc(
                subscription.start_date, period_to
            ),
        )
