"""ベクトルDB 操作の入口（移植元 CoreVectorDbRuntime）。"""

import math
from collections.abc import Iterable

from generative_ai_core.failure import CoreFailure
from generative_ai_core.vector.azure_search import AzureAiSearchCoreVectorDbProvider
from generative_ai_core.vector.model import (
    CoreGraphWriteResult,
    CoreVectorDbOperation,
    CoreVectorDbProvider,
    CoreVectorDbRequest,
    CoreVectorDbResult,
)
from generative_ai_core.vector.pgvector import PgVectorCoreVectorDbProvider

POSTGRESQL_PROVIDER = "postgresql"


def _normalize(provider_id: str | None) -> str:
    """プロバイダ ID を比較用に正規化する。

    Parameters
    ----------
    provider_id : str | None
        プロバイダ ID。

    Returns
    -------
    str
        trim して小文字にした ID。
    """
    return "" if provider_id is None else provider_id.strip().lower()


def _validate(request: CoreVectorDbRequest) -> CoreFailure | None:
    """要求の内容を検証する。

    Parameters
    ----------
    request : CoreVectorDbRequest
        要求。

    Returns
    -------
    CoreFailure | None
        不正なら失敗。問題なければ None。
    """
    payload = request.payload
    if request.operation == CoreVectorDbOperation.DELETE:
        if not payload.id.strip():
            return CoreFailure.of("TARGET_NOT_FOUND", "delete id must not be blank")
        return None
    if request.operation.is_graph_only():
        return None
    if not payload.id.strip():
        return CoreFailure.of(
            "CONFIGURATION_FAILURE", "vector row id must not be blank"
        )
    if not payload.vector:
        return CoreFailure.of("EMPTY_VECTOR", "vector must not be empty")
    for value in payload.vector:
        if value is None or math.isnan(value) or math.isinf(value):
            return CoreFailure.of(
                "MALFORMED_VECTOR", "vector contains non-finite value"
            )
    return None


class CoreVectorDbRuntime:
    """プロバイダ ID で実装を選び、検証・例外の失敗化を行う。"""

    def __init__(self, providers: Iterable[CoreVectorDbProvider] | None = None) -> None:
        """プロバイダを登録する。

        Parameters
        ----------
        providers : Iterable[CoreVectorDbProvider] | None
            登録するプロバイダ。省略時は Azure AI Search と PostgreSQL（pgvector）。
        """
        if providers is None:
            providers = [
                AzureAiSearchCoreVectorDbProvider(),
                PgVectorCoreVectorDbProvider(),
            ]
        self._providers: dict[str, CoreVectorDbProvider] = {}
        for provider in providers:
            self._providers[_normalize(provider.provider_id())] = provider

    def execute(self, request: CoreVectorDbRequest) -> CoreVectorDbResult:
        """要求を検証してプロバイダに渡し、例外は失敗の結果にする。

        Parameters
        ----------
        request : CoreVectorDbRequest
            要求。

        Returns
        -------
        CoreVectorDbResult
            結果。
        """
        operation = request.operation
        provider = self._providers.get(_normalize(request.provider_id))
        if provider is None:
            return CoreVectorDbResult.fail(
                operation,
                CoreFailure.of(
                    "UNSUPPORTED_PROVIDER", "Unsupported vector DB provider"
                ),
            )
        if operation.is_graph_only() and _normalize(provider.provider_id()) != (
            POSTGRESQL_PROVIDER
        ):
            return CoreVectorDbResult.ok(
                request.payload.id,
                operation,
                CoreGraphWriteResult.disabled(),
            )
        validation_failure = _validate(request)
        if validation_failure is not None:
            return CoreVectorDbResult.fail(operation, validation_failure)
        try:
            return provider.execute(request)
        except ValueError as e:
            # 移植元の IllegalArgumentException（NumberFormatException も含む）に当たる
            return CoreVectorDbResult.fail(
                operation, CoreFailure.from_exception("CONFIGURATION_FAILURE", e)
            )
        except Exception as e:  # noqa: BLE001 — 移植元と同じく失敗の結果にして返す
            return CoreVectorDbResult.fail(
                operation, CoreFailure.from_exception("PROVIDER_FAILURE", e)
            )
