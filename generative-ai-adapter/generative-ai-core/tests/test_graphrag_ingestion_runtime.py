"""取り込みの実行（受け入れ判定・抽出・永続化・LLM 候補・ライフサイクル）のテスト。

移植元の次のテストを移したもの。

- `graphrag/ingestion/CoreIngestionBranchCoverageTest`
- `graphrag/ingestion/InMemoryIngestionLifecycleBoundaryTest`
- `graphrag/ingestion/SourceLifecycleSafetyTest`
- `graphrag/ingestion/runtime/contract/IngestionRequestContractTest`・
  `IdempotencyCurrentReplacementContractTest`・`AcceptedTenantWideIngestionContractTest`・
  `IngestionRuntimeRejectClassificationContractTest`・
  `LlmCandidateExtractionRuntimeContractTest`（代表的な流れ）
"""

import json

import pytest
from generative_ai_core.graphrag.ingestion import (
    GraphCandidateRepairOutcome,
    IngestionAdmissionGate,
    IngestionDeterministicExtractor,
    IngestionExtraction,
    IngestionNonGoalProbe,
    IngestionRejectClassification,
    IngestionRequest,
    IngestionResult,
    IngestionRuntime,
    IngestionSchemaReadiness,
    InMemoryIngestionPersistenceAdapter,
    SourceLifecycleRequest,
    SourceLifecycleResult,
    stable_id,
)
from generative_ai_core.graphrag.ingestion.llm import (
    LlmCandidateExtraction,
    LlmCandidateExtractionRequest,
    LlmCandidateExtractionSettings,
    LlmCandidateOutputException,
    LlmJsonCandidateExtractor,
)


def _request(**overrides: object) -> IngestionRequest:
    """受け入れられる要求を作る（項目を上書きできる）。

    Parameters
    ----------
    **overrides : object
        上書きする項目。

    Returns
    -------
    IngestionRequest
        要求。
    """
    builder = (
        IngestionRequest.builder()
        .tenant_id("tenant")
        .source_ref("source")
        .normalized_body("body")
        .classification_rank(1)
        .acl_mode("tenant_wide")
        .acl_principals([])
        .acl_revision(1)
    )
    for name, value in overrides.items():
        getattr(builder, name)(value)
    return builder.build()


def _chunk_id(request: IngestionRequest) -> str:
    """永続化と同じ規則のチャンク ID を求める。

    Parameters
    ----------
    request : IngestionRequest
        要求。

    Returns
    -------
    str
        チャンク ID。
    """
    content = stable_id("content", request.normalized_body)
    version = stable_id(
        "version", f"{request.tenant_id}:{request.source_ref}:{content}"
    )
    return stable_id("chunk", f"{version}:0:{content}")


def _candidate_json(chunk_id: str) -> str:
    """LLM が返す正しい候補 JSON（エンティティ 1 件）を作る。

    Parameters
    ----------
    chunk_id : str
        候補が参照するチャンク ID。

    Returns
    -------
    str
        JSON。
    """
    return json.dumps(
        {
            "extraction_run_id": "run-1",
            "entities": [
                {
                    "candidate_id": "llm-entity",
                    "source_chunk_id": chunk_id,
                    "entity_type": "FEATURE",
                    "label_hash": "label.hash",
                    "evidence_id": "ev-1",
                    "verification_status": "candidate",
                    "trust_level": "llm_suggested",
                }
            ],
            "edges": [],
        }
    )


def test_request_normalizes_input_like_the_java_constructor() -> None:
    """要求の項目が移植元と同じ規則で整えられること"""
    request = (
        IngestionRequest.builder()
        .tenant_id(" t ")
        .source_ref(" s ")
        .display_name(" a\t\n  b ")
        .normalized_body(None)
        .classification(" ")
        .acl_principals([" p ", " ", "q"])
        .deterministic_marker_context("")
        .operation(None)
        .build()
    )
    assert request.tenant_id == "t"
    assert request.source_ref == "s"
    assert request.display_name == "a b"
    assert request.normalized_body == ""
    assert request.classification == "tenant-default"
    assert request.acl_principals == ("p", "q")
    assert request.deterministic_marker_context == "s03-compatible"
    assert request.operation is not None and request.operation.name == "SAVE"


