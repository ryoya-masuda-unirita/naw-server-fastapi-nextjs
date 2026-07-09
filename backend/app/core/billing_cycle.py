"""請求サイクルの起算日・次回リセット日時を算出する純粋関数群。

移植元(Spring Boot)の`SubscriptionBillingCycle`に対応する。締め日の基準は契約開始日の
暦日（日）。29〜31日で契約した場合、翌月に同一日が存在しない月は月末に丸める。
"""

import calendar
from datetime import date, datetime, timezone


def current_billing_reset_instant_utc(
    contract_start: date, now_utc: datetime
) -> datetime | None:
    """`now_utc`が属する現在の請求期間の開始日時(UTC 0時)を算出する。

    Args:
        contract_start: 契約開始日。
        now_utc: 現在時刻(UTC)。

    Returns:
        現在の請求期間の開始日時(UTC)。`now_utc`が契約開始日より前の場合は`None`。
    """
    today_utc = now_utc.astimezone(timezone.utc).date()
    if today_utc < contract_start:
        return None

    base_day = contract_start.day
    return _find_reset_instant_utc(today_utc, contract_start, base_day)


def next_billing_reset_instant_utc(
    contract_start: date, now_utc: datetime
) -> datetime | None:
    """`now_utc`が属する現在の請求期間の次の開始日時(UTC 0時)を算出する。

    Args:
        contract_start: 契約開始日。
        now_utc: 現在時刻(UTC)。

    Returns:
        次回請求リセット日時(UTC)。現在の請求期間が特定できない場合は`None`。
    """
    reset_instant = current_billing_reset_instant_utc(contract_start, now_utc)
    if reset_instant is None:
        return None

    period_start = reset_instant.date()
    base_day = contract_start.day
    next_boundary = _next_boundary_exclusive(period_start, base_day)
    return datetime.combine(next_boundary, datetime.min.time(), tzinfo=timezone.utc)


def _find_reset_instant_utc(
    today_utc: date, first_period_start: date, base_day: int
) -> datetime | None:
    """`today_utc`が含まれる請求期間の開始日時を、契約開始日から順に境界を辿って探す。

    Args:
        today_utc: 判定対象の日付(UTC)。
        first_period_start: 探索の起点となる期間開始日（通常は契約開始日）。
        base_day: 締め日の基準となる暦日。

    Returns:
        該当する請求期間の開始日時(UTC)。`today_utc`が`first_period_start`より前なら`None`。
    """
    period_start = first_period_start
    while True:
        if today_utc < period_start:
            return None

        period_end_exclusive = _next_boundary_exclusive(period_start, base_day)
        if period_start <= today_utc < period_end_exclusive:
            return datetime.combine(
                period_start, datetime.min.time(), tzinfo=timezone.utc
            )
        period_start = period_end_exclusive


def _next_boundary_exclusive(period_start: date, base_day: int) -> date:
    """区間`[period_start, next)`の右端（排他）となる次サイクル開始日を算出する。

    Args:
        period_start: 現在の期間開始日。
        base_day: 締め日の基準となる暦日（契約開始日の日）。

    Returns:
        次サイクルの開始日。

    Raises:
        ValueError: 想定外の請求境界日の場合。
    """
    year, month = period_start.year, period_start.month
    days_in_month = calendar.monthrange(year, month)[1]
    dom = period_start.day

    if dom == base_day:
        next_year, next_month = _add_month(year, month)
        next_days_in_month = calendar.monthrange(next_year, next_month)[1]
        if base_day <= next_days_in_month:
            return date(next_year, next_month, base_day)
        return date(next_year, next_month, next_days_in_month)

    if dom == 1:
        if base_day <= days_in_month:
            return date(year, month, base_day)
        next_year, next_month = _add_month(year, month)
        return date(next_year, next_month, 1)

    if dom == days_in_month and dom < base_day:
        next_year, next_month = _add_month(year, month)
        return date(next_year, next_month, 1)

    raise ValueError(f"想定外の請求境界日です: 日付={period_start} 基準日={base_day}")


def _add_month(year: int, month: int) -> tuple[int, int]:
    """年月に1ヶ月加算する。

    Args:
        year: 年。
        month: 月(1-12)。

    Returns:
        1ヶ月加算後の(年, 月)のタプル。
    """
    if month == 12:
        return year + 1, 1
    return year, month + 1
