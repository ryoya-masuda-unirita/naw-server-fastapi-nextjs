import pytest
from pydantic import ValidationError

from tests.conftest import make_settings


def test_azure_openai_requires_endpoint_key_and_deployment() -> None:
    """azure_openai で接続先が足りなければ、足りない環境変数名を示してエラーにすること"""
    with pytest.raises(ValidationError) as exc_info:
        make_settings(
            LLM_PROVIDER="azure_openai",
            AZURE_OPENAI_ENDPOINT="https://example.openai.azure.com",
        )

    message = str(exc_info.value)
    assert "AZURE_OPENAI_API_KEY" in message
    assert "AZURE_OPENAI_DEPLOYMENT" in message
    assert "AZURE_OPENAI_ENDPOINT," not in message


def test_authkey_is_required() -> None:
    """WAHA_AUTHKEY が空ならエラーにすること"""
    with pytest.raises(ValidationError):
        make_settings(WAHA_AUTHKEY="")


def test_log_level_is_validated_and_normalized() -> None:
    """LOG_LEVEL は大文字にそろえ、logging にない名前はエラーにすること"""
    assert make_settings(LOG_LEVEL="debug").log_level == "DEBUG"
    with pytest.raises(ValidationError, match="LOG_LEVEL"):
        make_settings(LOG_LEVEL="verbose")


def test_unknown_provider_is_rejected() -> None:
    """未知の LLM_PROVIDER はエラーにすること"""
    with pytest.raises(ValidationError):
        make_settings(LLM_PROVIDER="unknown")
