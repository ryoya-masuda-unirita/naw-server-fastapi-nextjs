"""Waha! に依存しない埋め込みの runtime（移植元 jp.co.unirita.ai.core.embedding）。"""

from generative_ai_core.embedding.request import (
    CoreEmbeddingRequest,
    CoreEmbeddingRequestBuilder,
    EmbeddingSource,
    EmbeddingSourceType,
)
from generative_ai_core.embedding.result import CoreEmbeddingResult
from generative_ai_core.embedding.runtime import CoreEmbeddingRuntime

from generative_ai_core.embedding.providers import (  # isort: skip
    AzureOpenAiCoreEmbeddingProvider,
    EchoCoreEmbeddingProvider,
    OpenAiCoreEmbeddingProvider,
    to_doubles,
)
from generative_ai_core.embedding.factory import (  # isort: skip
    create_embedding_provider_runtime,
    create_embedding_runtime,
    register_embedding,
)

__all__ = [
    "AzureOpenAiCoreEmbeddingProvider",
    "CoreEmbeddingRequest",
    "CoreEmbeddingRequestBuilder",
    "CoreEmbeddingResult",
    "CoreEmbeddingRuntime",
    "EchoCoreEmbeddingProvider",
    "EmbeddingSource",
    "EmbeddingSourceType",
    "OpenAiCoreEmbeddingProvider",
    "create_embedding_provider_runtime",
    "create_embedding_runtime",
    "register_embedding",
    "to_doubles",
]
