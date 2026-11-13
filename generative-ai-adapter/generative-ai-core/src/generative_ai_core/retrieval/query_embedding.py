"""検索クエリのベクトル化（移植元 CoreQueryEmbeddingGenerator・CoreDefaultQueryEmbeddingGenerator）。

移植元は core の `embedding` パッケージ（`CoreProviderRuntimeFactory.createEmbeddingRuntime`）
でプロバイダの埋め込みを呼ぶ。この `embedding` パッケージは embedding-adapter（Issue #300）
の担当のため、検索側では「クエリ 1 件を埋め込む」だけの最小の呼び出しをここに持つ。#300 の
`embedding` が入ったら、`embed_text` をその呼び出しに置き換えられる（インターフェースは
`QueryEmbeddingGenerator` のまま）。

HTTP の形（根拠は docs/issue-299/03_詳細設計.md）:

| プロバイダ | リクエスト |
|---|---|
| OpenAI | `POST {URL}/v1/embeddings`（`Authorization: Bearer`）。本文 `{"input":[…],"model":…,"encoding_format":"float"}` |
| AzureOpenAI | `POST {URL}/openai/deployments/{モデル名}/embeddings?api-version=…`（`api-key`）。本文 `{"input":[…]}` |
| SecuAiGent | `POST {URL}/api/llm/embedding`（`Bearer`・`X-Tenant-ID`）。本文 `{"deployName":…,"input":…,"dimensions":…}` |
| Echo（Python 版だけ） | HTTP なし。文字 2-gram のハッシュで決まる擬似ベクトル（同じ文章は同じベクトル） |
"""

import hashlib
import json
import logging
import math
from collections.abc import Callable
from typing import Protocol
from urllib.parse import quote

from generative_ai_core.failure import CoreFailure
from generative_ai_core.network.transport import create_transport
from generative_ai_core.provider.clients.secuaigent import failure as secuaigent_failure
from generative_ai_core.provider.clients.secuaigent.auth import (
    SecuAiGentAuthClient,
    normalize_base_url,
)
from generative_ai_core.provider.clients.secuaigent.keys import DIMENSIONS, TENANT_ID
from generative_ai_core.provider.model import (
    CoreProviderId,
    RuntimeProviderConfiguration,
)
from generative_ai_core.retrieval.models import CoreRetrievalRequest

logger = logging.getLogger(__name__)

AZURE_API_VERSION = "2025-01-01-preview"
SECUAIGENT_DEFAULT_DIMENSIONS = 1536
ECHO_DEFAULT_DIMENSIONS = 1536
HTTP_ERROR_THRESHOLD = 400
HTTP_PROXY_AUTH_REQUIRED = 407
JSON_CONTENT_TYPE = "application/json"
OPENAI_EMBEDDINGS_PATH = "/v1/embeddings"
SECUAIGENT_EMBEDDING_PATH = "/api/llm/embedding"


class QueryEmbeddingError(RuntimeError):
    """クエリのベクトル化の失敗。メッセージは秘密を含まない要約。"""


class QueryEmbeddingGenerator(Protocol):
    """検索リクエストからクエリのベクトルを作る。"""

    def embed(self, request: CoreRetrievalRequest) -> list[float]:
        """クエリのベクトルを返す。

        Parameters
        ----------
        request : CoreRetrievalRequest
            検索リクエスト。

        Returns
        -------
        list[float]
            ベクトル。
        """
        ...


EmbedFunction = Callable[[RuntimeProviderConfiguration, str], list[float]]


def _json_headers(extra: dict[str, str]) -> dict[str, str]:
    """JSON の送信に付けるヘッダーを作る。

    Parameters
    ----------
    extra : dict[str, str]
        追加のヘッダー。

    Returns
    -------
    dict[str, str]
        `Content-Type` を含むヘッダー。
    """
    return {"Content-Type": JSON_CONTENT_TYPE, **extra}


def _post_json(
    configuration: RuntimeProviderConfiguration,
    url: str,
    headers: dict[str, str],
    body: dict[str, object],
) -> str:
    """JSON を POST して本文を返す。

    Parameters
    ----------
    configuration : RuntimeProviderConfiguration
        プロバイダの設定（ネットワーク設定を使う）。
    url : str
        送信先。
    headers : dict[str, str]
        ヘッダー。
    body : dict[str, object]
        本文（JSON にする）。

    Returns
    -------
    str
        応答本文。

    Raises
    ------
    QueryEmbeddingError
        通信に失敗した、または状態コードが 400 以上のとき。
    """
    transport = create_transport(configuration.network_setting)
    payload = json.dumps(body, ensure_ascii=False).encode("utf-8")
    try:
        response = transport.post(url, _json_headers(headers), payload)
    except Exception as e:
        raise QueryEmbeddingError(
            f"embedding request failed: {type(e).__name__}"
        ) from e
    if response.status_code >= HTTP_ERROR_THRESHOLD:
        raise QueryEmbeddingError(
            f"embedding request failed: HTTP {response.status_code}"
        )
    return response.body


