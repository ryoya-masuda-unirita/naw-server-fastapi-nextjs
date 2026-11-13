"""audit の単体テスト。

移植元 embedding-adapter/src/test の audit/ 配下のテスト
（RejectAuditTsvWriterContractTest・GraphCandidateRepairMetricsSessionTest・
RejectAuditTsvSessionLifecycleTest のうち App に依存しない部分）を移したもの。
"""

import os
import stat
from datetime import UTC, datetime
from pathlib import Path

import pytest
from embedding_adapter.audit import (
    AppendOutcome,
    GraphCandidateRejectAuditWriter,
    GraphCandidateRepairMetricsSession,
    RejectAuditOutputConfig,
    RejectAuditPathValidator,
    RejectAuditTsvFilename,
    RejectAuditTsvRow,
    RejectAuditTsvSession,
    format_instant,
)
from generative_ai_core.graphrag.ingestion import (
    GraphCandidateRepairOutcome,
    IngestionResult,
)
from generative_ai_core.vector import CompensatingDeleteOutcome

RUN_START = datetime(2026, 6, 26, 15, 30, 45, 123000, tzinfo=UTC)
SECOND_REJECT = datetime(2026, 6, 26, 15, 31, 10, 456000, tzinfo=UTC)
HEADER = "filePath\tfailureCode\trejectedAt"
REJECT_CODE = "LLM_CANDIDATE_OUTPUT_REJECTED"
POLICY_PATH = "Z:\\customers\\acme\\docs\\policy-2024.pdf"


def _root(tmp_path: Path) -> Path:
    """監査の出力ディレクトリを作る。

    Parameters
    ----------
    tmp_path : Path
        テスト用の一時ディレクトリ。

    Returns
    -------
    Path
        作ったディレクトリ。
    """
    root = tmp_path / "audit-root"
    root.mkdir()
    return root


def _lines(path: Path | None) -> list[str]:
    """ファイルの行を読む。

    Parameters
    ----------
    path : Path | None
        ファイルのパス。

    Returns
    -------
    list[str]
        行の一覧（改行なし）。
    """
    assert path is not None
    return path.read_text(encoding="utf-8").splitlines()


def _learnable_reject_result() -> IngestionResult:
    """学習可能な拒否の取り込み結果を作る。

    Returns
    -------
    IngestionResult
        受理済みで LLM 候補出力の拒否コードを持つ結果。
    """
    return IngestionResult(accepted=True).with_learnable_reject(REJECT_CODE, "summary")


def test_format_instant_matches_java_instant_to_string() -> None:
    """format_instant が Java の Instant.toString と同じ書式になること"""
    assert format_instant(RUN_START) == "2026-06-26T15:30:45.123Z"
    assert format_instant(datetime(2026, 6, 26, 15, 30, 45, tzinfo=UTC)) == (
        "2026-06-26T15:30:45Z"
    )
    assert format_instant(datetime(2026, 6, 26, 15, 30, 45, 123456, tzinfo=UTC)) == (
        "2026-06-26T15:30:45.123456Z"
    )


def test_run_start_creates_tsv_with_header_and_appends_reject(tmp_path: Path) -> None:
    """実行開始で見出し付き TSV が作られ、拒否の行が追記されること"""
    root = _root(tmp_path)
    session = RejectAuditTsvSession.open(
        RejectAuditOutputConfig.from_resolved_path(root), RUN_START
    )
    assert session.enabled()
    target = session.target_file()
    assert target is not None
    assert target.name == "graph-candidate-rejects-20260626T153045Z.tsv"
    assert (
        session.append_reject(POLICY_PATH, REJECT_CODE, RUN_START)
        == AppendOutcome.ROW_APPENDED
    )
    assert _lines(target) == [
        HEADER,
        f"{POLICY_PATH}\t{REJECT_CODE}\t2026-06-26T15:30:45.123Z",
    ]


