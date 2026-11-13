"""OpenAI・Azure OpenAI の埋め込みプロバイダ。

移植元は Spring AI の OpenAiEmbeddingModel・AzureOpenAiEmbeddingModel を使うが、
Python では embeddings API を httpx で直接呼ぶ（chat と同じ方針）。Spring AI は
ベクトルを float で受けて double に広げるため、同じく単精度に丸めてから返す。
"""

import hashlib
import logging
import math
import struct
from collections.abc import Mapping, Sequence
from typing import Any

import httpx

from generative_ai_core.embedding.request import CoreEmbeddingRequest
from generative_ai_core.embedding.result import CoreEmbeddingResult
from generative_ai_core.network.transport import client_options
from generative_ai_core.provider.clients.openai_compatible import (
    AZURE_API_VERSION,
    ProviderHttpError,
)
from generative_ai_core.provider.model import RuntimeProviderConfiguration

logger = logging.getLogger(__name__)

OPENAI_EMBEDDINGS_PATH = "/v1/embeddings"


def to_doubles(vector: Sequence[float] | None) -> list[float]:
    """単精度に丸めたベクトルを double のリストにする（移植元 toDoubleArray）。

    Parameters
    ----------
    vector : Sequence[float] | None
        プロバイダが返したベクトル。None は空になる。

    Returns
    -------
    list[float]
        float32 の精度に丸めた値のリスト。
    """
    if vector is None:
        return []
    return [struct.unpack("f", struct.pack("f", value))[0] for value in vector]


def _extract_vector(body: Mapping[str, Any]) -> Sequence[float]:
    """応答本文の先頭の埋め込みを取り出す。

    Parameters
    ----------
    body : Mapping[str, Any]
        embeddings API の応答本文。

    Returns
    -------
    Sequence[float]
        先頭の埋め込みベクトル。

    Raises
    ------
    TypeError
        埋め込みが含まれていないとき。
    """
    data = body.get("data")
    if not isinstance(data, list) or not data or not isinstance(data[0], dict):
        raise TypeError("embedding response has no result")
    embedding = data[0].get("embedding")
    if not isinstance(embedding, list):
        raise TypeError("embedding response has no result")
    return embedding


def _post(
    configuration: RuntimeProviderConfiguration,
    url: str,
    headers: Mapping[str, str],
    params: Mapping[str, str],
    body: Mapping[str, Any],
) -> dict[str, Any]:
    """embeddings API に POST し、応答本文の JSON を返す。

    Parameters
    ----------
    configuration : RuntimeProviderConfiguration
        プロバイダの実行時設定（ネットワーク設定を使う）。
    url : str
        送信先の URL。
    headers : Mapping[str, str]
        HTTP ヘッダー。
    params : Mapping[str, str]
        クエリパラメータ。
    body : Mapping[str, Any]
        リクエスト本文。

    Returns
    -------
    dict[str, Any]
        応答本文（JSON オブジェクト以外なら空の辞書）。

    Raises
    ------
    ProviderHttpError
        HTTP エラーの応答のとき（メッセージは chat と同じ書式にしない。呼び出し元が整える）。
    """
    with httpx.Client(**client_options(configuration.network_setting)) as client:
        response = client.post(
            url, headers=dict(headers), params=dict(params), json=body
        )
    logger.info("provider embedding response: status=%d", response.status_code)
    if response.is_error:
        raise ProviderHttpError(f"{response.status_code}\n{response.text}")
    parsed: Any = response.json()
    return parsed if isinstance(parsed, dict) else {}


class OpenAiCoreEmbeddingProvider:
    """OpenAI の埋め込み（`{URL}/v1/embeddings`）。"""

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
        """
        configuration = self._configuration
        url = configuration.endpoint.rstrip("/") + OPENAI_EMBEDDINGS_PATH
        logger.info(
            "provider embedding request: provider=OpenAI, model=%s, inputChars=%d",
            configuration.model_name,
            len(request.source.text),
        )
        try:
            body = _post(
                configuration,
                url,
                {"Authorization": f"Bearer {configuration.credential.value}"},
                {},
                {"model": configuration.model_name, "input": [request.source.text]},
            )
        except ProviderHttpError as e:
            status, _, text = str(e).partition("\n")
            # 移植元（Spring AI）の例外メッセージの書式
            raise ProviderHttpError(f"HTTP {status} - {text}") from None
        return CoreEmbeddingResult.success(
            request.target_hint,
            to_doubles(_extract_vector(body)),
            request.source.display_name,
        )


class AzureOpenAiCoreEmbeddingProvider:
    """Azure OpenAI の埋め込み（デプロイ名ごとの embeddings）。"""

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
        """
        configuration = self._configuration
        url = (
            f"{configuration.endpoint.rstrip('/')}/openai/deployments/"
            f"{configuration.model_name}/embeddings"
        )
        logger.info(
            "provider embedding request: provider=AzureOpenAI, deployment=%s, "
            "inputChars=%d",
            configuration.model_name,
            len(request.source.text),
        )
        try:
            body = _post(
                configuration,
                url,
                {"api-key": configuration.credential.value},
                {"api-version": AZURE_API_VERSION},
                {"input": [request.source.text]},
            )
        except ProviderHttpError as e:
            status, _, text = str(e).partition("\n")
            # 移植元（Azure SDK）の例外メッセージの書式
            raise ProviderHttpError(f'Status code {status}, "{text}"') from None
        return CoreEmbeddingResult.success(
            request.target_hint,
            to_doubles(_extract_vector(body)),
            request.source.display_name,
        )


ECHO_EMBEDDING_DIMENSIONS = 1536


class EchoCoreEmbeddingProvider:
    """キーなしで動く確認用の埋め込み（Python 版だけ。移植元にはない）。

    文字列の SHA-256 から決まる単位ベクトルを返す。同じ文字列は必ず同じベクトルになる。
    意味の近さは反映しないため、ベクトル検索の品質確認には使えない。次元数は
    ベクトルDB のテーブルの次元（1536）に合わせる。
    """

    def __init__(self, configuration: RuntimeProviderConfiguration) -> None:
        """プロバイダの実行時設定を受け取る（使わない）。

        Parameters
        ----------
        configuration : RuntimeProviderConfiguration
            プロバイダの実行時設定。
        """
        self._configuration = configuration

    def embed(self, request: CoreEmbeddingRequest) -> CoreEmbeddingResult:
        """文字列から決まるベクトルを返す。

        Parameters
        ----------
        request : CoreEmbeddingRequest
            埋め込みのリクエスト。

        Returns
        -------
        CoreEmbeddingResult
            成功の結果。
        """
        values: list[float] = []
        counter = 0
        seed = request.source.text.encode("utf-8")
        while len(values) < ECHO_EMBEDDING_DIMENSIONS:
            digest = hashlib.sha256(seed + counter.to_bytes(4, "big")).digest()
            values.extend(byte / 255.0 - 0.5 for byte in digest)
            counter += 1
        values = values[:ECHO_EMBEDDING_DIMENSIONS]
        norm = math.sqrt(sum(v * v for v in values))
        vector = [v / norm for v in values]
        logger.info("echo embedding: inputChars=%d", len(request.source.text))
        return CoreEmbeddingResult.success(
            request.target_hint, to_doubles(vector), request.source.display_name
        )
