"""Graph 書き込み関連の型の変換（移植元 AdapterCoreGraphMapper）。"""

from generative_ai_core.vector import (
    CoreGraphChunkWritePayload,
    CoreGraphWriteResult,
    CoreGraphWriteSetting,
    CoreGraphWriteStatus,
)

from embedding_adapter.domain import (
    GraphChunkWriteRequest,
    GraphWriteResult,
    GraphWriteStatus,
    VectorDBConfig,
)
from embedding_adapter.service.core.vectordb_mapper import AdapterCoreVectorDbMapper

_STATUS_MAP = {
    CoreGraphWriteStatus.FAILED_CONFIGURATION: GraphWriteStatus.FAILED_CONFIGURATION,
    CoreGraphWriteStatus.FAILED_EXTENSION_UNAVAILABLE: (
        GraphWriteStatus.FAILED_EXTENSION_UNAVAILABLE
    ),
    CoreGraphWriteStatus.FAILED_WRITE: GraphWriteStatus.FAILED_WRITE,
    CoreGraphWriteStatus.DISABLED: GraphWriteStatus.DISABLED,
    CoreGraphWriteStatus.SUCCESS: GraphWriteStatus.SUCCESS,
}


class AdapterCoreGraphMapper(AdapterCoreVectorDbMapper):
    """ベクトルDB の変換に Graph 書き込みの変換を足したもの。"""

    def graph_write_setting(
        self, config: VectorDBConfig | None
    ) -> CoreGraphWriteSetting:
        """Graph 書き込みの設定にする。

        Parameters
        ----------
        config : VectorDBConfig | None
            ベクトルDB の設定。

        Returns
        -------
        CoreGraphWriteSetting
            Graph 書き込みが無効なら disabled、有効なら実効 graph 名つき。
        """
        if config is None or not config.graph_write_enabled:
            return CoreGraphWriteSetting.disabled()
        return CoreGraphWriteSetting.enabled_with(config.get_effective_graph_name())

    def graph_chunk_payload(
        self, request: GraphChunkWriteRequest | None
    ) -> CoreGraphChunkWritePayload:
        """1 チャンクを書く内容にする。

        Parameters
        ----------
        request : GraphChunkWriteRequest | None
            Graph 書き込みの要求。

        Returns
        -------
        CoreGraphChunkWritePayload
            core の内容。None なら空。
        """
        if request is None:
            return CoreGraphChunkWritePayload.none()
        return CoreGraphChunkWritePayload.chunk(
            request.file_id or "",
            request.file_path or "",
            request.vector_row_id or "",
            request.chunk_sequence,
            request.content or "",
            request.previous_vector_row_id or "",
        )

    def graph_delete_payload(self, ids: list[str]) -> CoreGraphChunkWritePayload:
        """削除するベクトル行 ID の内容にする。

        Parameters
        ----------
        ids : list[str]
            ベクトル行 ID。

        Returns
        -------
        CoreGraphChunkWritePayload
            core の内容。
        """
        return CoreGraphChunkWritePayload.delete_ids(ids)

    def graph_write_result(
        self, result: CoreGraphWriteResult | None
    ) -> GraphWriteResult:
        """core の Graph 書き込み結果をアダプタの結果にする。

        Parameters
        ----------
        result : CoreGraphWriteResult | None
            core の結果。

        Returns
        -------
        GraphWriteResult
            アダプタの結果。
        """
        if result is None or result.status == CoreGraphWriteStatus.DISABLED:
            return GraphWriteResult.disabled()
        if result.status == CoreGraphWriteStatus.SUCCESS:
            return GraphWriteResult.success(result.file_id, list(result.chunk_ids))
        return GraphWriteResult.failure(
            _STATUS_MAP[result.status],
            result.file_id,
            list(result.chunk_ids),
            result.message,
            result.cause_category,
        )