def test_disabled_config_does_not_write_tsv(tmp_path: Path) -> None:
    """無効な設定では TSV が作られないこと"""
    root = _root(tmp_path)
    session = RejectAuditTsvSession.open(RejectAuditOutputConfig.disabled(), RUN_START)
    assert not session.enabled()
    assert list(root.iterdir()) == []


def test_disabled_session_has_no_root_or_run_start() -> None:
    """無効なセッションは出力先も開始時刻も持たず、追記は SESSION_DISABLED になること"""
    session = RejectAuditTsvSession.disabled()
    assert session.root() is None and session.run_started_at() is None
    assert session.append_reject("Z:\\doc.pdf", REJECT_CODE, RUN_START) == (
        AppendOutcome.SESSION_DISABLED
    )


def test_filename_matches_contract_and_rejects_none() -> None:
    """ファイル名が規約どおりで、None は拒否されること"""
    assert RejectAuditTsvFilename.format(RUN_START) == (
        "graph-candidate-rejects-20260626T153045Z.tsv"
    )
    with pytest.raises(ValueError):
        RejectAuditTsvFilename.format(None)


def test_containment_checks(tmp_path: Path) -> None:
    """出力ディレクトリの内側は含まれ、外側は含まれないこと"""
    root = _root(tmp_path)
    target = RejectAuditPathValidator.resolve_target_file(root, "a.tsv")
    assert RejectAuditPathValidator.is_contained(root, target)
    assert RejectAuditPathValidator.is_contained(root, root / "missing" / "file.tsv")
    assert not RejectAuditPathValidator.is_contained(root, tmp_path / "outside.tsv")


def test_containment_violation_does_not_append_row(tmp_path: Path) -> None:
    """出力ディレクトリの外へは追記されないこと"""
    root = _root(tmp_path)
    session = RejectAuditTsvSession.open(
        RejectAuditOutputConfig.from_resolved_path(root), RUN_START
    )
    escape = tmp_path / "outside.tsv"
    outcome = session.append_reject_to_target(
        root, escape, POLICY_PATH, REJECT_CODE, RUN_START
    )
    assert outcome == AppendOutcome.CONTAINMENT_VIOLATION
    assert not escape.exists()


def test_append_reject_to_target_writes_when_contained(tmp_path: Path) -> None:
    """出力ディレクトリの中なら指定ファイルに追記されること"""
    root = _root(tmp_path)
    session = RejectAuditTsvSession.open(
        RejectAuditOutputConfig.from_resolved_path(root), RUN_START
    )
    target = root / "extra.tsv"
    outcome = session.append_reject_to_target(
        root, target, POLICY_PATH, REJECT_CODE, RUN_START
    )
    assert outcome == AppendOutcome.ROW_APPENDED
    assert len(_lines(target)) == 1


def test_same_file_path_dedupes_to_single_row(tmp_path: Path) -> None:
    """同じファイルパスは 1 行にまとまること"""
    root = _root(tmp_path)
    session = RejectAuditTsvSession.open(
        RejectAuditOutputConfig.from_resolved_path(root), RUN_START
    )
    assert (
        session.append_reject(POLICY_PATH, REJECT_CODE, RUN_START)
        == AppendOutcome.ROW_APPENDED
    )
    assert (
        session.append_reject(POLICY_PATH, REJECT_CODE, SECOND_REJECT)
        == AppendOutcome.ROW_DEDUPED
    )
    assert len(_lines(session.target_file())) == 2


