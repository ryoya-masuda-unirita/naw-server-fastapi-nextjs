from datetime import datetime, timedelta, timezone
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core.validation_messages import RequestModel, ValidationMessages
from app.models.token_usage import TokenUsage

MAX_PERIOD_DAYS = 31

ALLOWED_ORDER_BY_COLUMNS = ("createdAt", "totalTokens")


class TokenUsagePeriodQuery(RequestModel):
    """一覧・サマリ共通の期間クエリ。`from`/`to`必須、31日以内、from<=toを検証する。"""

    model_config = ConfigDict(populate_by_name=True)

    from_: Annotated[
        datetime,
        Field(alias="from"),
        ValidationMessages(
            not_blank="開始日時は必須です",
            iso8601_instant="開始日時は YYYY-MM-DDTHH:mm:ssZ 形式で指定してください",
        ),
    ]
    to: Annotated[
        datetime,
        ValidationMessages(
            not_blank="終了日時は必須です",
            iso8601_instant="終了日時は YYYY-MM-DDTHH:mm:ssZ 形式で指定してください",
        ),
    ]
    user_id: UUID | None = Field(default=None, alias="userId")

    @field_validator("from_", "to")
    @classmethod
    def _ensure_timezone_aware(cls, value: datetime) -> datetime:
        """タイムゾーン情報がない場合はUTCとして扱う。

        `from`/`to`の一方だけタイムゾーンなしで指定されると、後続の`_validate_period`での
        比較時にnaive/aware混在で`TypeError`が送出され400ではなく500になってしまうため、
        ここで両者を必ずaware(UTC)に揃える。

        Parameters
        ----------
        value : datetime
            パース済みの日時。

        Returns
        -------
        datetime
            タイムゾーン情報を持つ日時（元々naiveだった場合はUTCを付与）。
        """
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value

    @model_validator(mode="after")
    def _validate_period(self) -> "TokenUsagePeriodQuery":
        """`from<=to`かつ期間が31日以内であることを検証する。

        Returns
        -------
        'TokenUsagePeriodQuery'
            検証済みの自身のインスタンス。

        Raises
        ------
        ValueError
            期間の前後関係が逆、または31日を超える場合。
        """
        if self.from_ > self.to:
            raise ValueError("開始日時は終了日時以前である必要があります")
        if (self.to - self.from_) > timedelta(days=MAX_PERIOD_DAYS):
            raise ValueError(f"指定期間は{MAX_PERIOD_DAYS}日以内である必要があります")
        return self


class TokenUsageListQuery(TokenUsagePeriodQuery):
    """トークン使用量一覧のクエリパラメータ。"""

    page: Annotated[
        int,
        Field(ge=0),
        ValidationMessages(min_value="ページ番号は0以上である必要があります"),
    ] = 0
    size: Annotated[
        int,
        Field(ge=1, le=100),
        ValidationMessages(
            min_value="件数は1以上である必要があります",
            max_value="件数は100以下である必要があります",
        ),
    ] = 10
    order_by: str = Field(default="createdAt", alias="orderBy")
    reverse: bool = True

    @model_validator(mode="after")
    def _validate_order_by(self) -> "TokenUsageListQuery":
        """`orderBy`が許可された値であることを検証する。

        Returns
        -------
        'TokenUsageListQuery'
            検証済みの自身のインスタンス。

        Raises
        ------
        ValueError
            `createdAt`・`totalTokens`以外が指定された場合。
        """
        if self.order_by not in ALLOWED_ORDER_BY_COLUMNS:
            raise ValueError(
                "ソート項目は createdAt または totalTokens のいずれかを指定してください"
            )
        return self


class TokenUsageItemResponse(BaseModel):
    """トークン使用量1件分のレスポンス。"""

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

        Parameters
        ----------
        token_usage : TokenUsage
            変換対象のエンティティ。

        Returns
        -------
        'TokenUsageItemResponse'
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
    """トークン使用量一覧のレスポンス。"""

    contents: list[TokenUsageItemResponse]
    totalCount: int
    hasNext: bool


class TokenUsageSummaryResponse(BaseModel):
    """トークン使用量集計のレスポンス。"""

    inputTokens: int
    outputTokens: int
    embeddingTokens: int
    totalTokens: int
    inputCredits: int
    outputCredits: int
    embeddingCredits: int
    totalCredits: int