@pytest.mark.parametrize(
    ("overrides", "code"),
    [
        ({"tenant_id": " "}, "TENANT_MISSING"),
        ({"source_ref": " "}, "MISSING_SOURCE_REF"),
        ({"normalized_body": " "}, "BODY_MISSING"),
        ({"acl_mode": " "}, "ACL_CONTEXT_MISSING"),
        ({"acl_revision": 0}, "ACL_STALE"),
        ({"classification_rank": 0}, "CLASSIFICATION_AMBIGUOUS"),
        ({"classification_rank": 2}, "CLASSIFICATION_TOO_HIGH"),
        ({"acl_mode": "restricted"}, "ACL_NOT_TENANT_WIDE"),
        ({"acl_principals": ["principal"]}, "ACL_PRINCIPAL_NOT_EMPTY"),
    ],
)
def test_admission_gate_reports_every_fail_closed_reason(
    overrides: dict[str, object], code: str
) -> None:
    """受け入れ判定が、拒否理由ごとのコードを返すこと"""
    decision = IngestionAdmissionGate().decide(_request(**overrides))
    assert not decision.accepted
    assert decision.failure_code == code


def test_admission_gate_accepts_and_handles_missing_request() -> None:
    """正しい要求は受け入れ、要求なしは REQUEST_MISSING で拒否すること"""
    gate = IngestionAdmissionGate()
    assert gate.decide(_request()).accepted
    assert gate.decide(None).failure_code == "REQUEST_MISSING"


def test_non_goal_probe_requires_every_counter_to_stay_zero() -> None:
    """対象外の処理の呼び出し数が 1 つでもあれば all_zero が False になること"""
    assert IngestionNonGoalProbe.zero().all_zero()
    for index in range(7):
        counters = [0] * 7
        counters[index] = 1
        assert not IngestionNonGoalProbe(*counters).all_zero()


def test_rejected_result_is_zero_state_and_sanitized() -> None:
    """拒否の結果は件数がすべて 0 で、要約の秘密情報が伏せられること"""
    result = IngestionResult.rejected(
        _request(), "X", "failed password=hunter2 https://example.com/x", "ready"
    )
    assert result.zero_state()
    assert result.failure_summary is not None
    assert "hunter2" not in result.failure_summary
    assert "example.com" not in result.failure_summary
    assert (
        result.graph_candidate_repair_outcome
        is GraphCandidateRepairOutcome.NOT_PROCESSED
    )


def test_runtime_accepts_then_is_idempotent_and_replaces_changed_content() -> None:
    """同じ内容の再取り込みは冪等になり、内容が変われば差し替えになること"""
    runtime = IngestionRuntime()
    first = runtime.ingest(_request())
    assert (
        first.accepted and first.documents_created == 1 and first.versions_created == 1
    )
    assert first.chunk_diff_summary is not None and first.chunk_diff_summary.changed
    again = runtime.ingest(_request())
    assert again.idempotent and again.zero_state()
    assert again.embedding_queue_rows_created == 0
    replaced = runtime.ingest(_request(normalized_body="changed"))
    assert replaced.accepted and not replaced.idempotent
    assert replaced.documents_created == 0
    assert replaced.stale_versions == 1 and replaced.stale_chunks == 1


def test_runtime_marks_duplicate_content_from_another_source_as_report_only() -> None:
    """別の取り込み元と同じ内容は duplicate_report_only になること"""
    runtime = IngestionRuntime()
    runtime.ingest(_request(source_ref="a"))
    second = runtime.ingest(_request(source_ref="b"))
    assert second.accepted and second.duplicate_report_only


