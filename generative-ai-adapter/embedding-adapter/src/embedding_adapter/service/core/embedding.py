"""core の埋め込み runtime に委譲する埋め込みモデル（移植元 CoreDelegatingEmbeddingModel）。"""

from generative_ai_core.embedding import (
    CoreEmbeddingRequest,
    CoreEmbeddingRuntime,
    EmbeddingSource,
    create_embedding_runtime,
)
from generative_ai_core.network import CoreNetworkSetting
from generative_ai_core.provider.clients.secuaigent.keys import DIMENSIONS, TENANT_ID
from generative_ai_core.provider.model import (
    CoreCredential,
    CoreProviderId,
    RuntimeProviderConfiguration,
)

from embedding_adapter.domain import (
    EmbeddingNetworkProperties,
    EmbeddingProviderProperties,
)
from embedding_adapter.model import AbstractEmbeddingModel
from embedding_adapter.service.core.configuration import (
    DEFAULT_MODEL_NAME,
    resolve_embedding_dimensions,
)


def _core_credential(
    properties: EmbeddingProviderProperties, provider: CoreProviderId
) -> CoreCredential:
    """資格情報を作る。SecuAiGent でアクセストークンがあれば Bearer にする。

    Parameters
    ----------
    properties : EmbeddingProviderProperties
        プロバイダのプロパティ。
    provider : CoreProviderId
        プロバイダ。

    Returns
    -------
    CoreCredential
        資格情報。表示名にはプロバイダの正式名を使う。
    """
    token = properties.secu_ai_gent_access_token
    if provider == CoreProviderId.SecuAiGent and token is not None and token.strip():
        return CoreCredential.bearer_token(token)
    return CoreCredential.api_key(properties.api_key, provider.canonical_name)


class CoreDelegatingEmbeddingModel(AbstractEmbeddingModel):
    """Waha! のプロパティから core の埋め込み runtime を作り、埋め込みを委譲する。"""

    def __init__(
        self,
        access_credential: EmbeddingProviderProperties,
        proxy_setting: EmbeddingNetworkProperties | None,
    ) -> None:
        """プロパティから core の設定と runtime を作る。

        Parameters
        ----------
        access_credential : EmbeddingProviderProperties
            プロバイダのプロパティ。
        proxy_setting : EmbeddingNetworkProperties | None
            プロキシ・SSL のプロパティ。

        Raises
        ------
        ValueError
            ベンダーが不明、SecuAiGent で Tenant ID がない、必須項目が空のとき。
        """
        provider = CoreProviderId.parse(access_credential.vendor_name)
        model_name = access_credential.model_name
        attributes: dict[str, str] = {}
        if provider == CoreProviderId.SecuAiGent:
            tenant_id = access_credential.tenant_id
            if tenant_id is None or not tenant_id.strip():
                raise ValueError("tenantId must not be blank for SecuAiGent")
            attributes[TENANT_ID] = tenant_id
            attributes[DIMENSIONS] = str(
                resolve_embedding_dimensions(access_credential.embedding_dimensions)
            )
        network = (
            proxy_setting if proxy_setting is not None else EmbeddingNetworkProperties()
        )
        configuration = RuntimeProviderConfiguration(
            provider_id=provider,
            model_name=(
                DEFAULT_MODEL_NAME
                if model_name is None or not model_name.strip()
                else model_name
            ),
            endpoint=access_credential.url or "",
            credential=_core_credential(access_credential, provider),
            network_setting=network.to_setting(access_credential.timeout_seconds),
            attributes=attributes,
        )
        self._provider_id: str = configuration.provider_id.canonical_name
        self._network_setting: CoreNetworkSetting = configuration.network_setting
        self._runtime: CoreEmbeddingRuntime = create_embedding_runtime(configuration)

    @classmethod
    def from_runtime(
        cls,
        provider_id: str,
        network_setting: CoreNetworkSetting | None,
        runtime: CoreEmbeddingRuntime,
    ) -> "CoreDelegatingEmbeddingModel":
        """作成済みの runtime を使ってモデルを作る（テストで runtime を差し替える用）。

        Parameters
        ----------
        provider_id : str
            プロバイダ ID。
        network_setting : CoreNetworkSetting | None
            ネットワーク設定。None なら既定。
        runtime : CoreEmbeddingRuntime
            埋め込みの runtime。

        Returns
        -------
        CoreDelegatingEmbeddingModel
            作ったモデル。
        """
        model = cls.__new__(cls)
        model._provider_id = provider_id
        model._network_setting = (
            network_setting
            if network_setting is not None
            else CoreNetworkSetting.defaults()
        )
        model._runtime = runtime
        return model

    def create_embedding(self, text: str | None) -> list[float]:
        """テキストを埋め込みベクトルにする。

        Parameters
        ----------
        text : str | None
            テキスト。None は空文字列として扱う。

        Returns
        -------
        list[float]
            埋め込みベクトル。

        Raises
        ------
        RuntimeError
            core が失敗を返したとき（メッセージは伏せ字済みの要約）。
        """
        request = (
            CoreEmbeddingRequest.builder(self._provider_id)
            .network_setting(self._network_setting)
            .source(EmbeddingSource.of_text(text if text is not None else ""))
            .build()
        )
        result = self._runtime.embed(request)
        if result.failure is not None:
            raise RuntimeError(result.failure.summary)
        return list(result.vector)
