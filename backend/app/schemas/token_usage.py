from datetime import datetime, timedelta, timezone
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.token_usage import TokenUsage

MAX_PERIOD_DAYS = 31

ALLOWED_ORDER_BY_COLUMNS = ("createdAt", "totalTokens")


class TokenUsagePeriodQuery(BaseModel):
    """一覧・サマリ共通の期間クエリ。`from`/`to`必須、31日以内、from<=toを検証する。"""

    model_config = ConfigDict(populate_by_name=True)

    from_: datetime = Field(alias="from")
    to: datetime
    user_id: UUID | None = Field(default=None, alias="userId")

    @field_validator("from_", "to")
    @classmethod
    def _ensure_timezone_aware(cls, value: datetime) -> datetime:
        """タイムゾーン情報がない場合はUTCとして扱う。

        `from`/`to`の一方だけタイムゾーンなしで指定されると、後続の`_validate_period`での
        比較時にnaive/aware混在で`TypeError`が送出され422ではなく500になってしまうため、
        ここで両者を必ずaware(UTC)に揃える。

        Args:
            value: パース済みの日時。

        Returns:
            タイムゾーン情報を持つ日時（元々naiveだった場合はUTCを付与）。
        """
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value

    @model_validator(mode="after")
    def _validate_period(self) -> "TokenUsagePeriodQuery":
        """`from<=to`かつ期間が31日以内であることを検証する。

        Returns:
            検証済みの自身のインスタンス。

        Raises:
            ValueError: 期間の前後関係が逆、または31日を超える場合。
        """
        if self.from_ > self.to:
            raise ValueError("fromはto以前の日時を指定してください")
        if (self.to - self.from_) > timedelta(days=MAX_PERIOD_DAYS):
            raise ValueError(f"期間は{MAX_PERIOD_DAYS}日以内で指定してください")
        return self


class TokenUsageListQuery(TokenUsagePeriodQuery):
    page: int = Field(default=0, ge=0)
    size: int = Field(default=10, ge=1, le=100)
    order_by: str = Field(default="createdAt", alias="orderBy")
    reverse: bool = True

    @model_validator(mode="after")
    def _validate_order_by(self) -> "TokenUsageListQuery":
        """`orderBy`が許可された値であることを検証する。

        Returns:
            検証済みの自身のインスタンス。

        Raises:
            ValueError: `createdAt`・`totalTokens`以外が指定された場合。
        """
        if self.order_by not in ALLOWED_ORDER_BY_COLUMNS:
            raise ValueError(
                f"orderByは{ALLOWED_ORDER_BY_COLUMNS}のいずれかを指定してください"
            )
        return self


class TokenUsageItemResponse(BaseModel):
    id: str
    userId: str | None
    messageId: str | None
    model: str
    inputTokens: int
    outputTokens: int
    embeddingTokens: int
    totalTokens: int
    inputCredits: int
    outputCredits: int
    embeddingCredits: int
    totalCredits: int
    createdAt: datetime

    @classmethod
    def from_token_usage(cls, token_usage: TokenUsage) -> "TokenUsageItemResponse":
        """`TokenUsage`エンティティからレスポンスを組み立てる。

        `totalCredits`はDBに永続化されない導出値のため、ここで
        `inputCredits+outputCredits+embeddingCredits`を計算する（移植元と同様）。

        Args:
            token_usage: 変換対象のエンティティ。

        Returns:
            レスポンス用DTO。
        """
        return cls(
            id=token_usage.id,
            userId=str(token_usage.user_id) if token_usage.user_id else None,
            messageId=token_usage.message_id,
            model=token_usage.model,
            inputTokens=token_usage.input_tokens,
            outputTokens=token_usage.output_tokens,
            embeddingTokens=token_usage.embedding_tokens,
            totalTokens=token_usage.total_tokens,
            inputCredits=token_usage.input_credits,
            outputCredits=token_usage.output_credits,
            embeddingCredits=token_usage.embedding_credits,
            totalCredits=(
                token_usage.input_credits
                + token_usage.output_credits
                + token_usage.embedding_credits
            ),
            createdAt=token_usage.created_at,
        )


class TokenUsageListResponse(BaseModel):
    contents: list[TokenUsageItemResponse]
    totalCount: int
    hasNext: bool


class TokenUsageSummaryResponse(BaseModel):
    inputTokens: int
    outputTokens: int
    embeddingTokens: int
    totalTokens: int
    inputCredits: int
    outputCredits: int
    embeddingCredits: int
    totalCredits: int
