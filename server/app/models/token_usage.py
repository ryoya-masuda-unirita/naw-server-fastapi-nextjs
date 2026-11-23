import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlmodel import Field, SQLModel


class TokenUsage(SQLModel, table=True):
    """LLMのトークン消費量記録。1回のチャット送信・埋め込み処理等につき1行作成される。

    `total_tokens`はDB側の生成列（`GENERATED ALWAYS AS ... STORED`）で、
    `input_tokens + output_tokens + embedding_tokens`の合計値を保持する。
    移植元(Spring Boot)の`TOKEN_USAGES`テーブルに対応する。
    """

    __tablename__ = "token_usages"
    __table_args__ = (
        sa.Index("idx_token_usages_tenant_id", "tenant_id"),
        sa.Index("idx_token_usages_user_id", "user_id"),
        sa.Index("idx_token_usages_tenant_id_created_at", "tenant_id", "created_at"),
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
    # 移植元同様、users.idへのFK制約は付けない（ユーザー削除後も消費量記録は残す運用のため）。
    user_id: uuid.UUID | None = Field(
        default=None, sa_column=sa.Column(sa.UUID, nullable=True)
    )
    room_id: str | None = Field(default=None, max_length=32)
    # メッセージ削除時はSET NULLし、消費量記録自体は保持する。
    message_id: str | None = Field(
        default=None,
        sa_column=sa.Column(
            sa.String(32),
            sa.ForeignKey("messages.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    endpoint_type: str | None = Field(default=None, max_length=32)
    model: str = Field(max_length=32)
    input_tokens: int = Field(
        default=0, sa_column=sa.Column(sa.Integer, nullable=False, server_default="0")
    )
    output_tokens: int = Field(
        default=0, sa_column=sa.Column(sa.Integer, nullable=False, server_default="0")
    )
    input_credits: int = Field(
        default=0,
        sa_column=sa.Column(sa.BigInteger, nullable=False, server_default="0"),
    )
    output_credits: int = Field(
        default=0,
        sa_column=sa.Column(sa.BigInteger, nullable=False, server_default="0"),
    )
    embedding_tokens: int = Field(
        default=0, sa_column=sa.Column(sa.Integer, nullable=False, server_default="0")
    )
    embedding_credits: int = Field(
        default=0,
        sa_column=sa.Column(sa.BigInteger, nullable=False, server_default="0"),
    )
    # DB生成列。Field(default=...)を指定しないことで、インスタンス生成時に値を
    # 明示的にセットしない状態を保つ（`created_at`等の他のDBサーバー側生成カラムと同様の
    # パターン）。これによりSQLAlchemyがINSERT時にこの列を送出せず、DB側の
    # `GENERATED ALWAYS AS (...) STORED`計算に委ねられる。
    total_tokens: int = Field(
        sa_column=sa.Column(
            sa.BigInteger,
            sa.Computed(
                "input_tokens + output_tokens + embedding_tokens", persisted=True
            ),
            nullable=False,
        ),
    )
    created_at: datetime = Field(
        sa_column=sa.Column(
            sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
