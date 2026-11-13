"""埋め込みの facade（移植元 CoreEmbeddingRuntime）。"""

import logging
import math

from generative_ai_core.embedding.request import CoreEmbeddingRequest
from generative_ai_core.embedding.result import CoreEmbeddingResult
from generative_ai_core.failure import CoreFailure
from generative_ai_core.provider.model import Capability
from generative_ai_core.provider.runtime import CoreProviderRuntime

logger = logging.getLogger(__name__)


def _validate_vector(result: CoreEmbeddingResult) -> CoreFailure | None:
    """ベクトルが空でなく、有限の数だけであることを確かめる。

    Parameters
    ----------
    result : CoreEmbeddingResult
        プロバイダが返した成功の結果。

    Returns
    -------
    CoreFailure | None
        不正なら失敗、問題なければ None。
    """
    if not result.vector:
        return CoreFailure.of("EMPTY_VECTOR", "embedding vector must not be empty")
    for value in result.vector:
        if value is None or math.isnan(value) or math.isinf(value):
            return CoreFailure.of(
                "MALFORMED_VECTOR", "embedding vector contains non-finite value"
            )
    return None


class CoreEmbeddingRuntime:
    """プロバイダの埋め込みを呼び、結果のベクトルを検証する。"""

    def __init__(self, provider_runtime: CoreProviderRuntime) -> None:
        """プロバイダのランタイムを受け取る。

        Parameters
        ----------
        provider_runtime : CoreProviderRuntime
            EMBEDDING の実行器を登録したランタイム。

        Raises
        ------
        ValueError
            None のとき。
        """
        if provider_runtime is None:
            raise ValueError("providerRuntime must not be null")
        self._provider_runtime = provider_runtime

    def embed(self, request: CoreEmbeddingRequest) -> CoreEmbeddingResult:
        """埋め込みを実行する。失敗は例外にせず failure で返す。

        Parameters
        ----------
        request : CoreEmbeddingRequest
            埋め込みのリクエスト。

        Returns
        -------
        CoreEmbeddingResult
            結果。プロバイダ未対応は UNSUPPORTED_PROVIDER、空のベクトルは
            EMPTY_VECTOR、有限でない値を含むベクトルは MALFORMED_VECTOR、
            設定の不備は CONFIGURATION_FAILURE、その他は PROVIDER_FAILURE。

        Raises
        ------
        ValueError
            request が None のとき。
        """
        if request is None:
            raise ValueError("request must not be null")
        provider_id = request.provider_id
        if not self._provider_runtime.supports(provider_id, Capability.EMBEDDING):
            logger.info("core embedding: unsupported provider=%s", provider_id)
            return CoreEmbeddingResult.of_failure(
                CoreFailure.of("UNSUPPORTED_PROVIDER", "Unsupported embedding provider")
            )
        logger.info(
            "core embedding: provider=%s, source=%s, textChars=%d",
            provider_id,
            request.source.type,
            len(request.source.text),
        )
        try:
            result = self._provider_runtime.execute(
                provider_id,
                Capability.EMBEDDING,
                request,
                request.network_setting,
                CoreEmbeddingResult,
            )
            if result.failure is not None:
                return result
            validation_failure = _validate_vector(result)
            if validation_failure is not None:
                return CoreEmbeddingResult.of_failure(validation_failure)
            logger.info("core embedding finished: dimensions=%d", len(result.vector))
            return result
        except ValueError as e:
            return CoreEmbeddingResult.of_failure(
                CoreFailure.from_exception("CONFIGURATION_FAILURE", e)
            )
        except Exception as e:  # noqa: BLE001 — 移植元と同じく失敗の結果にして返す
            return CoreEmbeddingResult.of_failure(
                CoreFailure.from_exception("PROVIDER_FAILURE", e)
            )
