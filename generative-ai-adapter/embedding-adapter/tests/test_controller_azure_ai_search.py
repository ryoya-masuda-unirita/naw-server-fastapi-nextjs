"""AzureAISearchController の単体テスト。

移植元 embedding-adapter/src/test の controller/AzureAISearchControllerTest・
AzureAISearchControllerDerivedIndexNameTest を移したもの。
HTTP は送信部分（httppost_json / httpget）を差し替えるか respx でモックする。
"""

import json
from unittest.mock import MagicMock

import httpx
import pytest
import respx
from embedding_adapter.azure_schema import AISearchRequestSchema, VectorQuery
from embedding_adapter.controller.azure_ai_search import AzureAISearchController
from embedding_adapter.domain import (
    Embedding,
    EmbeddingNetworkProperties,
    VectorDBConfig,
)
from generative_ai_core.network import CoreHttpResponse

INDEX_URL = "https://example.com/indexes/test-index"
API_VERSION = "api-version=2023-11-01"


def make_config(index_name: str = "test-index") -> VectorDBConfig:
    """Azure AI Search の設定を作る。

    Parameters
    ----------
    index_name : str
        インデックス名。

    Returns
    -------
    VectorDBConfig
        設定。
    """
    return VectorDBConfig(
        "AzureOpenAI",
        "https://example.com",
        "test-api-key",
        index_name,
        "",
        "",
        "",
        "vector_store",
        False,
    )


@pytest.fixture
def controller() -> AzureAISearchController:
    """HTTP 送信を偽物にしたコントローラーを返す。

    Returns
    -------
    AzureAISearchController
        コントローラー。
    """
    return AzureAISearchController(
        make_config(), EmbeddingNetworkProperties(), transport=MagicMock()
    )


def test_find_related_parses_ids(controller: AzureAISearchController) -> None:
    """検索応答から ID の一覧を作ること"""
    controller.httppost_json = MagicMock(  # type: ignore[method-assign]
        return_value='{"value":[{"id":"test-id"}]}'
    )

    result = controller.find_related(Embedding("test-id", None, [0.1, 0.2, 0.3]))

    assert [e.id for e in result] == ["test-id"]
    url, body = controller.httppost_json.call_args.args
    assert url == f"{INDEX_URL}/docs/search?{API_VERSION}"
    assert json.loads(body)["vectorQueries"][0]["k"] == 3


def test_parse_response_variants(controller: AzureAISearchController) -> None:
    """value がある・空・ない応答を解釈できること"""
    assert [e.id for e in controller.parse_response('{"value":[{"id":"a"}]}')] == ["a"]
    assert controller.parse_response('{"value":[]}') == []
    assert controller.parse_response("{}") == []


def test_parse_response_invalid_json_raises(
    controller: AzureAISearchController,
) -> None:
    """解釈できない応答は失敗にすること"""
    with pytest.raises(RuntimeError, match="Failed to parse response"):
        controller.parse_response("not json")


def test_import_embedding_posts_merge_or_upload(
    controller: AzureAISearchController,
) -> None:
    """保存が mergeOrUpload の JSON を docs/index に送ること"""
    controller.httppost_json = MagicMock(return_value="{}")  # type: ignore[method-assign]

    result = controller.import_embedding(
        Embedding("test-id", None, [0.1, 0.2, 0.3]), "provided-id"
    )

    assert result == "provided-id"
    url, body = controller.httppost_json.call_args.args
    assert url == f"{INDEX_URL}/docs/index?{API_VERSION}"
    assert body == (
        '{"value":[{"id":"provided-id","contentVector":[0.1,0.2,0.3],'
        '"@search.action":"mergeOrUpload"}]}'
    )


def test_import_embedding_null_id_raises(controller: AzureAISearchController) -> None:
    """ID が None のときは例外にすること"""
    with pytest.raises(ValueError, match="予期せぬ動作です。IDがnullです。"):
        controller.import_embedding(Embedding("test-id", None, [0.1]), None)


def test_import_embedding_propagates_transport_error(
    controller: AzureAISearchController,
) -> None:
    """送信の失敗をそのまま伝えること"""
    controller.httppost_json = MagicMock(  # type: ignore[method-assign]
        side_effect=httpx.ConnectError("Failed to import")
    )

    with pytest.raises(httpx.ConnectError, match="Failed to import"):
        controller.import_embedding(Embedding("test-id", None, [0.1]), "test-id")


