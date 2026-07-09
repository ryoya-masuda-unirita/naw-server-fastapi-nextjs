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

    tenantName: str | None = None
    maxUsageBasedCreditsPerMonth: int | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def _validate_tenant_name_not_null_when_present(self) -> Self:
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
