"""Waha! のプロパティから core の設定への変換（移植元 EmbeddingCoreConfigurationMapper）。"""

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

DEFAULT_EMBEDDING_DIMENSIONS = 1536
DEFAULT_MODEL_NAME = "embedding-model"


def resolve_embedding_dimensions(configured: int | None) -> int:
    """埋め込みの次元数を決める。

    Parameters
    ----------
    configured : int | None
        設定された次元数。

    Returns
    -------
    int
        正の値ならそのまま、未設定・0 以下なら 1536。
    """
    if configured is None or configured <= 0:
        return DEFAULT_EMBEDDING_DIMENSIONS
    return configured


def _model(value: str | None) -> str:
    """モデル名が空なら既定のモデル名にする。

    Parameters
    ----------
    value : str | None
        モデル名。

    Returns
    -------
    str
        モデル名。
    """
    return DEFAULT_MODEL_NAME if value is None or not value.strip() else value


def _credential(
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
        資格情報。
    """
    token = properties.secu_ai_gent_access_token
    if provider == CoreProviderId.SecuAiGent and token is not None and token.strip():
        return CoreCredential.bearer_token(token)
    return CoreCredential.api_key(properties.api_key, properties.vendor_name or "")


class EmbeddingCoreConfigurationMapper:
    """Waha! のプロパティ（可変）を core の不変な設定に変換する。"""

    def map(
        self,
        properties: EmbeddingProviderProperties,
        network: EmbeddingNetworkProperties | None,
    ) -> RuntimeProviderConfiguration:
        """プロバイダのプロパティを core の設定に変換する。

        Parameters
        ----------
        properties : EmbeddingProviderProperties
            プロバイダのプロパティ。
        network : EmbeddingNetworkProperties | None
            プロキシ・SSL のプロパティ。

        Returns
        -------
        RuntimeProviderConfiguration
            core のプロバイダ設定。

        Raises
        ------
        ValueError
            ベンダーが不明、SecuAiGent で Tenant ID がない、必須項目が空のとき。
        """
        provider = CoreProviderId.parse(properties.vendor_name)
        attributes: dict[str, str] = {}
        if provider == CoreProviderId.SecuAiGent:
            if properties.tenant_id is None or not properties.tenant_id.strip():
                raise ValueError("tenantId must not be blank for SecuAiGent")
            attributes[TENANT_ID] = properties.tenant_id
            attributes[DIMENSIONS] = str(
                resolve_embedding_dimensions(properties.embedding_dimensions)
            )
        return RuntimeProviderConfiguration(
            provider_id=provider,
            model_name=_model(properties.model_name),
            endpoint=properties.url or "",
            credential=_credential(properties, provider),
            network_setting=self.network(properties, network),
            attributes=attributes,
        )

    def network(
        self,
        provider: EmbeddingProviderProperties | None,
        network: EmbeddingNetworkProperties | None,
    ) -> CoreNetworkSetting:
        """プロキシ・SSL とタイムアウトから core のネットワーク設定を作る。

        Parameters
        ----------
        provider : EmbeddingProviderProperties | None
            プロバイダのプロパティ（タイムアウトを読む）。
        network : EmbeddingNetworkProperties | None
            プロキシ・SSL のプロパティ。None なら既定（プロキシなし）。

        Returns
        -------
        CoreNetworkSetting
            core のネットワーク設定。
        """
        properties = network if network is not None else EmbeddingNetworkProperties()
        return properties.to_setting(provider.timeout_seconds if provider else None)
