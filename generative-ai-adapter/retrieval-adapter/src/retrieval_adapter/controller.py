"""検索アダプタのコントローラー（移植元 RetrievalController）。

列から検索文字列を取り出し、core の検索を呼び、結果を出力形式（TSV / RAG Context JSON）に
整えてファイルに書く。
"""

import json
import logging
from collections.abc import Sequence
from pathlib import Path

from generative_ai_core.media import (
    CoreMediaPreprocessingMode,
    CoreMediaPreprocessingRequest,
    CoreMediaPreprocessingRuntime,
)
from generative_ai_core.provider.factory import CoreProviderRuntimeFactory
from generative_ai_core.retrieval.runtime import CoreRetrievalRuntime

from retrieval_adapter.adapterconfig import (
    RetrievalNetworkProperties,
    RetrievalProviderProperties,
    RetrievalVectorDbProperties,
)
from retrieval_adapter.failure import RetrievalFailureException
from retrieval_adapter.mapper import AdapterCoreRetrievalMapper
from retrieval_adapter.output_format import RetrievalOutputFormat
from retrieval_adapter.settings import (
    GraphRagSearchSetting,
    HybridRetrievalEnablementSetting,
)
from retrieval_adapter.waha import ColumnData, ColumnInformation, ColumnType

logger = logging.getLogger(__name__)

DEFAULT_MAX_RESULT = 3


def _append_query(parts: list[str], value: str | None) -> None:
    """検索文字列の部品を足す（空は無視）。

    Parameters
    ----------
    parts : list[str]
        部品の一覧。
    value : str | None
        足す文字列。
    """
    if value is not None and value.strip():
        parts.append(value)


def _file_path(data: ColumnData) -> str | None:
    """FILE の列の値からファイルパスを取り出す。

    Parameters
    ----------
    data : ColumnData
        列の値。

    Returns
    -------
    str | None
        パス。値が JSON で `filePath` か `path` があればその値、なければ値そのまま。
        空なら None。
    """
    raw = data.s
    if (raw is None or not raw.strip()) and data.b_ary is not None:
        raw = data.b_ary.decode("utf-8", errors="replace")
    if raw is None or not raw.strip():
        return None
    try:
        parsed = json.loads(raw)
    except ValueError:
        return raw
    if isinstance(parsed, dict):
        for key in ("filePath", "path"):
            if key in parsed:
                return str(parsed[key])
    return raw


