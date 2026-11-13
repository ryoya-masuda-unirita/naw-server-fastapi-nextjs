"""output と rollback の単体テスト。

移植元 embedding-adapter/src/test の output/（JobOutputRunContextTest・
JobOutcomeMarkerWriterTest）と rollback/CompensatingDeleteHookContractTest を移したもの。
"""

import os
from pathlib import Path

from embedding_adapter.output import (
    JobOutcomeMarkerWriter,
    JobOutputRunContext,
    Outcome,
)
from embedding_adapter.rollback import (
    FileCommittedRowTracker,
    GraphCandidateCompensatingDeleteHook,
)
from generative_ai_core.network import CoreNetworkSetting
from generative_ai_core.vector import (
    CommittedRow,
    CompensatingDeleteOutcome,
    CompensatingDeleteOwnershipScope,
    CompensatingDeleteRequest,
    CoreVectorDbTarget,
    OverallStatus,
    RowOutcome,
    RowStatus,
)

REJECT_CODE = "LLM_CANDIDATE_OUTPUT_REJECTED"


def test_is_rejected_returns_false_for_none_or_blank() -> None:
    """None と空白のパスは拒否済みにならないこと"""
    context = JobOutputRunContext.enabled()
    assert not context.is_rejected(None)
    assert not context.is_rejected("  ")


def test_compute_outcome_is_success_without_signals() -> None:
    """何も記録がなければ SUCCESS になること"""
    assert JobOutputRunContext.enabled().compute_outcome() == Outcome.SUCCESS


def test_disabled_context_ignores_marks() -> None:
    """無効なコンテキストは記録を無視すること"""
    context = JobOutputRunContext.disabled()
    context.mark_learnable_reject("Z:\\fixture\\reject.pdf")
    context.mark_fail_closed()
    assert not context.is_enabled()
    assert not context.is_rejected("Z:\\fixture\\reject.pdf")
    assert context.compute_outcome() == Outcome.SUCCESS


def test_enabled_context_tracks_rejected_paths_and_outcomes() -> None:
    """有効なコンテキストが拒否パスを覚え、WARNING・ERROR を返すこと"""
    context = JobOutputRunContext.enabled()
    context.mark_learnable_reject("Z:\\fixture\\reject-a.pdf")
    context.mark_learnable_reject("Z:\\fixture\\reject-a.pdf")
    assert context.is_rejected(" Z:\\fixture\\reject-a.pdf ")
    assert context.compute_outcome() == Outcome.WARNING
    context.mark_fail_closed()
    assert context.compute_outcome() == Outcome.ERROR


def test_blank_reject_path_does_not_mark_rejected() -> None:
    """空のパスでは拒否済みにならず、WARNING にはなること"""
    context = JobOutputRunContext.enabled()
    context.mark_learnable_reject("  ")
    assert not context.is_rejected("ignored")
    assert context.compute_outcome() == Outcome.WARNING


def test_marker_writer_skips_none_arguments(tmp_path: Path) -> None:
    """引数が None のときは何も書かないこと"""
    writer = JobOutcomeMarkerWriter()
    writer.write(None, Outcome.SUCCESS)
    writer.write(tmp_path, None)
    assert list(tmp_path.iterdir()) == []


def test_marker_writer_creates_expected_file(tmp_path: Path) -> None:
    """結果のマーカーファイルが見出しと結果の行で作られること"""
    JobOutcomeMarkerWriter().write(tmp_path, Outcome.WARNING)
    marker = tmp_path / JobOutcomeMarkerWriter.FILE_NAME
    lines = marker.read_text(encoding="utf-8").splitlines()
    assert lines[0] == "outcome\trecordedAt"
    assert lines[1].startswith("WARNING\t")
    JobOutcomeMarkerWriter().write(tmp_path / "nested", Outcome.ERROR)
    nested = (tmp_path / "nested" / JobOutcomeMarkerWriter.FILE_NAME).read_text()
    assert nested.startswith("outcome\trecordedAt" + "\n" + "ERROR\t")


