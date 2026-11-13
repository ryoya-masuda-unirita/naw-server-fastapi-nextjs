"""SecuAiGent の埋め込み（移植元 SecuAiGentEmbeddingClient・SecuAiGentCoreEmbeddingProvider）。

`POST {URL}/api/llm/embedding` に deployName・input・dimensions を送り、
`{"embedding": [...]}` を受け取る。認証は chat と同じ（loginKey → JWT、または
textData の accessToken）。
"""

import json
import logging
from collections.abc import Sequence

from generative_ai_core.embedding.request import CoreEmbeddingRequest
from generative_ai_core.embedding.result import CoreEmbeddingResult
from generative_ai_core.failure import CoreFailure
from generative_ai_core.network.transport import create_transport
from generative_ai_core.provider.clients.secuaigent import failure
from generative_ai_core.provider.clients.secuaigent.auth import (
    SecuAiGentAuthClient,
    normalize_base_url,
)
from generative_ai_core.provider.clients.secuaigent.keys import DIMENSIONS, TENANT_ID
from generative_ai_core.provider.model import RuntimeProviderConfiguration

logger = logging.getLogger(__name__)

DEFAULT_DIMENSIONS = 1536
EMBEDDING_PATH = "/api/llm/embedding"
HTTP_ERROR_THRESHOLD = 400
HTTP_PROXY_AUTH_REQUIRED = 407
UPSTREAM_EMBEDDING_FAILURE = "UPSTREAM_EMBEDDING_FAILURE"
DIMENSION_MISMATCH = "DIMENSION_MISMATCH"


class _DimensionMismatchError(ValueError):
    """応答のベクトルの次元が要求と合わない（移植元は message 比較で判別）。"""


def _configured_dimensions(configuration: RuntimeProviderConfiguration) -> int | None:
    """設定された次元数を読む。空・数値でない・0 以下は未設定として扱う。

    Parameters
    ----------
    configuration : RuntimeProviderConfiguration
        プロバイダの実行時設定。

    Returns
    -------
    int | None
        次元数。未設定なら None。
    """
    configured = configuration.attributes.get(DIMENSIONS)
    if configured is None or not configured.strip():
        return None
    try:
        parsed = int(configured.strip())
    except ValueError:
        return None
    return parsed if parsed > 0 else None


def resolve_dimensions(configuration: RuntimeProviderConfiguration) -> int:
    """要求する次元数を決める。未設定なら既定（1536）。

    Parameters
    ----------
    configuration : RuntimeProviderConfiguration
        プロバイダの実行時設定。

    Returns
    -------
    int
        要求する次元数。
    """
    configured = _configured_dimensions(configuration)
    return DEFAULT_DIMENSIONS if configured is None else configured


def parse_embedding(response_body: str) -> list[float]:
    """応答本文から埋め込みベクトルを取り出す。

    Parameters
    ----------
    response_body : str
        応答本文（JSON）。

    Returns
    -------
    list[float]
        埋め込みベクトル。

    Raises
    ------
    TypeError
        `embedding` がない・配列でないとき。
    ValueError
        空・数値でないとき。
    """
    value = json.loads(response_body)
    if not isinstance(value, dict):
        raise TypeError("embedding must be present")
    array = value.get("embedding")
    if not isinstance(array, list):
        raise TypeError("embedding must be present")
    if not array:
        raise ValueError("embedding must not be empty")
    return [float(element) for element in array]