def test_runtime_rejects_when_admission_or_schema_fails() -> None:
    """受け入れ判定・スキーマ確認の失敗は拒否の結果になること"""
    runtime = IngestionRuntime()
    rejected = runtime.ingest(_request(tenant_id=" "))
    assert not rejected.accepted and rejected.failure_code == "TENANT_MISSING"

    class NotReady(InMemoryIngestionPersistenceAdapter):
        """スキーマが使えない保存先。"""

        def schema_readiness(self) -> IngestionSchemaReadiness:
            """使えない状態を返す。

            Returns
            -------
            IngestionSchemaReadiness
                使えない状態。
            """
            return IngestionSchemaReadiness.missing("SCHEMA_TABLE_MISSING")

    result = IngestionRuntime(NotReady()).ingest(_request())
    assert result.failure_code == "SCHEMA_TABLE_MISSING"
    assert result.schema_readiness == "missing"


def test_runtime_turns_persistence_exceptions_into_sanitized_rejections() -> None:
    """保存先の例外は PERSISTENCE_FAILURE の拒否になり、秘密情報は伏せられること"""

    class Broken(InMemoryIngestionPersistenceAdapter):
        """保存で失敗する保存先。"""

        def persist(
            self, request: IngestionRequest, extraction: IngestionExtraction
        ) -> IngestionResult:
            """常に失敗する。

            Parameters
            ----------
            request : IngestionRequest
                要求。
            extraction : IngestionExtraction
                抽出結果。

            Raises
            ------
            RuntimeError
                常に送出する。
            """
            raise RuntimeError("connect failed password=hunter2")

    result = IngestionRuntime(Broken()).ingest(_request())
    assert result.failure_code == "PERSISTENCE_FAILURE"
    assert result.failure_summary is not None
    assert "hunter2" not in result.failure_summary
    assert result.schema_readiness == "ready"


def _llm_runtime(outputs: list[str | Exception]) -> tuple[IngestionRuntime, list[bool]]:
    """LLM の出力を順に返す抽出器付きの実行を作る。

    Parameters
    ----------
    outputs : list[str | Exception]
        1 回目・2 回目（修復）の LLM の出力。例外ならそれを送出する。

    Returns
    -------
    tuple[IngestionRuntime, list[bool]]
        実行と、各呼び出しが修復だったかの記録。
    """
    calls: list[bool] = []
    queue = list(outputs)

    def provider(request: LlmCandidateExtractionRequest) -> str:
        """順に出力を返す。

        Parameters
        ----------
        request : LlmCandidateExtractionRequest
            要求。

        Returns
        -------
        str
            LLM の出力。

        Raises
        ------
        Exception
            キューの先頭が例外のとき。
        """
        calls.append(request.repair_attempt())
        item = queue.pop(0)
        if isinstance(item, Exception):
            raise item
        return item

    runtime = IngestionRuntime(
        InMemoryIngestionPersistenceAdapter(),
        llm_settings=LlmCandidateExtractionSettings.enabled(),
        llm_extractor=LlmJsonCandidateExtractor(provider),
    )
    return runtime, calls


def test_llm_candidates_are_merged_as_candidate_only() -> None:
    """LLM の候補が候補のまま取り込まれ、修復は不要で NO_REPAIR になること"""
    request = _request()
    runtime, calls = _llm_runtime([_candidate_json(_chunk_id(request))])
    result = runtime.ingest(request)
    assert result.accepted and result.entities_created == 1
    assert result.evidence_created == 1
    assert (
        result.graph_candidate_repair_outcome is GraphCandidateRepairOutcome.NO_REPAIR
    )
    assert result.learnable_reject_code is None
    assert calls == [False]


def test_llm_noncritical_reject_is_repaired_once() -> None:
    """非致命の拒否は 1 回だけ修復され、成功すれば REPAIR_SUCCEEDED になること"""
    request = _request()
    chunk = _chunk_id(request)
    bad = _candidate_json(chunk).replace("llm_suggested", "trusted")
    runtime, calls = _llm_runtime([bad, _candidate_json(chunk)])
    result = runtime.ingest(request)
    assert result.accepted and result.entities_created == 1
    assert (
        result.graph_candidate_repair_outcome
        is GraphCandidateRepairOutcome.REPAIR_SUCCEEDED
    )
    assert calls == [False, True]


