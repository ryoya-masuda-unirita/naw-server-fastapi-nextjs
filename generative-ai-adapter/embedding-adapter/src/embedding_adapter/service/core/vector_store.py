"""core のベクトルDB runtime と取り込みに処理を任せるベクトルストア（移植元 CoreDelegatingVectorStoreService）。"""

import logging

from generative_ai_core.graphrag.ingestion import (
    IngestionRejectClassification,
    IngestionResult,
    SourceLifecycleRequest,
    SourceLifecycleResult,
)
from generative_ai_core.vector import (
    CommittedRow,
    CompensatingDeleteOutcome,
    CompensatingDeleteOwnershipScope,
    CompensatingDeleteService,
    CoreGraphWriteResult,
    CoreVectorDbOperation,
    CoreVectorDbPayload,
    CoreVectorDbRequestBuilder,
    CoreVectorDbResult,
    CoreVectorDbRuntime,
    CoreVectorSearchMatch,
    OverallStatus,
)

from embedding_adapter.audit import (
    GraphCandidateRejectAuditWriter,
    GraphCandidateRepairMetricsSession,
    RejectAuditOutputConfig,
    RejectAuditTsvSession,
)
from embedding_adapter.domain import (
    Embedding,
    EmbeddingNetworkProperties,
    EmbeddingProviderProperties,
    GraphChunkWriteRequest,
    GraphWriteResult,
    VectorDBConfig,
)
from embedding_adapter.model import AbstractEmbeddingModel, AbstractVectorStoreService
from embedding_adapter.output import JobOutputRunContext
from embedding_adapter.rollback import (
    FileCommittedRowTracker,
    GraphCandidateCompensatingDeleteHook,
)
from embedding_adapter.service.core.graph_mapper import AdapterCoreGraphMapper
from embedding_adapter.service.core.ingestion_shim import CoreIngestionShim
from embedding_adapter.util import create_unique_id

logger = logging.getLogger(__name__)

LLM_CANDIDATE_OUTPUT_REJECTED = "LLM_CANDIDATE_OUTPUT_REJECTED"
SEARCH_QUERY_ID = "search-query"
TENANT_ID_METADATA = "tenantId"
GRAPH_RAG_SOURCE_REF_METADATA = "graphRagSourceRef"
LIMIT_METADATA = "limit"
UNKNOWN_RUN_ID = "run-unknown"


def _present(value: str | None) -> bool:
    """空白以外の文字があるか判定する。

    Parameters
    ----------
    value : str | None
        判定する文字列。

    Returns
    -------
    bool
        空白以外の文字があれば True。
    """
    return value is not None and value.strip() != ""