class SecuAiGentEmbeddingClient:
    """SecuAiGent の埋め込み API のクライアント。"""

    def __init__(self, auth_client: SecuAiGentAuthClient | None = None) -> None:
        """認証クライアントを受け取る（テストで差し替える）。

        Parameters
        ----------
        auth_client : SecuAiGentAuthClient | None
            認証クライアント。None なら既定。
        """
        self._auth_client = auth_client or SecuAiGentAuthClient()

    def embed(
        self, configuration: RuntimeProviderConfiguration, input_text: str | None
    ) -> list[float]:
        """文字列を埋め込む。

        Parameters
        ----------
        configuration : RuntimeProviderConfiguration
            プロバイダの実行時設定。
        input_text : str | None
            埋め込む文字列。None は空文字列になる。

        Returns
        -------
        list[float]
            埋め込みベクトル。

        Raises
        ------
        SecuAiGentIOError
            認証・通信・応答の不正・次元の不一致。メッセージは秘密情報を含まない固定文。
        """
        token = self._auth_client.resolve_access_token(configuration)
        requested = resolve_dimensions(configuration)
        body = json.dumps(
            {
                "deployName": configuration.model_name,
                "input": input_text or "",
                "dimensions": requested,
            },
            ensure_ascii=False,
            separators=(",", ":"),
        )
        logger.info(
            "secuaigent embedding: POST %s, dimensions=%d", EMBEDDING_PATH, requested
        )
        try:
            tenant_id = configuration.attributes.get(TENANT_ID)
            if tenant_id is None:
                # 移植元は Map.of(..., null) で NullPointerException になる
                raise ValueError("tenantId must not be null")
            transport = create_transport(configuration.network_setting)
            response = transport.post(
                normalize_base_url(configuration.endpoint) + EMBEDDING_PATH,
                {
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {token}",
                    "X-Tenant-ID": tenant_id,
                },
                body.encode("utf-8"),
            )
        except Exception as e:
            raise failure.to_io_error(e) from e
        if response.status_code >= HTTP_ERROR_THRESHOLD:
            failure_class = (
                failure.PROXY_AUTH_FAILURE
                if response.status_code == HTTP_PROXY_AUTH_REQUIRED
                else failure.NETWORK_FAILURE
            )
            raise failure.SecuAiGentIOError(
                f"{UPSTREAM_EMBEDDING_FAILURE}: {failure.summary(failure_class)}"
            )
        try:
            vector = parse_embedding(response.body)
            if len(vector) != requested:
                raise _DimensionMismatchError("embedding dimensions mismatch")
        except Exception as e:  # noqa: BLE001 — 移植元と同じく失敗の結果にして返す
            if isinstance(e, _DimensionMismatchError):
                message = (
                    f"{DIMENSION_MISMATCH}: embedding vector dimensions do not match "
                    "requested dimensions"
                )
            else:
                message = (
                    f"{UPSTREAM_EMBEDDING_FAILURE}: "
                    f"{failure.summary(failure.NETWORK_FAILURE)}"
                )
            raise failure.SecuAiGentIOError(message) from None
        return vector


class SecuAiGentCoreEmbeddingProvider:
    """SecuAiGent の埋め込みプロバイダ（core の EMBEDDING の実行器）。"""

    def __init__(
        self,
        configuration: RuntimeProviderConfiguration,
        client: SecuAiGentEmbeddingClient | None = None,
    ) -> None:
        """設定とクライアントを受け取る。

        Parameters
        ----------
        configuration : RuntimeProviderConfiguration
            プロバイダの実行時設定。
        client : SecuAiGentEmbeddingClient | None
            埋め込みのクライアント。None なら既定（テストで差し替える）。
        """
        self._configuration = configuration
        self._client = client or SecuAiGentEmbeddingClient()

    def embed(self, request: CoreEmbeddingRequest) -> CoreEmbeddingResult:
        """文字列を埋め込む。失敗は例外にせず failure で返す。

        Parameters
        ----------
        request : CoreEmbeddingRequest
            埋め込みのリクエスト。

        Returns
        -------
        CoreEmbeddingResult
            成功の結果、または PROVIDER_FAILURE。
        """
        try:
            vector: Sequence[float] = self._client.embed(
                self._configuration, request.source.text
            )
        except Exception as e:  # noqa: BLE001 — 移植元と同じく失敗の結果にして返す
            return CoreEmbeddingResult.of_failure(
                CoreFailure.from_exception("PROVIDER_FAILURE", e)
            )
        return CoreEmbeddingResult.success(
            request.target_hint, vector, request.source.display_name
        )
