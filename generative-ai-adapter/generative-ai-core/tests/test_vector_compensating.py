"""補償削除サービスのテスト。ベクトルDB の runtime は層ごとに応答を決める偽物に差し替える。

移植元の次のテストを移した。
- vector/CompensatingDeleteServiceCoverageTest
- vector/contract/CompensatingDeleteContractTest, CompensatingDeleteServiceBranchTest
"""

from dataclasses import dataclass, field
from typing import cast

from generative_ai_core.failure import CoreFailure
from generative_ai_core.vector import (
    CommittedRow,
    CommittedRowIds,
    CompensatingDeleteOutcome,
    CompensatingDeleteOwnershipScope,
    CompensatingDeleteRequest,
    CompensatingDeleteService,
    CoreGraphWriteResult,
    CoreGraphWriteStatus,
    CoreVectorDbOperation,
    CoreVectorDbRequest,
    CoreVectorDbResult,
    CoreVectorDbRuntime,
    LayerStatus,
    OverallStatus,
    RowStatus,
)
from generative_ai_core.vector.compensating_constants import (
    LAYER_GRAPH_RAG,
    LAYER_VECTOR,
    METADATA_COMPENSATING_LAYER,
)

TRIGGER = "LLM_CANDIDATE_OUTPUT_REJECTED"
ROW = CommittedRow(
    "t1", "s1", "s1", "s1", "PostgreSQL", "db", "tbl", "g1", "v1", "c1", ("e1",)
)
SCOPE = CompensatingDeleteOwnershipScope(
    "t1", "s1", "s1", "s1", "PostgreSQL", "db", "tbl", "g1"
)


@dataclass
class FakeRuntime:
    """層ごとに応答を決める偽の runtime。"""

    vector: CoreVectorDbResult = field(
        default_factory=lambda: CoreVectorDbResult.ok("", CoreVectorDbOperation.DELETE)
    )
    age: CoreVectorDbResult = field(
        default_factory=lambda: CoreVectorDbResult.ok(
            "", CoreVectorDbOperation.GRAPH_DELETE
        )
    )
    graph_rag: CoreVectorDbResult = field(
        default_factory=lambda: CoreVectorDbResult.ok("", CoreVectorDbOperation.DELETE)
    )
    requests: list[CoreVectorDbRequest] = field(default_factory=list)

    def execute(self, request: CoreVectorDbRequest) -> CoreVectorDbResult:
        """要求を記録し、層に応じた応答を返す。

        Parameters
        ----------
        request : CoreVectorDbRequest
            要求。

        Returns
        -------
        CoreVectorDbResult
            層に応じた応答。
        """
        self.requests.append(request)
        if request.operation == CoreVectorDbOperation.GRAPH_DELETE:
            return self.age
        if request.metadata.get(METADATA_COMPENSATING_LAYER) == LAYER_VECTOR:
            return self.vector
        return self.graph_rag


def _service(runtime: FakeRuntime) -> CompensatingDeleteService:
    """偽の runtime で補償削除サービスを作る。

    Parameters
    ----------
    runtime : FakeRuntime
        偽の runtime。

    Returns
    -------
    CompensatingDeleteService
        サービス。
    """
    return CompensatingDeleteService(cast(CoreVectorDbRuntime, runtime))


def _request(
    rows: list[CommittedRow] | None = None,
    trigger: str = TRIGGER,
    graph_write_enabled: bool = True,
) -> CompensatingDeleteRequest:
    """テスト用の補償削除の要求を作る。

    Parameters
    ----------
    rows : list[CommittedRow] | None
        コミット済みの行。省略時は 1 行。
    trigger : str
        契機の失敗コード。
    graph_write_enabled : bool
        Graph 書き込みが有効か。

    Returns
    -------
    CompensatingDeleteRequest
        要求。
    """
    return CompensatingDeleteRequest(
        SCOPE,
        CommittedRowIds.of(rows if rows is not None else [ROW]),
        trigger,
        graph_write_enabled,
        "c1",
    )


def _fail(
    code: str, summary: str = "x", graph: CoreGraphWriteResult | None = None
) -> CoreVectorDbResult:
    """失敗の結果を作る。

    Parameters
    ----------
    code : str
        失敗コード。
    summary : str
        要約。
    graph : CoreGraphWriteResult | None
        Graph の結果。

    Returns
    -------
    CoreVectorDbResult
        失敗の結果。
    """
    return CoreVectorDbResult.fail(
        CoreVectorDbOperation.DELETE, CoreFailure.of(code, summary), graph
    )


