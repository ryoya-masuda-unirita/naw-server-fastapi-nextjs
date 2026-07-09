from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.billing_cycle import current_billing_reset_instant_utc
from app.models.plan import Plan
from app.models.subscription import Subscription
from app.models.tenant import Tenant
from app.repositories.subscription_repository import SubscriptionRepository
from app.repositories.tenant_repository import TenantRepository
from app.repositories.tenant_resource_repository import TenantResourceRepository
from app.repositories.token_usage_repository import TokenUsageRepository
from app.schemas.tenant import (
    PlanResponse,
    SubscriptionResponse,
    TenantAdminPatchRequest,
    TenantDetailResponse,
    TenantResourceResponse,
)


class TenantService:
    @staticmethod
    async def get_tenant_detail_response(
        tenant_id: str, session: AsyncSession
    ) -> TenantDetailResponse:
        """テナント詳細情報を取得する。

        Args:
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            テナント詳細レスポンス。

        Raises:
            HTTPException: テナントが存在しない場合404を返す。
        """
        tenant = await TenantRepository.find_by_id(tenant_id, session)
        if tenant is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="テナントが存在しません。"
            )
        return await TenantService._build_response(tenant, session)

    @staticmethod
    async def patch_admin_tenant(
        tenant_id: str, request: TenantAdminPatchRequest, session: AsyncSession
    ) -> TenantDetailResponse:
        """管理用にテナント名・利用ベースクレジット上限を部分更新する。

        送られたキーのみを更新対象とする。いずれのキーも送られていない場合は
        永続化を行わず、現状のテナント詳細を返す。

        Args:
            tenant_id: テナントID。
            request: PATCHリクエストボディ。
            session: 非同期DBセッション。

        Returns:
            更新後（更新なしの場合は現状）のテナント詳細レスポンス。

        Raises:
            HTTPException: テナントが存在しない場合404、請求期間内の利用クレジットが
                プラン枠＋新しい利用ベース上限以上で上限を下げられない場合400を返す。
        """
        tenant = await TenantRepository.find_by_id(tenant_id, session)
        if tenant is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="テナントが存在しません。"
            )

        fields_set = request.model_fields_set
        updated = False

        if "tenantName" in fields_set and request.tenantName is not None:
            tenant.name = request.tenantName
            updated = True

        if "maxUsageBasedCreditsPerMonth" in fields_set:
            effective = (
                request.maxUsageBasedCreditsPerMonth
                if request.maxUsageBasedCreditsPerMonth is not None
                else 0
            )
            await TenantService._assert_new_max_usage_based_credits_not_below_current_usage(
                tenant_id, effective, session
            )
            tenant.max_usage_based_credits_per_month = effective
            updated = True

        if updated:
            tenant = await TenantRepository.update(tenant, session)

        return await TenantService._build_response(tenant, session)

    @staticmethod
    async def _assert_new_max_usage_based_credits_not_below_current_usage(
        tenant_id: str, new_max: int, session: AsyncSession
    ) -> None:
        """新しい利用ベースクレジット上限が、請求期間内の現在の利用量を下回らないことを検証する。

        移植元Java版`assertNewMaxUsageBasedCreditsNotBelowCurrentUsage`と同じ計算。
        有効なサブスクリプションが存在しない、プランのクレジット枠が未設定、または
        請求サイクルの起算日が算出できない場合はチェックをスキップする。

        Args:
            tenant_id: テナントID。
            new_max: 新しく設定しようとする利用ベースクレジット上限。
            session: 非同期DBセッション。

        Raises:
            HTTPException: 請求期間内の利用クレジット合計が
                「プランのクレジット枠 + new_max」以上の場合400を返す。
        """
        now = datetime.now(timezone.utc)
        result = await SubscriptionRepository.find_active_by_tenant_id_with_plan(
            tenant_id, now.date(), session
        )
        if result is None:
            return

        _subscription, plan = result
        if plan.max_credits_per_month is None:
            return

        period_from = current_billing_reset_instant_utc(_subscription.start_date, now)
        if period_from is None:
            return

        row = await TokenUsageRepository.summarize(
            tenant_id, period_from, now, None, session
        )
        usage = row.input_credits + row.output_credits + row.embedding_credits
        limit = plan.max_credits_per_month + new_max
        if usage >= limit:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "請求期間内の利用クレジットが、設定しようとする上限"
                    "（プラン含枠＋利用ベース上限）以上です。"
                    "より大きい上限を指定してください。"
                ),
            )

    @staticmethod
    async def _build_response(
        tenant: Tenant, session: AsyncSession
    ) -> TenantDetailResponse:
        """テナントエンティティからリソース・サブスクリプションを解決してレスポンスを組み立てる。

        Args:
            tenant: テナント。
            session: 非同期DBセッション。

        Returns:
            テナント詳細レスポンス。
        """
        resources = await TenantResourceRepository.find_by_tenant_id(tenant.id, session)
        today_utc = datetime.now(timezone.utc).date()
        active = await SubscriptionRepository.find_active_by_tenant_id_with_plan(
            tenant.id, today_utc, session
        )
        subscription_response = None
        if active is not None:
            subscription, plan = active
            subscription_response = TenantService._to_subscription_response(
                subscription, plan
            )

        return TenantDetailResponse(
            tenantId=tenant.id,
            tenantName=tenant.name,
            maxUsageBasedCreditsPerMonth=tenant.max_usage_based_credits_per_month,
            isDeleted=tenant.is_deleted,
            resources=[
                TenantResourceResponse(
                    id=resource.id,
                    type=resource.type.value,
                    description=resource.description,
                )
                for resource in resources
            ],
            subscription=subscription_response,
            createdAt=tenant.created_at,
            updatedAt=tenant.updated_at,
        )

    @staticmethod
    def _to_subscription_response(
        subscription: Subscription, plan: Plan
    ) -> SubscriptionResponse:
        """SubscriptionエンティティからSubscriptionResponseを組み立てる。

        Args:
            subscription: サブスクリプション。
            plan: サブスクリプションに紐づくプラン。

        Returns:
            サブスクリプションレスポンス。
        """
        return SubscriptionResponse(
            id=subscription.id,
            status=subscription.status.value,
            startDate=subscription.start_date,
            endDate=subscription.end_date,
            createdAt=subscription.created_at,
            updatedAt=subscription.updated_at,
            plan=PlanResponse(
                id=plan.id,
                name=plan.name,
                maxUsers=plan.max_users,
                maxCreditsPerMonth=plan.max_credits_per_month,
            ),
        )
