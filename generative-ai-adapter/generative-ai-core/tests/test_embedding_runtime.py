"""移植元 CoreEmbeddingDtoTest・CoreEmbeddingRuntimeTest・
CoreEmbeddingProviderBranchTest・CoreEmbeddingVectorFailureRedactionTest
（埋め込み側の 2 件。ベクトル DB 側は vector の移植で扱う）の移植。
"""

import math

from generative_ai_core.embedding import (
    CoreEmbeddingRequest,
    CoreEmbeddingResult,
    CoreEmbeddingRuntime,
    EmbeddingSource,
    to_doubles,
)
from generative_ai_core.failure import CoreFailure
from generative_ai_core.network.setting import CoreNetworkSetting
from generative_ai_core.provider.model import Capability
from generative_ai_core.provider.runtime import CoreProviderRuntime


def _runtime_returning(result: CoreEmbeddingResult) -> CoreEmbeddingRuntime:
    """常に指定の結果を返す実行器を登録したランタイムを作る。

    Parameters
    ----------
    result : CoreEmbeddingResult
        実行器が返す結果。

    Returns
    -------
    CoreEmbeddingRuntime
        プロバイダ `openai` に登録したランタイム。
    """
    return CoreEmbeddingRuntime(
        CoreProviderRuntime.builder()
        .register(
            "openai",
            Capability.EMBEDDING,
            CoreEmbeddingRequest,
            lambda request, context: result,
        )
        .build()
    )


def _request() -> CoreEmbeddingRequest:
    """テスト用のリクエストを作る。

    Returns
    -------
    CoreEmbeddingRequest
        プロバイダ `openai` のリクエスト。
    """
    return (
        CoreEmbeddingRequest.builder("openai")
        .source(EmbeddingSource.of_text("hello"))
        .target_hint("target")
        .build()
    )


def test_request_copies_only_named_metadata_values() -> None:
    """名前のある付加情報だけをコピーし、値が None なら空にすること"""
    request = (
        CoreEmbeddingRequest.builder("OpenAI")
        .source(EmbeddingSource.of_text("text"))
        .target_hint("target-1")
        .metadata(None, "ignored")
        .metadata(" ", "ignored")
        .metadata("null-value", None)
        .metadata("tenant", "tenant-a")
        .build()
    )

    assert request.metadata == {"tenant": "tenant-a", "null-value": ""}


def test_request_trims_provider_id_and_rejects_blank() -> None:
    """プロバイダ ID の空白を除き、空ならエラーにすること"""
    request = CoreEmbeddingRequest.builder(" openai ").build()
    assert request.provider_id == "openai"
    assert request.source == EmbeddingSource.of_text("")
    assert request.network_setting == CoreNetworkSetting.defaults()
    try:
        CoreEmbeddingRequest.builder(" ").build()
    except ValueError as e:
        assert "providerId" in str(e)
    else:
        raise AssertionError("ValueError expected")


def test_source_factories_set_type_and_display_name() -> None:
    """text は inline-text、file はパスを表示名にすること"""
    assert EmbeddingSource.of_text("a").display_name == "inline-text"
    assert EmbeddingSource.of_file("docs/a.txt", "a").display_name == "docs/a.txt"


def test_result_failure_uses_common_core_failure() -> None:
    """失敗の結果が共通の CoreFailure を持ち、秘密を伏せてベクトルが空であること"""
    result = CoreEmbeddingResult.of_failure(
        CoreFailure.of("PROVIDER_FAILURE", "api-key=secret")
    )

    assert result.failure is not None
    assert result.failure.code == "PROVIDER_FAILURE"
    assert "secret" not in result.failure.summary
    assert result.vector == ()


def test_result_success_copies_vector() -> None:
    """成功の結果が元のリストと独立してベクトルを持つこと"""
    vector = [0.1, 0.2]
    result = CoreEmbeddingResult.success("row-1", vector, "source.txt")
    vector.append(0.3)

    assert result.target_id == "row-1"
    assert result.vector == (0.1, 0.2)
    assert result.failure is None