def test_all_layers_deleted_completes() -> None:
    """3 層とも削除できれば COMPLETED で、層ごとの要求を送ること"""
    runtime = FakeRuntime()
    outcome = _service(runtime).execute(_request())
    assert outcome.overall_status == OverallStatus.COMPLETED
    row = outcome.row_outcomes[0]
    assert row.status == RowStatus.DELETED
    assert (
        row.vector_layer_status,
        row.age_layer_status,
        row.graph_rag_layer_status,
    ) == (
        LayerStatus.DELETED,
        LayerStatus.DELETED,
        LayerStatus.DELETED,
    )
    layers = [r.metadata.get(METADATA_COMPENSATING_LAYER) for r in runtime.requests]
    assert layers == [LAYER_VECTOR, None, LAYER_GRAPH_RAG]
    assert runtime.requests[0].provider_id == "postgresql"
    assert runtime.requests[0].payload.id == "v1"
    assert runtime.requests[0].metadata["tenantId"] == "t1"
    assert runtime.requests[1].graph_write_setting.enabled
    assert runtime.requests[1].graph_write_setting.graph_name == "g1"
    assert runtime.requests[1].graph_chunk_payload.delete_vector_row_ids == ("v1",)
    assert outcome.safe_source_ref_hash == CompensatingDeleteOutcome.safe_hash("s1")
    assert outcome.affected_chunk_count == 1


def test_non_trigger_code_is_skipped_without_calls() -> None:
    """契機でない失敗コードでは何も実行しないこと"""
    runtime = FakeRuntime()
    outcome = _service(runtime).execute(_request(trigger="OTHER"))
    assert outcome.overall_status == OverallStatus.SKIPPED
    assert runtime.requests == []


def test_null_request_and_empty_rows_are_skipped() -> None:
    """要求が None または行が空なら SKIPPED になること"""
    runtime = FakeRuntime()
    assert _service(runtime).execute(None).overall_status == OverallStatus.SKIPPED
    assert (
        _service(runtime).execute(_request(rows=[])).overall_status
        == OverallStatus.SKIPPED
    )
    assert runtime.requests == []


def test_row_outside_ownership_scope_is_blocked() -> None:
    """所有範囲外の行はブロックされ、何も実行しないこと"""
    runtime = FakeRuntime()
    other = CommittedRow(
        "other", "s1", "s1", "s1", "PostgreSQL", "db", "tbl", "g1", "v9", "c9"
    )
    outcome = _service(runtime).execute(_request(rows=[other]))
    assert outcome.overall_status == OverallStatus.SKIPPED
    assert outcome.row_outcomes[0].status == RowStatus.BLOCKED
    assert outcome.row_outcomes[0].reason == "cross_scope_blocked"
    assert runtime.requests == []


def test_graph_write_disabled_skips_age_layer() -> None:
    """Graph 書き込みが無効なら AGE 層は DISABLED で実行しないこと"""
    runtime = FakeRuntime()
    outcome = _service(runtime).execute(_request(graph_write_enabled=False))
    row = outcome.row_outcomes[0]
    assert row.age_layer_status == LayerStatus.DISABLED
    assert row.age_layer_reason == "graph_write_disabled"
    assert all(
        r.operation != CoreVectorDbOperation.GRAPH_DELETE for r in runtime.requests
    )


def test_empty_graph_rag_metadata_skips_graph_rag_layer() -> None:
    """テナントかチャンク ID がなければ GraphRAG 層をスキップすること"""
    runtime = FakeRuntime()
    row = CommittedRow(
        "t1", "s1", "s1", "s1", "PostgreSQL", "db", "tbl", "g1", "v1", ""
    )
    outcome = _service(runtime).execute(_request(rows=[row]))
    result = outcome.row_outcomes[0]
    assert result.graph_rag_layer_status == LayerStatus.SKIPPED
    assert result.graph_rag_layer_reason == "empty_metadata"


def test_already_absent_everywhere_is_skipped() -> None:
    """どの層も対象がなければ SKIPPED になること"""
    runtime = FakeRuntime(
        vector=_fail("TARGET_NOT_FOUND", "delete id missing"),
        age=CoreVectorDbResult.ok(
            "",
            CoreVectorDbOperation.GRAPH_DELETE,
            CoreGraphWriteResult.absent_skipped([], "graph_node_unwritten"),
        ),
        graph_rag=CoreVectorDbResult.ok(
            "",
            CoreVectorDbOperation.DELETE,
            CoreGraphWriteResult.absent_skipped([], "already_absent"),
        ),
    )
    outcome = _service(runtime).execute(_request())
    row = outcome.row_outcomes[0]
    assert outcome.overall_status == OverallStatus.SKIPPED
    assert row.status == RowStatus.SKIPPED
    assert row.reason == "already_absent"
    assert row.age_layer_reason == "graph_node_unwritten"


