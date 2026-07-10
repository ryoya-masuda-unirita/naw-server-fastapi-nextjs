"""テナントの当月クレジット利用量が契約プランの上限を超えていないかを検証する。

移植元(Spring Boot)の`TenantMonthlyCreditQuotaService.enforceWithinQuota`に対応する。
`credit_usage_service.py`・`file_service.py`・`index_service.py`・LLM関連の複数service
（`llm_chat_service.py`・`llm_embedding_service.py`）から共通で呼ぶDBクエリを伴う
チェックのため、「serviceが別serviceを呼ばない」規約に抵触しないよう`core/`に置く。
"""

from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.billing_cycle import current_billing_reset_instant_utc
from app.models.plan import Plan
from app.models.subscription import Subscription
from app.repositories.subscription_repository import SubscriptionRepository
from app.repositories.tenant_repository import TenantRepository
from app.repositories.token_usage_repository import TokenUsageRepository

CREDIT_QUOTA_EXCEEDED_MESSAGE = (
    "今月のクレジット利用量の上限に達しているため、チャットが送信できません"
)


async def resolve_active_billing_period(
    tenant_id: str, session: AsyncSession
) -> tuple[Subscription, Plan, datetime, datetime] | None:
    """テナントの有効な請求期間を解決する。

    移植元（Spring Boot）`TenantMonthlyCreditQuotaService`・既存`CreditUsageService`の
    請求期間解決ロジックを共通化したもの。`credit_usage_service.py`・`file_service.py`の
    双方から利用する（`xxx_service.py`が別の`yyy_service.py`を呼ぶ構造を避けるため、
    共通ロジックは`core/`に置く）。

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


async def resolve_credit_limit(
    tenant_id: str, plan: Plan, session: AsyncSession
) -> int | None:
    """プランの月間クレジット上限とテナントの従量課金上限からクレジット上限を算出する。

    Args:
        tenant_id: テナントID。
        plan: 契約中のプラン。
        session: 非同期DBセッション。

    Returns:
        クレジット上限。`plan.max_credits_per_month`が未設定の場合は`None`（上限なし）。
    """
    if plan.max_credits_per_month is None:
        return None

    tenant = await TenantRepository.find_by_id(tenant_id, session)
    tenant_usage_based_limit = (
        tenant.max_usage_based_credits_per_month if tenant is not None else 0
    )
    return plan.max_credits_per_month + tenant_usage_based_limit


async def enforce_within_quota(tenant_id: str, session: AsyncSession) -> None:
    """当月のクレジット利用量が上限を超えていないか検証する。

    移植元`TenantMonthlyCreditQuotaService.enforceWithinQuota`相当。有効なサブスクリプション
    が存在しない場合、またはプランに上限が設定されていない場合はチェックをスキップする
    （移植元同様、上限が定義されていなければ制限しない）。

    Args:
        tenant_id: テナントID。
        session: 非同期DBセッション。

    Raises:
        HTTPException: 当月のクレジット利用量が上限に達している場合、429を返す。
    """
    billing_period = await resolve_active_billing_period(tenant_id, session)
    if billing_period is None:
        return

    _subscription, plan, period_from, period_to = billing_period
    credit_limit = await resolve_credit_limit(tenant_id, plan, session)
    if credit_limit is None:
        return

    row = await TokenUsageRepository.summarize(
        tenant_id, period_from, period_to, None, session
    )
    total_credits = row.input_credits + row.output_credits + row.embedding_credits
    if total_credits >= credit_limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=CREDIT_QUOTA_EXCEEDED_MESSAGE,
        )
