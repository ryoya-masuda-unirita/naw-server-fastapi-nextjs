"""プロパティの検証エラーのテスト。

移植元: property/WahaPropertyValidationExceptionTest・
property/WahaPropertyValidationMessagesTest。
Java の WahaPropertyValidationException は WahaPropertyValidationError、
IllegalArgumentException は ValueError に当たる。
"""

import pytest
from generative_ai_adapter import property_validation
from generative_ai_adapter.property_validation import WahaPropertyValidationError


def test_keeps_contract_fields_without_unsafe_values() -> None:
    """ID・項目名・理由を持ち、メッセージに秘密情報を含めないこと"""
    error = WahaPropertyValidationError(
        46,
        "AGE graph 名",
        "unsafe-derived-name",
        "AGE graph 名 (propertyId=46) is unsafe-derived-name",
    )

    assert error.property_id == 46
    assert error.property_name == "AGE graph 名"
    assert error.reason == "unsafe-derived-name"
    assert error.sanitized is True
    for unsafe in ("secret", "api-key", "jdbc:"):
        assert unsafe not in str(error)


def test_rejects_blank_property_name() -> None:
    """項目名が空白だけなら ValueError にすること"""
    with pytest.raises(ValueError, match="propertyName"):
        WahaPropertyValidationError(3, " ", "reason", "msg")


def test_missing_message_names_property_and_reason_only() -> None:
    """missing のメッセージに ID と理由だけを出すこと"""
    error = property_validation.missing(44, "VDB テーブル名")

    assert error.property_id == 44
    assert error.property_name == "VDB テーブル名"
    assert error.reason == "missing"
    message = str(error)
    assert "propertyId=44" in message
    assert "missing" in message
    for unsafe in ("password", "token", "jdbc:"):
        assert unsafe not in message


def test_unsupported_provider_message_includes_supported_set() -> None:
    """unsupported-provider のメッセージに実行できるプロバイダの一覧を出すこと"""
    error = property_validation.unsupported_provider(
        30, "provider", "OpenAI, AzureOpenAI"
    )

    assert error.reason == "unsupported-provider"
    message = str(error)
    assert "supported providers: OpenAI, AzureOpenAI" in message
    for unsafe in ("sk-live", "Bearer"):
        assert unsafe not in message
