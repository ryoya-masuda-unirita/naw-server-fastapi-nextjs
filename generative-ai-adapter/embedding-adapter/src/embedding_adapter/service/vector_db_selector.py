"""ベクトルDB のベンダーに合うベクトルストアを選ぶ（移植元 VectorDBSelectorService）。"""

from embedding_adapter.audit import RejectAuditOutputConfig, RejectAuditPathValidator
from embedding_adapter.domain import (
    EmbeddingNetworkProperties,
    EmbeddingProviderProperties,
    VectorDBConfig,
)
from embedding_adapter.model import AbstractEmbeddingModel, AbstractVectorStoreService
from embedding_adapter.service.core.graph_vector_store import (
    CoreDelegatingGraphVectorStoreService,
)
from embedding_adapter.service.core.vector_store import CoreDelegatingVectorStoreService
from embedding_adapter.service.vectordb.azure_ai_search import AzureAISearchService


class VectorDBSelectorService:
    """ベクトルDB の設定からベクトルストアを作る。"""

    @staticmethod
    def create_vector_db_model(
        proxy_setting: EmbeddingNetworkProperties | None,
        embedding_model: AbstractEmbeddingModel,
        vector_db_config: VectorDBConfig,
        access_credential: EmbeddingProviderProperties | None = None,
        reject_audit_output_dir: str | None = None,
    ) -> AbstractVectorStoreService:
        """ベクトルストアを作る（移植元の static な createVectorDBModel）。

        Parameters
        ----------
        proxy_setting : EmbeddingNetworkProperties | None
            プロキシ・SSL の設定。
        embedding_model : AbstractEmbeddingModel
            埋め込みモデル。
        vector_db_config : VectorDBConfig
            ベクトルDB の設定。
        access_credential : EmbeddingProviderProperties | None
            埋め込みの接続設定。
        reject_audit_output_dir : str | None
            拒否の監査 TSV の出力先。空なら監査は無効。

        Returns
        -------
        AbstractVectorStoreService
            Azure AI Search なら core 委譲 + アダプタ側の検索サービス、それ以外は Graph 対応のもの。
        """
        return VectorDBSelectorService().create_model(
            proxy_setting,
            embedding_model,
            vector_db_config,
            access_credential,
            reject_audit_output_dir,
        )

    def create_model(
        self,
        proxy_setting: EmbeddingNetworkProperties | None,
        embedding_model: AbstractEmbeddingModel,
        vector_db_config: VectorDBConfig,
        access_credential: EmbeddingProviderProperties | None = None,
        reject_audit_output_dir: str | None = None,
    ) -> AbstractVectorStoreService:
        """ベクトルストアを作る（移植元のインスタンスメソッド createModel）。

        Parameters
        ----------
        proxy_setting : EmbeddingNetworkProperties | None
            プロキシ・SSL の設定。
        embedding_model : AbstractEmbeddingModel
            埋め込みモデル。
        vector_db_config : VectorDBConfig
            ベクトルDB の設定。
        access_credential : EmbeddingProviderProperties | None
            埋め込みの接続設定。
        reject_audit_output_dir : str | None
            拒否の監査 TSV の出力先。空なら監査は無効。

        Returns
        -------
        AbstractVectorStoreService
            Azure AI Search なら core 委譲 + アダプタ側の検索サービス、それ以外は Graph 対応のもの。
        """
        reject_audit_config = (
            RejectAuditOutputConfig.disabled()
            if reject_audit_output_dir is None or reject_audit_output_dir.strip() == ""
            else RejectAuditPathValidator.from_configured_path(reject_audit_output_dir)
        )
        if vector_db_config.is_azure_search_provider():
            return CoreDelegatingVectorStoreService(
                vector_db_config,
                proxy_setting,
                embedding_model,
                AzureAISearchService(vector_db_config, proxy_setting, embedding_model),
                access_credential,
                reject_audit_config,
            )
        return CoreDelegatingGraphVectorStoreService(
            vector_db_config,
            proxy_setting,
            embedding_model,
            access_credential,
            reject_audit_config,
        )