def test_one_layer_failed_and_one_deleted_is_partial() -> None:
    """失敗した層と削除できた層が混在すれば PARTIAL になること"""
    runtime = FakeRuntime(vector=_fail("PROVIDER_FAILURE", "db down"))
    outcome = _service(runtime).execute(_request(rows=[ROW, ROW]))
    assert outcome.overall_status == OverallStatus.FAILED
    mixed = FakeRuntime(graph_rag=_fail("GRAPH_RAG_CHUNK_DELETE_FAILED"))
    partial = _service(mixed).execute(_request())
    assert partial.overall_status == OverallStatus.FAILED
    assert partial.row_outcomes[0].reason == "graph_rag_delete_failure"
    # 行 1 は成功、行 2 は失敗にして PARTIAL を作る
    calls = {"n": 0}

    class Alternating(FakeRuntime):
        """2 行目の vector 層だけ失敗させる偽の runtime。"""

        def execute(self, request: CoreVectorDbRequest) -> CoreVectorDbResult:
            """vector 層の 2 回目の呼び出しだけ失敗にする。

            Parameters
            ----------
            request : CoreVectorDbRequest
                要求。

            Returns
            -------
            CoreVectorDbResult
                応答。
            """
            if request.metadata.get(METADATA_COMPENSATING_LAYER) == LAYER_VECTOR:
                calls["n"] += 1
                if calls["n"] == 2:
                    return _fail("PROVIDER_FAILURE")
            return super().execute(request)

    result = _service(Alternating()).execute(_request(rows=[ROW, ROW]))
    assert result.overall_status == OverallStatus.PARTIAL


def test_age_layer_failure_reasons() -> None:
    """AGE 層の失敗は分類に応じた理由になり、形式エラーは対象不在扱いにしないこと"""
    unavailable = CoreGraphWriteResult.failure(
        CoreGraphWriteStatus.FAILED_EXTENSION_UNAVAILABLE,
        "",
        ["v1"],
        "m",
        "GRAPH_PERMISSION_DENIED",
    )
    runtime = FakeRuntime(age=_fail("GRAPH_PERMISSION_DENIED", "denied", unavailable))
    outcome = _service(runtime).execute(_request())
    assert outcome.row_outcomes[0].age_layer_status == LayerStatus.FAILED
    assert outcome.row_outcomes[0].age_layer_reason == "graph_permission_denied"

    malformed = FakeRuntime(
        age=_fail("GRAPH_MALFORMED_RESULT", "Malformed graph operation result.")
    )
    result = _service(malformed).execute(_request())
    assert result.row_outcomes[0].age_layer_status == LayerStatus.FAILED
    assert result.row_outcomes[0].age_layer_reason == "provider_failure"


def test_age_layer_benign_absence_message_is_skipped() -> None:
    """AGE 層が「すでにない」旨の失敗ならスキップすること"""
    runtime = FakeRuntime(
        age=_fail("GRAPH_WRITE_FAILURE", "graph_node_unwritten for chunk")
    )
    outcome = _service(runtime).execute(_request())
    assert outcome.row_outcomes[0].age_layer_status == LayerStatus.SKIPPED
    assert outcome.row_outcomes[0].age_layer_reason == "already_absent"


def test_is_already_absent_does_not_hide_real_graph_failures() -> None:
    """本物の Graph 失敗は「not found」を含んでも対象不在にしないこと"""
    service = CompensatingDeleteService(cast(CoreVectorDbRuntime, FakeRuntime()))
    assert service.is_already_absent(CoreFailure.of("TARGET_NOT_FOUND", "x"))
    assert service.is_already_absent(CoreFailure.of("X", "Target vector row not found"))
    assert not service.is_already_absent(
        CoreFailure.of("GRAPH_UNAVAILABLE", "graph_node_unwritten")
    )
    assert not service.is_already_absent(
        CoreFailure.of("X", "AGE graph is unavailable or missing.")
    )
    assert not service.is_already_absent(
        CoreFailure.of("GRAPH_MALFORMED_RESULT", "graph_node_unwritten")
    )
    assert not service.is_already_absent(None)


def test_request_trigger_and_defaults() -> None:
    """要求は契機のコードだけを有効とし、未指定を既定値で補うこと"""
    assert _request().trigger_enabled()
    assert not _request(trigger="OTHER").trigger_enabled()
    empty = CompensatingDeleteRequest()
    assert empty.committed_row_ids.is_empty()
    assert empty.network_setting is not None
    assert empty.target is not None