def test_marker_writer_does_not_raise_on_io_failure(tmp_path: Path) -> None:
    """出力先を作れなくても例外にならないこと"""
    blocker = tmp_path / "file"
    blocker.write_text("x")
    JobOutcomeMarkerWriter().write(blocker / "sub", Outcome.SUCCESS)


def _row(tenant: str, source: str, vector_row: str, chunk: str) -> CommittedRow:
    """テスト用のコミット済みの行を作る。

    Parameters
    ----------
    tenant : str
        テナント ID。
    source : str
        取り込み元の参照。
    vector_row : str
        ベクトル行の ID。
    chunk : str
        チャンク ID。

    Returns
    -------
    CommittedRow
        行。
    """
    return CommittedRow(
        tenant,
        source,
        source,
        "run-1",
        "postgresql",
        "database",
        "vector_store",
        "embedding_graph",
        vector_row,
        chunk,
    )


def _scope(tenant: str, source: str) -> CompensatingDeleteOwnershipScope:
    """テスト用の所有範囲を作る。

    Parameters
    ----------
    tenant : str
        テナント ID。
    source : str
        取り込み元の参照。

    Returns
    -------
    CompensatingDeleteOwnershipScope
        所有範囲。
    """
    return CompensatingDeleteOwnershipScope(
        tenant,
        source,
        source,
        "run-1",
        "postgresql",
        "database",
        "vector_store",
        "embedding_graph",
    )


class RecordingService:
    """所有範囲が一致する行だけを「削除」したことにして記録する偽の補償削除サービス。"""

    def __init__(self) -> None:
        """記録を空にして作る。"""
        self.deleted: list[str] = []
        self.force_partial = False

    def execute(self, request: CompensatingDeleteRequest) -> CompensatingDeleteOutcome:
        """一致する行を削除済みとして記録し、結果を返す。

        Parameters
        ----------
        request : CompensatingDeleteRequest
            補償削除の要求。

        Returns
        -------
        CompensatingDeleteOutcome
            結果。対象がなければ SKIPPED。
        """
        rows = request.committed_row_ids.rows
        if not rows:
            return CompensatingDeleteOutcome.skipped(
                request.trigger_failure_code, "src", request.reject_chunk_id, 0
            )
        outcomes: list[RowOutcome] = []
        for row in rows:
            if request.ownership_scope.matches(row):
                self.deleted.append(row.vector_row_id)
                outcomes.append(RowOutcome(status=RowStatus.DELETED))
            else:
                outcomes.append(RowOutcome(status=RowStatus.BLOCKED))
        if self.force_partial:
            return CompensatingDeleteOutcome.partial(
                request.trigger_failure_code,
                "src",
                request.reject_chunk_id,
                outcomes,
                1,
            )
        return CompensatingDeleteOutcome.completed(
            request.trigger_failure_code, "src", request.reject_chunk_id, outcomes, 1
        )


def _hook(
    tracker: FileCommittedRowTracker, service: RecordingService
) -> GraphCandidateCompensatingDeleteHook:
    """偽のサービスを使うフックを作る。

    Parameters
    ----------
    tracker : FileCommittedRowTracker
        トラッカー。
    service : RecordingService
        偽のサービス。

    Returns
    -------
    GraphCandidateCompensatingDeleteHook
        フック。
    """
    return GraphCandidateCompensatingDeleteHook(tracker, service)  # type: ignore[arg-type]


def _execute(
    hook: GraphCandidateCompensatingDeleteHook,
    scope: CompensatingDeleteOwnershipScope,
) -> CompensatingDeleteOutcome:
    """フックを実行する。

    Parameters
    ----------
    hook : GraphCandidateCompensatingDeleteHook
        フック。
    scope : CompensatingDeleteOwnershipScope
        所有範囲。

    Returns
    -------
    CompensatingDeleteOutcome
        結果。
    """
    return hook.execute(
        scope,
        "source-a",
        REJECT_CODE,
        "chunk-a",
        CoreNetworkSetting.defaults(),
        CoreVectorDbTarget(),
    )


