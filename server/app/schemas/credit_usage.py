from datetime import datetime

from pydantic import BaseModel


class MyCreditUsageResponse(BaseModel):
    """ログインユーザー本人の請求期間内クレジット利用状況。

    有効なサブスクリプションが存在しない場合は全フィールドが`None`のまま返され、
    ルーター側の`response_model_exclude_none=True`によりレスポンスボディは`{}`になる
    （移植元の`@JsonInclude(NON_NULL)`と同等の挙動）。
    """

    totalCredits: int | None = None
    periodFrom: datetime | None = None
    periodTo: datetime | None = None
    nextBillingResetAt: datetime | None = None


class WorkspaceCreditUsageResponse(BaseModel):
    """テナント全体の請求期間内クレジット利用状況。"""

    totalCredits: int | None = None
    creditLimit: int | None = None
    periodFrom: datetime | None = None
    periodTo: datetime | None = None
    nextBillingResetAt: datetime | None = None
