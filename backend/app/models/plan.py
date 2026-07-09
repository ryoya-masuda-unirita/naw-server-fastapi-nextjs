import sqlalchemy as sa
from sqlmodel import Field, SQLModel


class Plan(SQLModel, table=True):
    """契約プランのマスタデータ。全テナントで共有され、`tenant_id`を持たない。

    移植元(Spring Boot)の`PLANS`テーブルに対応する。
    """

    __tablename__ = "plans"

    id: str = Field(max_length=32, primary_key=True)
    name: str = Field(max_length=255)
    max_users: int = Field(sa_column=sa.Column(sa.Integer, nullable=False))
    # 移植元DBはNOT NULLだが、移植元Java側の`resolveCreditLimit`がnullを許容して
    # 分岐しているため、FastAPI側もNULL許容としておく。
    max_credits_per_month: int | None = Field(
        default=None, sa_column=sa.Column(sa.BigInteger, nullable=True)
    )