def _parse_openai_vector(body: str) -> list[float]:
    """OpenAI 形式の応答（`data[0].embedding`）からベクトルを取り出す。

    Parameters
    ----------
    body : str
        応答本文。

    Returns
    -------
    list[float]
        ベクトル。

    Raises
    ------
    QueryEmbeddingError
        形式が違うとき。
    """
    try:
        root = json.loads(body)
        vector = root["data"][0]["embedding"]
        return [float(value) for value in vector]
    except (ValueError, KeyError, IndexError, TypeError) as e:
        raise QueryEmbeddingError("embedding response is malformed") from e


def _embed_openai(
    configuration: RuntimeProviderConfiguration, text: str
) -> list[float]:
    """OpenAI の埋め込み API を呼ぶ。

    Parameters
    ----------
    configuration : RuntimeProviderConfiguration
        プロバイダの設定。
    text : str
        埋め込む文字列。

    Returns
    -------
    list[float]
        ベクトル。
    """
    url = normalize_base_url(configuration.endpoint) + OPENAI_EMBEDDINGS_PATH
    body = _post_json(
        configuration,
        url,
        {"Authorization": f"Bearer {configuration.credential.value}"},
        {
            "input": [text],
            "model": configuration.model_name,
            "encoding_format": "float",
        },
    )
    return _parse_openai_vector(body)


def _embed_azure(configuration: RuntimeProviderConfiguration, text: str) -> list[float]:
    """Azure OpenAI の埋め込み API を呼ぶ。

    Parameters
    ----------
    configuration : RuntimeProviderConfiguration
        プロバイダの設定（モデル名はデプロイ名）。
    text : str
        埋め込む文字列。

    Returns
    -------
    list[float]
        ベクトル。
    """
    deployment = quote(configuration.model_name, safe="")
    url = (
        f"{normalize_base_url(configuration.endpoint)}/openai/deployments/"
        f"{deployment}/embeddings?api-version={AZURE_API_VERSION}"
    )
    body = _post_json(
        configuration,
        url,
        {"api-key": configuration.credential.value},
        {"input": [text]},
    )
    return _parse_openai_vector(body)


def _secuaigent_dimensions(configuration: RuntimeProviderConfiguration) -> int:
    """SecuAiGent に求める次元数を決める（正の整数でなければ既定）。

    Parameters
    ----------
    configuration : RuntimeProviderConfiguration
        プロバイダの設定。

    Returns
    -------
    int
        次元数。
    """
    configured = configuration.attributes.get(DIMENSIONS, "").strip()
    if configured:
        try:
            parsed = int(configured)
        except ValueError:
            return SECUAIGENT_DEFAULT_DIMENSIONS
        if parsed > 0:
            return parsed
    return SECUAIGENT_DEFAULT_DIMENSIONS


def _embed_secuaigent(
    configuration: RuntimeProviderConfiguration, text: str
) -> list[float]:
    """SecuAiGent の埋め込み API を呼ぶ（移植元 SecuAiGentEmbeddingClient）。

    Parameters
    ----------
    configuration : RuntimeProviderConfiguration
        プロバイダの設定。
    text : str
        埋め込む文字列。

    Returns
    -------
    list[float]
        ベクトル。

    Raises
    ------
    QueryEmbeddingError
        通信・応答の失敗、次元数の不一致のとき。
    """
    token = SecuAiGentAuthClient().resolve_access_token(configuration)
    dimensions = _secuaigent_dimensions(configuration)
    transport = create_transport(configuration.network_setting)
    body = {
        "deployName": configuration.model_name,
        "input": text or "",
        "dimensions": dimensions,
    }
    try:
        response = transport.post(
            normalize_base_url(configuration.endpoint) + SECUAIGENT_EMBEDDING_PATH,
            _json_headers(
                {
                    "Authorization": f"Bearer {token}",
                    "X-Tenant-ID": configuration.attributes.get(TENANT_ID, ""),
                }
            ),
            json.dumps(body, ensure_ascii=False).encode("utf-8"),
        )
    except Exception as e:
        raise secuaigent_failure.to_io_error(e) from e
    if response.status_code >= HTTP_ERROR_THRESHOLD:
        failure_class = (
            secuaigent_failure.PROXY_AUTH_FAILURE
            if response.status_code == HTTP_PROXY_AUTH_REQUIRED
            else secuaigent_failure.NETWORK_FAILURE
        )
        raise QueryEmbeddingError(
            f"UPSTREAM_EMBEDDING_FAILURE: {secuaigent_failure.summary(failure_class)}"
        )
    try:
        vector = [float(value) for value in json.loads(response.body)["embedding"]]
    except (ValueError, KeyError, TypeError) as e:
        raise QueryEmbeddingError(
            "UPSTREAM_EMBEDDING_FAILURE: "
            + secuaigent_failure.summary(secuaigent_failure.NETWORK_FAILURE)
        ) from e
    if not vector:
        raise QueryEmbeddingError(
            "UPSTREAM_EMBEDDING_FAILURE: "
            + secuaigent_failure.summary(secuaigent_failure.NETWORK_FAILURE)
        )
    if len(vector) != dimensions:
        raise QueryEmbeddingError(
            "DIMENSION_MISMATCH: embedding vector dimensions do not match "
            "requested dimensions"
        )
    return vector