def test_cross_scope_rows_stay_blocked() -> None:
    """所有範囲の違う行は削除されずブロックされること"""
    tracker = FileCommittedRowTracker()
    service = RecordingService()
    hook = _hook(tracker, service)
    tracker.register("source-a", _row("tenant-a", "source-a", "row-a", "chunk-a"))
    tracker.register("source-a", _row("tenant-other", "source-a", "row-b", "chunk-b"))
    outcome = _execute(hook, _scope("tenant-a", "source-a"))
    statuses = [r.status for r in outcome.row_outcomes]
    assert RowStatus.DELETED in statuses and RowStatus.BLOCKED in statuses
    assert service.deleted == ["row-a"]


def test_rerun_is_idempotent() -> None:
    """再実行は SKIPPED になり、最初の結果は完了であること"""
    tracker = FileCommittedRowTracker()
    hook = _hook(tracker, RecordingService())
    tracker.register("source-a", _row("tenant-a", "source-a", "row-a", "chunk-a"))
    scope = _scope("tenant-a", "source-a")
    assert _execute(hook, scope).overall_status == OverallStatus.COMPLETED
    assert _execute(hook, scope).overall_status == OverallStatus.SKIPPED
    assert tracker.is_rollback_completed("source-a")


def test_partial_failure_records_outcome_and_keeps_rows() -> None:
    """一部失敗は例外にならず結果が残り、行の登録は消えないこと"""
    tracker = FileCommittedRowTracker()
    service = RecordingService()
    service.force_partial = True
    hook = _hook(tracker, service)
    tracker.register("source-a", _row("tenant-a", "source-a", "row-a", "chunk-a"))
    _execute(hook, _scope("tenant-a", "source-a"))
    last = hook.last_outcome("source-a")
    assert last is not None and last.overall_status == OverallStatus.PARTIAL
    assert not tracker.is_rollback_completed("source-a")
    assert not tracker.file_rows("source-a").is_empty()


def test_tracker_handles_blank_inputs_and_debug_counts() -> None:
    """トラッカーが空の入力を無視し、重複を除いて件数を返すこと"""
    tracker = FileCommittedRowTracker()
    tracker.register("", None)
    tracker.register(None, _row("tenant-a", "source-a", "row-x", "chunk-x"))
    tracker.register("source-a", None)
    tracker.register("source-a", _row("tenant-a", "source-a", "", "chunk-empty"))
    tracker.register("source-a", _row("tenant-a", "source-a", "row-a", "chunk-a"))
    tracker.register("source-a", _row("tenant-a", "source-a", "row-a", "chunk-a"))
    assert len(tracker.file_rows("source-a").rows) == 1
    assert tracker.debug_counts() == {"source-a": 1}
    tracker.clear(None)
    tracker.clear("")
    tracker.mark_rollback_completed(None)
    tracker.mark_rollback_completed("")
    tracker.clear("source-a")
    assert tracker.file_rows("source-a").rows == ()
    assert tracker.debug_counts() is None


def test_should_execute_uses_reject_code_or_rollback_completion() -> None:
    """拒否コードか補償削除済みのときだけ実行すべきと判断されること"""
    tracker = FileCommittedRowTracker()
    hook = _hook(tracker, RecordingService())
    assert hook.should_execute("source-a", REJECT_CODE)
    assert not hook.should_execute("source-a", "LLM_CANDIDATE_PROVIDER_REQUEST_FAILED")
    tracker.mark_rollback_completed("source-a")
    assert hook.should_execute("source-a", None)


def test_hook_falls_back_when_dependencies_are_none() -> None:
    """依存が None でも既定のトラッカーとサービスで動くこと"""
    hook = GraphCandidateCompensatingDeleteHook(None, None)
    outcome = _execute(hook, _scope("tenant-a", "source-a"))
    assert outcome.overall_status == OverallStatus.SKIPPED
    assert hook.last_outcome("source-a") is not None
    assert os.name  # 使われない import を避けるための参照