def test_consecutive_runs_create_separate_files(tmp_path: Path) -> None:
    """実行ごとに別の TSV ができること"""
    root = _root(tmp_path)
    config = RejectAuditOutputConfig.from_resolved_path(root)
    first = RejectAuditTsvSession.open(
        config, datetime(2026, 6, 26, 15, 30, 45, tzinfo=UTC)
    )
    first.append_reject("/home/customer/data/spec-sheet.xml", REJECT_CODE, RUN_START)
    second = RejectAuditTsvSession.open(
        config, datetime(2026, 6, 26, 16, 0, 0, tzinfo=UTC)
    )
    second.append_reject("/opt/waha/input/master.txt", REJECT_CODE, RUN_START)
    assert sorted(p.name for p in root.iterdir()) == [
        "graph-candidate-rejects-20260626T153045Z.tsv",
        "graph-candidate-rejects-20260626T160000Z.tsv",
    ]
    assert "spec-sheet.xml" in _lines(first.target_file())[1]
    assert "master.txt" in _lines(second.target_file())[1]


def test_blank_file_path_skips_row(tmp_path: Path) -> None:
    """空のファイルパスは行を作らないこと"""
    root = _root(tmp_path)
    session = RejectAuditTsvSession.open(
        RejectAuditOutputConfig.from_resolved_path(root), RUN_START
    )
    assert session.append_reject("  ", REJECT_CODE, RUN_START) == (
        AppendOutcome.ROW_SKIPPED_NO_FILEPATH
    )
    assert _lines(session.target_file()) == [HEADER]


@pytest.mark.skipif(os.geteuid() == 0, reason="root は書き込み禁止でも書けるため")
def test_io_failure_does_not_raise(tmp_path: Path) -> None:
    """書き込めなくても例外にならず IO_FAILURE を返すこと"""
    root = _root(tmp_path)
    session = RejectAuditTsvSession.open(
        RejectAuditOutputConfig.from_resolved_path(root), RUN_START
    )
    target = session.target_file()
    assert target is not None
    target.chmod(stat.S_IRUSR)
    assert session.append_reject(POLICY_PATH, REJECT_CODE, RUN_START) == (
        AppendOutcome.IO_FAILURE
    )


def test_session_open_failure_returns_disabled_session(tmp_path: Path) -> None:
    """同名のファイルがあって開けないときは無効なセッションになること"""
    root = _root(tmp_path)
    (root / RejectAuditTsvFilename.format(RUN_START)).write_text("existing\n")
    session = RejectAuditTsvSession.open(
        RejectAuditOutputConfig.from_resolved_path(root), RUN_START
    )
    assert not session.enabled()


def test_to_tsv_line_escapes_and_handles_none() -> None:
    """to_tsv_line がタブ・引用符をエスケープし、None を空にすること"""
    row = RejectAuditTsvRow('path\twith"quote', REJECT_CODE, RUN_START)
    assert row.to_tsv_line() == (
        f'"path\twith""quote"\t{REJECT_CODE}\t2026-06-26T15:30:45.123Z'
    )
    assert RejectAuditTsvRow(None, None, RUN_START).to_tsv_line() == (
        "\t\t2026-06-26T15:30:45.123Z"
    )


def test_path_validator_rejects_invalid_directories(tmp_path: Path) -> None:
    """存在しない・ファイル・相対・トラバーサルのパスが拒否されること"""
    with pytest.raises(RuntimeError, match="does not exist"):
        RejectAuditPathValidator.validate_configured_path_string(
            str(tmp_path / "missing")
        )
    file = tmp_path / "not-a-dir"
    file.write_text("x")
    with pytest.raises(RuntimeError, match="must be a directory"):
        RejectAuditPathValidator.validate_configured_path_string(str(file))
    with pytest.raises(RuntimeError, match="path traversal"):
        RejectAuditPathValidator.validate_configured_path_string(f"{tmp_path}/../x")
    with pytest.raises(RuntimeError, match="valid directory path"):
        RejectAuditPathValidator.validate_configured_path_string("relative/dir")


def test_path_validator_blank_and_windows_paths(tmp_path: Path) -> None:
    """空は何もせず、Windows パスは非 Windows では検証を省くこと"""
    RejectAuditPathValidator.validate_configured_path_string(None)
    RejectAuditPathValidator.validate_configured_path_string("   ")
    if os.name != "nt":
        RejectAuditPathValidator.validate_configured_path_string(
            "Z:\\fixture\\reject-audit\\"
        )


