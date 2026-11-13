"""取り込みの実行（移植元 IngestionRuntime）。

受け入れ判定 → スキーマ確認 → 決定的抽出 → （有効なら）LLM 候補の抽出と検証・修復 →
永続化の順で動かす。失敗は例外にせず、拒否の結果として返す（fail-closed）。
"""

import logging
from dataclasses import dataclass

from generative_ai_core.failure import CoreFailure, sanitize
from generative_ai_core.graphrag.ingestion.admission import (
    IngestionAdmissionGate,
    IngestionDeterministicExtractor,
)
from generative_ai_core.graphrag.ingestion.candidates import stable_id
from generative_ai_core.graphrag.ingestion.extraction import IngestionExtraction
from generative_ai_core.graphrag.ingestion.lifecycle import (
    SourceLifecycleRequest,
    SourceLifecycleResult,
)
from generative_ai_core.graphrag.ingestion.llm.models import (
    STATUS_CANDIDATE,
    TRUST_LLM_SUGGESTED,
    LlmCandidateExtraction,
    LlmCandidateExtractionSettings,
    LlmCandidateOrigin,
    LlmCandidateOutputException,
    LlmCandidateRepairContext,
)
from generative_ai_core.graphrag.ingestion.llm.request import (
    LlmCandidateExtractionRequest,
    LlmCandidateExtractor,
    disabled_extractor,
)
from generative_ai_core.graphrag.ingestion.persistence import (
    IngestionPersistenceAdapter,
    InMemoryIngestionPersistenceAdapter,
)
from generative_ai_core.graphrag.ingestion.reject_classification import (
    IngestionRejectClassification,
)
from generative_ai_core.graphrag.ingestion.request import (
    IngestionRequest,
    IngestionRequestBuilder,
)
from generative_ai_core.graphrag.ingestion.result import (
    GraphCandidateRepairOutcome,
    IngestionResult,
)

logger = logging.getLogger(__name__)

MAX_LLM_INPUT_CHARS = 4096
LLM_REJECT_CODE = "LLM_CANDIDATE_OUTPUT_REJECTED"


@dataclass(frozen=True)
class _LlmCandidateMergeOutcome:
    """LLM 候補を合わせた抽出結果と、学習可能な拒否・修復の結果。"""

    extraction: IngestionExtraction
    learnable_reject_code: str | None
    learnable_reject_summary: str | None
    repair_outcome: GraphCandidateRepairOutcome


def _reject_invalid_llm_output(summary: str) -> None:
    """LLM 出力の検証違反を拒否する。

    Parameters
    ----------
    summary : str
        拒否の理由。

    Raises
    ------
    LlmCandidateOutputException
        常に送出する。
    """
    raise LlmCandidateOutputException(LLM_REJECT_CODE, sanitize(summary))