class CoreDelegatingVectorStoreService(AbstractVectorStoreService):
    """保存・更新は取り込み（Graph Candidate）を通してから core の runtime に任せる。"""

    def __init__(
        self,
        vector_db_config: VectorDBConfig,
        proxy_setting: EmbeddingNetworkProperties | None,
        embedding_model: AbstractEmbeddingModel,
        adapter_owned_search_service: AbstractVectorStoreService | None = None,
        access_credential: EmbeddingProviderProperties | None = None,
        reject_audit_config: RejectAuditOutputConfig | None = None,
        *,
        runtime: CoreVectorDbRuntime | None = None,
        ingestion_shim: CoreIngestionShim | None = None,
        file_committed_row_tracker: FileCommittedRowTracker | None = None,
        compensating_delete_hook: GraphCandidateCompensatingDeleteHook | None = None,
    ) -> None:
        """設定と部品を受け取る。

        移植元のコンストラクタの組み合わせは次のように対応する。runtime を渡さない
        （公開コンストラクタ相当）ときは、設定から取り込み入口を作る。runtime を渡す
        （テスト用のコンストラクタ相当）ときは、取り込み入口は既定のメモリ上のもの。

        Parameters
        ----------
        vector_db_config : VectorDBConfig
            ベクトルDB の設定。
        proxy_setting : EmbeddingNetworkProperties | None
            プロキシ・SSL の設定。
        embedding_model : AbstractEmbeddingModel
            埋め込みモデル。
        adapter_owned_search_service : AbstractVectorStoreService | None
            アダプタ側が持つ検索サービス。
        access_credential : EmbeddingProviderProperties | None
            埋め込みの接続設定（テナント ID と候補抽出に使う）。
        reject_audit_config : RejectAuditOutputConfig | None
            拒否の監査出力の設定。省略時は無効。
        runtime : CoreVectorDbRuntime | None
            core のベクトルDB runtime。
        ingestion_shim : CoreIngestionShim | None
            取り込みの入口。
        file_committed_row_tracker : FileCommittedRowTracker | None
            コミット済みの行の記録。
        compensating_delete_hook : GraphCandidateCompensatingDeleteHook | None
            補償削除のフック。
        """
        self._vector_db_config = vector_db_config
        self._proxy_setting = proxy_setting
        self._embedding_model = embedding_model
        self._adapter_owned_search_service = adapter_owned_search_service
        self._runtime = runtime if runtime is not None else CoreVectorDbRuntime()
        if ingestion_shim is not None:
            self._ingestion_shim = ingestion_shim
        elif runtime is not None:
            self._ingestion_shim = CoreIngestionShim()
        else:
            self._ingestion_shim = CoreIngestionShim.for_config(
                vector_db_config, access_credential, proxy_setting
            )
        self._reject_audit_config = (
            reject_audit_config
            if reject_audit_config is not None
            else RejectAuditOutputConfig.disabled()
        )
        self._reject_audit_session = RejectAuditTsvSession.disabled()
        self._repair_metrics_session = GraphCandidateRepairMetricsSession.disabled()
        self._job_output_run_context = JobOutputRunContext.disabled()
        self._file_committed_row_tracker = (
            file_committed_row_tracker
            if file_committed_row_tracker is not None
            else FileCommittedRowTracker()
        )
        self._compensating_delete_hook = (
            compensating_delete_hook
            if compensating_delete_hook is not None
            else GraphCandidateCompensatingDeleteHook(
                self._file_committed_row_tracker,
                CompensatingDeleteService(self._runtime),
            )
        )
        self._mapper = AdapterCoreGraphMapper()
        self._tenant_id = self._normalized_tenant_id(access_credential)

    def use_tenant_id_if_unset(self, tenant_id: str | None) -> None:
        """テナント ID が未設定なら、与えられた値を使う（Python 版の補い）。

        移植元は Graph candidate 用の接続設定からだけテナント ID を受け取るため、
        Graph 書き込みが無効だとテナント ID が空になり、削除（テナントが必須）が
        常に失敗する。埋め込みの接続設定（プロパティ 3）のテナント ID で補う。

        Parameters
        ----------
        tenant_id : str | None
            補うテナント ID。
        """
        if not self._tenant_id and tenant_id and tenant_id.strip():
            self._tenant_id = tenant_id.strip()

    def set_reject_audit_session(
        self, reject_audit_session: RejectAuditTsvSession | None
    ) -> None:
        """拒否の監査セッションを設定し、再修復の指標セッションを開く。

        Parameters
        ----------
        reject_audit_session : RejectAuditTsvSession | None
            監査セッション。None なら無効。
        """
        self._reject_audit_session = (
            reject_audit_session
            if reject_audit_session is not None
            else RejectAuditTsvSession.disabled()
        )
        self._repair_metrics_session = GraphCandidateRepairMetricsSession.open(
            self._reject_audit_session
        )

    def set_job_output_run_context(
        self, job_output_run_context: JobOutputRunContext | None
    ) -> None:
        """ジョブ出力の実行文脈を設定する。

        Parameters
        ----------
        job_output_run_context : JobOutputRunContext | None
            実行文脈。None なら無効。
        """
        self._job_output_run_context = (
            job_output_run_context
            if job_output_run_context is not None
            else JobOutputRunContext.disabled()
        )

    def add(self, embedding: Embedding) -> str:
        """取り込みを通してから行を保存し、その ID を返す。

        拒否済みの参照元、致命的でない拒否（学習可能な拒否）の場合は保存せず空文字を返す。

        Parameters
        ----------
        embedding : Embedding
            保存する内容。ID・ベクトルがなければ補う。

        Returns
        -------
        str
            保存した行の ID。保存しなかったときは空文字。

        Raises
        ------
        RuntimeError
            取り込みが拒否された、または保存に失敗したとき。
        """
        if self._stop_before_rejected_source(embedding):
            return ""
        self._ensure_id_and_vector(embedding)
        ingestion_result = self._ingestion_shim.save(embedding)
        self._throw_if_rejected(ingestion_result)
        self._record_repair_metrics(ingestion_result)
        self._write_reject_audit_if_needed(ingestion_result, embedding)
        if self._stop_after_learnable_reject(embedding, ingestion_result):
            return ""
        if self._stop_after_rejected_source(embedding, ingestion_result):
            return ""
        self._execute(CoreVectorDbOperation.SAVE, embedding)
        self._register_committed_row(embedding, ingestion_result)
        self._compensating_delete_if_needed(embedding, ingestion_result)
        return embedding.id or ""

    def delete(self, file_unique_id: str) -> None:
        """ファイル固有 ID に紐づく行をすべて削除する（テナント ID を必ず付ける）。

        Parameters
        ----------
        file_unique_id : str
            ファイル固有 ID。

        Raises
        ------
        ValueError
            ID が空のとき。
        RuntimeError
            削除に失敗したとき。
        """
        if file_unique_id is None or file_unique_id.strip() == "":
            raise ValueError("fileUniqueId must not be blank")
        normalized = file_unique_id.strip()
        result = self._runtime.execute(
            self._base_request(CoreVectorDbOperation.DELETE)
            .payload(CoreVectorDbPayload(normalized, "", (), normalized))
            .graph_write_setting(
                self._mapper.graph_write_setting(self._vector_db_config)
            )
            .metadata(TENANT_ID_METADATA, self._tenant_id)
            .metadata(GRAPH_RAG_SOURCE_REF_METADATA, normalized)
            .build()
        )
        self._throw_if_failed(result)

    def replace_source(
        self,
        tenant_id: str,
        source_ref: str,
        expected_source_version: str,
        new_content_hash: str,
    ) -> SourceLifecycleResult:
        """参照元を置き換える。

        Parameters
        ----------
        tenant_id : str
            テナント ID。
        source_ref : str
            参照元。
        expected_source_version : str
            期待する参照元のバージョン。
        new_content_hash : str
            新しい内容のハッシュ。

        Returns
        -------
        SourceLifecycleResult
            置き換えの結果。
        """
        return self._ingestion_shim.replace_source(
            SourceLifecycleRequest.replace(
                tenant_id, source_ref, expected_source_version, new_content_hash
            )
        )

    def delete_source(
        self,
        tenant_id: str,
        source_ref: str,
        expected_source_version: str,
        deletion_reason: str,
    ) -> SourceLifecycleResult:
        """参照元を削除する。

        Parameters
        ----------
        tenant_id : str
            テナント ID。
        source_ref : str
            参照元。
        expected_source_version : str
            期待する参照元のバージョン。
        deletion_reason : str
            削除の理由。

        Returns
        -------
        SourceLifecycleResult
            削除の結果。
        """
        return self._ingestion_shim.delete_source(
            SourceLifecycleRequest.delete(
                tenant_id, source_ref, expected_source_version, deletion_reason
            )
        )

    def update(self, embedding: Embedding) -> None:
        """取り込みを通してから行を更新する。

        Parameters
        ----------
        embedding : Embedding
            更新する内容。

        Raises
        ------
        RuntimeError
            取り込みが拒否された、または更新に失敗したとき。
        """
        self._ensure_id_and_vector(embedding)
        ingestion_result = self._ingestion_shim.update(embedding)
        self._throw_if_rejected(ingestion_result)
        self._record_repair_metrics(ingestion_result)
        self._write_reject_audit_if_needed(ingestion_result, embedding)
        if self._stop_after_learnable_reject(embedding, ingestion_result):
            return
        if self._stop_after_rejected_source(embedding, ingestion_result):
            return
        self._execute(CoreVectorDbOperation.UPDATE, embedding)
        self._register_committed_row(embedding, ingestion_result)
        self._compensating_delete_if_needed(embedding, ingestion_result)

    def search(self, query: str, top_k: int) -> list[Embedding]:
        """クエリの埋め込みで近い行を検索する。

        Parameters
        ----------
        query : str
            検索文。
        top_k : int
            返す件数。

        Returns
        -------
        list[Embedding]
            見つかった行。

        Raises
        ------
        RuntimeError
            検索に失敗したとき。
        """
        query_vector = self._embedding_model.create_embedding(query)
        result = self._runtime.execute(
            self._base_request(CoreVectorDbOperation.SEARCH)
            .payload(
                CoreVectorDbPayload(SEARCH_QUERY_ID, query, tuple(query_vector), "")
            )
            .metadata(LIMIT_METADATA, str(top_k))
            .build()
        )
        self._throw_if_failed(result)
        return [self._to_embedding(match) for match in result.matches]

    def write_core_graph_chunk(
        self, request: GraphChunkWriteRequest | None
    ) -> GraphWriteResult:
        """1 チャンクの Graph 書き込みを core に任せる。

        Parameters
        ----------
        request : GraphChunkWriteRequest | None
            Graph 書き込みの要求。

        Returns
        -------
        GraphWriteResult
            書き込みの結果。

        Raises
        ------
        RuntimeError
            core が失敗を返したとき。
        """
        result = self._runtime.execute(
            self._base_request(CoreVectorDbOperation.GRAPH_WRITE)
            .payload(
                CoreVectorDbPayload.delete(request.vector_row_id if request else "")
            )
            .graph_write_setting(
                self._mapper.graph_write_setting(self._vector_db_config)
            )
            .graph_chunk_payload(self._mapper.graph_chunk_payload(request))
            .build()
        )
        self._throw_if_failed(result)
        return self._mapper.graph_write_result(
            result.graph_result or CoreGraphWriteResult.disabled()
        )

    def delete_core_graph_data_by_ids(self, ids: list[str] | None) -> GraphWriteResult:
        """ベクトル行 ID の Graph データ削除を core に任せる。

        Parameters
        ----------
        ids : list[str] | None
            ベクトル行 ID。

        Returns
        -------
        GraphWriteResult
            削除の結果。

        Raises
        ------
        RuntimeError
            core が失敗を返したとき。
        """
        result_id = "" if not ids else ids[0]
        result = self._runtime.execute(
            self._base_request(CoreVectorDbOperation.GRAPH_DELETE)
            .payload(CoreVectorDbPayload.delete(result_id))
            .graph_write_setting(
                self._mapper.graph_write_setting(self._vector_db_config)
            )
            .graph_chunk_payload(self._mapper.graph_delete_payload(ids or []))
            .build()
        )
        self._throw_if_failed(result)
        return self._mapper.graph_write_result(
            result.graph_result or CoreGraphWriteResult.disabled()
        )

    def _execute(self, operation: CoreVectorDbOperation, embedding: Embedding) -> None:
        """保存・更新を core に任せ、失敗なら例外にする。

        Parameters
        ----------
        operation : CoreVectorDbOperation
            SAVE または UPDATE。
        embedding : Embedding
            対象の内容。
        """
        result = self._runtime.execute(
            self._base_request(operation)
            .payload(self._mapper.payload(embedding))
            .build()
        )
        self._throw_if_failed(result)

    def _base_request(
        self, operation: CoreVectorDbOperation
    ) -> CoreVectorDbRequestBuilder:
        """プロバイダ・ネットワーク・接続先を設定した要求のビルダーを作る。

        Parameters
        ----------
        operation : CoreVectorDbOperation
            操作。

        Returns
        -------
        CoreVectorDbRequestBuilder
            要求のビルダー。
        """
        return (
            CoreVectorDbRequestBuilder(
                self._mapper.provider_id(self._vector_db_config), operation
            )
            .network_setting(self._mapper.network_setting(self._proxy_setting))
            .target(self._mapper.target(self._vector_db_config))
        )

    @staticmethod
    def _to_embedding(match: CoreVectorSearchMatch) -> Embedding:
        """検索結果の 1 行を Embedding にする。

        Parameters
        ----------
        match : CoreVectorSearchMatch
            検索結果の 1 行。

        Returns
        -------
        Embedding
            Embedding。
        """
        return Embedding(
            id=match.id,
            content=match.content,
            vector=list(match.vector),
            file_unique_id=match.file_unique_id,
        )

    def _ensure_id_and_vector(self, embedding: Embedding) -> None:
        """ID とベクトルがなければ補う。

        Parameters
        ----------
        embedding : Embedding
            対象の内容。
        """
        if embedding.id is None or embedding.id == "":
            embedding.id = create_unique_id()
        if not embedding.vector:
            embedding.vector = self._embedding_model.create_embedding(embedding.content)

    @staticmethod
    def _throw_if_failed(result: CoreVectorDbResult) -> None:
        """失敗の結果なら例外にする。

        Parameters
        ----------
        result : CoreVectorDbResult
            core の結果。

        Raises
        ------
        RuntimeError
            失敗、または Graph 書き込みの失敗があるとき。
        """
        if result.failure is not None:
            raise RuntimeError(result.failure.summary)
        if result.graph_result is not None and result.graph_result.is_failed():
            raise RuntimeError(result.graph_result.message)

    def _write_reject_audit_if_needed(
        self, ingestion_result: IngestionResult | None, embedding: Embedding
    ) -> None:
        """学習可能な拒否のとき、監査に 1 行書く。書けなくても取り込みは止めない。

        Parameters
        ----------
        ingestion_result : IngestionResult | None
            取り込み結果。
        embedding : Embedding
            対象の内容。
        """
        if (
            not self._reject_audit_config.enabled
            or ingestion_result is None
            or not ingestion_result.accepted
        ):
            return
        if not self._is_learnable_candidate_reject(ingestion_result):
            return
        try:
            GraphCandidateRejectAuditWriter.append_reject(
                self._reject_audit_session, ingestion_result, embedding.source_file_path
            )
        except Exception:  # noqa: BLE001 - 監査の失敗で取り込みを止めない（移植元 FR-009）
            logger.warning("Reject audit could not be written; ingestion continues.")

    def _record_repair_metrics(self, ingestion_result: IngestionResult) -> None:
        """再修復の指標を記録する。記録できなくても取り込みは止めない。

        Parameters
        ----------
        ingestion_result : IngestionResult
            取り込み結果。
        """
        try:
            self._repair_metrics_session.record(ingestion_result)
        except Exception:  # noqa: BLE001 - 指標の失敗で取り込みを止めない（移植元と同じ）
            logger.warning("Repair metrics could not be recorded; ingestion continues.")

    def _stop_after_learnable_reject(
        self, embedding: Embedding, ingestion_result: IngestionResult
    ) -> bool:
        """学習可能な拒否なら、書いた行を取り消して後続を止める。

        Parameters
        ----------
        embedding : Embedding
            対象の内容。
        ingestion_result : IngestionResult
            取り込み結果。

        Returns
        -------
        bool
            後続を止めるなら True。
        """
        if not self._is_learnable_candidate_reject(ingestion_result):
            return False
        self._register_committed_row(embedding, ingestion_result)
        self._compensating_delete_if_needed(embedding, ingestion_result)
        return True

    def _stop_before_rejected_source(self, embedding: Embedding) -> bool:
        """すでに拒否された参照元なら、取り込む前に止める。

        Parameters
        ----------
        embedding : Embedding
            対象の内容。

        Returns
        -------
        bool
            止めるなら True。
        """
        return self._stop_rejected_source(
            self._success_tsv_source_path(embedding, self._source_ref(embedding))
        )

    def _stop_after_rejected_source(
        self, embedding: Embedding, ingestion_result: IngestionResult
    ) -> bool:
        """取り込みの後で、拒否された参照元なら止める。

        Parameters
        ----------
        embedding : Embedding
            対象の内容。
        ingestion_result : IngestionResult
            取り込み結果。

        Returns
        -------
        bool
            止めるなら True。
        """
        return self._stop_rejected_source(
            self._success_tsv_source_path(
                embedding, self._source_ref_with_result(embedding, ingestion_result)
            )
        )

    def _stop_rejected_source(self, source_path: str | None) -> bool:
        """参照元が拒否済みなら、後続チャンクのスキップを数えて True を返す。

        Parameters
        ----------
        source_path : str | None
            成功 TSV に出す参照元のパス。

        Returns
        -------
        bool
            拒否済みなら True。
        """
        rejected = self._job_output_run_context.is_rejected(source_path)
        if rejected:
            self._repair_metrics_session.record_post_reject_skipped_chunk()
        return rejected

    @staticmethod
    def _is_learnable_candidate_reject(
        ingestion_result: IngestionResult | None,
    ) -> bool:
        """LLM 候補出力の拒否（致命的でない）か判定する。

        Parameters
        ----------
        ingestion_result : IngestionResult | None
            取り込み結果。

        Returns
        -------
        bool
            受理済みで、学習可能な拒否コードなら True。
        """
        if ingestion_result is None or not ingestion_result.accepted:
            return False
        code = ingestion_result.learnable_reject_code
        return code == LLM_CANDIDATE_OUTPUT_REJECTED and (
            IngestionRejectClassification.is_non_critical(code)
        )

    @staticmethod
    def _throw_if_rejected(result: IngestionResult) -> None:
        """取り込みが拒否されていれば例外にする。

        Parameters
        ----------
        result : IngestionResult
            取り込み結果。

        Raises
        ------
        RuntimeError
            受理されなかったとき。
        """
        if not result.accepted:
            raise RuntimeError(
                f"{result.failure_summary} failureCode={result.failure_code}; "
                f"schemaReadiness={result.schema_readiness}"
            )

    def _register_committed_row(
        self, embedding: Embedding | None, ingestion_result: IngestionResult | None
    ) -> None:
        """コミットした行を、補償削除のために記録する。

        Parameters
        ----------
        embedding : Embedding | None
            対象の内容。
        ingestion_result : IngestionResult | None
            取り込み結果。
        """
        if embedding is None or ingestion_result is None:
            return
        source_ref = self._source_ref_with_result(embedding, ingestion_result)
        self._file_committed_row_tracker.register(
            source_ref,
            CommittedRow(
                tenant_id=ingestion_result.tenant_id or "",
                source_ref=source_ref,
                job_id=source_ref,
                run_id=self._file_run_id(source_ref),
                provider_id=self._mapper.provider_id(self._vector_db_config),
                database_name=self._vector_db_config.database_name or "",
                table_name=self._vector_db_config.table_name or "",
                graph_name=self._graph_name(),
                vector_row_id=embedding.id or "",
                graph_rag_chunk_id=ingestion_result.chunk_id or "",
                evidence_links=tuple(ingestion_result.evidence_links),
            ),
        )

    def _compensating_delete_if_needed(
        self, embedding: Embedding | None, ingestion_result: IngestionResult | None
    ) -> None:
        """学習可能な拒否のとき、書いた行を各層から取り消す。

        Parameters
        ----------
        embedding : Embedding | None
            対象の内容。
        ingestion_result : IngestionResult | None
            取り込み結果。
        """
        if ingestion_result is None or embedding is None:
            return
        source_ref = self._source_ref_with_result(embedding, ingestion_result)
        code = ingestion_result.learnable_reject_code
        if not self._compensating_delete_hook.should_execute(source_ref, code):
            return
        run_id = self._file_run_id(source_ref)
        outcome: CompensatingDeleteOutcome = self._compensating_delete_hook.execute(
            CompensatingDeleteOwnershipScope(
                tenant_id=ingestion_result.tenant_id or "",
                source_ref=source_ref,
                job_id=source_ref,
                run_id=run_id,
                provider_id=self._mapper.provider_id(self._vector_db_config),
                database_name=self._vector_db_config.database_name or "",
                table_name=self._vector_db_config.table_name or "",
                graph_name=self._graph_name(),
            ),
            source_ref,
            LLM_CANDIDATE_OUTPUT_REJECTED,
            ingestion_result.chunk_id or "",
            self._mapper.network_setting(self._proxy_setting),
            self._mapper.target(self._vector_db_config),
        )
        self._repair_metrics_session.record_cleanup_outcome(outcome)
        if self._job_output_run_context.is_enabled():
            self._job_output_run_context.mark_learnable_reject(
                self._success_tsv_source_path(embedding, source_ref)
            )
        if outcome.overall_status in (OverallStatus.PARTIAL, OverallStatus.FAILED):
            self._job_output_run_context.mark_fail_closed()

    def _graph_name(self) -> str:
        """Graph 書き込みが有効なら実効 graph 名、無効なら空文字を返す。

        Returns
        -------
        str
            graph 名。
        """
        if self._vector_db_config.graph_write_enabled:
            return self._vector_db_config.get_effective_graph_name()
        return ""

    @staticmethod
    def _success_tsv_source_path(
        embedding: Embedding | None, source_ref: str | None
    ) -> str | None:
        """成功 TSV に出す参照元のパスを選ぶ。取り込み元のパスがあればそれを優先する。

        Parameters
        ----------
        embedding : Embedding | None
            対象の内容。
        source_ref : str | None
            参照元。

        Returns
        -------
        str | None
            取り込み元のパス、なければ参照元。
        """
        if embedding is not None and _present(embedding.source_file_path):
            return embedding.source_file_path
        return source_ref

    @staticmethod
    def _source_ref(embedding: Embedding) -> str | None:
        """ファイル固有 ID、なければ行の ID を参照元にする。

        Parameters
        ----------
        embedding : Embedding
            対象の内容。

        Returns
        -------
        str | None
            参照元。
        """
        if _present(embedding.file_unique_id):
            return embedding.file_unique_id
        return embedding.id

    @staticmethod
    def _source_ref_with_result(
        embedding: Embedding, ingestion_result: IngestionResult
    ) -> str:
        """取り込み結果の参照元、なければファイル固有 ID を参照元にする。

        Parameters
        ----------
        embedding : Embedding
            対象の内容。
        ingestion_result : IngestionResult
            取り込み結果。

        Returns
        -------
        str
            参照元。
        """
        if _present(ingestion_result.source_ref):
            return ingestion_result.source_ref or ""
        return embedding.file_unique_id or ""

    @staticmethod
    def _file_run_id(source_ref: str | None) -> str:
        """参照元からファイル単位の実行 ID を作る。

        Parameters
        ----------
        source_ref : str | None
            参照元。

        Returns
        -------
        str
            実行 ID。参照元が空なら `run-unknown`。
        """
        if not _present(source_ref):
            return UNKNOWN_RUN_ID
        return source_ref or UNKNOWN_RUN_ID

    @staticmethod
    def _normalized_tenant_id(
        access_credential: EmbeddingProviderProperties | None,
    ) -> str:
        """接続設定のテナント ID を trim して返す。

        Parameters
        ----------
        access_credential : EmbeddingProviderProperties | None
            埋め込みの接続設定。

        Returns
        -------
        str
            テナント ID。なければ空文字。
        """
        if access_credential is None or access_credential.tenant_id is None:
            return ""
        return access_credential.tenant_id.strip()