def test_from_configured_path(tmp_path: Path) -> None:
    """設定されたパスから有効・無効な設定が作られること"""
    config = RejectAuditPathValidator.from_configured_path(str(tmp_path))
    assert config.enabled
    assert config.resolved_root == Path(os.path.normpath(tmp_path.absolute()))
    assert RejectAuditPathValidator.from_configured_path("") == (
        RejectAuditOutputConfig.disabled()
    )
    assert RejectAuditPathValidator.from_configured_path(None) == (
        RejectAuditOutputConfig.disabled()
    )


def test_output_config_requires_root_when_enabled() -> None:
    """有効な設定には出力先が必要であること"""
    with pytest.raises(ValueError):
        RejectAuditOutputConfig(None, True)


def test_writer_appends_learnable_reject_only(tmp_path: Path) -> None:
    """GraphCandidateRejectAuditWriter が学習可能な拒否だけを追記すること"""
    root = _root(tmp_path)
    session = RejectAuditTsvSession.open(
        RejectAuditOutputConfig.from_resolved_path(root), RUN_START
    )
    source = "/home/customer/data/spec-sheet.xml"
    writer = GraphCandidateRejectAuditWriter
    writer.append_reject(None, _learnable_reject_result(), source)
    writer.append_reject(
        RejectAuditTsvSession.disabled(), _learnable_reject_result(), source
    )
    writer.append_reject(session, None, source)
    writer.append_reject(
        session,
        IngestionResult.rejected(None, "PERSISTENCE_FAILURE", "x", "ready"),
        source,
    )
    writer.append_reject(session, IngestionResult(accepted=True), source)
    writer.append_reject(session, _learnable_reject_result(), None)
    writer.append_reject(session, _learnable_reject_result(), "  ")
    assert _lines(session.target_file()) == [HEADER]
    writer.append_reject(session, _learnable_reject_result(), source)
    lines = _lines(session.target_file())
    assert len(lines) == 2 and lines[1].startswith(f"{source}\t{REJECT_CODE}\t")


def _metrics_session(root: Path) -> GraphCandidateRepairMetricsSession:
    """修復メトリクスのセッションを開く。

    Parameters
    ----------
    root : Path
        監査の出力ディレクトリ。

    Returns
    -------
    GraphCandidateRepairMetricsSession
        メトリクスのセッション。
    """
    audit = RejectAuditTsvSession.open(
        RejectAuditOutputConfig.from_resolved_path(root), RUN_START
    )
    return GraphCandidateRepairMetricsSession.open(audit)


def _repair_result(outcome: GraphCandidateRepairOutcome) -> IngestionResult:
    """修復の結果付きの取り込み結果を作る。

    Parameters
    ----------
    outcome : GraphCandidateRepairOutcome
        修復の結果。

    Returns
    -------
    IngestionResult
        受理済みの結果。
    """
    return IngestionResult(accepted=True).with_graph_candidate_repair_outcome(outcome)


