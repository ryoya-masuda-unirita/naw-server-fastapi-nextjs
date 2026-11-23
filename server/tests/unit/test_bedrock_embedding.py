"""Bedrock（Titan）の埋め込みクライアントのテスト（`bedrock-ext`）。"""

import json
from collections.abc import Callable
from typing import Any
from unittest.mock import patch

import httpx
import pytest

from app.core.bedrock_embedding import (
    BEDROCK_EMBEDDING_MODEL_ID,
    EMBEDDING_DIMENSIONS,
    BedrockEmbeddingError,
    BedrockLlmEmbeddingClient,
)

ENDPOINT = "https://bedrock-runtime.ap-northeast-1.amazonaws.com"
API_KEY = "ABSKsecret-api-key"


def _patch_client(handler: Callable[[httpx.Request], httpx.Response]) -> Any:
    """`httpx.AsyncClient` を、モックの通信（`MockTransport`）を使うものに差し替える。

    Parameters
    ----------
    handler : Callable[[httpx.Request], httpx.Response]
        リクエストを受け取り、応答を返す関数。

    Returns
    -------
    Any
        `patch` のコンテキストマネージャ。
    """
    real_client = httpx.AsyncClient
    return patch(
        "app.core.bedrock_embedding.httpx.AsyncClient",
        lambda **kwargs: real_client(transport=httpx.MockTransport(handler), **kwargs),
    )


def _ok(dimensions: int = EMBEDDING_DIMENSIONS, tokens: int = 7) -> httpx.Response:
    """正常な応答を作る。

    Parameters
    ----------
    dimensions : int
        ベクトルの次元数。
    tokens : int
        入力トークン数。

    Returns
    -------
    httpx.Response
        InvokeModel の正常な応答。
    """
    return httpx.Response(
        200, json={"embedding": [0.5] * dimensions, "inputTextTokenCount": tokens}
    )


async def _call() -> Any:
    """既定の引数で `create_embedding` を呼ぶ。

    Returns
    -------
    Any
        `EmbeddingResult`。
    """
    return await BedrockLlmEmbeddingClient.create_embedding(
        ENDPOINT, API_KEY, BEDROCK_EMBEDDING_MODEL_ID, "こんにちは"
    )


class TestCreateEmbedding:
    """BedrockLlmEmbeddingClient.create_embedding のテスト"""

    async def test_sends_bearer_without_api_key_header(self) -> None:
        """Bearer だけを送り、x-api-key は送らず、本文は inputText であること"""
        seen: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            seen.append(request)
            return _ok()

        with _patch_client(handler):
            await _call()

        [request] = seen
        assert request.method == "POST"
        assert str(request.url) == (
            f"{ENDPOINT}/model/amazon.titan-embed-text-v1/invoke"
        )
        assert request.headers["authorization"] == f"Bearer {API_KEY}"
        assert "x-api-key" not in request.headers
        assert json.loads(request.content) == {"inputText": "こんにちは"}

    async def test_returns_embedding_and_tokens(self) -> None:
        """ベクトルと入力トークン数が返ること"""
        with _patch_client(lambda request: _ok(tokens=12)):
            result = await _call()

        assert len(result.embedding) == EMBEDDING_DIMENSIONS
        assert result.tokens == 12

    async def test_trailing_slash_of_endpoint_is_ignored(self) -> None:
        """接続先の末尾の / が重ならないこと"""
        seen: list[str] = []

        def handler(request: httpx.Request) -> httpx.Response:
            seen.append(str(request.url))
            return _ok()

        with _patch_client(handler):
            await BedrockLlmEmbeddingClient.create_embedding(
                f"{ENDPOINT}/", API_KEY, BEDROCK_EMBEDDING_MODEL_ID, "x"
            )

        assert seen == [f"{ENDPOINT}/model/amazon.titan-embed-text-v1/invoke"]

    async def test_model_id_is_url_encoded(self) -> None:
        """モデル ID の記号が、パスに安全にエンコードされること"""
        seen: list[str] = []

        def handler(request: httpx.Request) -> httpx.Response:
            seen.append(request.url.raw_path.decode())
            return _ok()

        with _patch_client(handler):
            await BedrockLlmEmbeddingClient.create_embedding(
                ENDPOINT, API_KEY, "a/b:c", "x"
            )

        assert seen == ["/model/a%2Fb%3Ac/invoke"]

    async def test_rejects_wrong_dimensions(self) -> None:
        """次元数が 1536 でないとき、分かる失敗になること"""
        with _patch_client(lambda request: _ok(dimensions=1024)):
            with pytest.raises(BedrockEmbeddingError, match="1536"):
                await _call()

    @pytest.mark.parametrize("status_code", [401, 403, 429, 500])
    async def test_http_error_is_reported_without_api_key(
        self, status_code: int
    ) -> None:
        """HTTP エラーが分かる失敗になり、メッセージに API キーが含まれないこと"""
        with _patch_client(
            lambda request: httpx.Response(status_code, text=f"denied {API_KEY}")
        ):
            with pytest.raises(BedrockEmbeddingError) as raised:
                await _call()

        assert str(status_code) in str(raised.value)
        assert API_KEY not in str(raised.value)

    @pytest.mark.parametrize(
        "body",
        [
            {"inputTextTokenCount": 3},
            {"embedding": "not-a-list", "inputTextTokenCount": 3},
            {"embedding": ["a"] * EMBEDDING_DIMENSIONS},
        ],
    )
    async def test_malformed_response_is_rejected(self, body: dict[str, Any]) -> None:
        """embedding がない・型が違う応答が、分かる失敗になること"""
        with _patch_client(lambda request: httpx.Response(200, json=body)):
            with pytest.raises(BedrockEmbeddingError):
                await _call()

    async def test_non_json_response_is_rejected(self) -> None:
        """JSON でない応答が、分かる失敗になること"""
        with _patch_client(lambda request: httpx.Response(200, text="not json")):
            with pytest.raises(BedrockEmbeddingError):
                await _call()

    async def test_connection_error_is_reported_without_api_key(self) -> None:
        """接続の失敗が、分かる失敗になり、API キーが含まれないこと"""

        def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError(f"cannot connect {API_KEY}")

        with _patch_client(handler):
            with pytest.raises(BedrockEmbeddingError) as raised:
                await _call()

        assert API_KEY not in str(raised.value)
