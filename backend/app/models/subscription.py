import uuid
from datetime import date, datetime
from enum import Enum

import sqlalchemy as sa
from sqlmodel import Field, SQLModel


class SubscriptionStatus(str, Enum):
    ACTIVE = "ACTIVE"
    CANCELLED = "CANCELLED"
    EXPIRED = "EXPIRED"
    PENDING = "PENDING"
    TRIAL = "TRIAL"


class Subscription(SQLModel, table=True):
    """テナントごとの契約（サブスクリプション）。

    移植元(Spring Boot)の`SUBSCRIPTIONS`テーブルに対応する。有効なサブスクリプションの
    判定は`status == ACTIVE`かつ`end_date`が未設定または本日以降であることで行う
    （`SubscriptionRepository.find_active_by_tenant_id_with_plan`参照）。
    """

    __tablename__ = "subscriptions"
    __table_args__ = (sa.Index("idx_subscriptions_tenant_id", "tenant_id"),)

    id: str = Field(
        max_length=32, primary_key=True, default_factory=lambda: uuid.uuid4().hex
    )
    tenant_id: str = Field(
        sa_column=sa.Column(
            sa.String(32),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
    )
    plan_id: str = Field(
        sa_column=sa.Column(
            sa.String(32),
            sa.ForeignKey("plans.id", ondelete="RESTRICT"),
            nullable=False,
        ),
    )
    status: SubscriptionStatus = Field(
        sa_column=sa.Column(
            sa.Enum(SubscriptionStatus, name="subscriptionstatus", create_type=True),
            nullable=False,
        ),
    )
    start_date: date = Field(sa_column=sa.Column(sa.Date, nullable=False))
    end_date: date | None = Field(default=None, sa_column=sa.Column(sa.Date))
    created_at: datetime = Field(
        sa_column=sa.Column(
            sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
    updated_at: datetime = Field(
        sa_column=sa.Column(
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
        ),
    )