def echo_vector(text: str, dimensions: int = ECHO_DEFAULT_DIMENSIONS) -> list[float]:
    """文字 2-gram のハッシュから擬似ベクトルを作る（Python 版だけの確認用）。

    同じ文章は同じベクトルになり、文字が重なる文章ほど近いベクトルになる。長さは 1 に
    正規化する。

    Parameters
    ----------
    text : str
        文章。
    dimensions : int
        次元数。

    Returns
    -------
    list[float]
        ベクトル。
    """
    vector = [0.0] * dimensions
    normalized = text.strip().lower()
    grams = [normalized[i : i + 2] for i in range(max(1, len(normalized) - 1))]
    for gram in grams:
        digest = hashlib.sha256(gram.encode("utf-8")).digest()
        index = int.from_bytes(digest[:4], "big") % dimensions
        sign = 1.0 if digest[4] % 2 == 0 else -1.0
        vector[index] += sign
    norm = math.sqrt(sum(value * value for value in vector))
    if norm == 0.0:
        vector[0] = 1.0
        return vector
    return [value / norm for value in vector]


def _embed_echo(configuration: RuntimeProviderConfiguration, text: str) -> list[float]:
    """Echo の擬似ベクトルを返す（次元数は SecuAiGent と同じ属性で指定できる）。

    Parameters
    ----------
    configuration : RuntimeProviderConfiguration
        プロバイダの設定。
    text : str
        埋め込む文字列。

    Returns
    -------
    list[float]
        ベクトル。
    """
    return echo_vector(text, _secuaigent_dimensions(configuration))


_EMBEDDERS: dict[CoreProviderId, EmbedFunction] = {
    CoreProviderId.OpenAI: _embed_openai,
    CoreProviderId.AzureOpenAI: _embed_azure,
    CoreProviderId.SecuAiGent: _embed_secuaigent,
    CoreProviderId.Echo: _embed_echo,
}


def embed_text(configuration: RuntimeProviderConfiguration, text: str) -> list[float]:
    """プロバイダの埋め込みでテキスト 1 件をベクトルにする。

    Parameters
    ----------
    configuration : RuntimeProviderConfiguration
        プロバイダの設定。
    text : str
        埋め込む文字列。

    Returns
    -------
    list[float]
        ベクトル。空・有限でない値を含むものは失敗にする。

    Raises
    ------
    QueryEmbeddingError
        プロバイダが埋め込みに未対応、通信や応答の失敗、ベクトルが不正なとき。
    """
    embedder = _EMBEDDERS.get(configuration.provider_id)
    if embedder is None:
        raise QueryEmbeddingError(
            "UNSUPPORTED_PROVIDER: Unsupported embedding provider"
        )
    try:
        vector = embedder(configuration, text)
    except QueryEmbeddingError:
        raise
    except ValueError as e:
        raise QueryEmbeddingError(
            CoreFailure.from_exception("CONFIGURATION_FAILURE", e).summary
        ) from e
    except Exception as e:
        raise QueryEmbeddingError(
            CoreFailure.from_exception("PROVIDER_FAILURE", e).summary
        ) from e
    if not vector:
        raise QueryEmbeddingError("embedding vector must not be empty")
    if any(math.isnan(value) or math.isinf(value) for value in vector):
        raise QueryEmbeddingError("embedding vector contains non-finite value")
    return vector


class CoreDefaultQueryEmbeddingGenerator:
    """リクエストのベクトル、なければプロバイダの埋め込みでクエリをベクトルにする。"""

    def __init__(self, embed: EmbedFunction | None = None) -> None:
        """埋め込みの呼び出しを受け取る（テストで差し替える）。

        Parameters
        ----------
        embed : EmbedFunction | None
            プロバイダの設定と文字列からベクトルを作る関数。省略すると `embed_text`。
        """
        self._embed = embed or embed_text

    def embed(self, request: CoreRetrievalRequest) -> list[float]:
        """クエリのベクトルを返す。

        Parameters
        ----------
        request : CoreRetrievalRequest
            検索リクエスト。

        Returns
        -------
        list[float]
            ベクトル。

        Raises
        ------
        ValueError
            リクエストにベクトルも埋め込みプロバイダの設定もないとき。
        QueryEmbeddingError
            埋め込みに失敗したとき。
        """
        if request.query_vector:
            return list(request.query_vector)
        configuration = request.embedding_provider_configuration
        if configuration is None:
            raise ValueError("embedding provider configuration is required")
        vector = self._embed(configuration, request.query)
        logger.info(
            "query embedding: provider=%s, dimensions=%d",
            configuration.provider_id,
            len(vector),
        )
        return vector
