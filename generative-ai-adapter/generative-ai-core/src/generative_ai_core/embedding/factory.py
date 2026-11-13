"""埋め込みの実行器の登録（移植元 CoreProviderRuntimeFactory の registerEmbedding・createEmbeddingRuntime）。

#298 の `CoreProviderRuntimeFactory`（chat・rag・画像説明）には手を入れず、
埋め込みの登録だけをここに持つ。
"""

from generative_ai_core.embedding.providers import (
    AzureOpenAiCoreEmbeddingProvider,
    EchoCoreEmbeddingProvider,
    OpenAiCoreEmbeddingProvider,
)
from generative_ai_core.embedding.request import CoreEmbeddingRequest
from generative_ai_core.embedding.runtime import CoreEmbeddingRuntime
from generative_ai_core.provider.model import (
    Capability,
    CoreProviderId,
    RuntimeProviderConfiguration,
)
from generative_ai_core.provider.runtime import (
    CoreProviderRuntime,
    CoreProviderRuntimeBuilder,
)


def register_embedding(
    builder: CoreProviderRuntimeBuilder, configuration: RuntimeProviderConfiguration
) -> None:
    """プロバイダに合う埋め込みの実行器を登録する。OpenAI・Azure・SecuAiGent と、Python 版だけの Echo。

    Parameters
    ----------
    builder : CoreProviderRuntimeBuilder
        登録先のビルダー。
    configuration : RuntimeProviderConfiguration
        プロバイダの実行時設定。
    """
    name = configuration.provider_id.canonical_name
    match configuration.provider_id:
        case CoreProviderId.OpenAI:
            openai = OpenAiCoreEmbeddingProvider(configuration)
            builder.register(
                name,
                Capability.EMBEDDING,
                CoreEmbeddingRequest,
                lambda request, context: openai.embed(request),
            )
        case CoreProviderId.AzureOpenAI:
            azure = AzureOpenAiCoreEmbeddingProvider(configuration)
            builder.register(
                name,
                Capability.EMBEDDING,
                CoreEmbeddingRequest,
                lambda request, context: azure.embed(request),
            )
        case CoreProviderId.SecuAiGent:
            # secuaigent.embedding は embedding パッケージを import するため、循環を避けて遅延 import する
            from generative_ai_core.provider.clients.secuaigent.embedding import (
                SecuAiGentCoreEmbeddingProvider,
            )

            secuaigent = SecuAiGentCoreEmbeddingProvider(configuration)
            builder.register(
                name,
                Capability.EMBEDDING,
                CoreEmbeddingRequest,
                lambda request, context: secuaigent.embed(request),
            )
        case CoreProviderId.Echo:
            echo = EchoCoreEmbeddingProvider(configuration)
            builder.register(
                name,
                Capability.EMBEDDING,
                CoreEmbeddingRequest,
                lambda request, context: echo.embed(request),
            )
        case _:
            return


def create_embedding_provider_runtime(
    configuration: RuntimeProviderConfiguration,
) -> CoreProviderRuntime:
    """埋め込みの実行器だけを登録したプロバイダのランタイムを作る。

    Parameters
    ----------
    configuration : RuntimeProviderConfiguration
        プロバイダの実行時設定。

    Returns
    -------
    CoreProviderRuntime
        EMBEDDING を登録したランタイム（未対応のプロバイダは何も登録しない）。
    """
    builder = CoreProviderRuntime.builder()
    register_embedding(builder, configuration)
    return builder.build()


def create_embedding_runtime(
    configuration: RuntimeProviderConfiguration,
) -> CoreEmbeddingRuntime:
    """設定から埋め込みの facade を作る（移植元 createEmbeddingRuntime）。

    Parameters
    ----------
    configuration : RuntimeProviderConfiguration
        プロバイダの実行時設定。

    Returns
    -------
    CoreEmbeddingRuntime
        埋め込みの facade。
    """
    return CoreEmbeddingRuntime(create_embedding_provider_runtime(configuration))
