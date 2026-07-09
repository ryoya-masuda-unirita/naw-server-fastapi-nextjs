from datetime import date, datetime
from typing import Self

from pydantic import BaseModel, Field, model_validator


class TenantAdminPatchRequest(BaseModel):
    """管理用テナントPATCHのリクエストボディ。

    どのキーが送られたかは`model_fields_set`で判定する（値が`None`かどうかではなく、
    キー自体が存在するかどうかで部分更新の対象を決める。移植元Java版の
    `JsonNode.has()`による判定に相当）。`maxUsageBasedCreditsPerMonth`に`null`を
    指定した場合は0にリセットする。一方`tenantName`は仕様上nullリセットに対応しない
    （DB列がNOT NULLのため）ため、キーを送る場合は必ず値を指定する必要がある。
    """

    tenantName: str | None = Field(default=None, max_length=32)
    maxUsageBasedCreditsPerMonth: int | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def _validate_tenant_name_not_null_when_present(self) -> Self:
        """tenantNameキーが送られた場合、値がnullでないことを検証する。

        Tenant.name はDB上NOT NULL制約のため、キーが存在するのに値がnullだと
        DB制約違反による500が発生してしまう。それを避けるため、リクエストの
        バリデーション段階で422として弾く。
        """
        if "tenantName" in self.model_fields_set and self.tenantName is None:
            raise ValueError("tenantName に null は指定できません")
        return self


class TenantResourceResponse(BaseModel):
    id: str
    type: str
    description: str | None = None


class PlanResponse(BaseModel):
    id: str
    name: str
    maxUsers: int
    maxCreditsPerMonth: int | None = None


class SubscriptionResponse(BaseModel):
    id: str
    status: str
    startDate: date
    endDate: date | None = None
    createdAt: datetime
    updatedAt: datetime
    plan: PlanResponse


class TenantDetailResponse(BaseModel):
    tenantId: str
    tenantName: str
    maxUsageBasedCreditsPerMonth: int
    isDeleted: bool
    resources: list[TenantResourceResponse]
    subscription: SubscriptionResponse | None = None
    createdAt: datetime
    updatedAt: datetime


class TenantResourceCostResponse(BaseModel):
    """テナントリソースのコスト取得APIのレスポンス。

    移植元Java版`TenantResourceCostResponse`（record）に対応する。
    """

    resourceType: str
    usageDate: date
    preTaxCost: float
    currency: str
