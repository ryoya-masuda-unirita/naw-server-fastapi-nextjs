"""埋め込みモデルの作成（移植元 service.EmbeddingSelectorService と service.embedding）。

OpenAI・AzureOpenAI・SecuAiGent はどれも core に委譲するため、同じ
`CoreDelegatingEmbeddingModel` を使う。
"""

from embedding_adapter.domain import (
    EmbeddingNetworkProperties,
    EmbeddingProviderProperties,
)
from embedding_adapter.model import AbstractEmbeddingModel
from embedding_adapter.service.core.embedding import CoreDelegatingEmbeddingModel

SUPPORTED_VENDORS = frozenset({"OpenAI", "AzureOpenAI", "SecuAiGent", "Echo"})


class OpenAIEmbeddingService(AbstractEmbeddingModel):
    """OpenAI の埋め込み。core に委譲する。"""

    def __init__(
        self,
        provider: EmbeddingProviderProperties,
        network: EmbeddingNetworkProperties | None,
    ) -> None:
        """委譲先のモデルを作る。

        Parameters
        ----------
        provider : EmbeddingProviderProperties
            プロバイダのプロパティ。
        network : EmbeddingNetworkProperties | None
            プロキシ・SSL のプロパティ。
        """
        self._delegate = CoreDelegatingEmbeddingModel(provider, network)

    def create_embedding(self, text: str | None) -> list[float]:
        """テキストを埋め込みベクトルにする。

        Parameters
        ----------
        text : str | None
            テキスト。

        Returns
        -------
        list[float]
            埋め込みベクトル。
        """
        return self._delegate.create_embedding(text)


class AzureOpenAIEmbeddingService(AbstractEmbeddingModel):
    """Azure OpenAI の埋め込み。core に委譲する。"""

    def __init__(
        self,
        provider: EmbeddingProviderProperties,
        network: EmbeddingNetworkProperties | None,
    ) -> None:
        """委譲先のモデルを作る。

        Parameters
        ----------
        provider : EmbeddingProviderProperties
            プロバイダのプロパティ。
        network : EmbeddingNetworkProperties | None
            プロキシ・SSL のプロパティ。
        """
        self._delegate = CoreDelegatingEmbeddingModel(provider, network)

    def create_embedding(self, text: str | None) -> list[float]:
        """テキストを埋め込みベクトルにする。

        Parameters
        ----------
        text : str | None
            テキスト。

        Returns
        -------
        list[float]
            埋め込みベクトル。
        """
        return self._delegate.create_embedding(text)


class EmbeddingSelectorService:
    """ベンダー名から埋め込みモデルを作る。"""

    @staticmethod
    def create_embedding_model(
        proxy_setting: EmbeddingNetworkProperties | None,
        access_credential: EmbeddingProviderProperties,
    ) -> AbstractEmbeddingModel:
        """埋め込みモデルを作る。

        Parameters
        ----------
        proxy_setting : EmbeddingNetworkProperties | None
            プロキシ・SSL のプロパティ。
        access_credential : EmbeddingProviderProperties
            プロバイダのプロパティ。

        Returns
        -------
        AbstractEmbeddingModel
            埋め込みモデル。

        Raises
        ------
        ValueError
            ベンダーが対応外のとき。
        """
        return EmbeddingSelectorService().create_model(proxy_setting, access_credential)

    def create_model(
        self,
        proxy_setting: EmbeddingNetworkProperties | None,
        access_credential: EmbeddingProviderProperties,
    ) -> AbstractEmbeddingModel:
        """ベンダー名（OpenAI・AzureOpenAI・SecuAiGent）に応じてモデルを作る。

        Parameters
        ----------
        proxy_setting : EmbeddingNetworkProperties | None
            プロキシ・SSL のプロパティ。
        access_credential : EmbeddingProviderProperties
            プロバイダのプロパティ。

        Returns
        -------
        AbstractEmbeddingModel
            埋め込みモデル。

        Raises
        ------
        ValueError
            ベンダーが対応外のとき。
        """
        if access_credential.vendor_name not in SUPPORTED_VENDORS:
            raise ValueError(f"Unsupported vendor: {access_credential.vendor_name}")
        return CoreDelegatingEmbeddingModel(access_credential, proxy_setting)
