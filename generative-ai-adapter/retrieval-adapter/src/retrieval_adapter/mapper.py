"""アダプタのプロパティを core の検索リクエストに変える（移植元 AdapterCoreRetrievalMapper）。"""

import logging

from generative_ai_core.network.setting import CoreNetworkSetting, CoreProxySetting
from generative_ai_core.provider.clients.secuaigent import keys
from generative_ai_core.provider.model import (
    CoreCredential,
    CoreProviderId,
    RuntimeProviderConfiguration,
)
from generative_ai_core.retrieval.models import (
    CoreGraphRagSearchSetting,
    CoreProviderLlmRerankAttributes,
    CoreRetrievalRequest,
    CoreRetrievalRequestBuilder,
)
from generative_ai_core.vector.target import CoreVectorDbTarget

from retrieval_adapter.adapterconfig import (
    RetrievalNetworkProperties,
    RetrievalProviderProperties,
    RetrievalVectorDbProperties,
)
from retrieval_adapter.settings import (
    GraphRagSearchSetting,
    HybridRetrievalEnablementSetting,
)

logger = logging.getLogger(__name__)

SECUAIGENT = "SecuAiGent"
UNSUPPORTED_PROVIDER = "unsupported"
SECUAIGENT_DEFAULT_DIMENSIONS = "1536"
POSTGRESQL_VENDOR_NAMES = ("PostgreSQL", "PGvector", "PostgreSQL(PGVector)")
HYBRID_RUNTIME_ATTRIBUTE = "s04.hybridRetrievalRuntime"
HYBRID_SCOPE_ATTRIBUTE = "s04.hybridRetrievalScope"
PROXY_MANUAL = 1
PROXY_SYSTEM = 2


def _has_text(value: str | None) -> bool:
    """空白だけでない文字列かを返す。

    Parameters
    ----------
    value : str | None
        文字列。

    Returns
    -------
    bool
        空白以外の文字があれば True。
    """
    return value is not None and bool(value.strip())


def _text(value: str | None) -> str:
    """None を空文字にする。

    Parameters
    ----------
    value : str | None
        文字列。

    Returns
    -------
    str
        文字列。
    """
    return "" if value is None else value


