from datetime import UTC, datetime, timedelta, timezone

import pytest

from app.core.jsonutil import (
    column_to_string_list,
    format_instant,
    java_split,
    string_list_to_column,
    to_compact_json,
)


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("a\r\nb\r\n", ["a", "b"]),
        ("a\r\n\r\nb", ["a", "", "b"]),
        ("", [""]),
        ("abc", ["abc"]),
        ("\r\n", []),
    ],
)
def test_java_split(value: str, expected: list[str]) -> None:
    """Java の String.split と同じく末尾の空要素を落とすこと"""
    assert java_split(value, "\r\n") == expected


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (datetime(2024, 1, 2, 3, 4, 5), "2024-01-02T03:04:05Z"),
        (datetime(2024, 1, 2, 3, 4, 5, 120000), "2024-01-02T03:04:05.120Z"),
        (datetime(2024, 1, 2, 3, 4, 5, 123456), "2024-01-02T03:04:05.123456Z"),
        (
            datetime(2024, 1, 2, 12, 0, tzinfo=timezone(timedelta(hours=9))),
            "2024-01-02T03:00:00Z",
        ),
        (None, None),
    ],
)
def test_format_instant(value: datetime | None, expected: str | None) -> None:
    """Jackson の Instant 形式（UTC・小数秒は 0/3/6 桁）で出力すること"""
    assert format_instant(value) == expected


def test_format_instant_aware_utc() -> None:
    """タイムゾーン付きの UTC もそのまま出力すること"""
    assert format_instant(datetime(2024, 1, 1, tzinfo=UTC)) == "2024-01-01T00:00:00Z"


def test_string_list_conversion() -> None:
    """参照パスのリストとカンマ区切り文字列を移植元どおりに変換すること"""
    assert string_list_to_column(None) == ""
    assert string_list_to_column([]) == ""
    assert string_list_to_column(["a", "b"]) == "a,b"
    assert column_to_string_list(None) is None
    assert column_to_string_list("") is None
    assert column_to_string_list("a, b ,c") == ["a", "b", "c"]


def test_to_compact_json() -> None:
    """空白なし・非 ASCII をそのまま出力すること"""
    assert to_compact_json({"a": "日本", "b": [1, 2]}) == '{"a":"日本","b":[1,2]}'
