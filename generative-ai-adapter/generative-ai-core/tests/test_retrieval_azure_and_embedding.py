"""Azure AI Search の検索プロバイダと、クエリのベクトル化（埋め込み）の HTTP のテスト。

移植元 `CoreAzureAiSearchRetrievalProviderTest`・`CoreSecuAiGentQueryEmbeddingFailurePropagationTest`
を移した。Azure AI Search・埋め込み API への HTTP は `respx` でモックする（実際には接続しない）。
"""

import json

import httpx
import pytest
import respx
from generative_ai_core.provider.clients.secuaigent import keys
from generative_ai_core.provider.model import (
    CoreCredential,
    CoreProviderId,
    RuntimeProviderConfiguration,
)
from generative_ai_core.retrieval.azure_search_provider import (
    CoreAzureAiSearchRetrievalProvider,
)
from generative_ai_core.retrieval.models import CoreRetrievalRequest
from generative_ai_core.retrieval.query_embedding import (
    QueryEmbeddingError,
    echo_vector,
    embed_text,
)
from generative_ai_core.vector.target import CoreVectorDbTarget

SEARCH_URL = "https://search.example.invalid"
INDEX = "docs-index"
SEARCH_API = f"{SEARCH_URL}/indexes/{INDEX}/docs/search"
EMBED_URL = "https://embed.example.invalid"
VECTOR = [0.25, 0.5]


class FixedEmbedding:
    """決まったベクトルを返す偽の埋め込み。"""

    def embed(self, request: CoreRetrievalRequest) -> list[float]:
        """固定のベクトルを返す。

        Parameters
        ----------
        request : CoreRetrievalRequest
            使わない。

        Returns
        -------
        list[float]
            ベクトル。
        """
        return list(VECTOR)


def _azure_request() -> CoreRetrievalRequest:
    """Azure AI Search 向けの検索リクエストを作る。

    Returns
    -------
    CoreRetrievalRequest
        リクエスト。
    """
    target = CoreVectorDbTarget.azure_ai_search(f"{SEARCH_URL}/", "search-key", INDEX)
    return (
        CoreRetrievalRequest.builder("AzureOpenAI")
        .query("質問")
        .max_results(4)
        .vector_db_target(target)
        .build()
    )


@respx.mock
def test_azure_search_sends_vector_query_and_returns_ids() -> None:
    """ベクトル検索のリクエストを api-key 付きで送り、value[].id を順に返すこと"""
    route = respx.post(SEARCH_API).mock(
        return_value=httpx.Response(200, json={"value": [{"id": "b"}, {"id": "a"}]})
    )

    result = CoreAzureAiSearchRetrievalProvider(FixedEmbedding()).retrieve(
        _azure_request()
    )

    assert result.ordered_ids == ("b", "a")
    request = route.calls.last.request
    assert request.url.params["api-version"] == "2023-11-01"
    assert request.headers["api-key"] == "search-key"
    body = json.loads(request.content)
    assert body == {
        "count": True,
        "select": "id",
        "vectorQueries": [
            {
                "vector": VECTOR,
                "k": 4,
                "fields": "contentVector",
                "kind": "vector",
                "exhaustive": True,
            }
        ],
    }


@respx.mock
@pytest.mark.parametrize(
    "body",
    [
        "",
        "null",
        "[]",
        '{"value": {}}',
        '{"value": [1]}',
        '{"value": [{"id": " "}]}',
        '{"value": [{}]}',
    ],
)
def test_azure_search_malformed_result(body: str) -> None:
    """応答の形が想定と違えば MALFORMED_RESULT になること"""
    respx.post(SEARCH_API).mock(return_value=httpx.Response(200, text=body))

    result = CoreAzureAiSearchRetrievalProvider(FixedEmbedding()).retrieve(
        _azure_request()
    )

    assert result.failure is not None
    assert result.failure.code == "MALFORMED_RESULT"
    assert "malformed" in result.failure.summary


