"""設定からプロバイダのランタイムを組み立てる（移植元 CoreProviderRuntimeFactory）。

embedding の登録は embedding-adapter の移植（後続の Issue）で加える。
"""

from collections.abc import Mapping

from generative_ai_core.chat.models import (
    CoreChatRequest,
    CoreImageExplanationRequest,
    CoreRagRequest,
)
from generative_ai_core.chat.runtime import CoreChatRuntime
from generative_ai_core.provider.clients.base import CoreProviderChatClient
from generative_ai_core.provider.clients.echo import EchoCoreChatClient
from generative_ai_core.provider.clients.openai_compatible import (
    AzureOpenAiCoreChatClient,
    OpenAiCoreChatClient,
)
from generative_ai_core.provider.clients.secuaigent.transport import (
    SecuAiGentCoreChatClient,
)
from generative_ai_core.provider.clients.unsupported import (
    AnthropicCoreChatClient,
    GoogleAiStudioCoreChatClient,
    VertexAiCoreChatClient,
)
from generative_ai_core.provider.model import (
    Capability,
    CoreCredential,
    CoreProviderCapabilityStatus,
    CoreProviderId,
    RuntimeProviderConfiguration,
)
from generative_ai_core.provider.runtime import CoreProviderRuntime

CAPABILITY_PROBE_MODEL = "capability-probe"
CAPABILITY_PROBE_ENDPOINT = "https://provider.example.invalid"
CAPABILITY_PROBE_SECRET = "capability-probe-secret"


def default_client(
    configuration: RuntimeProviderConfiguration,
) -> CoreProviderChatClient:
    """設定のプロバイダに合うクライアントを作る。

    Parameters
    ----------
    configuration : RuntimeProviderConfiguration
        プロバイダの設定。

    Returns
    -------
    CoreProviderChatClient
        プロバイダに対応するクライアント。
    """
    match configuration.provider_id:
        case CoreProviderId.OpenAI:
            return OpenAiCoreChatClient(configuration)
        case CoreProviderId.AzureOpenAI:
            return AzureOpenAiCoreChatClient(configuration)
        case CoreProviderId.Anthropic:
            return AnthropicCoreChatClient(configuration)
        case CoreProviderId.VertexAI:
            return VertexAiCoreChatClient(configuration)
        case CoreProviderId.GoogleAIStudio:
            return GoogleAiStudioCoreChatClient(configuration)
        case CoreProviderId.SecuAiGent:
            return SecuAiGentCoreChatClient(configuration)
        case CoreProviderId.Echo:
            return EchoCoreChatClient(configuration)


class CoreProviderRuntimeFactory:
    """設定からプロバイダのランタイムを組み立てる工場。"""

    def __init__(
        self, clients: Mapping[CoreProviderId, CoreProviderChatClient]
    ) -> None:
        """差し替え用のクライアントを受け取る。

        Parameters
        ----------
        clients : Mapping[CoreProviderId, CoreProviderChatClient]
            プロバイダごとの差し替えクライアント。ないプロバイダは既定を使う。
        """
        self._clients = dict(clients)

    @classmethod
    def with_clients(
        cls, clients: Mapping[CoreProviderId, CoreProviderChatClient]
    ) -> "CoreProviderRuntimeFactory":
        """プロバイダのクライアントを差し替えた工場（テスト用）。

        Parameters
        ----------
        clients : Mapping[CoreProviderId, CoreProviderChatClient]
            プロバイダごとの差し替えクライアント。

        Returns
        -------
        CoreProviderRuntimeFactory
            差し替えた工場。
        """
        return cls(clients)

    @staticmethod
    def create_provider_runtime(
        configuration: RuntimeProviderConfiguration,
    ) -> CoreProviderRuntime:
        """既定のクライアントでプロバイダのランタイムを作る。

        Parameters
        ----------
        configuration : RuntimeProviderConfiguration
            プロバイダの設定。

        Returns
        -------
        CoreProviderRuntime
            プロバイダのランタイム。
        """
        return CoreProviderRuntimeFactory({})._create_provider_runtime(configuration)

    @staticmethod
    def create_chat_runtime(
        configuration: RuntimeProviderConfiguration,
    ) -> CoreChatRuntime:
        """既定のクライアントでチャットのランタイムを作る。

        Parameters
        ----------
        configuration : RuntimeProviderConfiguration
            プロバイダの設定。

        Returns
        -------
        CoreChatRuntime
            チャットのランタイム。
        """
        return CoreChatRuntime(
            CoreProviderRuntimeFactory.create_provider_runtime(configuration)
        )

    @staticmethod
    def default_capability_matrix() -> dict[
        CoreProviderId, list[CoreProviderCapabilityStatus]
    ]:
        """全プロバイダの機能対応表を作る。

        Returns
        -------
        dict[CoreProviderId, list[CoreProviderCapabilityStatus]]
            プロバイダごとの機能の対応状況。
        """
        matrix: dict[CoreProviderId, list[CoreProviderCapabilityStatus]] = {}
        for provider_id in CoreProviderId:
            configuration = RuntimeProviderConfiguration(
                provider_id,
                CAPABILITY_PROBE_MODEL,
                CAPABILITY_PROBE_ENDPOINT,
                CoreCredential.api_key(CAPABILITY_PROBE_SECRET),
            )
            matrix[provider_id] = list(
                default_client(configuration).capability_statuses().values()
            )
        return matrix

    def create_runtime(
        self, configuration: RuntimeProviderConfiguration
    ) -> CoreChatRuntime:
        """このインスタンスのクライアントでチャットのランタイムを作る。

        Parameters
        ----------
        configuration : RuntimeProviderConfiguration
            プロバイダの設定。

        Returns
        -------
        CoreChatRuntime
            チャットのランタイム。
        """
        return CoreChatRuntime(self._create_provider_runtime(configuration))

    def _create_provider_runtime(
        self, configuration: RuntimeProviderConfiguration
    ) -> CoreProviderRuntime:
        """プロバイダのランタイムを作り、chat・rag・画像説明の実行器を登録する。

        Parameters
        ----------
        configuration : RuntimeProviderConfiguration
            プロバイダの設定。

        Returns
        -------
        CoreProviderRuntime
            プロバイダのランタイム。
        """
        client = self._clients.get(configuration.provider_id) or default_client(
            configuration
        )
        name = configuration.provider_id.canonical_name
        return (
            CoreProviderRuntime.builder()
            .register(name, Capability.CHAT, CoreChatRequest, client.chat)
            .register(name, Capability.RAG, CoreRagRequest, client.rag)
            .register(
                name,
                Capability.IMAGE_EXPLANATION,
                CoreImageExplanationRequest,
                client.image_explanation,
            )
            .build()
        )
