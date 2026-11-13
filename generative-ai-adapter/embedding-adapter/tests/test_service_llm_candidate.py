"""Graph Candidate 用の LLM 出力プロバイダ・抽出器の単体テスト。

移植元 embedding-adapter/src/test の service/core/AdapterLlmCandidateOutputProvidersContractTest・
AdapterLlmCandidateOutputProvidersTest のうち、HTTP を使わない部分
（応答の取り出し・検証、修復プロンプトの無害化、設定からの生成）を移したもの。
"""

import json
from unittest.mock import MagicMock

import pytest
from embedding_adapter.domain import (
    EmbeddingNetworkProperties,
    EmbeddingProviderProperties,
)
from embedding_adapter.service.core.llm_candidate import (
    REQUEST_FAILED,
    AdapterLlmCandidateExtractors,
    AdapterLlmCandidateOutputProviders,
    CoreChatCandidateOutputProvider,
    ProviderRequiredLlmCandidateExtractor,
    extract_candidate_json,
)
from generative_ai_core.chat.models import CoreChatResult
from generative_ai_core.failure import CoreFailure
from generative_ai_core.graphrag.ingestion import (
    IngestionExtraction,
    IngestionRequest,
)
from generative_ai_core.graphrag.ingestion.llm import (
    LlmCandidateExtractionRequest,
    LlmCandidateOutputException,
    LlmCandidateRepairContext,
    LlmJsonCandidateExtractor,
)

CANDIDATE_JSON = '{"extraction_run_id":"run-1","entities":[],"edges":[]}'


def extraction_request(
    repair: LlmCandidateRepairContext | None = None,
) -> LlmCandidateExtractionRequest:
    """テスト用の候補抽出の要求を作る。

    Parameters
    ----------
    repair : LlmCandidateRepairContext | None
        修復の文脈。

    Returns
    -------
    LlmCandidateExtractionRequest
        抽出の要求。
    """
    ingestion = (
        IngestionRequest.builder()
        .tenant_id("tenant-default")
        .source_ref("source-1")
        .display_name("source-1")
        .normalized_body("DOC-2026-0001 [[ENTITY:system:billing]]")
        .classification("tenant-default")
        .classification_rank(1)
        .acl_mode("tenant_wide")
        .acl_principals([])
        .acl_revision(1)
        .deterministic_marker_context("embedding-adapter-save-update")
        .build()
    )
    return LlmCandidateExtractionRequest(
        ingestion, IngestionExtraction(), "chunk-1", repair
    )


def provider_with(runtime: MagicMock) -> CoreChatCandidateOutputProvider:
    """偽の chat runtime を使う出力プロバイダを作る。

    Parameters
    ----------
    runtime : MagicMock
        偽の chat runtime。

    Returns
    -------
    CoreChatCandidateOutputProvider
        出力プロバイダ。
    """
    return CoreChatCandidateOutputProvider("OpenAI", None, runtime)


def credential(provider_name: str) -> EmbeddingProviderProperties:
    """テスト用の接続設定を作る。

    Parameters
    ----------
    provider_name : str
        ベンダー名。

    Returns
    -------
    EmbeddingProviderProperties
        接続設定。
    """
    properties = EmbeddingProviderProperties(
        url="https://example.invalid",
        api_key="placeholder-api-key",
        model_name="model",
        vendor_name=provider_name,
    )
    if provider_name == "SecuAiGent":
        properties.tenant_id = "tenant"
    return properties


@pytest.mark.parametrize("name", ["OpenAI", "AzureOpenAI", "SecuAiGent"])
def test_supported_providers_use_shared_core_chat_runtime(name: str) -> None:
    """対応するベンダーは core の chat runtime を使う出力プロバイダになること"""
    provider = AdapterLlmCandidateOutputProviders.from_properties(
        credential(name), EmbeddingNetworkProperties()
    )

    assert isinstance(provider, CoreChatCandidateOutputProvider)


def test_unconfigured_or_unsupported_provider_is_none() -> None:
    """未設定・未対応のベンダーでは出力プロバイダを作らないこと"""
    build = AdapterLlmCandidateOutputProviders.from_properties

    assert build(None, None) is None
    assert build(EmbeddingProviderProperties(vendor_name="OpenAI"), None) is None
    assert build(credential("Anthropic"), None) is None


def test_secuaigent_without_tenant_id_fails_closed() -> None:
    """SecuAiGent でテナント ID がなければ作成時に失敗すること"""
    properties = credential("SecuAiGent")
    properties.tenant_id = " "

    with pytest.raises(ValueError, match="tenantId"):
        AdapterLlmCandidateOutputProviders.from_properties(properties, None)


def test_provider_returns_candidate_json_from_answer() -> None:
    """chat の回答が候補 JSON ならそのまま返すこと"""
    runtime = MagicMock()
    runtime.chat.return_value = CoreChatResult(answer=CANDIDATE_JSON)

    assert provider_with(runtime)(extraction_request()) == CANDIDATE_JSON
    chat_request = runtime.chat.call_args.args[0]
    assert chat_request.candidate_json_response_requested()
    assert "source_chunk_id: chunk-1" in chat_request.messages[1].content