def test_llm_repair_that_stays_rejected_becomes_a_learnable_reject() -> None:
    """修復でも拒否されたら、候補なしで取り込み、学習可能な拒否として残ること"""
    request = _request()
    bad = _candidate_json(_chunk_id(request)).replace("llm_suggested", "trusted")
    runtime, calls = _llm_runtime([bad, bad])
    result = runtime.ingest(request)
    assert result.accepted and result.entities_created == 0
    assert result.learnable_reject_code == "LLM_CANDIDATE_OUTPUT_REJECTED"
    assert (
        result.graph_candidate_repair_outcome
        is GraphCandidateRepairOutcome.REPAIR_REJECTED
    )
    assert calls == [False, True]
    assert result.graph_candidate_repair_outcome.repair_attempted()
    assert result.graph_candidate_repair_outcome.final_rejected()


def test_llm_noncritical_reject_without_body_is_rejected_without_repair() -> None:
    """修復用の候補 JSON がない非致命の拒否は、修復せず学習可能な拒否になること"""
    runtime, calls = _llm_runtime(
        [LlmCandidateOutputException("LLM_CANDIDATE_OUTPUT_REJECTED", "no body")]
    )
    result = runtime.ingest(_request())
    assert result.accepted
    assert result.learnable_reject_code == "LLM_CANDIDATE_OUTPUT_REJECTED"
    assert (
        result.graph_candidate_repair_outcome
        is GraphCandidateRepairOutcome.REJECTED_WITHOUT_REPAIR
    )
    assert calls == [False]


def test_llm_critical_reject_fails_the_ingestion() -> None:
    """致命の拒否（読めない出力）は取り込みを拒否の結果にすること"""
    runtime, _ = _llm_runtime(["{"])
    result = runtime.ingest(_request())
    assert not result.accepted
    assert result.failure_code == "LLM_CANDIDATE_OUTPUT_UNREADABLE"
    assert result.learnable_reject_code is None


def test_llm_candidates_without_matching_origins_are_rejected() -> None:
    """候補と由来が 1 対 1 でない抽出結果は非致命の拒否になること"""
    request = _request()
    from generative_ai_core.graphrag.ingestion import IngestionEntityCandidate

    runtime = IngestionRuntime(
        InMemoryIngestionPersistenceAdapter(),
        llm_settings=LlmCandidateExtractionSettings.enabled(),
        llm_extractor=lambda _: LlmCandidateExtraction(
            (IngestionEntityCandidate("m", "e1", "FEATURE", "h"),), (), ()
        ),
    )
    result = runtime.ingest(request)
    assert result.accepted and result.entities_created == 0
    assert result.learnable_reject_code == "LLM_CANDIDATE_OUTPUT_REJECTED"


def test_llm_receives_sanitized_and_truncated_input() -> None:
    """LLM に渡す要求は秘密情報が伏せられ、4096 文字までに切られること"""
    seen: list[LlmCandidateExtractionRequest] = []

    def extractor(request: LlmCandidateExtractionRequest) -> LlmCandidateExtraction:
        """渡された要求を記録する。

        Parameters
        ----------
        request : LlmCandidateExtractionRequest
            要求。

        Returns
        -------
        LlmCandidateExtraction
            空の結果。
        """
        seen.append(request)
        return LlmCandidateExtraction.empty()

    runtime = IngestionRuntime(
        InMemoryIngestionPersistenceAdapter(),
        llm_settings=LlmCandidateExtractionSettings.enabled(),
        llm_extractor=extractor,
    )
    runtime.ingest(_request(normalized_body="password=hunter2 " + "x" * 5000))
    body = seen[0].ingestion_request.normalized_body
    assert body is not None and "hunter2" not in body and len(body) == 4096


def test_reject_classification_only_treats_llm_reject_as_non_critical() -> None:
    """LLM 候補出力の拒否だけが非致命と分類されること"""
    assert IngestionRejectClassification.is_non_critical(
        "LLM_CANDIDATE_OUTPUT_REJECTED"
    )
    assert IngestionRejectClassification.is_critical("LLM_CANDIDATE_OUTPUT_UNREADABLE")
    assert IngestionRejectClassification.is_critical(None)


