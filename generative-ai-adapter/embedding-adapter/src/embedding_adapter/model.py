"""アダプタ内の抽象（移植元 embedding.model）。"""

from abc import ABC, abstractmethod
from typing import Protocol, runtime_checkable

from embedding_adapter.domain import (
    Embedding,
    GraphChunkWriteRequest,
    GraphWriteResult,
)


class AbstractEmbeddingModel(ABC):
    """テキストから埋め込みベクトルを作るモデルの抽象。

    移植元の `getEmbeddingModel()`（Spring AI の EmbeddingModel を返す）は
    Spring AI に依存するため移植しない。
    """

    @abstractmethod
    def create_embedding(self, text: str | None) -> list[float]:
        """テキストから埋め込みベクトルを生成する。

        Parameters
        ----------
        text : str | None
            テキスト。

        Returns
        -------
        list[float]
            埋め込みベクトル。
        """


class AbstractVectorStoreService(ABC):
    """ベクトルストアの抽象（保存・削除・更新・検索）。"""

    @abstractmethod
    def add(self, embedding: Embedding) -> str:
        """埋め込みを保存する。

        Parameters
        ----------
        embedding : Embedding
            保存する埋め込み。

        Returns
        -------
        str
            保存した行の ID。保存しなかった場合は空文字列。
        """

    @abstractmethod
    def delete(self, id: str) -> None:
        """ファイル固有 ID に紐づく埋め込みを削除する。

        Parameters
        ----------
        id : str
            ファイル固有 ID。
        """

    @abstractmethod
    def update(self, embedding: Embedding) -> None:
        """埋め込みを更新する。

        Parameters
        ----------
        embedding : Embedding
            更新する埋め込み。
        """

    @abstractmethod
    def search(self, query: str, top_k: int) -> list[Embedding]:
        """クエリに近い埋め込みを検索する。

        Parameters
        ----------
        query : str
            検索文字列。
        top_k : int
            取得する件数。

        Returns
        -------
        list[Embedding]
            検索結果。
        """


@runtime_checkable
class GraphWritableVectorStoreService(Protocol):
    """ベクトル行の隣にグラフの参照を保てるベクトルストアの任意の機能。"""

    def write_graph_chunk(self, request: GraphChunkWriteRequest) -> GraphWriteResult:
        """チャンクをグラフに書く。

        Parameters
        ----------
        request : GraphChunkWriteRequest
            書き込み要求。

        Returns
        -------
        GraphWriteResult
            書き込みの結果。
        """
        ...

    def delete_graph_data_by_ids(self, ids: list[str]) -> GraphWriteResult:
        """ID に紐づくグラフのデータを削除する。

        Parameters
        ----------
        ids : list[str]
            ベクトル行の ID。

        Returns
        -------
        GraphWriteResult
            削除の結果。
        """
        ...