def test_metrics_record_then_flush_counts_and_rates(tmp_path: Path) -> None:
    """メトリクスがメモリに集計され、flush で件数と比率が JSON に出ること"""
    root = _root(tmp_path)
    session = _metrics_session(root)
    session.record(_repair_result(GraphCandidateRepairOutcome.REPAIR_SUCCEEDED))
    session.record(_repair_result(GraphCandidateRepairOutcome.REPAIR_REJECTED))
    session.record(_repair_result(GraphCandidateRepairOutcome.NO_REPAIR))
    session.record_cleanup_outcome(
        CompensatingDeleteOutcome.completed(REJECT_CODE, "file-a", "chunk-1", [], 2)
    )
    session.record_cleanup_outcome(
        CompensatingDeleteOutcome.skipped(REJECT_CODE, "file-b", "chunk-2", 0)
    )
    session.record_cleanup_outcome(
        CompensatingDeleteOutcome.partial(REJECT_CODE, "file-c", "chunk-3", [], 3)
    )
    session.record_cleanup_outcome(
        CompensatingDeleteOutcome.failed(REJECT_CODE, "file-d", "chunk-4", [], 4)
    )
    session.record_post_reject_skipped_chunk()
    metrics_files = list(root.glob("graph-candidate-repair-metrics-*.json"))
    assert metrics_files == []
    session.flush()
    metrics_files = list(root.glob("graph-candidate-repair-metrics-*.json"))
    assert [p.name for p in metrics_files] == [
        "graph-candidate-repair-metrics-20260626T153045Z.json"
    ]
    text = metrics_files[0].read_text(encoding="utf-8")
    for expected in (
        '"schemaVersion":2',
        '"runStartedAt":"2026-06-26T15:30:45.123Z"',
        '"graphCandidateProcessedChunkCount":3',
        '"repairAttemptCount":2',
        '"repairSuccessCount":1',
        '"finalRejectCount":1',
        '"repairSuccessRate":0.5',
        '"finalRejectRate":0.333333',
        '"cleanupAttemptedCount":4',
        '"cleanupCompletedCount":1',
        '"cleanupSkippedCount":1',
        '"cleanupPartialCount":1',
        '"cleanupFailedCount":1',
        '"postRejectSkippedChunkCount":1',
        '"affectedChunkCount":9',
        '"cleanupFailureRate":0.5',
    ):
        assert expected in text
    for forbidden in ("source", "tenant", "chunk", "doc", "hash"):
        assert forbidden not in text.replace(
            "graphCandidateProcessedChunkCount", ""
        ).replace("postRejectSkippedChunkCount", "").replace("affectedChunkCount", "")


def test_metrics_rates_are_null_without_denominator(tmp_path: Path) -> None:
    """分母が 0 の比率は null、分子 0 は 0.0 になること"""
    root = _root(tmp_path)
    session = _metrics_session(root)
    session.record(_repair_result(GraphCandidateRepairOutcome.NO_REPAIR))
    session.flush()
    text = next(root.glob("graph-candidate-repair-metrics-*.json")).read_text()
    assert '"repairSuccessRate":null' in text
    assert '"finalRejectRate":0.0' in text
    assert '"cleanupFailureRate":null' in text


def test_metrics_skip_disabled_rejected_and_not_processed(tmp_path: Path) -> None:
    """無効・拒否・未処理の結果は数えず、無効なセッションは何も書かないこと"""
    GraphCandidateRepairMetricsSession.open(None).record(
        _repair_result(GraphCandidateRepairOutcome.REPAIR_SUCCEEDED)
    )
    disabled = GraphCandidateRepairMetricsSession.disabled()
    disabled.record(_repair_result(GraphCandidateRepairOutcome.REPAIR_SUCCEEDED))
    disabled.record_cleanup_outcome(
        CompensatingDeleteOutcome.completed(REJECT_CODE, "f", "c", [], 1)
    )
    disabled.record_post_reject_skipped_chunk()
    disabled.flush()
    root = _root(tmp_path)
    session = _metrics_session(root)
    session.record(None)
    session.record(IngestionResult.rejected(None, "PERSISTENCE_FAILURE", "x", "ready"))
    session.record(_repair_result(GraphCandidateRepairOutcome.NOT_PROCESSED))
    session.record_cleanup_outcome(None)
    assert list(root.glob("graph-candidate-repair-metrics-*.json")) == []


def test_metrics_write_failure_does_not_raise(tmp_path: Path) -> None:
    """書き込みに失敗しても例外にならないこと"""
    root = _root(tmp_path)
    (root / "graph-candidate-repair-metrics-20260626T153045Z.json").mkdir()
    session = _metrics_session(root)
    session.record(_repair_result(GraphCandidateRepairOutcome.REPAIR_REJECTED))
    session.flush()