class RetrievalController:
    """検索を実行して結果をファイルに書く。"""

    def __init__(
        self,
        proxy_setting: RetrievalNetworkProperties | None,
        access_credential: RetrievalProviderProperties | None,
        vector_db_config: RetrievalVectorDbProperties,
        image_explanation_mode: CoreMediaPreprocessingMode | None = None,
        graph_rag_search_setting: GraphRagSearchSetting | None = None,
        hybrid_retrieval_enablement_setting: HybridRetrievalEnablementSetting
        | None = None,
        rerank_retrieval_provider_properties: RetrievalProviderProperties | None = None,
        provider_llm_rerank_enabled: bool = False,
        core_retrieval_runtime: CoreRetrievalRuntime | None = None,
    ) -> None:
        """設定を受け取る。

        Parameters
        ----------
        proxy_setting : RetrievalNetworkProperties | None
            プロキシ・SSL のプロパティ。
        access_credential : RetrievalProviderProperties | None
            埋め込みプロバイダのプロパティ。
        vector_db_config : RetrievalVectorDbProperties
            ベクトルDB のプロパティ。
        image_explanation_mode : CoreMediaPreprocessingMode | None
            画像説明のモード（省略は無効）。
        graph_rag_search_setting : GraphRagSearchSetting | None
            Graph RAG の設定（省略は無効）。
        hybrid_retrieval_enablement_setting : HybridRetrievalEnablementSetting | None
            ハイブリッド検索の設定（省略は無効）。
        rerank_retrieval_provider_properties : RetrievalProviderProperties | None
            リランクのプロバイダのプロパティ。
        provider_llm_rerank_enabled : bool
            リランクを使うか。
        core_retrieval_runtime : CoreRetrievalRuntime | None
            core の検索（テストで差し替える）。

        Raises
        ------
        ValueError
            vector_db_config が None のとき。
        """
        if vector_db_config is None:
            raise ValueError("vectorDBConfig")
        self._proxy_setting = proxy_setting or RetrievalNetworkProperties()
        self._access_credential = access_credential or RetrievalProviderProperties()
        self._vector_db_config = vector_db_config
        self._image_explanation_mode = (
            image_explanation_mode or CoreMediaPreprocessingMode.DISABLED
        )
        self._graph_rag_search_setting = (
            graph_rag_search_setting
            or GraphRagSearchSetting.disabled(vector_db_config.vendor_name)
        )
        self._hybrid_setting = (
            hybrid_retrieval_enablement_setting
            or HybridRetrievalEnablementSetting.disabled()
        )
        self._rerank_properties = rerank_retrieval_provider_properties
        self._provider_llm_rerank_enabled = provider_llm_rerank_enabled
        self._mapper = AdapterCoreRetrievalMapper()
        self._media_runtime = CoreMediaPreprocessingRuntime()
        self._core_retrieval_runtime = core_retrieval_runtime or CoreRetrievalRuntime()
        logger.info("retrieval controller ready via core retrieval runtime")

    def find_related_embeddings(
        self,
        data: Sequence[ColumnData],
        column_information: Sequence[ColumnInformation],
        output_path: str,
        max_result: int,
        output_format: RetrievalOutputFormat | None = None,
    ) -> None:
        """検索して結果をファイルに書く。

        Parameters
        ----------
        data : Sequence[ColumnData]
            レコードの列の値。
        column_information : Sequence[ColumnInformation]
            列の定義。
        output_path : str
            出力先のファイルパス。
        max_result : int
            最大件数。
        output_format : RetrievalOutputFormat | None
            出力形式（省略は LEGACY_TSV）。

        Raises
        ------
        RetrievalFailureException
            core の検索が失敗を返したとき。
        """
        fmt = output_format or RetrievalOutputFormat.LEGACY_TSV
        query = self._extract_query(data, column_information)
        logger.info(
            "retrieval: queryChars=%d, maxResult=%d, outputFormat=%s, vectorDb=%s",
            len(query),
            max_result,
            fmt.value,
            self._vector_db_config.vendor_name,
        )
        request = self._mapper.request(
            self._vector_db_config,
            self._proxy_setting,
            self._access_credential,
            self._rerank_properties,
            self._graph_rag_search_setting,
            self._hybrid_setting,
            self._provider_llm_rerank_enabled,
            query,
            max_result,
        )
        result = self._core_retrieval_runtime.retrieve(request)
        if result.failure is not None:
            logger.warning("retrieval failed: code=%s", result.failure.code)
            raise RetrievalFailureException(result.failure)
        output = fmt.render(result)
        Path(output_path).write_bytes(output.encode("utf-8"))
        logger.info(
            "retrieval output written: format=%s, ids=%d, chars=%d",
            fmt.value,
            len(result.visible_ordered_ids()),
            len(output),
        )

    def _extract_query(
        self,
        data: Sequence[ColumnData],
        column_information: Sequence[ColumnInformation],
    ) -> str:
        """列から検索文字列を作る（FILE は前処理したテキスト、文字はそのまま。改行でつなぐ）。

        Parameters
        ----------
        data : Sequence[ColumnData]
            レコードの列の値。
        column_information : Sequence[ColumnInformation]
            列の定義。

        Returns
        -------
        str
            検索文字列。

        Raises
        ------
        RuntimeError
            ファイルの前処理に失敗したとき。
        """
        parts: list[str] = []
        for value, column in zip(data, column_information, strict=False):
            if value is None or column is None:
                continue
            if column.col_type == ColumnType.FILE:
                file_path = _file_path(value)
                if (
                    file_path is None
                    or not file_path.strip()
                    or file_path.endswith(("\\null", "/null"))
                ):
                    continue
                media = self._media_runtime.preprocess(
                    self._media_request(Path(file_path))
                )
                if media.failure is not None:
                    raise RuntimeError(
                        f"Core media preprocessing failed [{media.failure.code}]: "
                        f"{media.failure.summary}"
                    )
                _append_query(parts, media.text)
            elif value.s is not None:
                _append_query(parts, value.s)
        return "\n".join(parts)

    def _media_request(self, file_path: Path) -> CoreMediaPreprocessingRequest:
        """ファイル前処理のリクエストを作る（画像説明が有効ならプロバイダの chat を付ける）。

        Parameters
        ----------
        file_path : Path
            ファイルのパス。

        Returns
        -------
        CoreMediaPreprocessingRequest
            リクエスト。

        Raises
        ------
        ValueError
            画像説明が有効なのに埋め込みプロバイダの設定がないとき。
        """
        if self._image_explanation_mode == CoreMediaPreprocessingMode.DISABLED:
            return CoreMediaPreprocessingRequest(
                file_path, mode=self._image_explanation_mode
            )
        configuration = self._mapper.embedding_configuration(
            self._access_credential, self._proxy_setting
        )
        if configuration is None:
            raise ValueError("image explanation provider configuration is required")
        return CoreMediaPreprocessingRequest(
            file_path,
            mode=self._image_explanation_mode,
            provider_id=configuration.provider_id.canonical_name,
            network_setting=configuration.network_setting,
            image_explanation_runtime=CoreProviderRuntimeFactory.create_chat_runtime(
                configuration
            ),
        )
