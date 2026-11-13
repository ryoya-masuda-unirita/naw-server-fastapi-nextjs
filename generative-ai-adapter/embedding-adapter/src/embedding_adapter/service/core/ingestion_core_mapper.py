"""Embedding を core の取り込み要求に変換する（移植元 IngestionCoreMapper）。"""

from generative_ai_core.graphrag.ingestion import IngestionOperation, IngestionRequest

from embedding_adapter.domain import Embedding

DEFAULT_TENANT_ID = "tenant-default"
DEFAULT_ACL_MODE = "tenant_wide"
DEFAULT_CLASSIFICATION_RANK = 1
DEFAULT_ACL_REVISION = 1
MARKER_CONTEXT = "embedding-adapter-save-update"


class IngestionCoreMapper:
    """Embedding を保存・更新の取り込み要求にする。"""

    def save_request(self, embedding: Embedding | None) -> IngestionRequest:
        """保存の取り込み要求を作る。

        Parameters
        ----------
        embedding : Embedding | None
            保存する Embedding。

        Returns
        -------
        IngestionRequest
            SAVE の取り込み要求。
        """
        return self._request(embedding, IngestionOperation.SAVE)

    def update_request(self, embedding: Embedding | None) -> IngestionRequest:
        """更新の取り込み要求を作る。

        Parameters
        ----------
        embedding : Embedding | None
            更新する Embedding。

        Returns
        -------
        IngestionRequest
            UPDATE の取り込み要求。
        """
        return self._request(embedding, IngestionOperation.UPDATE)

    def _request(
        self, embedding: Embedding | None, operation: IngestionOperation
    ) -> IngestionRequest:
        """取り込み要求を作る。

        Parameters
        ----------
        embedding : Embedding | None
            対象の Embedding。
        operation : IngestionOperation
            操作。

        Returns
        -------
        IngestionRequest
            取り込み要求。

        Raises
        ------
        ValueError
            Embedding・参照元・本文のいずれかがないとき。
        """
        if embedding is None:
            raise ValueError("Ingestion embedding is missing.")
        source_ref = self._first_present(embedding.file_unique_id, embedding.id)
        if source_ref is None:
            raise ValueError("Ingestion source reference is missing.")
        if embedding.content is None or embedding.content.strip() == "":
            raise ValueError("Ingestion body is missing.")
        return (
            IngestionRequest.builder()
            .tenant_id(DEFAULT_TENANT_ID)
            .source_ref(source_ref)
            .display_name(source_ref)
            .normalized_body(embedding.content)
            .classification(DEFAULT_TENANT_ID)
            .classification_rank(DEFAULT_CLASSIFICATION_RANK)
            .acl_mode(DEFAULT_ACL_MODE)
            .acl_principals([])
            .acl_revision(DEFAULT_ACL_REVISION)
            .deterministic_marker_context(MARKER_CONTEXT)
            .operation(operation)
            .build()
        )

    def _first_present(self, first: str | None, second: str | None) -> str | None:
        """空でない最初の値を trim して返す。

        Parameters
        ----------
        first : str | None
            優先する値。
        second : str | None
            次の値。

        Returns
        -------
        str | None
            空でない最初の値。どちらも空なら None。
        """
        if first is not None and first.strip() != "":
            return first.strip()
        if second is not None and second.strip() != "":
            return second.strip()
        return None
