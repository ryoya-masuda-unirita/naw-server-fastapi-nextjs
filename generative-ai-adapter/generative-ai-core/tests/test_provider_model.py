"""移植元 CoreProviderIdTest・CoreProviderCapabilityStatusTest・
RuntimeProviderConfigurationTest の移植。"""

from collections.abc import Callable

import pytest
from generative_ai_core.network.setting import CoreNetworkSetting, CoreProxySetting
from generative_ai_core.provider.model import (
    UNSUPPORTED_PROVIDER_CAPABILITY,
    Capability,
    CapabilityStatusKind,
    CoreCredential,
    CoreProviderCapabilityStatus,
    CoreProviderId,
    RuntimeProviderConfiguration,
    unsupported_capability_failure,
)

SECRET = "sk-test-secret-value"
CANONICAL_NAMES = {
    CoreProviderId.OpenAI: "OpenAI",
    CoreProviderId.AzureOpenAI: "AzureOpenAI",
    CoreProviderId.Anthropic: "Anthropic",
    CoreProviderId.VertexAI: "VertexAI",
    CoreProviderId.GoogleAIStudio: "GoogleAIStudio",
    CoreProviderId.SecuAiGent: "SecuAiGent",
}


def test_normalizes_canonical_provider_names_and_vendor_ids() -> None:
    """名前の表記ゆれと vendorId（数字）から同じプロバイダを引けること"""
    assert CoreProviderId.parse("openai") == CoreProviderId.OpenAI
    assert CoreProviderId.parse("Azure OpenAI") == CoreProviderId.AzureOpenAI
    assert CoreProviderId.parse("anthropic") == CoreProviderId.Anthropic
    assert CoreProviderId.parse("vertex-ai") == CoreProviderId.VertexAI
    assert CoreProviderId.parse("google_ai_studio") == CoreProviderId.GoogleAIStudio
    assert CoreProviderId.parse(" 5 ") == CoreProviderId.SecuAiGent
    expected = [
        CoreProviderId.OpenAI,
        CoreProviderId.AzureOpenAI,
        CoreProviderId.Anthropic,
        CoreProviderId.VertexAI,
        CoreProviderId.GoogleAIStudio,
        CoreProviderId.SecuAiGent,
    ]
    for vendor_id, provider in enumerate(expected):
        assert CoreProviderId.from_vendor_id(vendor_id) == provider


def test_exposes_stable_canonical_names_and_rejects_unknown_providers() -> None:
    """正式名が固定で、空・未知のプロバイダと未知の vendorId は拒否されること"""
    for provider, name in CANONICAL_NAMES.items():
        assert provider.canonical_name == name
    with pytest.raises(ValueError, match="providerId must not be blank"):
        CoreProviderId.parse(None)
    with pytest.raises(ValueError, match="providerId must not be blank"):
        CoreProviderId.parse(" ")
    with pytest.raises(ValueError, match="Unsupported provider"):
        CoreProviderId.parse("unknown-provider")
    with pytest.raises(ValueError, match="Unsupported provider vendor id"):
        CoreProviderId.from_vendor_id(6)


def test_represents_supported_provider_capability_evidence() -> None:
    """対応済みの能力が証跡だけを持ち、理由・後続対応は空であること"""
    status = CoreProviderCapabilityStatus.supported(
        CoreProviderId.OpenAI, Capability.CHAT, "controlled OpenAI test"
    )

    assert status.provider_id == CoreProviderId.OpenAI
    assert status.capability == Capability.CHAT
    assert status.status == CapabilityStatusKind.SUPPORTED
    assert status.evidence == "controlled OpenAI test"
    assert not status.reason.strip()
    assert not status.follow_up.strip()


def test_converts_unsupported_capability_to_sanitized_failure() -> None:
    """未対応の能力が秘密情報を伏せた失敗に変換されること"""
    status = CoreProviderCapabilityStatus.unsupported(
        CoreProviderId.GoogleAIStudio,
        Capability.RAG,
        "SDK path exposed Bearer secret-token and api_key=sk-test-secret",
        "specs/018-core-provider-communication/implementation-report.md#T030",
        "Implement supported Google GenAI provider when SDK hook is validated",
    )

    failure = unsupported_capability_failure(status)

    assert failure.code == UNSUPPORTED_PROVIDER_CAPABILITY
    assert "GoogleAIStudio" in failure.summary
    assert "RAG" in failure.summary
    assert "implementation-report.md#T030" in failure.summary
    assert "secret-token" not in failure.summary
    assert "sk-test-secret" not in failure.summary
    assert "api_key=sk-test-secret" not in failure.summary


def test_rejects_converting_supported_capability_to_unsupported_failure() -> None:
    """対応済みの能力を未対応の失敗に変換しようとすると拒否されること"""
    status = CoreProviderCapabilityStatus.supported(
        CoreProviderId.AzureOpenAI, Capability.RAG, "controlled Azure test"
    )

    with pytest.raises(ValueError, match="unsupported"):
        unsupported_capability_failure(status)


def test_builds_programmatic_configuration_without_exposing_secrets(
    make_configuration: Callable[..., RuntimeProviderConfiguration],
) -> None:
    """設定を組み立てられ、文字列表現に秘密情報が出ないこと"""
    credential = CoreCredential.api_key(SECRET, "primary")
    network_setting = CoreNetworkSetting(
        CoreProxySetting.manual("proxy.example", 8080), True, 240
    )

    configuration = make_configuration(
        CoreProviderId.OpenAI,
        model_name="gpt-4o-mini",
        endpoint="https://provider.example.invalid/v1",
        credential=credential,
        network_setting=network_setting,
        attributes={"apiVersion": "2024-02-15-preview"},
        capabilities=(Capability.CHAT, Capability.RAG),
    )

    assert configuration.provider_id == CoreProviderId.OpenAI
    assert configuration.model_name == "gpt-4o-mini"
    assert configuration.endpoint == "https://provider.example.invalid/v1"
    assert configuration.credential == credential
    assert configuration.network_setting == network_setting
    assert configuration.attributes["apiVersion"] == "2024-02-15-preview"
    assert configuration.capabilities == (Capability.CHAT, Capability.RAG)
    assert "[REDACTED]" in str(configuration)
    assert SECRET not in str(configuration)
    assert "displayName=primary" in str(credential)
    assert SECRET not in str(credential)


def test_validates_required_fields_before_provider_client_construction(
    make_configuration: Callable[..., RuntimeProviderConfiguration],
) -> None:
    """必須項目の不正が拒否され、省略時は既定のネットワーク設定と能力になること"""
    with pytest.raises(ValueError, match="modelName"):
        make_configuration(CoreProviderId.OpenAI, model_name=" ")
    with pytest.raises(ValueError, match="credential value"):
        CoreCredential.api_key(" ")

    configuration = make_configuration(
        CoreProviderId.AzureOpenAI,
        model_name="deployment-a",
        credential=CoreCredential.api_key("azure-test-secret"),
    )

    assert configuration.network_setting == CoreNetworkSetting.defaults()
    assert configuration.capabilities == (
        Capability.CHAT,
        Capability.RAG,
        Capability.IMAGE_EXPLANATION,
    )
