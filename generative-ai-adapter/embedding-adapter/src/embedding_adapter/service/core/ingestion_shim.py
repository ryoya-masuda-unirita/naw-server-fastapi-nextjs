"""core の取り込み（Graph Candidate）への入口（移植元 CoreIngestionShim）。"""

from generative_ai_core.graphrag.ingestion import (
    IngestionAdmissionGate,
    IngestionDeterministicExtractor,
    IngestionRequest,
    IngestionResult,
    IngestionRuntime,
    SourceLifecycleRequest,
    SourceLifecycleResult,
)
from generative_ai_core.graphrag.ingestion.llm import (
    LlmCandidateExtractionSettings,
    LlmCandidateOutputProvider,
)

from embedding_adapter.domain import (
    Embedding,
    EmbeddingNetworkProperties,
    EmbeddingProviderProperties,
    VectorDBConfig,
)
from embedding_adapter.service.core.ingestion_core_mapper import IngestionCoreMapper
from embedding_adapter.service.core.jdbc_persistence import (
    ConnectionOpener,
    JdbcBackedIngestionPersistenceAdapter,
    open_connection,
)
from embedding_adapter.service.core.llm_candidate import (
    AdapterLlmCandidateExtractors,
    AdapterLlmCandidateOutputProviders,
)


class CoreIngestionShim:
    """Embedding を取り込み要求にして core の IngestionRuntime に渡す。"""

    def __init__(
        self,
        mapper: IngestionCoreMapper | None = None,
        runtime: IngestionRuntime | None = None,
    ) -> None:
        """マッパーと runtime を受け取る。省略時は既定（メモリ上の保存先）。

        Parameters
        ----------
        mapper : IngestionCoreMapper | None
            Embedding → 取り込み要求の変換。
        runtime : IngestionRuntime | None
            core の取り込み runtime。
        """
        self._mapper = mapper if mapper is not None else IngestionCoreMapper()
        self._runtime = runtime if runtime is not None else IngestionRuntime()

    @staticmethod
    def for_config(
        config: VectorDBConfig | None,
        access_credential: EmbeddingProviderProperties | None = None,
        proxy_setting: EmbeddingNetworkProperties | None = None,
        *,
        llm_output_provider: LlmCandidateOutputProvider | None = None,
        connection_opener: ConnectionOpener = open_connection,
    ) -> "CoreIngestionShim":
        """設定から入口を作る。PostgreSQL で Graph 書き込みが有効なときだけ JDBC に保存する。

        Parameters
        ----------
        config : VectorDBConfig | None
            ベクトルDB の設定。
        access_credential : EmbeddingProviderProperties | None
            候補抽出に使う LLM の接続設定。
        proxy_setting : EmbeddingNetworkProperties | None
            プロキシ・SSL の設定。
        llm_output_provider : LlmCandidateOutputProvider | None
            出力プロバイダ。指定すると接続設定からは作らない（テスト用）。
        connection_opener : ConnectionOpener
            PostgreSQL への接続を開く関数（テストで差し替える）。

        Returns
        -------
        CoreIngestionShim
            Graph 書き込みが有効な PostgreSQL なら JDBC 保存つき、それ以外は既定の入口。
        """
        if not CoreIngestionShim._is_postgresql_graph_enabled(config):
            return CoreIngestionShim()
        assert config is not None
        provider = (
            llm_output_provider
            if llm_output_provider is not None
            else AdapterLlmCandidateOutputProviders.from_properties(
                access_credential, proxy_setting
            )
        )
        return CoreIngestionShim(
            IngestionCoreMapper(),
            IngestionRuntime(
                JdbcBackedIngestionPersistenceAdapter(config, connection_opener),
                IngestionAdmissionGate(),
                IngestionDeterministicExtractor(),
                LlmCandidateExtractionSettings.enabled(),
                AdapterLlmCandidateExtractors.configured(provider),
            ),
        )

    def save(self, embedding: Embedding) -> IngestionResult:
        """保存として取り込む。

        Parameters
        ----------
        embedding : Embedding
            保存する Embedding。

        Returns
        -------
        IngestionResult
            取り込み結果。
        """
        return self.execute(self._mapper.save_request(embedding))

    def update(self, embedding: Embedding) -> IngestionResult:
        """更新として取り込む。

        Parameters
        ----------
        embedding : Embedding
            更新する Embedding。

        Returns
        -------
        IngestionResult
            取り込み結果。
        """
        return self.execute(self._mapper.update_request(embedding))

    def replace_source(self, request: SourceLifecycleRequest) -> SourceLifecycleResult:
        """参照元を置き換える。

        Parameters
        ----------
        request : SourceLifecycleRequest
            置き換えの要求。

        Returns
        -------
        SourceLifecycleResult
            置き換えの結果。
        """
        return self._runtime.replace_source(request)

    def delete_source(self, request: SourceLifecycleRequest) -> SourceLifecycleResult:
        """参照元を削除する。

        Parameters
        ----------
        request : SourceLifecycleRequest
            削除の要求。

        Returns
        -------
        SourceLifecycleResult
            削除の結果。
        """
        return self._runtime.delete_source(request)

    def execute(self, request: IngestionRequest) -> IngestionResult:
        """取り込みを実行する。

        Parameters
        ----------
        request : IngestionRequest
            取り込み要求。

        Returns
        -------
        IngestionResult
            取り込み結果。
        """
        return self._runtime.ingest(request)

    @staticmethod
    def _is_postgresql_graph_enabled(config: VectorDBConfig | None) -> bool:
        """PostgreSQL で Graph 書き込みが有効か判定する。

        Parameters
        ----------
        config : VectorDBConfig | None
            ベクトルDB の設定。

        Returns
        -------
        bool
            Graph 書き込みが有効で PostgreSQL なら True。
        """
        if config is None or not config.graph_write_enabled:
            return False
        return config.is_postgre_sql_provider()