class IngestionRuntime:
    """取り込みを実行する。"""

    def __init__(
        self,
        persistence_adapter: IngestionPersistenceAdapter | None = None,
        admission_gate: IngestionAdmissionGate | None = None,
        extractor: IngestionDeterministicExtractor | None = None,
        llm_settings: LlmCandidateExtractionSettings | None = None,
        llm_extractor: LlmCandidateExtractor | None = None,
    ) -> None:
        """依存を受け取る。省略した部分は移植元の既定を使う。

        Parameters
        ----------
        persistence_adapter : IngestionPersistenceAdapter | None
            保存先。省略時はメモリ上の実装。
        admission_gate : IngestionAdmissionGate | None
            受け入れ判定。
        extractor : IngestionDeterministicExtractor | None
            決定的な抽出。
        llm_settings : LlmCandidateExtractionSettings | None
            LLM 候補抽出の設定。省略時は無効。
        llm_extractor : LlmCandidateExtractor | None
            LLM 候補の抽出器。省略時は何も抽出しない。
        """
        self._admission_gate = admission_gate or IngestionAdmissionGate()
        self._extractor = extractor or IngestionDeterministicExtractor()
        self._persistence_adapter: IngestionPersistenceAdapter = (
            persistence_adapter or InMemoryIngestionPersistenceAdapter()
        )
        self._llm_settings = llm_settings or LlmCandidateExtractionSettings.disabled()
        self._llm_extractor: LlmCandidateExtractor = llm_extractor or disabled_extractor

    def ingest(self, request: IngestionRequest) -> IngestionResult:
        """1 件を取り込む。失敗は拒否の結果として返す。

        Parameters
        ----------
        request : IngestionRequest
            取り込みの要求。

        Returns
        -------
        IngestionResult
            取り込みの結果。
        """
        decision = self._admission_gate.decide(request)
        if not decision.accepted:
            return IngestionResult.rejected(
                request,
                decision.failure_code,
                "Ingestion rejected by admission gate.",
                "not checked",
            )
        try:
            readiness = self._persistence_adapter.schema_readiness()
            if not readiness.ready:
                return IngestionResult.rejected(
                    request,
                    readiness.failure_code,
                    "Ingestion schema is not ready.",
                    readiness.status,
                )
            extraction = self._extractor.extract(request.normalized_body)
            outcome = self._with_llm_candidates(request, extraction)
            result = self._persistence_adapter.persist(
                request, outcome.extraction
            ).with_graph_candidate_repair_outcome(outcome.repair_outcome)
            if outcome.learnable_reject_code is not None:
                return result.with_learnable_reject(
                    outcome.learnable_reject_code, outcome.learnable_reject_summary
                )
            return result
        except LlmCandidateOutputException as e:
            return IngestionResult.rejected(request, e.failure_code, str(e), "ready")
        except Exception as e:  # noqa: BLE001  永続化の失敗は例外にせず拒否の結果にする（移植元と同じ）
            failure = CoreFailure.from_exception("PERSISTENCE_FAILURE", e)
            logger.warning("ingestion persistence failed: code=%s", failure.code)
            return IngestionResult.rejected(
                request, failure.code, failure.summary, "ready"
            )

    def replace_source(self, request: SourceLifecycleRequest) -> SourceLifecycleResult:
        """取り込み元の内容を置き換える。

        Parameters
        ----------
        request : SourceLifecycleRequest
            置き換えの要求。

        Returns
        -------
        SourceLifecycleResult
            結果。失敗は例外にせず失敗の結果で返す。
        """
        try:
            readiness_failure = self._lifecycle_readiness_failure(request)
            if readiness_failure is not None:
                return readiness_failure
            return self._persistence_adapter.replace_source(request)
        except Exception:  # noqa: BLE001  ライフサイクルの失敗は例外にせず失敗の結果にする（移植元と同じ）
            return SourceLifecycleResult.failure(request, "LIFECYCLE_FAILED")

    def delete_source(self, request: SourceLifecycleRequest) -> SourceLifecycleResult:
        """取り込み元を削除する。

        Parameters
        ----------
        request : SourceLifecycleRequest
            削除の要求。

        Returns
        -------
        SourceLifecycleResult
            結果。失敗は例外にせず失敗の結果で返す。
        """
        try:
            readiness_failure = self._lifecycle_readiness_failure(request)
            if readiness_failure is not None:
                return readiness_failure
            return self._persistence_adapter.delete_source(request)
        except Exception:  # noqa: BLE001  ライフサイクルの失敗は例外にせず失敗の結果にする（移植元と同じ）
            return SourceLifecycleResult.failure(request, "LIFECYCLE_FAILED")

    def _lifecycle_readiness_failure(
        self, request: SourceLifecycleRequest
    ) -> SourceLifecycleResult | None:
        """スキーマが使えなければ失敗の結果を返す。

        Parameters
        ----------
        request : SourceLifecycleRequest
            要求。

        Returns
        -------
        SourceLifecycleResult | None
            使えなければ失敗の結果。使えれば None。
        """
        readiness = self._persistence_adapter.schema_readiness()
        if readiness.ready:
            return None
        return SourceLifecycleResult.failure(request, readiness.failure_code)

    def _with_llm_candidates(
        self, request: IngestionRequest, deterministic: IngestionExtraction
    ) -> _LlmCandidateMergeOutcome:
        """（有効なら）LLM の候補を決定的抽出に合わせる。非致命の拒否は修復を試す。

        Parameters
        ----------
        request : IngestionRequest
            取り込みの要求。
        deterministic : IngestionExtraction
            決定的な抽出結果。

        Returns
        -------
        _LlmCandidateMergeOutcome
            合わせた結果。

        Raises
        ------
        LlmCandidateOutputException
            致命的な拒否のとき。
        """
        if not self._llm_settings.is_enabled():
            return _LlmCandidateMergeOutcome(
                deterministic, None, None, GraphCandidateRepairOutcome.NOT_PROCESSED
            )
        source_chunk_id = self._source_chunk_id(request)
        llm_request = LlmCandidateExtractionRequest(
            self._sanitized_llm_request(request), deterministic, source_chunk_id
        )
        try:
            llm_extraction = self._llm_extractor(llm_request)
            return _LlmCandidateMergeOutcome(
                deterministic.with_llm_candidates(
                    self._validated_llm_extraction(llm_extraction, source_chunk_id)
                ),
                None,
                None,
                GraphCandidateRepairOutcome.NO_REPAIR,
            )
        except LlmCandidateOutputException as e:
            if not IngestionRejectClassification.is_non_critical(e.failure_code):
                raise
            candidate_json = e.candidate_json_body()
            if candidate_json is None:
                return _LlmCandidateMergeOutcome(
                    deterministic,
                    e.failure_code,
                    str(e),
                    GraphCandidateRepairOutcome.REJECTED_WITHOUT_REPAIR,
                )
            return self._repair_llm_candidates(
                llm_request, deterministic, source_chunk_id, e, candidate_json
            )

    def _repair_llm_candidates(
        self,
        llm_request: LlmCandidateExtractionRequest,
        deterministic: IngestionExtraction,
        source_chunk_id: str,
        initial_reject: LlmCandidateOutputException,
        candidate_json: str,
    ) -> _LlmCandidateMergeOutcome:
        """拒否された候補 JSON を LLM に一度だけ直させる。

        Parameters
        ----------
        llm_request : LlmCandidateExtractionRequest
            最初の抽出の要求。
        deterministic : IngestionExtraction
            決定的な抽出結果。
        source_chunk_id : str
            取り込み元のチャンク ID。
        initial_reject : LlmCandidateOutputException
            最初の拒否。
        candidate_json : str
            修復の入力にする候補 JSON。

        Returns
        -------
        _LlmCandidateMergeOutcome
            修復の結果。

        Raises
        ------
        LlmCandidateOutputException
            修復でも致命的な拒否になったとき。
        """
        repair_request = LlmCandidateExtractionRequest(
            llm_request.ingestion_request,
            deterministic,
            source_chunk_id,
            LlmCandidateRepairContext(candidate_json, initial_reject.failure_code),
        )
        try:
            repaired = self._validated_llm_extraction(
                self._llm_extractor(repair_request), source_chunk_id
            )
            if self._candidate_count(repaired) == 0:
                return _LlmCandidateMergeOutcome(
                    deterministic,
                    initial_reject.failure_code,
                    str(initial_reject),
                    GraphCandidateRepairOutcome.REPAIR_REJECTED,
                )
            return _LlmCandidateMergeOutcome(
                deterministic.with_llm_candidates(repaired),
                None,
                None,
                GraphCandidateRepairOutcome.REPAIR_SUCCEEDED,
            )
        except LlmCandidateOutputException as repair_failure:
            if IngestionRejectClassification.is_non_critical(
                repair_failure.failure_code
            ):
                return _LlmCandidateMergeOutcome(
                    deterministic,
                    initial_reject.failure_code,
                    str(repair_failure),
                    GraphCandidateRepairOutcome.REPAIR_REJECTED,
                )
            raise

    def _candidate_count(self, extraction: LlmCandidateExtraction | None) -> int:
        """候補（エンティティ + エッジ）の数を返す。

        Parameters
        ----------
        extraction : LlmCandidateExtraction | None
            LLM の候補。

        Returns
        -------
        int
            候補の数。
        """
        if extraction is None:
            return 0
        return len(extraction.entities) + len(extraction.edges)

    def _sanitized_llm_request(self, request: IngestionRequest) -> IngestionRequest:
        """LLM に渡す要求を、伏せ字・長さ制限をかけて作る。

        Parameters
        ----------
        request : IngestionRequest
            取り込みの要求。

        Returns
        -------
        IngestionRequest
            LLM 用の要求。
        """
        return (
            IngestionRequestBuilder()
            .tenant_id(self._sanitize_for_llm(request.tenant_id))
            .source_ref(self._sanitize_for_llm(request.source_ref))
            .display_name(self._sanitize_for_llm(request.display_name))
            .normalized_body(self._sanitize_for_llm(request.normalized_body))
            .classification(request.classification)
            .classification_rank(request.classification_rank)
            .acl_mode(request.acl_mode)
            .acl_principals(list(request.acl_principals or ()))
            .acl_revision(request.acl_revision)
            .deterministic_marker_context(
                self._sanitize_for_llm(request.deterministic_marker_context)
            )
            .operation(request.operation)
            .build()
        )

    def _sanitize_for_llm(self, value: str | None) -> str | None:
        """LLM に渡す文字列を伏せ字にし、4096 文字までにする。

        Parameters
        ----------
        value : str | None
            文字列。

        Returns
        -------
        str | None
            伏せ字・切り詰め後の文字列。
        """
        if value is None:
            return None
        sanitized = sanitize(value)
        return sanitized[:MAX_LLM_INPUT_CHARS]

    def _validated_llm_extraction(
        self, extraction: LlmCandidateExtraction | None, expected_source_chunk_id: str
    ) -> LlmCandidateExtraction:
        """候補と由来が 1 対 1 で、候補のまま・同じチャンクの根拠付きかを検証する。

        Parameters
        ----------
        extraction : LlmCandidateExtraction | None
            LLM の候補。
        expected_source_chunk_id : str
            期待する取り込み元チャンク ID。

        Returns
        -------
        LlmCandidateExtraction
            検証済みの候補。None は空の結果。

        Raises
        ------
        LlmCandidateOutputException
            検証に違反したとき。
        """
        if extraction is None:
            return LlmCandidateExtraction.empty()
        candidate_count = len(extraction.entities) + len(extraction.edges)
        if candidate_count == 0 and not extraction.origins:
            return extraction
        if candidate_count != len(extraction.origins):
            _reject_invalid_llm_output("candidate metadata coverage is incomplete")
        entity_ids = {entity.entity_id for entity in extraction.entities}
        edge_ids = {edge.edge_id for edge in extraction.edges}
        seen_origins: set[str] = set()
        for origin in extraction.origins:
            self._validate_origin(
                origin, expected_source_chunk_id, entity_ids, edge_ids, seen_origins
            )
        if entity_ids or edge_ids:
            _reject_invalid_llm_output("candidate metadata coverage is incomplete")
        return extraction

    def _validate_origin(
        self,
        origin: LlmCandidateOrigin,
        expected_source_chunk_id: str,
        entity_ids: set[str],
        edge_ids: set[str],
        seen_origins: set[str],
    ) -> None:
        """1 件の由来を検証し、対応する候補 ID を残りから外す。

        Parameters
        ----------
        origin : LlmCandidateOrigin
            由来。
        expected_source_chunk_id : str
            期待する取り込み元チャンク ID。
        entity_ids : set[str]
            まだ由来に対応づいていないエンティティ ID（外される）。
        edge_ids : set[str]
            まだ由来に対応づいていないエッジ ID（外される）。
        seen_origins : set[str]
            検証済みの由来のキー（追加される）。
        """
        if expected_source_chunk_id != origin.source_chunk_id:
            _reject_invalid_llm_output(
                "candidate evidence must reference the source chunk"
            )
        if (
            origin.verification_status != STATUS_CANDIDATE
            or origin.trust_level != TRUST_LLM_SUGGESTED
        ):
            _reject_invalid_llm_output("LLM suggestion must remain candidate-only")
        origin_key = f"{origin.candidate_kind}:{origin.candidate_id}"
        if origin_key in seen_origins:
            _reject_invalid_llm_output("candidate metadata coverage is duplicated")
        seen_origins.add(origin_key)
        remaining = {"entity": entity_ids, "edge": edge_ids}.get(origin.candidate_kind)
        if remaining is None or origin.candidate_id not in remaining:
            _reject_invalid_llm_output("candidate metadata coverage is incomplete")
            return
        remaining.remove(origin.candidate_id)

    def _source_chunk_id(self, request: IngestionRequest) -> str:
        """永続化と同じ規則で、取り込み元チャンクの ID を求める。

        Parameters
        ----------
        request : IngestionRequest
            取り込みの要求。

        Returns
        -------
        str
            チャンク ID。
        """
        source_key = f"{request.tenant_id}:{request.source_ref}"
        content_hash = stable_id("content", request.normalized_body)
        version_id = stable_id("version", f"{source_key}:{content_hash}")
        return stable_id("chunk", f"{version_id}:0:{content_hash}")