def _hash_of(request: IngestionRequest) -> str:
    """要求の内容ハッシュを求める。

    Parameters
    ----------
    request : IngestionRequest
        要求。

    Returns
    -------
    str
        内容ハッシュ。
    """
    return stable_id("content", request.normalized_body)


def _version_of(request: IngestionRequest) -> str:
    """要求のバージョン ID を求める。

    Parameters
    ----------
    request : IngestionRequest
        要求。

    Returns
    -------
    str
        バージョン ID。
    """
    return stable_id(
        "version", f"{request.tenant_id}:{request.source_ref}:{_hash_of(request)}"
    )


def test_lifecycle_replace_and_delete_in_memory() -> None:
    """メモリ上のライフサイクル: 置き換え後は古いバージョンで削除できず、新しいバージョンで削除できること"""
    runtime = IngestionRuntime()
    request = _request()
    runtime.ingest(request)
    replaced = runtime.replace_source(
        SourceLifecycleRequest.replace(
            "tenant", "source", _version_of(request), "hash-2"
        )
    )
    assert replaced.succeeded and replaced.replacement_registered
    assert replaced.previous_version_id == _version_of(request)
    stale = runtime.delete_source(
        SourceLifecycleRequest.delete(
            "tenant", "source", _version_of(request), "reason"
        )
    )
    assert stale.failure_code == "LIFECYCLE_STALE_VERSION"
    deleted = runtime.delete_source(
        SourceLifecycleRequest.delete(
            "tenant", "source", replaced.current_version_id, "no longer needed"
        )
    )
    assert deleted.succeeded and deleted.affected_versions == 1
    missing = runtime.delete_source(
        SourceLifecycleRequest.delete("tenant", "source", "v", "reason")
    )
    assert missing.failure_code == "LIFECYCLE_SOURCE_NOT_CURRENT"


@pytest.mark.parametrize(
    ("lifecycle", "code"),
    [
        (
            SourceLifecycleRequest.delete("tenant", "C:\\docs\\a.txt", "v1", "r"),
            "LIFECYCLE_PATH_ONLY_SOURCE_REF",
        ),
        (
            SourceLifecycleRequest.delete("tenant", "a/b", "v1", "r"),
            "LIFECYCLE_PATH_ONLY_SOURCE_REF",
        ),
        (
            SourceLifecycleRequest.delete("tenant", "source:x", "v1", "r"),
            "LIFECYCLE_AMBIGUOUS_SOURCE_REF",
        ),
        (
            SourceLifecycleRequest.delete("tenant", "source", None, "r"),
            "LIFECYCLE_TARGET_REQUIRED",
        ),
    ],
)
def test_lifecycle_rejects_ambiguous_targets(
    lifecycle: SourceLifecycleRequest, code: str
) -> None:
    """パスだけ・曖昧・不足した対象指定は、破壊的な操作を許さないこと"""
    runtime = IngestionRuntime()
    runtime.ingest(_request())
    assert runtime.delete_source(lifecycle).failure_code == code


def test_lifecycle_replace_validates_content_hash_and_delete_reason() -> None:
    """置き換えのハッシュと削除の理由が検証されること"""
    runtime = IngestionRuntime()
    request = _request()
    runtime.ingest(request)
    version = _version_of(request)
    runtime.ingest(_request(source_ref="other", normalized_body="other-body"))
    cases = {
        None: "LIFECYCLE_CONTENT_HASH_REQUIRED",
        "path/value": "LIFECYCLE_CONTENT_HASH_UNSAFE",
        "password=1": "LIFECYCLE_CONTENT_HASH_UNSAFE",
        _hash_of(request): "LIFECYCLE_CONTENT_HASH_UNCHANGED",
        _hash_of(
            _request(normalized_body="other-body")
        ): "LIFECYCLE_CONTENT_HASH_COLLISION",
    }
    for new_hash, code in cases.items():
        result = runtime.replace_source(
            SourceLifecycleRequest.replace("tenant", "source", version, new_hash)
        )
        assert result.failure_code == code, new_hash
    for reason in (None, "jdbc:postgresql://x", "bad\u0001text", "{json}"):
        result = runtime.delete_source(
            SourceLifecycleRequest.delete("tenant", "source", version, reason)
        )
        assert result.failure_code == "LIFECYCLE_DELETE_REASON_REQUIRED"


