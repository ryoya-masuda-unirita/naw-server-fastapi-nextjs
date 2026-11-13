"""OpenAI・Azure OpenAI の埋め込みプロバイダ（移植元 OpenAiCoreEmbeddingProvider・
AzureOpenAiCoreEmbeddingProvider）の HTTP リクエスト・応答のテスト。

移植元に HTTP を見るテストはない（Spring AI の内部）ため、送信するリクエストと
結果・失敗の写像を respx で確かめる。実際の OpenAI・Azure には接続しない。
"""

import json
from collections.abc import Callable, Iterator

import httpx
import pytest
import respx
from generative_ai_core.embedding import (
    CoreEmbeddingRequest,
    EmbeddingSource,
    create_embedding_runtime,
)
from generative_ai_core.provider.model import (
    CoreProviderId,
    RuntimeProviderConfiguration,
)

ENDPOINT = "https://embedding.example.invalid"
Factory = Callable[..., RuntimeProviderConfiguration]


@pytest.fixture
def router() -> Iterator[respx.MockRouter]:
    """HTTP をモックするルーターを返す。

    Yields
    ------
    respx.MockRouter
        呼ばれなくてもよいルーター。
    """
    with respx.mock(assert_all_called=False) as mock:
        yield mock


def _request(provider_id: str) -> CoreEmbeddingRequest:
    """テスト用のリクエストを作る。

    Parameters
    ----------
    provider_id : str
        プロバイダ ID。

    Returns
    -------
    CoreEmbeddingRequest
        ファイルを元にしたリクエスト。
    """
    return (
        CoreEmbeddingRequest.builder(provider_id)
        .source(EmbeddingSource.of_file("docs/a.txt", "こんにちは"))
        .target_hint("row-1")
        .build()
    )


def test_openai_posts_embeddings_request_and_maps_vector(
    make_configuration: Factory, router: respx.MockRouter
) -> None:
    """OpenAI は /v1/embeddings に model と input を送り、先頭の埋め込みを返すこと"""
    route = router.post(f"{ENDPOINT}/v1/embeddings").mock(
        return_value=httpx.Response(
            200, json={"data": [{"embedding": [1.0, 2.5], "index": 0}]}
        )
    )
    configuration = make_configuration(
        CoreProviderId.OpenAI,
        model_name="text-embedding-3-small",
        endpoint=ENDPOINT + "/",
    )

    result = create_embedding_runtime(configuration).embed(_request("OpenAI"))

    sent = route.calls.last.request
    assert sent.headers["Authorization"] == "Bearer sk-test-secret"
    assert json.loads(sent.content) == {
        "model": "text-embedding-3-small",
        "input": ["こんにちは"],
    }
    assert result.failure is None
    assert result.vector == (1.0, 2.5)
    assert result.target_id == "row-1"
    assert result.source_name == "docs/a.txt"


def test_azure_posts_deployment_embeddings_request(
    make_configuration: Factory, router: respx.MockRouter
) -> None:
    """Azure はデプロイ名の embeddings に api-key と api-version を付けて送ること"""
    route = router.post(f"{ENDPOINT}/openai/deployments/emb-deploy/embeddings").mock(
        return_value=httpx.Response(200, json={"data": [{"embedding": [3.0, 4.5]}]})
    )
    configuration = make_configuration(
        CoreProviderId.AzureOpenAI, model_name="emb-deploy", endpoint=ENDPOINT
    )

    result = create_embedding_runtime(configuration).embed(_request("AzureOpenAI"))

    sent = route.calls.last.request
    assert sent.headers["api-key"] == "sk-test-secret"
    assert sent.url.params["api-version"] == "2025-01-01-preview"
    assert json.loads(sent.content) == {"input": ["こんにちは"]}
    assert result.vector == (3.0, 4.5)


def test_openai_http_error_becomes_sanitized_provider_failure(
    make_configuration: Factory, router: respx.MockRouter
) -> None:
    """HTTP エラーは PROVIDER_FAILURE になり、応答本文の秘密情報が伏せられること"""
    router.post(f"{ENDPOINT}/v1/embeddings").mock(
        return_value=httpx.Response(401, text="bad key sk-leaked-value")
    )
    configuration = make_configuration(CoreProviderId.OpenAI, endpoint=ENDPOINT)

    result = create_embedding_runtime(configuration).embed(_request("OpenAI"))

    assert result.failure is not None
    assert result.failure.code == "PROVIDER_FAILURE"
    assert "HTTP 401" in result.failure.summary
    assert "sk-leaked-value" not in result.failure.summary


def test_azure_http_error_uses_azure_message_format(
    make_configuration: Factory, router: respx.MockRouter
) -> None:
    """Azure の HTTP エラーは Status code 形式のメッセージになること"""
    router.post(f"{ENDPOINT}/openai/deployments/emb/embeddings").mock(
        return_value=httpx.Response(429, text="slow down")
    )
    configuration = make_configuration(
        CoreProviderId.AzureOpenAI, model_name="emb", endpoint=ENDPOINT
    )

    result = create_embedding_runtime(configuration).embed(_request("AzureOpenAI"))

    assert result.failure is not None
    assert 'Status code 429, "slow down"' in result.failure.summary


def test_response_without_embedding_is_provider_failure(
    make_configuration: Factory, router: respx.MockRouter
) -> None:
    """埋め込みを含まない応答は PROVIDER_FAILURE になること"""
    router.post(f"{ENDPOINT}/v1/embeddings").mock(
        return_value=httpx.Response(200, json={"data": []})
    )
    configuration = make_configuration(CoreProviderId.OpenAI, endpoint=ENDPOINT)

    result = create_embedding_runtime(configuration).embed(_request("OpenAI"))

    assert result.failure is not None
    assert result.failure.code == "PROVIDER_FAILURE"


def test_unsupported_vendor_has_no_embedding_executor(
    make_configuration: Factory,
) -> None:
    """Anthropic など埋め込み未対応のプロバイダは UNSUPPORTED_PROVIDER になること"""
    configuration = make_configuration(CoreProviderId.Anthropic)

    result = create_embedding_runtime(configuration).embed(_request("Anthropic"))

    assert result.failure is not None
    assert result.failure.code == "UNSUPPORTED_PROVIDER"
