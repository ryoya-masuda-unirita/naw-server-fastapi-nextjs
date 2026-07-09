from datetime import date

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.plan import Plan
from app.models.subscription import Subscription, SubscriptionStatus


class SubscriptionRepository:
    @staticmethod
    async def find_active_by_tenant_id_with_plan(
        tenant_id: str, today: date, session: AsyncSession
    ) -> tuple[Subscription, Plan] | None:
        """テナントの有効なサブスクリプションを、紐づくプランと合わせて1件取得する。

        有効なサブスクリプションとは、ステータスが`ACTIVE`かつ`end_date`が未設定
        または本日以降であるものを指す。複数該当する場合は作成日時が最新のものを採用する。

        Args:
            tenant_id: テナントID。
            today: 判定基準日（UTC日付）。
            session: 非同期DBセッション。

        Returns:
            該当する`(Subscription, Plan)`のタプル。存在しない場合は`None`。
        """
        stmt = (
            select(Subscription, Plan)
            .join(Plan, Plan.id == Subscription.plan_id)
            .where(
                Subscription.tenant_id == tenant_id,
                Subscription.status == SubscriptionStatus.ACTIVE,
                or_(
                    Subscription.end_date.is_(None),
                    Subscription.end_date >= today,
                ),
            )
            .order_by(Subscription.created_at.desc())
            .limit(1)
        )
        result = await session.execute(stmt)
        row = result.first()
        return (row[0], row[1]) if row is not None else None