def test_provider_unwraps_openai_style_choice_content() -> None:
    """OpenAI 互換のラッパーから中の候補 JSON を取り出すこと"""
    wrapped = json.dumps({"choices": [{"message": {"content": CANDIDATE_JSON}}]})
    runtime = MagicMock()
    runtime.chat.return_value = CoreChatResult(answer=wrapped)

    assert provider_with(runtime)(extraction_request()) == CANDIDATE_JSON


def test_extract_candidate_json_variants() -> None:
    """応答の形ごとに候補 JSON を取り出すこと"""
    assert extract_candidate_json(CANDIDATE_JSON) == CANDIDATE_JSON
    assert (
        extract_candidate_json(json.dumps({"output_text": CANDIDATE_JSON}))
        == CANDIDATE_JSON
    )
    assert extract_candidate_json(json.dumps({"choices": [{"text": "x"}]})) == "x"
    assert extract_candidate_json("not json") == "not json"
    assert extract_candidate_json(None) is None


def test_provider_rejects_response_without_required_fields() -> None:
    """必須項目のない応答は拒否コードつきで失敗すること"""
    runtime = MagicMock()
    runtime.chat.return_value = CoreChatResult(answer='{"entities":[]}')

    with pytest.raises(LlmCandidateOutputException) as raised:
        provider_with(runtime)(extraction_request())

    assert raised.value.failure_code == REQUEST_FAILED


def test_provider_wraps_core_failure_and_exceptions() -> None:
    """core の失敗や例外を拒否コードつきの例外にすること"""
    failing = MagicMock()
    failing.chat.return_value = CoreChatResult(
        failure=CoreFailure.of("PROVIDER_FAILURE", "boom")
    )
    raising = MagicMock()
    raising.chat.side_effect = RuntimeError("Bearer secret-token exploded")

    with pytest.raises(LlmCandidateOutputException, match="boom"):
        provider_with(failing)(extraction_request())
    with pytest.raises(LlmCandidateOutputException) as raised:
        provider_with(raising)(extraction_request())
    assert raised.value.failure_code == REQUEST_FAILED
    assert "secret-token" not in str(raised.value)


def test_repair_prompt_keeps_only_allowed_safe_fields() -> None:
    """修復プロンプトは許可された項目だけを残し、危険な値を伏せること"""
    body = json.dumps(
        {
            "extraction_run_id": "run-original",
            "entities": [
                {
                    "candidate_id": "entity-1",
                    "label_hash": "/home/user/secret.txt",
                    "raw_text": "must be dropped",
                }
            ],
            "edges": "not-a-list",
        }
    )
    runtime = MagicMock()
    runtime.chat.return_value = CoreChatResult(answer=CANDIDATE_JSON)

    provider_with(runtime)(
        extraction_request(
            LlmCandidateRepairContext(body, "LLM_CANDIDATE_OUTPUT_REJECTED")
        )
    )

    chat_request = runtime.chat.call_args.args[0]
    assert chat_request.messages[0].content.startswith("Repair candidate JSON.")
    user_prompt = chat_request.messages[1].content
    assert "validator_error_code: LLM_CANDIDATE_OUTPUT_REJECTED" in user_prompt
    assert '"candidate_id":"entity-1"' in user_prompt
    assert '"label_hash":"redacted"' in user_prompt
    assert "raw_text" not in user_prompt
    assert '"edges":[]' in user_prompt


def test_repair_prompt_falls_back_to_empty_candidates_for_invalid_json() -> None:
    """解釈できない候補 JSON は空の候補にして修復プロンプトに入れること"""
    runtime = MagicMock()
    runtime.chat.return_value = CoreChatResult(answer=CANDIDATE_JSON)

    provider_with(runtime)(
        extraction_request(LlmCandidateRepairContext("not json", "CODE"))
    )

    assert (
        '{"entities":[],"edges":[]}'
        in runtime.chat.call_args.args[0].messages[1].content
    )


def test_provider_required_extractor_always_rejects() -> None:
    """プロバイダ未設定の抽出器は必ず未設定の拒否にすること"""
    with pytest.raises(LlmCandidateOutputException) as raised:
        ProviderRequiredLlmCandidateExtractor()(extraction_request())

    assert raised.value.failure_code == "LLM_CANDIDATE_PROVIDER_UNCONFIGURED"
    assert "provider abstraction is not configured" in str(raised.value)


def test_extractors_select_by_provider_presence() -> None:
    """プロバイダの有無で抽出器を選ぶこと"""
    assert isinstance(
        AdapterLlmCandidateExtractors.configured(None),
        ProviderRequiredLlmCandidateExtractor,
    )
    assert isinstance(
        AdapterLlmCandidateExtractors.configured(lambda request: CANDIDATE_JSON),
        LlmJsonCandidateExtractor,
    )
    assert isinstance(
        AdapterLlmCandidateExtractors.unconfigured(),
        ProviderRequiredLlmCandidateExtractor,
    )
