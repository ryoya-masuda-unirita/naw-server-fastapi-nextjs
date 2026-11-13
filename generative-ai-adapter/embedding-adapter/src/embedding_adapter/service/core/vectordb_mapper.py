"""アダプタの設定・Embedding を core のベクトルDB 型へ変換する（移植元 AdapterCoreVectorDbMapper）。"""

from generative_ai_core.network import (
    DEFAULT_TIMEOUT_SECONDS,
    CoreNetworkSetting,
    CoreProxySetting,
)
from generative_ai_core.vector import CoreVectorDbPayload, CoreVectorDbTarget

from embedding_adapter.domain import (
    Embedding,
    EmbeddingNetworkProperties,
    VectorDBConfig,
)

PROVIDER_AZURE_AI_SEARCH = "AzureAISearch"
PROVIDER_POSTGRESQL = "PostgreSQL"
PROXY_MODE_NONE = 0
PROXY_MODE_SYSTEM = 2


class AdapterCoreVectorDbMapper:
    """アダプタの型を core のベクトルDB の型へ変換する。"""

    def provider_id(self, config: VectorDBConfig) -> str:
        """core のプロバイダ ID にする。

        Parameters
        ----------
        config : VectorDBConfig
            ベクトルDB の設定。

        Returns
        -------
        str
            `AzureAISearch`・`PostgreSQL`。どちらでもなければベンダー名そのまま。
        """
        if config.is_azure_search_provider():
            return PROVIDER_AZURE_AI_SEARCH
        if config.is_postgre_sql_provider():
            return PROVIDER_POSTGRESQL
        return config.vendor_name or ""

    def network_setting(
        self, proxy_setting: EmbeddingNetworkProperties | None
    ) -> CoreNetworkSetting:
        """プロキシ・SSL の設定を core のネットワーク設定にする（タイムアウトは既定）。

        Parameters
        ----------
        proxy_setting : EmbeddingNetworkProperties | None
            プロキシ・SSL の設定。

        Returns
        -------
        CoreNetworkSetting
            core のネットワーク設定。
        """
        insecure_ssl_enabled = (
            proxy_setting is not None and proxy_setting.insecure_ssl_enabled
        )
        return CoreNetworkSetting.from_seconds(
            self._core_proxy_setting(proxy_setting),
            insecure_ssl_enabled,
            DEFAULT_TIMEOUT_SECONDS,
        )

    def target(self, config: VectorDBConfig) -> CoreVectorDbTarget:
        """接続先を作る。

        Parameters
        ----------
        config : VectorDBConfig
            ベクトルDB の設定。

        Returns
        -------
        CoreVectorDbTarget
            Azure AI Search または pgvector の接続先。
        """
        if config.is_azure_search_provider():
            return CoreVectorDbTarget.azure_ai_search(
                config.url or "",
                config.api_key or "",
                config.get_effective_index_name(),
            )
        return CoreVectorDbTarget.pg_vector(
            config.url or "",
            config.user_name or "",
            config.password or "",
            config.database_name or "",
            config.table_name or "",
            config.is_new_creation,
        )

    def payload(self, embedding: Embedding) -> CoreVectorDbPayload:
        """保存・更新する 1 行分の内容にする。

        Parameters
        ----------
        embedding : Embedding
            アダプタの Embedding。

        Returns
        -------
        CoreVectorDbPayload
            core の内容。
        """
        return CoreVectorDbPayload(
            embedding.id or "",
            embedding.content or "",
            tuple(embedding.vector or ()),
            embedding.file_unique_id or "",
            embedding.source_file_path or "",
        )

    def _core_proxy_setting(
        self, proxy_setting: EmbeddingNetworkProperties | None
    ) -> CoreProxySetting:
        """プロキシ設定を core の設定にする。

        Parameters
        ----------
        proxy_setting : EmbeddingNetworkProperties | None
            プロキシ・SSL の設定。

        Returns
        -------
        CoreProxySetting
            core のプロキシ設定。
        """
        if proxy_setting is None or proxy_setting.use_proxy == PROXY_MODE_NONE:
            return CoreProxySetting.none()
        if proxy_setting.use_proxy == PROXY_MODE_SYSTEM:
            return CoreProxySetting.system()
        if proxy_setting.use_proxy_cred:
            return CoreProxySetting.manual(
                proxy_setting.proxy_host or "",
                proxy_setting.proxy_port,
                proxy_setting.proxy_id or "",
                proxy_setting.proxy_pass or "",
            )
        return CoreProxySetting.manual(
            proxy_setting.proxy_host or "", proxy_setting.proxy_port
        )
