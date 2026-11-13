"""列挙値のテスト。

移植元: constants/ImageExplanationModeTest・constants/ReasoningEffortTest・
constants/VerbosityTest。Java の `value()` は `wire_value()`、`getCode()` は `code` に当たる。
"""

import pytest
from generative_ai_adapter.constants import (
    ImageExplanationMode,
    ReasoningEffort,
    Verbosity,
)


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (None, ImageExplanationMode.DISABLED),
        ("", ImageExplanationMode.DISABLED),
        ("0", ImageExplanationMode.DISABLED),
        ("1", ImageExplanationMode.EMBED_ONLY),
        ("2", ImageExplanationMode.FULL_PAGE),
        ("99", ImageExplanationMode.DISABLED),
    ],
)
def test_image_explanation_mode_from_string(
    value: str | None, expected: ImageExplanationMode
) -> None:
    """画像説明モードを数字から引き、未設定・未知の値は DISABLED にすること"""
    assert ImageExplanationMode.from_string(value) == expected


def test_image_explanation_mode_code() -> None:
    """画像説明モードのコードが 0・1・2 であること"""
    assert ImageExplanationMode.DISABLED.code == 0
    assert ImageExplanationMode.EMBED_ONLY.code == 1
    assert ImageExplanationMode.FULL_PAGE.code == 2


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("0", ReasoningEffort.AUTO),
        ("1", ReasoningEffort.MINIMAL),
        ("2", ReasoningEffort.LOW),
        ("3", ReasoningEffort.MEDIUM),
        ("4", ReasoningEffort.HIGH),
        ("5", ReasoningEffort.NONE),
    ],
)
def test_reasoning_effort_from_string_returns_all_defined_values(
    value: str, expected: ReasoningEffort
) -> None:
    """推論の深さを数字から引けること"""
    assert ReasoningEffort.from_string(value) == expected


@pytest.mark.parametrize("value", ["", "invalid", "-1"])
def test_reasoning_effort_from_string_defaults_to_medium(value: str) -> None:
    """未設定・不正な値の推論の深さは MEDIUM にすること"""
    assert ReasoningEffort.from_string(value) == ReasoningEffort.MEDIUM


def test_reasoning_effort_wire_value_returns_provider_strings() -> None:
    """推論の深さをプロバイダへ送る文字列にできること"""
    assert ReasoningEffort.AUTO.wire_value() == ""
    assert ReasoningEffort.MINIMAL.wire_value() == "minimal"
    assert ReasoningEffort.LOW.wire_value() == "low"
    assert ReasoningEffort.MEDIUM.wire_value() == "medium"
    assert ReasoningEffort.HIGH.wire_value() == "high"
    assert ReasoningEffort.NONE.wire_value() == "none"


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("0", Verbosity.NONE),
        ("1", Verbosity.LOW),
        ("2", Verbosity.MEDIUM),
        ("3", Verbosity.HIGH),
    ],
)
def test_verbosity_from_string_returns_all_defined_values(
    value: str, expected: Verbosity
) -> None:
    """回答の詳細度を数字から引けること"""
    assert Verbosity.from_string(value) == expected


@pytest.mark.parametrize("value", ["", "invalid", "4"])
def test_verbosity_from_string_defaults_to_medium(value: str) -> None:
    """未設定・不正な値の回答の詳細度は MEDIUM にすること"""
    assert Verbosity.from_string(value) == Verbosity.MEDIUM


def test_verbosity_wire_value_returns_provider_strings() -> None:
    """回答の詳細度をプロバイダへ送る文字列にできること"""
    assert Verbosity.NONE.wire_value() == ""
    assert Verbosity.LOW.wire_value() == "low"
    assert Verbosity.MEDIUM.wire_value() == "medium"
    assert Verbosity.HIGH.wire_value() == "high"