def test_lifecycle_request_and_result_normalization() -> None:
    """ライフサイクルの要求は前後の空白を除き、失敗の結果は要約を持つこと"""
    request = SourceLifecycleRequest.replace(" tenant ", " source ", " v1 ", " hash ")
    assert request.new_content_hash == "hash"
    assert SourceLifecycleRequest.replace(
        "t", "s", "v", "abc\u0001"
    ).new_content_hash_looks_unsafe()
    failure = SourceLifecycleResult.failure(None, "LIFECYCLE_CONTENT_HASH_UNSAFE")
    assert failure.operation == "unknown"
    assert failure.failure_summary == "Replacement content hash is invalid."
    delete_failure = SourceLifecycleResult.failure(
        SourceLifecycleRequest.delete("t", "s", "v", "r"),
        "LIFECYCLE_DELETE_REASON_REQUIRED",
    )
    assert delete_failure.operation == "delete"


def test_lifecycle_failure_from_the_adapter_becomes_lifecycle_failed() -> None:
    """保存先が例外を投げたら LIFECYCLE_FAILED の失敗になること"""

    class Broken(InMemoryIngestionPersistenceAdapter):
        """置き換えで失敗する保存先。"""

        def replace_source(
            self, request: SourceLifecycleRequest
        ) -> SourceLifecycleResult:
            """常に失敗する。

            Parameters
            ----------
            request : SourceLifecycleRequest
                要求。

            Raises
            ------
            RuntimeError
                常に送出する。
            """
            raise RuntimeError("boom")

    result = IngestionRuntime(Broken()).replace_source(
        SourceLifecycleRequest.replace("t", "s", "v", "h")
    )
    assert result.failure_code == "LIFECYCLE_FAILED"


def test_default_adapter_lifecycle_is_unsupported() -> None:
    """既定のインターフェースの置き換え・削除は LIFECYCLE_UNSUPPORTED になること"""
    from generative_ai_core.graphrag.ingestion import BaseIngestionPersistenceAdapter

    adapter = BaseIngestionPersistenceAdapter()
    request = SourceLifecycleRequest.delete("t", "s", "v", "r")
    assert adapter.delete_source(request).failure_code == "LIFECYCLE_UNSUPPORTED"
    assert adapter.schema_readiness().ready


def test_deterministic_extraction_markers() -> None:
    """マーカーと識別子から、エンティティ・エッジ・識別子が決定的に抽出されること"""
    body = (
        "see DOC-2024-0001 and policy-x ticket-12 TICKET-7 POLICY-AB1-2\n"
        "[[ENTITY:Feature:alpha]] [[ENTITY:Team:beta]] [[ENTITY:Feature:alpha]]\n"
        "[[EDGE:alpha->beta:OWNS]] [[EDGE:alpha->missing:OWNS]]"
    )
    extraction = IngestionDeterministicExtractor().extract(body)
    assert [i.identifier_value_norm for i in extraction.identifiers] == [
        "DOC-2024-0001",
        "POLICY-AB1-2",
        "TICKET-7",
    ]
    assert [e.entity_type for e in extraction.entities] == ["Feature", "Team"]
    assert len(extraction.edges) == 1
    edge = extraction.edges[0]
    assert edge.source_entity_id == extraction.entities[0].entity_id
    assert edge.target_entity_id == extraction.entities[1].entity_id
    again = IngestionDeterministicExtractor().extract(body)
    assert again == extraction
    assert (
        IngestionDeterministicExtractor().extract(None) == IngestionExtraction.empty()
    )
