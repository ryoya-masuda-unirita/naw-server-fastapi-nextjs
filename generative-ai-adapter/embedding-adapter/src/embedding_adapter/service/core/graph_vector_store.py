"""Graph 書き込みもできる core 委譲のベクトルストア（移植元 CoreDelegatingGraphVectorStoreService）。"""

from generative_ai_core.vector import CoreVectorDbRuntime

from embedding_adapter.audit import RejectAuditOutputConfig
from embedding_adapter.domain import (
    EmbeddingNetworkProperties,
    EmbeddingProviderProperties,
    GraphChunkWriteRequest,
    GraphWriteResult,
    VectorDBConfig,
)
from embedding_adapter.model import AbstractEmbeddingModel
from embedding_adapter.service.core.vector_store import CoreDelegatingVectorStoreService


class CoreDelegatingGraphVectorStoreService(CoreDelegatingVectorStoreService):
    """ベクトルストアに Graph チャンクの書き込み・削除を足したもの（PostgreSQL 用）。"""

    def __init__(
        self,
        vector_db_config: VectorDBConfig,
        proxy_setting: EmbeddingNetworkProperties | None,
        embedding_model: AbstractEmbeddingModel,
        access_credential: EmbeddingProviderProperties | None = None,
        reject_audit_config: RejectAuditOutputConfig | None = None,
        *,
        runtime: CoreVectorDbRuntime | None = None,
    ) -> None:
        """設定と部品を受け取る。検索はアダプタ側のサービスを持たない。

        Parameters
        ----------
        vector_db_config : VectorDBConfig
            ベクトルDB の設定。
        proxy_setting : EmbeddingNetworkProperties | None
            プロキシ・SSL の設定。
        embedding_model : AbstractEmbeddingModel
            埋め込みモデル。
        access_credential : EmbeddingProviderProperties | None
            埋め込みの接続設定。
        reject_audit_config : RejectAuditOutputConfig | None
            拒否の監査出力の設定。
        runtime : CoreVectorDbRuntime | None
            core のベクトルDB runtime（テスト用）。
        """
        super().__init__(
            vector_db_config,
            proxy_setting,
            embedding_model,
            None,
            access_credential,
            reject_audit_config,
            runtime=runtime,
        )

    def write_graph_chunk(self, request: GraphChunkWriteRequest) -> GraphWriteResult:
        """1 チャンクの Graph 参照を書く。

        Parameters
        ----------
        request : GraphChunkWriteRequest
            Graph 書き込みの要求。

        Returns
        -------
        GraphWriteResult
            書き込みの結果。
        """
        return self.write_core_graph_chunk(request)

    def delete_graph_data_by_ids(self, ids: list[str]) -> GraphWriteResult:
        """ベクトル行 ID に紐づく Graph データを削除する。

        Parameters
        ----------
        ids : list[str]
            ベクトル行 ID。

        Returns
        -------
        GraphWriteResult
            削除の結果。
        """
        return self.delete_core_graph_data_by_ids(ids)
