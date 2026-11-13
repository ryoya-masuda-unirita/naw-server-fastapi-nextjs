"""Echo 埋め込み（Python 版だけ。移植元にはない）のテスト。

キーなしでベクトルDB の動作確認ができるよう、文字列から決まる単位ベクトルを返す。
"""

import math

from generative_ai_core.embedding import (
    CoreEmbeddingRequest,
    EmbeddingSource,
    create_embedding_runtime,
)
from generative_ai_core.provider.model import (
    CoreCredential,
    CoreProviderId,
    RuntimeProviderConfiguration,
)

DIMENSIONS = 1536


def embed(text: str) -> tuple[float, ...]:
    """Echo の埋め込みでベクトルを作る。

    Parameters
    ----------
    text : str
        埋め込む文字列。

    Returns
    -------
    tuple[float, ...]
        ベクトル。
    """
    runtime = create_embedding_runtime(
        RuntimeProviderConfiguration(
            provider_id=CoreProviderId.Echo,
            model_name="echo",
            endpoint="http://echo.invalid",
            credential=CoreCredential.api_key("echo", "Echo"),
        )
    )
    request = (
        CoreEmbeddingRequest.builder(CoreProviderId.Echo.canonical_name)
        .source(EmbeddingSource.of_text(text))
        .build()
    )
    result = runtime.embed(request)
    assert result.failure is None
    return tuple(result.vector)


def test_echo_embedding_is_deterministic_unit_vector_of_table_dimension() -> None:
    """同じ文字列は同じベクトルになり、1536 次元の単位ベクトルであること"""
    first = embed("経費精算")
    assert first == embed("経費精算")
    assert len(first) == DIMENSIONS
    assert math.isclose(math.sqrt(sum(v * v for v in first)), 1.0, rel_tol=1e-4)


def test_echo_embedding_differs_by_text() -> None:
    """文字列が違えばベクトルも違うこと"""
    assert embed("a") != embed("b")
