"""Bedrock（Titan 埋め込み）の InvokeModel（Python 版だけの独自の拡張）。

**移植元に対応する実装がない。** 移植元の埋め込みのベンダーは OpenAI・Azure・VertexAI
Gemini・Anthropic・SecuAiGent で、Bedrock はない。#436 の Bedrock（回答の生成）と同じく、
Echo と同じ「Python 版だけのプロバイダ」として作った。

移植元が将来 Bedrock の埋め込みに対応したら、このファイルを移植元の実装に置き換える。
このファイルと `bedrock-ext` の目印がある行を消せば、元の状態に戻る。手順は
`generative-ai-adapter/README.md` の「移植元にない拡張」を参照。

呼び方:

- 接続先は Bedrock Runtime の InvokeModel（`{URL}/model/{モデル ID}/invoke`）。#436 の
  回答の生成が使う Mantle には、埋め込みの入口がないため、`URL` のホストが別になる
- 認証は Bedrock API キー（`Authorization: Bearer`）
- モデルは Titan Embeddings G1 - Text（`amazon.titan-embed-text-v1`）を想定する。
  リクエストは `{"inputText": ...}` だけ、応答は `{"embedding": [...], ...}`
- ベクトルの次元数は、ベクトル DB のテーブルの次元数（1536）と同じでなければならない。
  違うときは、保存や検索の前に `DimensionMismatchError` にする（Titan V2 は 1024 などで、
  そのままでは使えない）

接続先ごとの違い（URL・認証のヘッダー）は `request_target` に集めてある。
学習用（`BedrockCoreEmbeddingProvider`）と質問用（`embed_vector`）の 2 系統は、
同じ送信と応答の解釈を使う。
"""

import logging
import math
from collections.abc import Mapping, Sequence
from typing import Any
from urllib.parse import quote

import httpx

from generative_ai_core.embedding.providers import to_doubles
from generative_ai_core.embedding.request import CoreEmbeddingRequest
from generative_ai_core.embedding.result import CoreEmbeddingResult
from generative_ai_core.network.transport import client_options
from generative_ai_core.provider.clients.openai_compatible import ProviderHttpError
from generative_ai_core.provider.model import (
    Capability,
    RuntimeProviderConfiguration,
)
from generative_ai_core.provider.runtime import CoreProviderRuntimeBuilder
from generative_ai_core.vector.schema import EMBEDDING_DIMENSIONS

logger = logging.getLogger(__name__)

INVOKE_PATH_TEMPLATE = "/model/{model_id}/invoke"
JSON_CONTENT_TYPE = "application/json"


class DimensionMismatchError(ValueError):
    """返ったベクトルの次元数が、ベクトル DB のテーブルの次元数と違う。"""


def request_target(
    configuration: RuntimeProviderConfiguration,
) -> tuple[str, dict[str, str]]:
    """接続先の URL と認証のヘッダーを組み立てる（接続先ごとの違いはここだけ）。

    Parameters
    ----------
    configuration : RuntimeProviderConfiguration
        プロバイダの実行時設定。`endpoint` は Bedrock Runtime のホスト、
        `model_name` はモデル ID。

    Returns
    -------
    tuple[str, dict[str, str]]
        URL と、リクエストのヘッダー。
    """
    path = INVOKE_PATH_TEMPLATE.format(
        model_id=quote(configuration.model_name, safe="")
    )
    url = f"{configuration.endpoint.rstrip('/')}{path}"
    headers = {
        "Authorization": f"Bearer {configuration.credential.value}",
        "Content-Type": JSON_CONTENT_TYPE,
        "Accept": JSON_CONTENT_TYPE,
    }
    return url, headers


def request_body(text: str) -> dict[str, str]:
    """InvokeModel のリクエスト本文を作る。

    Parameters
    ----------
    text : str
        埋め込む文字列。

    Returns
    -------
    dict[str, str]
        Titan G1 の本文（`inputText` だけ）。
    """
    return {"inputText": text}


