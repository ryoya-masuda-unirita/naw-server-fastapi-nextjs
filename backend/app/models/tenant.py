from datetime import datetime

import sqlalchemy as sa
from sqlmodel import Field, SQLModel


class Tenant(SQLModel, table=True):
    __tablename__ = "tenants"
    __table_args__ = (
        sa.CheckConstraint("pw_histories_limit >= 1", name="ck_tenants_pw_histories_limit"),
        sa.Index("tenants_is_deleted_idx", "is_deleted"),
    )

    id: str = Field(max_length=32, primary_key=True)
    name: str = Field(max_length=32)
    owner: str = Field(max_length=32)
    is_deleted: bool = Field(
        default=False,
        sa_column=sa.Column(sa.Boolean, nullable=False, server_default=sa.false()),
    )
    max_usage_based_credits_per_month: int = Field(
        default=0,
        sa_column=sa.Column(sa.BigInteger, nullable=False, server_default="0"),
    )
    pw_policy_min_length: int = Field(
        default=12,
        sa_column=sa.Column(sa.SmallInteger, nullable=False, server_default="12"),
    )
    pw_policy_use_uppercase: bool = Field(
        default=True,
        sa_column=sa.Column(sa.Boolean, nullable=False, server_default=sa.true()),
    )
    pw_policy_use_lowercase: bool = Field(
        default=True,
        sa_column=sa.Column(sa.Boolean, nullable=False, server_default=sa.true()),
    )
    pw_policy_use_digits: bool = Field(
        default=True,
        sa_column=sa.Column(sa.Boolean, nullable=False, server_default=sa.true()),
    )
    pw_policy_use_symbols: bool = Field(
        default=True,
        sa_column=sa.Column(sa.Boolean, nullable=False, server_default=sa.true()),
    )
    pw_policy_valid_symbols: str = Field(
        default="!@#$%^&*",
        sa_column=sa.Column(sa.String(100), nullable=False, server_default="!@#$%^&*"),
    )
    pw_validity_period_days: int = Field(
        default=90,
        sa_column=sa.Column(sa.SmallInteger, nullable=False, server_default="90"),
    )
    pw_histories_limit: int = Field(
        default=1,
        sa_column=sa.Column(sa.SmallInteger, nullable=False, server_default="1"),
    )
    created_at: datetime = Field(
        sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    updated_at: datetime = Field(
        sa_column=sa.Column(
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
        ),
    )