class AdapterCoreRetrievalMapper:
    """アダプタの設定を core のリクエスト・設定に変える。"""

    def request(
        self,
        vector_db_config: RetrievalVectorDbProperties,
        proxy_setting: RetrievalNetworkProperties | None,
        access_credential: RetrievalProviderProperties | None,
        rerank_properties: RetrievalProviderProperties | None,
        graph_rag_search_setting: GraphRagSearchSetting | None,
        hybrid_setting: HybridRetrievalEnablementSetting | None,
        provider_llm_rerank_enabled: bool,
        query: str,
        max_results: int,
    ) -> CoreRetrievalRequest:
        """検索リクエストを作る。クエリのベクトルは入れず、core が埋め込みで作る。

        Parameters
        ----------
        vector_db_config : RetrievalVectorDbProperties
            ベクトルDB のプロパティ。
        proxy_setting : RetrievalNetworkProperties | None
            プロキシ・SSL のプロパティ。
        access_credential : RetrievalProviderProperties | None
            埋め込みプロバイダのプロパティ。
        rerank_properties : RetrievalProviderProperties | None
            リランクのプロバイダのプロパティ。
        graph_rag_search_setting : GraphRagSearchSetting | None
            Graph RAG の設定。
        hybrid_setting : HybridRetrievalEnablementSetting | None
            ハイブリッド検索の設定。
        provider_llm_rerank_enabled : bool
            リランクを使うか。
        query : str
            検索文字列。
        max_results : int
            最大件数。

        Returns
        -------
        CoreRetrievalRequest
            検索リクエスト。
        """
        provider_id = self.provider_id(vector_db_config)
        builder: CoreRetrievalRequestBuilder = (
            CoreRetrievalRequest.builder(provider_id)
            .network_setting(self.network_setting(proxy_setting))
            .query(query)
            .query_vector(self.query_vector(query))
            .max_results(max_results)
            .graph_rag_search_setting(
                self.graph_setting(graph_rag_search_setting, provider_id)
            )
        )
        hybrid = hybrid_setting or HybridRetrievalEnablementSetting.disabled()
        if hybrid.is_runtime_enabled_for_provider(provider_id):
            builder.attribute(HYBRID_RUNTIME_ATTRIBUTE, "enabled")
            builder.attribute(HYBRID_SCOPE_ATTRIBUTE, "hybrid-retrieval-runtime-only")
            if provider_llm_rerank_enabled:
                self._apply_rerank_attributes(builder, rerank_properties)
        embedding = self.embedding_configuration(access_credential, proxy_setting)
        if embedding is not None:
            builder.embedding_provider_configuration(embedding)
        target = self.target(vector_db_config)
        if target is not None:
            builder.vector_db_target(target)
        return builder.build()

    def _apply_rerank_attributes(
        self,
        builder: CoreRetrievalRequestBuilder,
        credential: RetrievalProviderProperties | None,
    ) -> None:
        """リランクの属性を足す。

        Parameters
        ----------
        builder : CoreRetrievalRequestBuilder
            リクエストのビルダー。
        credential : RetrievalProviderProperties | None
            リランクのプロバイダのプロパティ。None なら有効の印だけ。
        """
        attributes = CoreProviderLlmRerankAttributes
        builder.attribute(attributes.ENABLED, "enabled")
        if credential is None:
            return
        builder.attribute(attributes.PROVIDER, _text(credential.vendor_name))
        builder.attribute(attributes.ENDPOINT, _text(credential.url))
        builder.attribute(
            attributes.CREDENTIAL, self._rerank_credential_value(credential)
        )
        builder.attribute(
            attributes.CREDENTIAL_KIND, self._rerank_credential_kind(credential)
        )
        builder.attribute(attributes.MODEL, _text(credential.model_name))
        builder.attribute(attributes.TENANT_ID, _text(credential.tenant_id))
        builder.attribute(attributes.TIMEOUT_SECONDS, str(credential.timeout_seconds))

    def provider_id(self, config: RetrievalVectorDbProperties | None) -> str:
        """ベクトルDB のベンダー名から検索プロバイダ ID を決める。

        Parameters
        ----------
        config : RetrievalVectorDbProperties | None
            ベクトルDB のプロパティ。

        Returns
        -------
        str
            PostgreSQL 系は `PostgreSQL`、ベンダー名がなければ `unsupported`、
            それ以外はベンダー名そのまま。
        """
        if config is None or not _has_text(config.vendor_name):
            return UNSUPPORTED_PROVIDER
        assert config.vendor_name is not None
        if config.vendor_name == "AzureOpenAI":
            return "AzureOpenAI"
        if config.vendor_name in POSTGRESQL_VENDOR_NAMES:
            return "PostgreSQL"
        return config.vendor_name

    def graph_setting(
        self, setting: GraphRagSearchSetting | None, provider_id: str
    ) -> CoreGraphRagSearchSetting:
        """アダプタの Graph RAG の設定を core の設定に変える。

        Parameters
        ----------
        setting : GraphRagSearchSetting | None
            アダプタの設定。
        provider_id : str
            検索プロバイダ ID。

        Returns
        -------
        CoreGraphRagSearchSetting
            core の設定。無効または PostgreSQL でなければ無効な設定。
        """
        if setting is None or not setting.is_graph_search_active():
            return CoreGraphRagSearchSetting.disabled(provider_id)
        return CoreGraphRagSearchSetting.enabled_for(
            setting.effective_graph_name(), "PostgreSQL"
        )

    def network_setting(
        self, proxy_setting: RetrievalNetworkProperties | None
    ) -> CoreNetworkSetting:
        """プロキシ・SSL のプロパティを core のネットワーク設定に変える。

        Parameters
        ----------
        proxy_setting : RetrievalNetworkProperties | None
            プロキシ・SSL のプロパティ。

        Returns
        -------
        CoreNetworkSetting
            ネットワーク設定（タイムアウトは既定）。
        """
        if proxy_setting is None:
            return CoreNetworkSetting.defaults()
        core_proxy = CoreProxySetting.none()
        if proxy_setting.use_proxy == PROXY_MANUAL:
            if proxy_setting.use_proxy_cred:
                core_proxy = CoreProxySetting.manual(
                    proxy_setting.proxy_host or "",
                    proxy_setting.proxy_port,
                    proxy_setting.proxy_id or "",
                    proxy_setting.proxy_pass or "",
                )
            else:
                core_proxy = CoreProxySetting.manual(
                    proxy_setting.proxy_host or "", proxy_setting.proxy_port
                )
        elif proxy_setting.use_proxy == PROXY_SYSTEM:
            core_proxy = CoreProxySetting.system()
        return CoreNetworkSetting(
            core_proxy,
            proxy_setting.insecure_ssl_enabled,
            CoreNetworkSetting.defaults().timeout_seconds,
        )

    def embedding_configuration(
        self,
        credential: RetrievalProviderProperties | None,
        proxy_setting: RetrievalNetworkProperties | None,
    ) -> RuntimeProviderConfiguration | None:
        """埋め込みプロバイダの設定を作る。

        Parameters
        ----------
        credential : RetrievalProviderProperties | None
            埋め込みプロバイダのプロパティ。
        proxy_setting : RetrievalNetworkProperties | None
            プロキシ・SSL のプロパティ。

        Returns
        -------
        RuntimeProviderConfiguration | None
            設定。URL・API キー・モデル名・ベンダーのどれかが欠ける、ベンダーが未知、
            SecuAiGent でテナント ID がないときは None。
        """
        if (
            credential is None
            or not _has_text(credential.vendor_name)
            or not _has_text(credential.url)
            or not _has_text(credential.api_key)
            or not _has_text(credential.model_name)
        ):
            return None
        assert credential.vendor_name is not None
        assert credential.url is not None
        assert credential.model_name is not None
        try:
            provider_id = CoreProviderId.parse(credential.vendor_name)
            attributes: dict[str, str] = {}
            if provider_id == CoreProviderId.SecuAiGent:
                if not _has_text(credential.tenant_id):
                    return None
                attributes[keys.TENANT_ID] = credential.tenant_id or ""
                attributes[keys.DIMENSIONS] = (
                    SECUAIGENT_DEFAULT_DIMENSIONS
                    if credential.embedding_dimensions is None
                    else str(credential.embedding_dimensions)
                )
            return RuntimeProviderConfiguration(
                provider_id,
                credential.model_name,
                credential.url,
                self._core_credential(credential, provider_id),
                self.network_setting(proxy_setting),
                attributes,
            )
        except ValueError:
            return None

    def query_vector(self, query: str) -> list[float]:
        """クエリのベクトルを返す。アダプタでは作らず、core が埋め込みで作る。

        Parameters
        ----------
        query : str
            検索文字列。

        Returns
        -------
        list[float]
            常に空。
        """
        return []

    def target(
        self, config: RetrievalVectorDbProperties | None
    ) -> CoreVectorDbTarget | None:
        """ベクトルDB のプロパティから接続先を作る。

        Parameters
        ----------
        config : RetrievalVectorDbProperties | None
            ベクトルDB のプロパティ。

        Returns
        -------
        CoreVectorDbTarget | None
            接続先。必須の項目が欠ける、またはベンダーが対象外なら None。
        """
        if config is None:
            return None
        if config.vendor_name == "AzureOpenAI":
            if (
                not _has_text(config.url)
                or not _has_text(config.api_key)
                or not _has_text(config.index_name)
            ):
                return None
            return CoreVectorDbTarget.azure_ai_search(
                config.url, config.api_key, config.index_name
            )
        if config.vendor_name in POSTGRESQL_VENDOR_NAMES:
            if (
                not _has_text(config.url)
                or not _has_text(config.user_name)
                or not _has_text(config.database_name)
            ):
                return None
            return CoreVectorDbTarget.pg_vector(
                config.url,
                config.user_name,
                config.password,
                config.database_name,
                config.table_name,
                config.new_creation,
            )
        return None

    def _rerank_credential_value(self, credential: RetrievalProviderProperties) -> str:
        """リランクの資格情報の値を決める（SecuAiGent はアクセストークン優先）。

        Parameters
        ----------
        credential : RetrievalProviderProperties
            リランクのプロバイダのプロパティ。

        Returns
        -------
        str
            値。
        """
        if credential.vendor_name == SECUAIGENT and _has_text(
            credential.secuaigent_access_token
        ):
            return credential.secuaigent_access_token or ""
        return _text(credential.api_key)

    def _rerank_credential_kind(self, credential: RetrievalProviderProperties) -> str:
        """リランクの資格情報の種類を決める。

        Parameters
        ----------
        credential : RetrievalProviderProperties
            リランクのプロバイダのプロパティ。

        Returns
        -------
        str
            アクセストークンなら `bearer_token`、それ以外は `api_key`。
        """
        if credential.vendor_name == SECUAIGENT and _has_text(
            credential.secuaigent_access_token
        ):
            return "bearer_token"
        return "api_key"

    def _core_credential(
        self, credential: RetrievalProviderProperties, provider_id: CoreProviderId
    ) -> CoreCredential:
        """埋め込みプロバイダの資格情報を作る。

        Parameters
        ----------
        credential : RetrievalProviderProperties
            埋め込みプロバイダのプロパティ。
        provider_id : CoreProviderId
            プロバイダ。

        Returns
        -------
        CoreCredential
            資格情報。SecuAiGent のアクセストークンがあれば bearer。
        """
        if provider_id == CoreProviderId.SecuAiGent and _has_text(
            credential.secuaigent_access_token
        ):
            return CoreCredential.bearer_token(credential.secuaigent_access_token)
        return CoreCredential.api_key(credential.api_key, credential.vendor_name or "")
