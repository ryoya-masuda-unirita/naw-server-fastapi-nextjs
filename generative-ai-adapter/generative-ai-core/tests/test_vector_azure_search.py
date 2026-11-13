"""Azure AI Search プロバイダのテスト（HTTP は respx でモックする）。

移植元の vector/AzureAiSearchCoreVectorDbProviderTest を移した。
"""

import json

import httpx
import pytest
import respx
from generative_ai_core.vector import (
    AzureAiSearchCoreVectorDbProvider,
    CoreVectorDbOperation,
    CoreVectorDbPayload,
    CoreVectorDbRequest,
    CoreVectorDbRuntime,
    CoreVectorDbTarget,
)

ENDPOINT = "https://search.example.invalid/"
INDEX_URL = (
    "https://search.example.invalid/indexes/idx/docs/index?api-version=2023-11-01"
)
SEARCH_URL = (
    "https://search.example.invalid/indexes/idx/docs/search?api-version=2023-11-01"
)
ROW_ID = "00000000-0000-0000-0000-000000000001"


def _request(operation: CoreVectorDbOperation, **metadata: str) -> CoreVectorDbRequest:
    """テスト用の要求を作る。

    Parameters
    ----------
    operation : CoreVectorDbOperation
        操作。
    **metadata : str
        メタデータ。

    Returns
    -------
    CoreVectorDbRequest
        要求。
    """
    builder = (
        CoreVectorDbRequest.builder("AzureAISearch", operation)
        .target(CoreVectorDbTarget.azure_ai_search(ENDPOINT, "secret-key", "idx"))
        .payload(CoreVectorDbPayload(ROW_ID, "c", (0.1, 0.2), "f"))
    )
    for key, value in metadata.items():
        builder.metadata(key, value)
    return builder.build()


@respx.mock
def test_save_posts_merge_or_upload_with_api_key() -> None:
    """保存は mergeOrUpload を api-key 付きで POST すること"""
    route = respx.post(INDEX_URL).mock(
        return_value=httpx.Response(200, json={"value": [{"status": True}]})
    )
    result = AzureAiSearchCoreVectorDbProvider().execute(
        _request(CoreVectorDbOperation.SAVE)
    )
    assert result.success
    sent = route.calls[0].request
    assert sent.headers["api-key"] == "secret-key"
    assert sent.headers["content-type"] == "application/json"
    assert json.loads(sent.content) == {
        "value": [
            {
                "id": ROW_ID,
                "contentVector": [0.1, 0.2],
                "@search.action": "mergeOrUpload",
            }
        ]
    }


@respx.mock
def test_delete_posts_delete_action_without_vector() -> None:
    """削除は delete アクションをベクトルなしで POST すること"""
    route = respx.post(INDEX_URL).mock(
        return_value=httpx.Response(200, json={"value": [{"status": True}]})
    )
    result = AzureAiSearchCoreVectorDbProvider().execute(
        _request(CoreVectorDbOperation.DELETE)
    )
    assert result.success
    assert json.loads(route.calls[0].request.content) == {
        "value": [{"id": ROW_ID, "@search.action": "delete"}]
    }


@respx.mock
def test_partial_failure_in_response_raises() -> None:
    """応答に失敗の項目があれば例外にすること"""
    respx.post(INDEX_URL).mock(
        return_value=httpx.Response(200, json={"value": [{"status": False}]})
    )
    with pytest.raises(RuntimeError, match="partial operation failed"):
        AzureAiSearchCoreVectorDbProvider().execute(
            _request(CoreVectorDbOperation.SAVE)
        )


@respx.mock
def test_error_in_response_raises_without_leaking_body() -> None:
    """応答に error があれば固定メッセージの例外にすること"""
    respx.post(INDEX_URL).mock(
        return_value=httpx.Response(200, json={"error": {"message": "secret"}})
    )
    with pytest.raises(RuntimeError, match="^Azure AI Search operation failed$"):
        AzureAiSearchCoreVectorDbProvider().execute(
            _request(CoreVectorDbOperation.SAVE)
        )


@respx.mock
def test_http_error_through_runtime_becomes_provider_failure() -> None:
    """HTTP エラーは runtime で PROVIDER_FAILURE の失敗になること"""
    respx.post(INDEX_URL).mock(return_value=httpx.Response(503, text="down"))
    result = CoreVectorDbRuntime().execute(_request(CoreVectorDbOperation.SAVE))
    assert not result.success
    assert result.failure is not None
    assert result.failure.code == "PROVIDER_FAILURE"


@respx.mock
def test_search_posts_vector_query_and_parses_matches() -> None:
    """検索はベクトルクエリを POST し、応答を検索結果にすること"""
    body = {
        "value": [
            {
                "id": "a",
                "content": "本文",
                "contentVector": [0.5, 0.25],
                "fileUniqueId": "f1",
            },
            {"id": "b", "content": None},
        ]
    }
    route = respx.post(SEARCH_URL).mock(return_value=httpx.Response(200, json=body))
    request = _request(CoreVectorDbOperation.SEARCH, limit="7")
    result = AzureAiSearchCoreVectorDbProvider().execute(request)
    assert json.loads(route.calls[0].request.content) == {
        "vectorQueries": [
            {
                "vector": [0.1, 0.2],
                "k": 7,
                "fields": "contentVector",
                "kind": "vector",
                "exhaustive": True,
            }
        ]
    }
    assert [(m.id, m.content, m.vector, m.file_unique_id) for m in result.matches] == [
        ("a", "本文", (0.5, 0.25), "f1"),
        ("b", "", (), ""),
    ]


def test_search_uses_injected_executor_instead_of_http() -> None:
    """検索の実行を差し替えると HTTP を送らないこと"""
    provider = AzureAiSearchCoreVectorDbProvider(
        lambda _r: json.dumps({"value": [{"id": "x"}]})
    )
    result = provider.execute(_request(CoreVectorDbOperation.SEARCH))
    assert [m.id for m in result.matches] == ["x"]


@pytest.mark.parametrize(
    ("response", "message"),
    [
        ("{}", "Malformed Azure AI Search response"),
        ("not json", "Malformed Azure AI Search response"),
        ('{"value": [1]}', "Malformed Azure AI Search result item"),
        (
            '{"value": [{"contentVector": "x"}]}',
            "Malformed Azure AI Search vector field",
        ),
    ],
)
def test_search_rejects_malformed_responses(response: str, message: str) -> None:
    """不正な検索応答は ValueError になること"""
    provider = AzureAiSearchCoreVectorDbProvider(lambda _r: response)
    with pytest.raises(ValueError, match=message):
        provider.execute(_request(CoreVectorDbOperation.SEARCH))


def test_search_limit_must_be_numeric() -> None:
    """検索件数が数値でなければ ValueError になること"""
    provider = AzureAiSearchCoreVectorDbProvider(lambda _r: '{"value": []}')
    # executor を使う経路では上限を読まないため、HTTP 経路で検証する
    with respx.mock:
        respx.post(SEARCH_URL).mock(
            return_value=httpx.Response(200, json={"value": []})
        )
        with pytest.raises(ValueError, match="Search limit must be numeric"):
            AzureAiSearchCoreVectorDbProvider().execute(
                _request(CoreVectorDbOperation.SEARCH, limit="abc")
            )
    assert provider.provider_id() == "AzureAISearch"
