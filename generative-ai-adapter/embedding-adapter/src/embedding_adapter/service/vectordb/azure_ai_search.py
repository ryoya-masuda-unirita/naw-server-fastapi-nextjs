"""Azure AI Search のベクトルストア（移植元 AzureAISearchService）。"""

from embedding_adapter.controller.azure_ai_search import AzureAISearchController
from embedding_adapter.domain import (
    Embedding,
    EmbeddingNetworkProperties,
    VectorDBConfig,
)
from embedding_adapter.model import AbstractEmbeddingModel, AbstractVectorStoreService
from embedding_adapter.util import create_unique_id


class AzureAISearchService(AbstractVectorStoreService):
    """埋め込みを作って Azure AI Search に保存・削除・検索する。"""

    def __init__(
        self,
        vector_db_config: VectorDBConfig,
        proxy_settings: EmbeddingNetworkProperties | None,
        embedding_service: AbstractEmbeddingModel,
        azure_ai_search_controller: AzureAISearchController | None = None,
    ) -> None:
        """設定と埋め込みモデルを受け取る。

        Parameters
        ----------
        vector_db_config : VectorDBConfig
            ベクトルDB の設定。
        proxy_settings : EmbeddingNetworkProperties | None
            プロキシ・SSL の設定。
        embedding_service : AbstractEmbeddingModel
            埋め込みモデル。
        azure_ai_search_controller : AzureAISearchController | None
            コントローラー。省略時は設定から作る（テストでは差し替える）。
        """
        self.azure_ai_search_controller = (
            azure_ai_search_controller
            if azure_ai_search_controller is not None
            else AzureAISearchController(vector_db_config, proxy_settings)
        )
        self.embedding_service = embedding_service

    def add(self, embedding: Embedding) -> str:
        """埋め込みを作って保存する。ID がなければ採番する。

        Parameters
        ----------
        embedding : Embedding
            保存する内容。ID とベクトルが設定される。

        Returns
        -------
        str
            保存した ID。
        """
        if embedding.id is None or embedding.id == "":
            embedding.id = create_unique_id()
        embedding.vector = self.embedding_service.create_embedding(embedding.content)
        self.azure_ai_search_controller.import_embedding(embedding, embedding.id)
        return embedding.id

    def delete(self, id: str) -> None:
        """ドキュメントを削除する。

        Parameters
        ----------
        id : str
            削除する ID。
        """
        self.azure_ai_search_controller.delete_embedding(id)

    def update(self, embedding: Embedding) -> None:
        """ドキュメントを更新する（保存と同じ）。

        Parameters
        ----------
        embedding : Embedding
            更新する内容。
        """
        self.add(embedding)

    def search(self, query: str, top_k: int) -> list[Embedding]:
        """クエリの埋め込みで近いドキュメントを検索する。

        Parameters
        ----------
        query : str
            検索文。
        top_k : int
            返す件数。

        Returns
        -------
        list[Embedding]
            ID だけを持つ Embedding の一覧。
        """
        embedding = Embedding(
            id="", vector=self.embedding_service.create_embedding(query)
        )
        return self.azure_ai_search_controller.find_related(embedding, top_k)
