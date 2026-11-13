"""移植元で「未対応」として理由付きの失敗を返すプロバイダ。

移植元（S3.2）は Anthropic・VertexAI・GoogleAIStudio のネットワーク設定・オプションの
同等性を確かめていないため、送信せずに UNSUPPORTED_PROVIDER_CAPABILITY を返す。
文言は移植元のまま。
"""

from generative_ai_core.provider.clients.base import UnsupportedCoreProviderChatClient
from generative_ai_core.provider.model import (
    CoreProviderId,
    RuntimeProviderConfiguration,
)


class AnthropicCoreChatClient(UnsupportedCoreProviderChatClient):
    """Anthropic 向けの未対応クライアント。"""

    def __init__(self, configuration: RuntimeProviderConfiguration) -> None:
        """未対応の理由を設定して初期化する。

        Parameters
        ----------
        configuration : RuntimeProviderConfiguration
            プロバイダの設定（未対応のため使わない）。
        """
        super().__init__(
            CoreProviderId.Anthropic,
            "scope violation: Spring AI Anthropic artifact compiles, but core-owned "
            "network and option parity evidence is incomplete in S3.2",
            "dependency-probe=spring-ai-starter-model-anthropic:1.1.7:pass; "
            "scope-boundary=network-option-parity-unverified; compile-evidence=adapter "
            "AnthropicChatService reviewed without importing adapter code",
            "Implement Anthropic Spring AI transport in a follow-up within the same "
            "runtime configuration model",
        )


class VertexAiCoreChatClient(UnsupportedCoreProviderChatClient):
    """VertexAI 向けの未対応クライアント。"""

    def __init__(self, configuration: RuntimeProviderConfiguration) -> None:
        """未対応の理由を設定して初期化する。

        Parameters
        ----------
        configuration : RuntimeProviderConfiguration
            プロバイダの設定（未対応のため使わない）。
        """
        super().__init__(
            CoreProviderId.VertexAI,
            "SDK limitation: VertexAI needs credentials file, project, location, and "
            "Google GenAI network hook mapping outside the approved S3.2 boundary",
            "dependency-probe=spring-ai-starter-model-google-genai:1.1.7:pass; "
            "scope-boundary=credentials-project-location-and-network-mapping; "
            "compile-evidence=adapter VertexAIChatService reviewed without importing "
            "adapter code",
            "Implement VertexAI Google GenAI transport after credential and network "
            "mapping evidence is added",
        )


class GoogleAiStudioCoreChatClient(UnsupportedCoreProviderChatClient):
    """GoogleAIStudio 向けの未対応クライアント。"""

    def __init__(self, configuration: RuntimeProviderConfiguration) -> None:
        """未対応の理由を設定して初期化する。

        Parameters
        ----------
        configuration : RuntimeProviderConfiguration
            プロバイダの設定（未対応のため使わない）。
        """
        super().__init__(
            CoreProviderId.GoogleAIStudio,
            "scope violation: Spring AI Google GenAI artifact compiles, but proxy and "
            "timeout parity evidence is incomplete in S3.2",
            "dependency-probe=spring-ai-starter-model-google-genai:1.1.7:pass; "
            "scope-boundary=proxy-timeout-parity-unverified; compile-evidence=adapter "
            "GeminiChatService reviewed without importing adapter code",
            "Implement Google AI Studio Spring AI transport after network parity "
            "evidence is added",
        )
