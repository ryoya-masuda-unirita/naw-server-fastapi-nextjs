import uuid
from datetime import datetime
from enum import Enum

import sqlalchemy as sa
from sqlmodel import Field, SQLModel


class IndexType(str, Enum):
    SAAS_GLOBAL = "SAAS_GLOBAL"
    LOCAL = "LOCAL"


class Index(SQLModel, table=True):
    """RAG検索対象の情報源（インデックス）。

    移植元（Spring Boot）では主キーは当初`(id, tenant_id)`の複合キーだったが、
    最終的なLiquibase定義では`id`単独主キー + `(id, tenant_id)`のUNIQUE制約
    （中間テーブルからのFKターゲット用）に変更されている。FastAPI側もこの最終形に合わせる。
    """

    __tablename__ = "indexes"
    __table_args__ = (
        sa.UniqueConstraint("id", "tenant_id", name="uq_indexes_id_tenant_id"),
    )

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
    type: IndexType = Field(
        sa_column=sa.Column(
            sa.Enum(IndexType, name="indextype", create_type=True), nullable=False
        ),
    )
    name: str = Field(max_length=255)
    description: str | None = Field(default=None, max_length=255)
    add: str | None = Field(default=None, max_length=32)
    delete: str | None = Field(default=None, max_length=32)
    get: str | None = Field(default=None, max_length=32)
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


class IndexEndpoint(SQLModel, table=True):
    """インデックスとテナントエンドポイントの中間テーブル。

    移植元Spring Bootでは`@JoinTable`のみで定義され、Entityクラスは存在しない
    （`Index.tenantEndpoints`から暗黙的に扱われる）が、FastAPI側では明示的に
    モデル化する（本リポジトリの規約）。主キーは`(index_id, endpoint_id)`で
    `tenant_id`を含まない（移植元最終スキーマに準拠）。
    """

    __tablename__ = "indexes_endpoints"
    __table_args__ = (
        sa.ForeignKeyConstraint(
            ["index_id", "tenant_id"],
            ["indexes.id", "indexes.tenant_id"],
            ondelete="CASCADE",
        ),
    )

    index_id: str = Field(max_length=32, primary_key=True, nullable=False)
    tenant_id: str = Field(max_length=32, nullable=False)
    endpoint_id: str = Field(
        sa_column=sa.Column(
            sa.String(32),
            sa.ForeignKey("tenant_endpoints.id", ondelete="CASCADE"),
            primary_key=True,
            nullable=False,
        ),
    )


class IndexGroup(SQLModel, table=True):
    """インデックスとグループの中間テーブル。

    `IndexEndpoint`と同様、移植元にEntityクラスは存在しないがFastAPI側で明示的にモデル化する。
    主キーは`(index_id, group_id)`で`tenant_id`を含まない（移植元最終スキーマに準拠）。
    """

    __tablename__ = "indexes_groups"
    __table_args__ = (
        sa.ForeignKeyConstraint(
            ["index_id", "tenant_id"],
            ["indexes.id", "indexes.tenant_id"],
            ondelete="CASCADE",
        ),
    )

    index_id: str = Field(max_length=32, primary_key=True, nullable=False)
    tenant_id: str = Field(max_length=32, nullable=False)
    group_id: str = Field(
        sa_column=sa.Column(
            sa.String(32),
            sa.ForeignKey("groups.id", ondelete="CASCADE"),
            primary_key=True,
            nullable=False,
        ),
    )
