from datetime import datetime, timezone

import pytest
from fastapi import HTTPException

from app.core.date_parse import parse_iso_instant

_EXPECTED_MESSAGE = (
    "updatedAtFrom は 2026-10-08T15:00:00Z のような ISO 8601 の日時で指定してください"
)


class TestParseIsoInstant:
    """ISO 8601 形式の日時文字列のパースのテスト。"""

    def test_parses_utc_datetime(self) -> None:
        """末尾がZの日時をUTCの日時に変換できること"""
        assert parse_iso_instant("2026-10-08T15:00:00Z", "updatedAtFrom") == datetime(
            2026, 10, 8, 15, tzinfo=timezone.utc
        )

    def test_converts_offset_datetime_to_utc(self) -> None:
        """オフセット付きの日時をUTCの日時に直すこと"""
        parsed = parse_iso_instant("2026-10-09T00:00:00+09:00", "updatedAtFrom")

        assert parsed == datetime(2026, 10, 8, 15, tzinfo=timezone.utc)
        assert parsed is not None and parsed.tzinfo == timezone.utc

    def test_parses_fractional_seconds(self) -> None:
        """小数秒付きの日時を変換できること"""
        parsed = parse_iso_instant("2026-10-08T15:00:00.123Z", "updatedAtFrom")

        assert parsed == datetime(2026, 10, 8, 15, 0, 0, 123000, tzinfo=timezone.utc)

    @pytest.mark.parametrize("value", [None, "", "  "])
    def test_returns_none_when_not_specified(self, value: None | str) -> None:
        """未指定・空文字・空白だけは指定なしとしてNoneを返すこと"""
        assert parse_iso_instant(value, "updatedAtFrom") is None

    @pytest.mark.parametrize(
        "value",
        [
            "2026-10-09",
            "2026-10-09T00:00:00",
            "2026-10-09 00:00:00Z",
            "abc",
            "2026-13-01T00:00:00Z",
            # UTCに直すと`datetime`の範囲（9999年まで）を外れる
            "9999-12-31T23:59:59-01:00",
        ],
    )
    def test_rejects_invalid_value(self, value: str) -> None:
        """日付だけ・オフセットなし・日時でない値は移植元と同じメッセージで400になること"""
        with pytest.raises(HTTPException) as exc_info:
            parse_iso_instant(value, "updatedAtFrom")

        assert exc_info.value.status_code == 400
        assert exc_info.value.detail == _EXPECTED_MESSAGE