@respx.mock
def test_azure_search_http_error_is_provider_failure() -> None:
    """HTTP エラーは RETRIEVAL_PROVIDER_FAILURE になること"""
    respx.post(SEARCH_API).mock(return_value=httpx.Response(403, text="forbidden"))

    result = CoreAzureAiSearchRetrievalProvider(FixedEmbedding()).retrieve(
        _azure_request()
    )

    assert result.failure is not None
    assert result.failure.code == "RETRIEVAL_PROVIDER_FAILURE"
    assert "HTTP 403" in result.failure.summary


def test_azure_search_without_target_is_configuration_invalid() -> None:
    """接続先がなければ設定不正（MALFORMED_RESULT）になること"""
    request = CoreRetrievalRequest.builder("AzureOpenAI").query("q").build()

    result = CoreAzureAiSearchRetrievalProvider(FixedEmbedding()).retrieve(request)

    assert result.failure is not None
    assert "configuration is invalid" in result.failure.summary


def _configuration(
    provider: CoreProviderId,
    credential: CoreCredential | None = None,
    attributes: dict[str, str] | None = None,
) -> RuntimeProviderConfiguration:
    """埋め込みプロバイダの設定を作る。

    Parameters
    ----------
    provider : CoreProviderId
        プロバイダ。
    credential : CoreCredential | None
        資格情報。省略すると API キー。
    attributes : dict[str, str] | None
        追加の属性。

    Returns
    -------
    RuntimeProviderConfiguration
        設定。
    """
    return RuntimeProviderConfiguration(
        provider,
        "embed-model",
        EMBED_URL,
        credential or CoreCredential.api_key("embed-key"),
        attributes=attributes or {},
    )


@respx.mock
def test_openai_embedding_request_and_vector() -> None:
    """OpenAI は /v1/embeddings に Bearer 付きで送り、data[0].embedding をベクトルにすること"""
    route = respx.post(f"{EMBED_URL}/v1/embeddings").mock(
        return_value=httpx.Response(200, json={"data": [{"embedding": [1, 2.5]}]})
    )

    vector = embed_text(_configuration(CoreProviderId.OpenAI), "質問")

    assert vector == [1.0, 2.5]
    request = route.calls.last.request
    assert request.headers["authorization"] == "Bearer embed-key"
    assert json.loads(request.content) == {
        "input": ["質問"],
        "model": "embed-model",
        "encoding_format": "float",
    }


@respx.mock
def test_azure_embedding_request_uses_deployment_and_api_key() -> None:
    """Azure OpenAI はデプロイ名の埋め込み API に api-key 付きで送ること"""
    route = respx.post(f"{EMBED_URL}/openai/deployments/embed-model/embeddings").mock(
        return_value=httpx.Response(200, json={"data": [{"embedding": [0.5]}]})
    )

    vector = embed_text(_configuration(CoreProviderId.AzureOpenAI), "質問")

    assert vector == [0.5]
    request = route.calls.last.request
    assert request.url.params["api-version"] == "2025-01-01-preview"
    assert request.headers["api-key"] == "embed-key"
    assert json.loads(request.content) == {"input": ["質問"]}


@respx.mock
def test_secuaigent_embedding_logs_in_then_posts_with_tenant_and_dimensions() -> None:
    """SecuAiGent は loginKey でログインしてから、テナント ID・次元数付きで埋め込みを呼ぶこと"""
    respx.post(f"{EMBED_URL}/auth/login-key").mock(
        return_value=httpx.Response(200, json={"token": "jwt-token"})
    )
    route = respx.post(f"{EMBED_URL}/api/llm/embedding").mock(
        return_value=httpx.Response(200, json={"embedding": [0.1, 0.2, 0.3]})
    )
    configuration = _configuration(
        CoreProviderId.SecuAiGent,
        attributes={keys.TENANT_ID: "tenant-1", keys.DIMENSIONS: "3"},
    )

    vector = embed_text(configuration, "質問")

    assert vector == [0.1, 0.2, 0.3]
    request = route.calls.last.request
    assert request.headers["authorization"] == "Bearer jwt-token"
    assert request.headers["x-tenant-id"] == "tenant-1"
    assert json.loads(request.content) == {
        "deployName": "embed-model",
        "input": "質問",
        "dimensions": 3,
    }