def test_embed_executes_through_provider_boundary_with_hints() -> None:
    """プロバイダ境界を通して targetHint と表示名を持つ結果を返すこと"""
    provider_runtime = (
        CoreProviderRuntime.builder()
        .register(
            "openai",
            Capability.EMBEDDING,
            CoreEmbeddingRequest,
            lambda request, context: CoreEmbeddingResult.success(
                request.target_hint, [0.1, 0.2, 0.3], request.source.display_name
            ),
        )
        .build()
    )
    request = (
        CoreEmbeddingRequest.builder("openai")
        .network_setting(CoreNetworkSetting.defaults())
        .source(EmbeddingSource.of_file("docs/a.txt", "hello"))
        .target_hint("vector-row-1")
        .metadata("chunk", "1")
        .build()
    )

    result = CoreEmbeddingRuntime(provider_runtime).embed(request)

    assert result.target_id == "vector-row-1"
    assert result.vector == (0.1, 0.2, 0.3)
    assert result.source_name == "docs/a.txt"
    assert result.failure is None


def test_embed_rejects_unsupported_provider() -> None:
    """EMBEDDING を登録していないプロバイダは UNSUPPORTED_PROVIDER になること"""
    runtime = CoreEmbeddingRuntime(CoreProviderRuntime.builder().build())

    result = runtime.embed(
        CoreEmbeddingRequest.builder("Anthropic")
        .source(EmbeddingSource.of_text("hello"))
        .build()
    )

    assert result.failure is not None
    assert result.failure.code == "UNSUPPORTED_PROVIDER"


def test_embed_rejects_empty_vector() -> None:
    """空のベクトルは EMPTY_VECTOR になること"""
    result = _runtime_returning(CoreEmbeddingResult.success("t", [], "s")).embed(
        _request()
    )
    assert result.failure is not None
    assert result.failure.code == "EMPTY_VECTOR"


def test_embed_rejects_non_finite_vectors() -> None:
    """NaN・無限大を含むベクトルは MALFORMED_VECTOR になること"""
    for vector in ([math.nan], [1.0, math.inf], [-math.inf]):
        result = _runtime_returning(
            CoreEmbeddingResult.success("t", vector, "s")
        ).embed(_request())
        assert result.failure is not None
        assert result.failure.code == "MALFORMED_VECTOR"


def test_embed_passes_provider_failure_through() -> None:
    """プロバイダが返した失敗はそのまま返すこと"""
    result = _runtime_returning(
        CoreEmbeddingResult.of_failure(CoreFailure.of("PROVIDER", "failed"))
    ).embed(_request())
    assert result.failure is not None
    assert result.failure.code == "PROVIDER"


def test_embed_converts_provider_exception_to_sanitized_failure() -> None:
    """実行器の例外は PROVIDER_FAILURE にして秘密情報を伏せること"""

    def boom(request: CoreEmbeddingRequest, context: object) -> CoreEmbeddingResult:
        """秘密情報入りのメッセージで失敗する実行器。

        Parameters
        ----------
        request : CoreEmbeddingRequest
            リクエスト（使わない）。
        context : object
            実行コンテキスト（使わない）。

        Raises
        ------
        RuntimeError
            常に送出する。
        """
        raise RuntimeError(
            "failed with api-key=sk-test and https://prod.example.internal"
        )

    runtime = CoreEmbeddingRuntime(
        CoreProviderRuntime.builder()
        .register("openai", Capability.EMBEDDING, CoreEmbeddingRequest, boom)
        .build()
    )

    result = runtime.embed(_request())

    assert result.failure is not None
    assert result.failure.code == "PROVIDER_FAILURE"
    assert "sk-test" not in result.failure.summary
    assert "prod.example.internal" not in result.failure.summary


def test_to_doubles_handles_none_and_values() -> None:
    """ベクトル変換が None を空にし、値を double にすること"""
    assert to_doubles(None) == []
    assert to_doubles([1.0, 2.5]) == [1.0, 2.5]
    assert to_doubles([3.0, 4.5]) == [3.0, 4.5]


def test_to_doubles_rounds_to_single_precision_like_float_widening() -> None:
    """float を double に広げたときと同じく単精度に丸めること"""
    assert to_doubles([0.1]) == [0.10000000149011612]