def test_delete_embedding_posts_delete_action(
    controller: AzureAISearchController,
) -> None:
    """削除が delete の JSON を送ること"""
    controller.httppost_json = MagicMock(return_value="{}")  # type: ignore[method-assign]

    assert controller.delete_embedding("test-id") == "test-id"

    body = controller.httppost_json.call_args.args[1]
    assert body == '{"value":[{"id":"test-id","@search.action":"delete"}]}'


def test_check_error_with_error_response(controller: AzureAISearchController) -> None:
    """error を含む応答を日本語の失敗メッセージにすること"""
    with pytest.raises(RuntimeError) as raised:
        controller.check_error('{"error":{"message":"Some error occurred"}}')

    assert str(raised.value) == "インデックス操作に失敗しました。 Some error occurred"


def test_check_error_with_invalid_json(controller: AzureAISearchController) -> None:
    """解釈できない応答も失敗にすること"""
    with pytest.raises(RuntimeError, match="インデックス操作に失敗しました。"):
        controller.check_error("invalid json")


def test_check_error_without_error_passes(controller: AzureAISearchController) -> None:
    """error を含まない応答は成功として扱うこと"""
    controller.check_error('{"value":[]}')


def test_test_connect_uses_table_derived_index_when_index_name_is_blank() -> None:
    """インデックス名が空ならテーブル名から導いたインデックスで接続確認すること"""
    config = VectorDBConfig(
        "Azure AI Search",
        "https://search.example",
        "[api-key]",
        "",
        "user",
        "password",
        "database",
        "Customer Orders",
        False,
    )
    controller = AzureAISearchController(
        config, EmbeddingNetworkProperties(), transport=MagicMock()
    )
    controller.httpget = MagicMock(return_value="{}")  # type: ignore[method-assign]

    assert controller.test_connect() is True
    controller.httpget.assert_called_once_with(
        f"https://search.example/indexes/{config.get_effective_index_name()}"
        f"/stats?{API_VERSION}",
        "",
    )


def test_test_connect_returns_false_on_network_error(
    controller: AzureAISearchController,
) -> None:
    """通信エラーのとき接続確認は False を返すこと"""
    controller.httpget = MagicMock(side_effect=httpx.ConnectError("down"))  # type: ignore[method-assign]

    assert controller.test_connect() is False


@respx.mock
def test_httppost_json_sends_api_key_header_through_transport() -> None:
    """POST が api-key ヘッダー付きの JSON を送信部に渡すこと"""
    transport = MagicMock()
    transport.post.return_value = CoreHttpResponse(200, "{}")
    controller = AzureAISearchController(
        make_config(), EmbeddingNetworkProperties(), transport=transport
    )

    assert controller.httppost_json("https://example.com/x", '{"a":1}') == "{}"

    url, headers, body = transport.post.call_args.args
    assert url == "https://example.com/x"
    assert headers == {"Content-Type": "application/json", "api-key": "test-api-key"}
    assert body == b'{"a":1}'


@respx.mock
def test_httpget_sends_api_key_header() -> None:
    """GET が api-key ヘッダーを付けて応答本文を返すこと"""
    route = respx.get("https://example.com/stats").mock(
        return_value=httpx.Response(200, text="ok")
    )
    controller = AzureAISearchController(
        make_config(), EmbeddingNetworkProperties(), transport=MagicMock()
    )

    assert controller.httpget("https://example.com/stats", "") == "ok"
    assert route.calls.last.request.headers["api-key"] == "test-api-key"


def test_request_schema_json_matches_gson_layout() -> None:
    """検索リクエストの JSON が移植元の Gson と同じ形であること"""
    request = AISearchRequestSchema.of(VectorQuery.of([0.1, 0.2], 3))

    assert json.loads(request.to_json_string()) == {
        "count": True,
        "select": "id",
        "vectorQueries": [
            {
                "vector": [0.1, 0.2],
                "k": 3,
                "fields": "contentVector",
                "kind": "vector",
                "exhaustive": True,
            }
        ],
    }