@respx.mock
def test_secuaigent_embedding_uses_access_token_without_login() -> None:
    """アクセストークン（bearer）があればログインしないこと"""
    login = respx.post(f"{EMBED_URL}/auth/login-key")
    respx.post(f"{EMBED_URL}/api/llm/embedding").mock(
        return_value=httpx.Response(200, json={"embedding": [1.0]})
    )
    configuration = _configuration(
        CoreProviderId.SecuAiGent,
        CoreCredential.bearer_token("access-token"),
        {keys.TENANT_ID: "t", keys.DIMENSIONS: "1"},
    )

    assert embed_text(configuration, "q") == [1.0]
    assert not login.called


@respx.mock
def test_secuaigent_embedding_dimension_mismatch_and_upstream_failure() -> None:
    """次元数の不一致と上流の失敗は、固定の要約で失敗すること"""
    respx.post(f"{EMBED_URL}/auth/login-key").mock(
        return_value=httpx.Response(200, json={"token": "t"})
    )
    route = respx.post(f"{EMBED_URL}/api/llm/embedding")
    configuration = _configuration(
        CoreProviderId.SecuAiGent,
        attributes={keys.TENANT_ID: "t", keys.DIMENSIONS: "2"},
    )

    route.mock(return_value=httpx.Response(200, json={"embedding": [1.0]}))
    with pytest.raises(QueryEmbeddingError, match="DIMENSION_MISMATCH"):
        embed_text(configuration, "q")

    route.mock(return_value=httpx.Response(500, text="secret upstream body"))
    with pytest.raises(QueryEmbeddingError, match="UPSTREAM_EMBEDDING_FAILURE") as info:
        embed_text(configuration, "q")
    assert "secret upstream body" not in str(info.value)


@respx.mock
def test_embedding_http_error_and_malformed_response() -> None:
    """HTTP エラー・形式不正は QueryEmbeddingError になり、応答本文を含めないこと"""
    route = respx.post(f"{EMBED_URL}/v1/embeddings")

    route.mock(return_value=httpx.Response(401, text="bad key secret-body"))
    with pytest.raises(QueryEmbeddingError, match="HTTP 401") as info:
        embed_text(_configuration(CoreProviderId.OpenAI), "q")
    assert "secret-body" not in str(info.value)

    route.mock(return_value=httpx.Response(200, json={"data": []}))
    with pytest.raises(QueryEmbeddingError, match="malformed"):
        embed_text(_configuration(CoreProviderId.OpenAI), "q")

    route.mock(return_value=httpx.Response(200, json={"data": [{"embedding": []}]}))
    with pytest.raises(QueryEmbeddingError, match="must not be empty"):
        embed_text(_configuration(CoreProviderId.OpenAI), "q")


def test_embedding_unsupported_provider() -> None:
    """埋め込みに対応しないプロバイダは UNSUPPORTED_PROVIDER になること"""
    with pytest.raises(QueryEmbeddingError, match="UNSUPPORTED_PROVIDER"):
        embed_text(_configuration(CoreProviderId.Anthropic), "q")


def test_echo_embedding_is_deterministic_and_normalized() -> None:
    """Echo の擬似ベクトルは同じ文章なら同じで、長さ 1、文字が重なる文章ほど近いこと"""
    first = embed_text(_configuration(CoreProviderId.Echo), "出張旅費の精算")
    again = embed_text(_configuration(CoreProviderId.Echo), "出張旅費の精算")
    similar = echo_vector("出張旅費の申請")
    other = echo_vector("パスワードを共有しない")

    def dot(a: list[float], b: list[float]) -> float:
        return sum(x * y for x, y in zip(a, b, strict=True))

    assert first == again
    assert len(first) == 1536
    assert dot(first, first) == pytest.approx(1.0)
    assert dot(first, similar) > dot(first, other)
