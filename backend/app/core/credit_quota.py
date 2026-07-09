"""テナントの当月クレジット利用量が契約プランの上限を超えていないかを検証する。

移植元(Spring Boot)の`TenantMonthlyCreditQuotaService.enforceWithinQuota`に対応する。
LLM関連の複数service（`llm_chat_service.py`・`llm_embedding_service.py`）から共通で呼ぶ
DBクエリを伴うチェックのため、「serviceが別serviceを呼ばない」規約に抵触しないよう
`core/`に置く。`app/services/tenant_service.py`の
`_assert_new_max_usage_based_credits_not_below_current_usage`と判定式は同一だが、
目的（設定変更時の整合性チェック vs 呼び出し前のクォータ検証）が異なるため独立実装とする。
"""

from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.billing_cycle import current_billing_reset_instant_utc
from app.repositories.subscription_repository import SubscriptionRepository
from app.repositories.tenant_repository import TenantRepository
from app.repositories.token_usage_repository import TokenUsageRepository

CREDIT_QUOTA_EXCEEDED_MESSAGE = (
    "今月のクレジット利用量の上限に達しているため、チャットが送信できません"
)


async def enforce_within_quota(tenant_id: str, session: AsyncSession) -> None:
    """テナントの当月クレジット利用量が上限に達していないことを検証する。

    テナントが存在しない、有効なサブスクリプションが存在しない、プランのクレジット
    枠が未設定、または請求サイクルの起算日が算出できない場合は、移植元と同様に
    チェックをスキップする（無制限とみなす）。

    Args:
        tenant_id: テナントID。
        session: 非同期DBセッション。

    Raises:
        HTTPException: 請求期間内の利用クレジット合計が
            「プランのクレジット枠 + テナント個別の利用ベース上限」以上の場合、
            429（Too Many Requests）を返す。
    """
    tenant = await TenantRepository.find_by_id(tenant_id, session)
    if tenant is None:
        return

    today_utc = datetime.now(timezone.utc).date()
    active = await SubscriptionRepository.find_active_by_tenant_id_with_plan(
        tenant_id, today_utc, session
    )
    if active is None:
        return
    subscription, plan = active
    if plan.max_credits_per_month is None:
        return

    now = datetime.now(timezone.utc)
    period_from = current_billing_reset_instant_utc(subscription.start_date, now)
    if period_from is None:
        return

    row = await TokenUsageRepository.summarize(
        tenant_id, period_from, now, None, session
    )
    usage = row.input_credits + row.output_credits + row.embedding_credits
    limit = plan.max_credits_per_month + tenant.max_usage_based_credits_per_month
    if usage >= limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=CREDIT_QUOTA_EXCEEDED_MESSAGE,
        )