def parse_vector(body: Mapping[str, Any]) -> list[float]:
    """応答本文から埋め込みを取り出し、次元数を確かめる。

    Parameters
    ----------
    body : Mapping[str, Any]
        InvokeModel の応答本文。

    Returns
    -------
    list[float]
        ベクトル。

    Raises
    ------
    TypeError
        応答に埋め込みが含まれない・数値でない値や有限でない値（NaN・無限大）が
        含まれるとき。
    DimensionMismatchError
        次元数がベクトル DB のテーブルの次元数と違うとき。
    """
    embedding = body.get("embedding")
    if not isinstance(embedding, list) or not embedding:
        raise TypeError("embedding response has no result")
    try:
        vector = [float(value) for value in embedding]
    except (TypeError, ValueError):
        # Bedrock 側の不具合なので、設定の誤り（ValueError）ではなく TypeError にそろえる。
        # 失敗の要約が元の例外の文言に置き換わらないよう、例外の連鎖は切る
        raise TypeError("embedding response is malformed") from None
    if not all(math.isfinite(value) for value in vector):
        raise TypeError("embedding vector contains non-finite value")
    if len(vector) != EMBEDDING_DIMENSIONS:
        raise DimensionMismatchError(
            "DIMENSION_MISMATCH: embedding vector dimensions do not match "
            f"the vector table dimensions ({len(vector)} != {EMBEDDING_DIMENSIONS})"
        )
    return vector


def embed_vector(configuration: RuntimeProviderConfiguration, text: str) -> list[float]:
    """文字列 1 件を Bedrock の埋め込みでベクトルにする（学習用・質問用で共通）。

    Parameters
    ----------
    configuration : RuntimeProviderConfiguration
        プロバイダの実行時設定。
    text : str
        埋め込む文字列。

    Returns
    -------
    list[float]
        ベクトル（次元数は確認済み）。

    Raises
    ------
    ProviderHttpError
        プロバイダが HTTP エラーを返したとき。
    TypeError
        応答が JSON でない・埋め込みが含まれない・値が不正なとき。
    DimensionMismatchError
        次元数がベクトル DB のテーブルの次元数と違うとき。
    """
    url, headers = request_target(configuration)
    logger.info(
        "provider embedding request: provider=Bedrock, model=%s, inputChars=%d",
        configuration.model_name,
        len(text),
    )
    with httpx.Client(**client_options(configuration.network_setting)) as client:
        response = client.post(url, headers=headers, json=request_body(text))
    logger.info("provider embedding response: status=%d", response.status_code)
    if response.is_error:
        raise ProviderHttpError(f"HTTP {response.status_code} - {response.text}")
    try:
        parsed: Any = response.json()
    except ValueError:
        # 200 でも JSON でない（プロキシの HTML など）。設定の誤りではなく応答の不備にする
        raise TypeError("embedding response is malformed") from None
    return parse_vector(parsed if isinstance(parsed, dict) else {})


class BedrockCoreEmbeddingProvider:
    """Bedrock の埋め込み（学習用。`CoreEmbeddingRequest` を受ける）。"""

    def __init__(self, configuration: RuntimeProviderConfiguration) -> None:
        """プロバイダの実行時設定を受け取る。

        Parameters
        ----------
        configuration : RuntimeProviderConfiguration
            プロバイダの実行時設定。
        """
        self._configuration = configuration

    def embed(self, request: CoreEmbeddingRequest) -> CoreEmbeddingResult:
        """文字列を 1 件埋め込む。

        Parameters
        ----------
        request : CoreEmbeddingRequest
            埋め込みのリクエスト。

        Returns
        -------
        CoreEmbeddingResult
            成功の結果。

        Raises
        ------
        ProviderHttpError
            プロバイダが HTTP エラーを返したとき。
        TypeError
            応答に埋め込みが含まれないとき。
        DimensionMismatchError
            次元数がベクトル DB のテーブルの次元数と違うとき。
        """
        vector: Sequence[float] = embed_vector(self._configuration, request.source.text)
        return CoreEmbeddingResult.success(
            request.target_hint,
            to_doubles(vector),
            request.source.display_name,
        )


def register_bedrock_embedding(
    builder: CoreProviderRuntimeBuilder,
    configuration: RuntimeProviderConfiguration,
    name: str,
) -> None:
    """Bedrock の埋め込みの実行器を、プロバイダのランタイムに登録する。

    工場（`factory.py`）の分岐を 1 行にして、既存のファイルへの変更を減らすために、
    登録の中身をここに置く。

    Parameters
    ----------
    builder : CoreProviderRuntimeBuilder
        登録先のビルダー。
    configuration : RuntimeProviderConfiguration
        プロバイダの実行時設定。
    name : str
        プロバイダの正式名。
    """
    provider = BedrockCoreEmbeddingProvider(configuration)
    builder.register(
        name,
        Capability.EMBEDDING,
        CoreEmbeddingRequest,
        lambda request, context: provider.embed(request),
    )
