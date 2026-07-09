from datetime import date, datetime, timezone

from app.core.billing_cycle import (
    current_billing_reset_instant_utc,
    next_billing_reset_instant_utc,
)


class TestCurrentBillingResetInstantUtc:
    def test_reset_instant_when_contract_start_is_first_day_of_month(self):
        """契約開始日1日、当月内の日付で計算すると当月1日始まりの期間になること"""
        contract_start = date(2020, 1, 1)
        now = datetime(2026, 6, 15, 12, 0, 0, tzinfo=timezone.utc)

        result = current_billing_reset_instant_utc(contract_start, now)

        assert result == datetime(2026, 6, 1, 0, 0, 0, tzinfo=timezone.utc)

    def test_reset_instant_rounds_down_to_month_end_when_base_day_not_in_month(self):
        """契約開始日31日で、31日が存在しない月をまたぐと期間境界が月末側に丸められ、
        丸められた月の翌月は1日始まりの期間に復帰すること"""
        contract_start = date(2026, 1, 31)
        # 2月・4月は31日が存在しないため境界が月末側に丸められ、
        # 5月は5/1始まり〜5/31始まり前の期間になる
        now = datetime(2026, 5, 15, 0, 0, 0, tzinfo=timezone.utc)

        result = current_billing_reset_instant_utc(contract_start, now)

        assert result == datetime(2026, 5, 1, 0, 0, 0, tzinfo=timezone.utc)

    def test_reset_instant_returns_none_when_today_before_contract_start(self):
        """契約開始日より前の日付で計算するとNoneが返ること"""
        contract_start = date(2026, 6, 1)
        now = datetime(2026, 5, 31, 23, 59, 59, tzinfo=timezone.utc)

        result = current_billing_reset_instant_utc(contract_start, now)

        assert result is None

    def test_reset_instant_for_29th_base_day_in_february(self):
        """契約開始日29日、2月(28日まで)の平年をまたぐと2月末に丸められ、
        3月は1日始まりの期間に復帰すること"""
        contract_start = date(2025, 1, 29)
        now = datetime(2025, 3, 15, 0, 0, 0, tzinfo=timezone.utc)

        result = current_billing_reset_instant_utc(contract_start, now)

        assert result == datetime(2025, 3, 1, 0, 0, 0, tzinfo=timezone.utc)


class TestNextBillingResetInstantUtc:
    def test_next_reset_instant_after_current_period(self):
        """next_billing_reset_instant_utcが現在の請求期間の次の境界日を返すこと"""
        contract_start = date(2020, 1, 1)
        now = datetime(2026, 6, 15, 12, 0, 0, tzinfo=timezone.utc)

        result = next_billing_reset_instant_utc(contract_start, now)

        assert result == datetime(2026, 7, 1, 0, 0, 0, tzinfo=timezone.utc)

    def test_next_reset_instant_returns_none_when_today_before_contract_start(self):
        """契約開始日より前の日付で計算するとNoneが返ること"""
        contract_start = date(2026, 6, 1)
        now = datetime(2026, 5, 31, 23, 59, 59, tzinfo=timezone.utc)

        result = next_billing_reset_instant_utc(contract_start, now)

        assert result is None
