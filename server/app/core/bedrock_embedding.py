"""Bedrock（Titan）の埋め込みを呼ぶクライアント（Python 版だけの独自の拡張）。

**移植元に対応する実装がない。** `bedrock-ext` の目印がある行（`tenant_endpoint.py`・
`ai_model.py`）と、このファイル、呼び出し側の分岐を消せば、元の状態に戻る。

Bedrock Runtime の InvokeModel を、Bedrock API キー（Bearer）で呼ぶ。回答の生成
（Bedrock Mantle）とは、接続先のホストが別（``bedrock-runtime`` と ``bedrock-mantle``）。
Bedrock は ``x-api-key`` と ``Authorization`` が同時にあるリクエストを拒否するため、
``Authorization: Bearer`` だけを送る。
"""

from typing import Any
from urllib.parse import quote

import httpx

from app.core.llm_client import EmbeddingResult
from app.core.vector_store import EMBEDDING_DIMENSIONS

# Titan G1。1536 次元（Titan V2 は次元数が合わないため使えない）
BEDROCK_EMBEDDING_MODEL_ID = "amazon.titan-embed-text-v1"
REQUEST_TIMEOUT_SECONDS = 30.0


class BedrockEmbeddingError(RuntimeError):
    """Bedrock の埋め込みの呼び出しに失敗したとき（API キーはメッセージに含めない）。"""


class BedrockLlmEmbeddingClient:
    """Bedrock Runtime の InvokeModel で、Titan の埋め込みを呼ぶクライアント。"""

    @staticmethod
    async def create_embedding(
        endpoint: str, api_key: str, model_id: str, input_text: str
    ) -> EmbeddingResult:
        """入力テキストを Titan でベクトル化する。

        Parameters
        ----------
        endpoint : str
            Bedrock Runtime の URL（例: ``https://bedrock-runtime.ap-northeast-1.amazonaws.com``）。
        api_key : str
            Bedrock API キー（Bearer トークン）。
        model_id : str
            モデル ID（``amazon.titan-embed-text-v1``）。
        input_text : str
            ベクトル化する文字列。

        Returns
        -------
        EmbeddingResult
            埋め込みベクトルと、消費した入力トークン数。

        Raises
        ------
        BedrockEmbeddingError
            通信・HTTP エラー、応答の形式の不一致、次元数が 1536 でないとき。
        """
        url = f"{endpoint.rstrip('/')}/model/{quote(model_id, safe='')}/invoke"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "content-type": "application/json",
        }
        try:
            async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
                response = await client.post(
                    url, headers=headers, json={"inputText": input_text}
                )
        except httpx.HTTPError as error:
            raise BedrockEmbeddingError(
                f"Bedrock の埋め込みの呼び出しに失敗しました: {type(error).__name__}"
            ) from None
        if response.status_code >= 400:
            raise BedrockEmbeddingError(
                f"Bedrock の埋め込みが HTTP {response.status_code} を返しました"
            )
        return _to_result(response)


def _to_result(response: httpx.Response) -> EmbeddingResult:
    """応答本文から、ベクトルとトークン数を取り出し、次元数を確かめる。

    Parameters
    ----------
    response : httpx.Response
        InvokeModel の応答。

    Returns
    -------
    EmbeddingResult
        埋め込みベクトルと、入力トークン数。

    Raises
    ------
    BedrockEmbeddingError
        形式の不一致、または次元数が 1536 でないとき。
    """
    try:
        body: Any = response.json()
        embedding = body["embedding"]
        tokens = int(body.get("inputTextTokenCount", 0))
    except (ValueError, KeyError, TypeError):
        raise BedrockEmbeddingError(
            "Bedrock の埋め込みの応答の形式が想定と違います"
        ) from None
    # bool は int のサブクラスなので、数値として通らないよう明示的に除く
    if not isinstance(embedding, list) or not all(
        isinstance(value, int | float) and not isinstance(value, bool)
        for value in embedding
    ):
        raise BedrockEmbeddingError("Bedrock の埋め込みの応答の形式が想定と違います")
    if len(embedding) != EMBEDDING_DIMENSIONS:
        raise BedrockEmbeddingError(
            f"埋め込みの次元数が {EMBEDDING_DIMENSIONS} ではありません"
            f"（{len(embedding)}）。モデルに amazon.titan-embed-text-v1 を指定してください"
        )
    return EmbeddingResult(embedding=[float(v) for v in embedding], tokens=tokens)
