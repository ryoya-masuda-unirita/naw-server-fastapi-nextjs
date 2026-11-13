"""textData で資格情報・生成パラメータを上書きするテスト。

移植元: textdata/SecuAiGentTextDataOverlayTest。

- 移植元の SecuAiGentTextDataOverlay（Document から作る上書きの値）は Python にはなく、
  core の CoreSecuAiGentTextDataDocument をそのまま `apply_credential`・`apply_parameter`
  に渡す。`Overlay.from(null)` と `Overlay.empty()` が等しいことは、None と空の Document で
  上書きの結果が同じことで確かめる
"""

from collections.abc import Callable
from pathlib import Path

from generative_ai_adapter.constants import ReasoningEffort, Verbosity
from generative_ai_adapter.domain import AccessCredential, ChatGPTParameter
from generative_ai_adapter.textdata import (
    apply_credential,
    apply_parameter,
    load_text_data_document,
)
from generative_ai_core.provider.clients.secuaigent.text_data import (
    CoreSecuAiGentTextDataDocument,
)


def test_creates_effective_copies_without_mutating_base_state(
    tmp_path: Path,
    write_text_data_fixture: Callable[[Path, str], Path],
    text_data_json: dict[str, str],
) -> None:
    """textData で上書きした写しを作り、元の資格情報・生成パラメータを変えないこと"""
    fixture = write_text_data_fixture(tmp_path, text_data_json["valid_generative"])
    document = load_text_data_document(str(fixture))
    base_credential = AccessCredential(
        url="https://property-provider.invalid",
        test_url="",
        api_key="property-login",
        model_name="property-deploy",
        vendor_name="SecuAiGent",
    )
    base_credential.tenant_id = "property-tenant"
    base_credential.timeout_seconds = 240
    base_credential.embedding_dimensions = 2048
    base_parameter = ChatGPTParameter()
    base_parameter.temperature = 0.7
    base_parameter.max_tokens = 300
    base_parameter.reasoning_effort = ReasoningEffort.LOW
    base_parameter.verbosity = Verbosity.HIGH

    effective_credential = apply_credential(base_credential, document)
    effective_parameter = apply_parameter(base_parameter, document)

    assert effective_credential is not base_credential
    assert effective_credential.url == "https://json-provider.invalid"
    assert effective_credential.api_key == "property-login"
    assert effective_credential.secuaigent_access_token == "access-token-fixture"
    assert effective_credential.tenant_id == "tenant-fixture"
    assert effective_credential.model_name == "json-deploy"
    assert effective_credential.vendor_name == "SecuAiGent"
    assert effective_credential.timeout_seconds == 240
    assert effective_credential.embedding_dimensions == 2048

    assert effective_parameter is not base_parameter
    assert effective_parameter.temperature == 0.2
    assert effective_parameter.max_tokens == 1024
    assert effective_parameter.reasoning_effort == ReasoningEffort.HIGH
    assert effective_parameter.verbosity == Verbosity.LOW

    assert base_credential.url == "https://property-provider.invalid"
    assert base_credential.api_key == "property-login"
    assert base_credential.secuaigent_access_token is None
    assert base_credential.tenant_id == "property-tenant"
    assert base_credential.model_name == "property-deploy"
    assert base_parameter.temperature == 0.7
    assert base_parameter.max_tokens == 300


def test_normalizes_null_documents_and_fields_to_empty_overlay() -> None:
    """textData がない・項目がすべて None なら何も上書きしないこと"""
    base = AccessCredential(
        url="https://property-provider.invalid",
        model_name="property-deploy",
        vendor_name="SecuAiGent",
        secuaigent_stream_file_path="property-stream",
    )
    empty_document = CoreSecuAiGentTextDataDocument(
        url=None, stream_file_path=None, deploy_name=None, create_library=None
    )

    assert CoreSecuAiGentTextDataDocument.empty() == empty_document
    assert apply_credential(base, None) == apply_credential(base, empty_document)
    overlaid = apply_credential(base, empty_document)
    assert overlaid.url == "https://property-provider.invalid"
    assert overlaid.secuaigent_stream_file_path == "property-stream"
    assert overlaid.model_name == "property-deploy"
    assert overlaid.secuaigent_create_library is None


def test_applies_empty_overlay_to_default_copies_when_base_state_is_missing() -> None:
    """元の値がなければ既定値の写しを返すこと"""
    credential = apply_credential(None, None)
    parameter = apply_parameter(None, None)

    assert credential is not None
    assert credential.vendor_name is None
    assert parameter is not None
    assert parameter.temperature is None


def test_falls_back_to_existing_enum_parsing_for_non_canonical_text() -> None:
    """reasoning_effort・verbosity が名前でも番号でもなければ MEDIUM にすること"""
    document = CoreSecuAiGentTextDataDocument(
        reasoning_effort="unknown", verbosity="unknown"
    )

    effective_parameter = apply_parameter(ChatGPTParameter(), document)

    assert effective_parameter.reasoning_effort == ReasoningEffort.MEDIUM
    assert effective_parameter.verbosity == Verbosity.MEDIUM
