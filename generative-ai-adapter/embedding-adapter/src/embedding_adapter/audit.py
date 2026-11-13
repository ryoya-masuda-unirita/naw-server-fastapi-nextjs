"""Graph Candidate の拒否監査 TSV と修復メトリクス（移植元 embedding.audit）。

出力ファイルの書式（ファイル名・TSV の列・JSON の項目）は移植元と同じ。
"""

import logging
import os
import re
import threading
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal
from enum import Enum
from pathlib import Path

from generative_ai_core.failure import sanitize
from generative_ai_core.graphrag.ingestion import (
    GraphCandidateRepairOutcome,
    IngestionResult,
)
from generative_ai_core.vector import CompensatingDeleteOutcome, OverallStatus

logger = logging.getLogger(__name__)

LLM_CANDIDATE_OUTPUT_REJECTED = "LLM_CANDIDATE_OUTPUT_REJECTED"
TSV_PREFIX = "graph-candidate-rejects-"
TSV_SUFFIX = ".tsv"
METRICS_PREFIX = "graph-candidate-repair-metrics-"
METRICS_SUFFIX = ".json"
TIMESTAMP_FORMAT = "%Y%m%dT%H%M%SZ"
RATE_SCALE = Decimal("0.000001")
_WINDOWS_PATH = re.compile(r"^[a-zA-Z]:\\.*$")

_PATH_TRAVERSAL_MESSAGE = (
    "Graph Candidate reject audit output directory must not contain path traversal."
)
_INVALID_PATH_MESSAGE = (
    "Graph Candidate reject audit output directory must be a valid directory path."
)
_NOT_EXIST_MESSAGE = "Graph Candidate reject audit output directory does not exist."
_NOT_DIRECTORY_MESSAGE = (
    "Graph Candidate reject audit output directory must be a directory."
)
_NOT_WRITABLE_MESSAGE = "Graph Candidate reject audit output directory is not writable."


def format_instant(value: datetime) -> str:
    """時刻を Java の `Instant.toString()` と同じ書式にする。

    Parameters
    ----------
    value : datetime
        時刻（タイムゾーン付き。なければ UTC とみなす）。

    Returns
    -------
    str
        `2026-11-13T03:21:45Z` のような UTC の ISO-8601。小数部は 0 でなければ 3 桁
        または 6 桁で付ける。
    """
    utc = value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)
    text = utc.strftime("%Y-%m-%dT%H:%M:%S")
    micro = utc.microsecond
    if micro == 0:
        return f"{text}Z"
    if micro % 1000 == 0:
        return f"{text}.{micro // 1000:03d}Z"
    return f"{text}.{micro:06d}Z"


def _timestamp(value: datetime) -> str:
    """ファイル名に使う UTC のタイムスタンプにする。

    Parameters
    ----------
    value : datetime
        時刻。

    Returns
    -------
    str
        `yyyyMMdd'T'HHmmss'Z'` 形式の文字列。
    """
    utc = value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)
    return utc.strftime(TIMESTAMP_FORMAT)


def _normalize(path: Path) -> Path:
    """絶対パスにして `.`・`..` を取り除く（Java の toAbsolutePath().normalize()）。

    Parameters
    ----------
    path : Path
        パス。

    Returns
    -------
    Path
        正規化した絶対パス。
    """
    return Path(os.path.normpath(path.absolute()))


@dataclass(frozen=True)
class RejectAuditOutputConfig:
    """拒否監査の出力設定（移植元 RejectAuditOutputConfig）。

    Attributes
    ----------
    resolved_root : Path | None
        出力ディレクトリ。無効のときは None になる。
    enabled : bool
        有効か。
    """

    resolved_root: Path | None
    enabled: bool

    def __post_init__(self) -> None:
        """無効なら出力先を消し、有効で出力先がなければエラーにする。

        Raises
        ------
        ValueError
            有効なのに出力先がないとき。
        """
        if not self.enabled:
            object.__setattr__(self, "resolved_root", None)
        elif self.resolved_root is None:
            raise ValueError("resolvedRoot is required when audit is enabled")

    @classmethod
    def disabled(cls) -> "RejectAuditOutputConfig":
        """無効な設定を作る。

        Returns
        -------
        RejectAuditOutputConfig
            無効な設定。
        """
        return cls(None, False)

    @classmethod
    def from_resolved_path(cls, resolved_root: Path) -> "RejectAuditOutputConfig":
        """出力ディレクトリを指定して有効な設定を作る。

        Parameters
        ----------
        resolved_root : Path
            出力ディレクトリ。

        Returns
        -------
        RejectAuditOutputConfig
            有効な設定。
        """
        return cls(resolved_root, True)


class RejectAuditPathValidator:
    """拒否監査の出力ディレクトリのパス検証。"""

    @staticmethod
    def validate_configured_path_string(configured_path: str | None) -> None:
        """設定されたパス文字列を検証する（空は許す）。

        Parameters
        ----------
        configured_path : str | None
            設定されたパス。

        Raises
        ------
        RuntimeError
            `..` を含む・絶対パスでない・存在しない・ディレクトリでない・
            書き込めないとき。
        """
        if configured_path is None or not configured_path.strip():
            return
        trimmed = configured_path.strip()
        if ".." in trimmed:
            raise RuntimeError(_PATH_TRAVERSAL_MESSAGE)
        is_windows_path = _WINDOWS_PATH.match(trimmed) is not None
        if not is_windows_path and not Path(trimmed).is_absolute():
            raise RuntimeError(_INVALID_PATH_MESSAGE + trimmed)
        if is_windows_path and os.name != "nt":
            return
        RejectAuditPathValidator._validate_resolved_directory(
            RejectAuditPathValidator.resolve_configured_path(trimmed)
        )

    @staticmethod
    def from_configured_path(configured_path: str | None) -> RejectAuditOutputConfig:
        """設定されたパスから出力設定を作る。

        Parameters
        ----------
        configured_path : str | None
            設定されたパス。空なら無効な設定を返す。

        Returns
        -------
        RejectAuditOutputConfig
            出力設定。

        Raises
        ------
        RuntimeError
            パスが不正なとき。
        """
        if configured_path is None or not configured_path.strip():
            return RejectAuditOutputConfig.disabled()
        RejectAuditPathValidator.validate_configured_path_string(configured_path)
        return RejectAuditOutputConfig.from_resolved_path(
            RejectAuditPathValidator.resolve_configured_path(configured_path.strip())
        )

    @staticmethod
    def resolve_configured_path(configured_path: str) -> Path:
        """設定されたパスを正規化した絶対パスにする。

        Parameters
        ----------
        configured_path : str
            設定されたパス。

        Returns
        -------
        Path
            正規化した絶対パス。
        """
        return _normalize(Path(configured_path.strip()))

    @staticmethod
    def resolve_target_file(root: Path, filename: str) -> Path:
        """出力ディレクトリの中のファイルのパスを作る。

        Parameters
        ----------
        root : Path
            出力ディレクトリ。
        filename : str
            ファイル名。

        Returns
        -------
        Path
            正規化したパス。
        """
        return Path(os.path.normpath(root / filename))

    @staticmethod
    def is_contained(root: Path, target: Path) -> bool:
        """対象が出力ディレクトリの中にあるか（シンボリックリンクを解決して確かめる）。

        Parameters
        ----------
        root : Path
            出力ディレクトリ。
        target : Path
            対象のパス。

        Returns
        -------
        bool
            中にあれば True。
        """
        try:
            canonical_root = root.resolve(strict=True)
            canonical_target = _normalize(target)
            if not canonical_target.parent.exists():
                return canonical_target.is_relative_to(canonical_root)
            return canonical_target.resolve(strict=True).is_relative_to(canonical_root)
        except OSError:
            return _normalize(target).is_relative_to(_normalize(root))

    @staticmethod
    def _validate_resolved_directory(resolved: Path) -> None:
        """出力ディレクトリが存在し、書き込めることを確かめる。

        Parameters
        ----------
        resolved : Path
            正規化したディレクトリのパス。

        Raises
        ------
        RuntimeError
            存在しない・ディレクトリでない・書き込めないとき。
        """
        if not resolved.exists():
            raise RuntimeError(_NOT_EXIST_MESSAGE)
        if not resolved.is_dir():
            raise RuntimeError(_NOT_DIRECTORY_MESSAGE)
        if not os.access(resolved, os.W_OK):
            raise RuntimeError(_NOT_WRITABLE_MESSAGE)
        probe = resolved / f".reject-audit-probe-{time.perf_counter_ns()}"
        try:
            probe.touch(exist_ok=False)
        except OSError as e:
            raise RuntimeError(_NOT_WRITABLE_MESSAGE) from e
        finally:
            probe.unlink(missing_ok=True)


class RejectAuditTsvFilename:
    """拒否監査 TSV のファイル名。"""

    @staticmethod
    def format(run_started_at: datetime | None) -> str:
        """実行開始時刻からファイル名を作る。

        Parameters
        ----------
        run_started_at : datetime | None
            実行開始時刻。

        Returns
        -------
        str
            `graph-candidate-rejects-yyyyMMddTHHmmssZ.tsv`。

        Raises
        ------
        ValueError
            時刻が None のとき。
        """
        if run_started_at is None:
            raise ValueError("runStartedAt is required")
        return f"{TSV_PREFIX}{_timestamp(run_started_at)}{TSV_SUFFIX}"


def escape_tsv(value: str | None) -> str:
    """TSV のフィールドをエスケープする。

    Parameters
    ----------
    value : str | None
        値。

    Returns
    -------
    str
        タブ・改行・二重引用符を含むときは二重引用符で囲む。None は空文字列。
    """
    if value is None:
        return ""
    if "\t" in value or "\n" in value or '"' in value:
        escaped = value.replace('"', '""')
        return f'"{escaped}"'
    return value


@dataclass(frozen=True)
class RejectAuditTsvRow:
    """拒否監査 TSV の 1 行。

    Attributes
    ----------
    file_path : str | None
        拒否されたファイルのパス。
    failure_code : str | None
        失敗コード。
    rejected_at : datetime
        拒否された時刻。
    """

    file_path: str | None
    failure_code: str | None
    rejected_at: datetime

    HEADER = "filePath\tfailureCode\trejectedAt"

    def to_tsv_line(self) -> str:
        """TSV の 1 行にする。

        Returns
        -------
        str
            タブ区切りの行（改行なし）。
        """
        return (
            f"{escape_tsv(self.file_path)}\t{escape_tsv(self.failure_code)}\t"
            f"{format_instant(self.rejected_at)}"
        )


class AppendOutcome(Enum):
    """行の追記の結果（移植元 RejectAuditTsvSession.AppendOutcome）。"""

    ROW_APPENDED = "ROW_APPENDED"
    ROW_DEDUPED = "ROW_DEDUPED"
    ROW_SKIPPED_NO_FILEPATH = "ROW_SKIPPED_NO_FILEPATH"
    CONTAINMENT_VIOLATION = "CONTAINMENT_VIOLATION"
    IO_FAILURE = "IO_FAILURE"
    SESSION_DISABLED = "SESSION_DISABLED"


def _log_failure(prefix: str, reason: str, target: Path | None) -> None:
    """失敗の理由を、伏せ字にして警告ログに出す。

    Parameters
    ----------
    prefix : str
        ログの冒頭の文言。
    reason : str
        失敗の理由。
    target : Path | None
        対象のファイル。ファイル名だけを出す。
    """
    name = "null" if target is None else target.name
    logger.warning(sanitize(f"{prefix} {reason} target={name}"))


class RejectAuditTsvSession:
    """1 回のジョブの拒否監査 TSV への書き込み。同じパスは 1 度だけ書く。"""

    def __init__(
        self,
        config: RejectAuditOutputConfig | None,
        target_file: Path | None,
        enabled: bool,
        run_started_at: datetime | None,
    ) -> None:
        """セッションを作る（通常は `open`・`disabled` を使う）。

        Parameters
        ----------
        config : RejectAuditOutputConfig | None
            出力設定。
        target_file : Path | None
            書き込み先の TSV。
        enabled : bool
            有効か。
        run_started_at : datetime | None
            実行開始時刻。
        """
        self._config = config
        self._target_file = target_file
        self._enabled = enabled
        self._run_started_at = run_started_at
        self._repair_metrics_session: GraphCandidateRepairMetricsSession | None = None
        self._dedupe_keys: set[str] = set()
        self._lock = threading.RLock()

    @classmethod
    def disabled(cls) -> "RejectAuditTsvSession":
        """無効なセッションを作る。

        Returns
        -------
        RejectAuditTsvSession
            無効なセッション。
        """
        return cls(None, None, False, None)

    @classmethod
    def open(
        cls, config: RejectAuditOutputConfig | None, run_started_at: datetime
    ) -> "RejectAuditTsvSession":
        """TSV を新規作成してセッションを開く。失敗したら無効なセッションを返す。

        Parameters
        ----------
        config : RejectAuditOutputConfig | None
            出力設定。
        run_started_at : datetime
            実行開始時刻。

        Returns
        -------
        RejectAuditTsvSession
            開いたセッション。
        """
        if config is None or not config.enabled or config.resolved_root is None:
            return cls.disabled()
        filename = RejectAuditTsvFilename.format(run_started_at)
        target = RejectAuditPathValidator.resolve_target_file(
            config.resolved_root, filename
        )
        if not RejectAuditPathValidator.is_contained(config.resolved_root, target):
            _log_failure(
                "reject audit tsv", "session open containment violation", target
            )
            return cls.disabled()
        try:
            target.parent.mkdir(parents=True, exist_ok=True)
            with open(target, "x", encoding="utf-8", newline="") as f:
                f.write(RejectAuditTsvRow.HEADER + os.linesep)
            return cls(config, target, True, run_started_at)
        except OSError:
            _log_failure("reject audit tsv", "session open io failure", target)
            return cls.disabled()

    def enabled(self) -> bool:
        """有効か。

        Returns
        -------
        bool
            有効なら True。
        """
        return self._enabled

    def target_file(self) -> Path | None:
        """書き込み先の TSV を返す。

        Returns
        -------
        Path | None
            TSV のパス。無効なら None。
        """
        return self._target_file

    def root(self) -> Path | None:
        """出力ディレクトリを返す。

        Returns
        -------
        Path | None
            出力ディレクトリ。無効なら None。
        """
        return None if self._config is None else self._config.resolved_root

    def run_started_at(self) -> datetime | None:
        """実行開始時刻を返す。

        Returns
        -------
        datetime | None
            実行開始時刻。無効なら None。
        """
        return self._run_started_at

    def repair_metrics_session(self) -> "GraphCandidateRepairMetricsSession":
        """このセッションの修復メトリクスを返す（最初の呼び出しで作る）。

        Returns
        -------
        GraphCandidateRepairMetricsSession
            修復メトリクスのセッション。
        """
        with self._lock:
            if self._repair_metrics_session is None:
                self._repair_metrics_session = (
                    GraphCandidateRepairMetricsSession.create(self)
                )
            return self._repair_metrics_session

    def append_reject(
        self, file_path: str | None, failure_code: str | None, rejected_at: datetime
    ) -> AppendOutcome:
        """拒否の行を追記する。

        Parameters
        ----------
        file_path : str | None
            拒否されたファイルのパス。
        failure_code : str | None
            失敗コード。
        rejected_at : datetime
            拒否された時刻。

        Returns
        -------
        AppendOutcome
            追記の結果。
        """
        if not self._enabled or self._config is None or self._target_file is None:
            return AppendOutcome.SESSION_DISABLED
        if file_path is None or not file_path.strip():
            return AppendOutcome.ROW_SKIPPED_NO_FILEPATH
        normalized = file_path.strip()
        with self._lock:
            if normalized in self._dedupe_keys:
                return AppendOutcome.ROW_DEDUPED
            if self._config.resolved_root is None or not (
                RejectAuditPathValidator.is_contained(
                    self._config.resolved_root, self._target_file
                )
            ):
                _log_failure(
                    "reject audit tsv",
                    "append containment violation",
                    self._target_file,
                )
                return AppendOutcome.CONTAINMENT_VIOLATION
            try:
                row = RejectAuditTsvRow(normalized, failure_code, rejected_at)
                with open(self._target_file, "a", encoding="utf-8", newline="") as f:
                    f.write(row.to_tsv_line() + os.linesep)
                self._dedupe_keys.add(normalized)
                return AppendOutcome.ROW_APPENDED
            except OSError:
                _log_failure("reject audit tsv", "append io failure", self._target_file)
                return AppendOutcome.IO_FAILURE

    def append_reject_to_target(
        self,
        root: Path,
        target: Path,
        file_path: str | None,
        failure_code: str | None,
        rejected_at: datetime,
    ) -> AppendOutcome:
        """指定したファイルに拒否の行を追記する（なければ作る。重複排除はしない）。

        Parameters
        ----------
        root : Path
            出力ディレクトリ。
        target : Path
            追記先のファイル。
        file_path : str | None
            拒否されたファイルのパス。
        failure_code : str | None
            失敗コード。
        rejected_at : datetime
            拒否された時刻。

        Returns
        -------
        AppendOutcome
            追記の結果。
        """
        if not RejectAuditPathValidator.is_contained(root, target):
            _log_failure("reject audit tsv", "append containment violation", target)
            return AppendOutcome.CONTAINMENT_VIOLATION
        if file_path is None or not file_path.strip():
            return AppendOutcome.ROW_SKIPPED_NO_FILEPATH
        try:
            row = RejectAuditTsvRow(file_path.strip(), failure_code, rejected_at)
            with open(target, "a", encoding="utf-8", newline="") as f:
                f.write(row.to_tsv_line() + os.linesep)
            return AppendOutcome.ROW_APPENDED
        except OSError:
            _log_failure("reject audit tsv", "append io failure", target)
            return AppendOutcome.IO_FAILURE


# 移植元の入れ子の列挙型（RejectAuditTsvSession.AppendOutcome）と同じ名前でも引けるようにする
RejectAuditTsvSession.AppendOutcome = AppendOutcome  # type: ignore[attr-defined]


class GraphCandidateRejectAuditWriter:
    """Graph Candidate の拒否を監査 TSV に書く。"""

    @staticmethod
    def append_reject(
        session: RejectAuditTsvSession | None,
        result: IngestionResult | None,
        source_file_path: str | None,
    ) -> None:
        """取り込み結果が LLM 候補出力の拒否なら TSV に追記する。

        Parameters
        ----------
        session : RejectAuditTsvSession | None
            拒否監査のセッション。
        result : IngestionResult | None
            取り込み結果。
        source_file_path : str | None
            取り込み元ファイルのパス。空なら何もしない。
        """
        if session is None or not session.enabled() or result is None:
            return
        if not result.accepted:
            return
        code = result.learnable_reject_code
        if code != LLM_CANDIDATE_OUTPUT_REJECTED:
            return
        if source_file_path is None or not source_file_path.strip():
            return
        session.append_reject(source_file_path, code, datetime.now(UTC))


def _rate(numerator: int, denominator: int) -> str:
    """比率を移植元と同じ書式の文字列にする。

    Parameters
    ----------
    numerator : int
        分子。
    denominator : int
        分母。

    Returns
    -------
    str
        分母 0 は `null`、分子 0 は `0.0`、それ以外は小数 6 桁（四捨五入）で
        末尾の 0 を除いた文字列。
    """
    if denominator == 0:
        return "null"
    if numerator == 0:
        return "0.0"
    value = (Decimal(numerator) / Decimal(denominator)).quantize(
        RATE_SCALE, rounding=ROUND_HALF_UP
    )
    return format(value.normalize(), "f")


class GraphCandidateRepairMetricsSession:
    """Graph Candidate の修復と後始末の件数を集計し、JSON に書き出す。"""

    def __init__(
        self,
        root: Path | None,
        target_file: Path | None,
        run_started_at: datetime | None,
        enabled: bool,
    ) -> None:
        """セッションを作る（通常は `open`・`disabled` を使う）。

        Parameters
        ----------
        root : Path | None
            出力ディレクトリ。
        target_file : Path | None
            書き込み先の JSON。
        run_started_at : datetime | None
            実行開始時刻。
        enabled : bool
            有効か。
        """
        self._root = root
        self._target_file = target_file
        self._run_started_at = run_started_at
        self._enabled = enabled
        self._lock = threading.Lock()
        self._processed = 0
        self._repair_attempt = 0
        self._repair_success = 0
        self._final_reject = 0
        self._cleanup_attempted = 0
        self._cleanup_completed = 0
        self._cleanup_skipped = 0
        self._cleanup_partial = 0
        self._cleanup_failed = 0
        self._post_reject_skipped = 0
        self._affected_chunk = 0

    @classmethod
    def disabled(cls) -> "GraphCandidateRepairMetricsSession":
        """無効なセッションを作る。

        Returns
        -------
        GraphCandidateRepairMetricsSession
            無効なセッション。
        """
        return cls(None, None, None, False)

    @classmethod
    def open(
        cls, reject_audit_session: RejectAuditTsvSession | None
    ) -> "GraphCandidateRepairMetricsSession":
        """拒否監査のセッションに紐づくメトリクスのセッションを返す。

        Parameters
        ----------
        reject_audit_session : RejectAuditTsvSession | None
            拒否監査のセッション。

        Returns
        -------
        GraphCandidateRepairMetricsSession
            メトリクスのセッション。None なら無効なセッション。
        """
        if reject_audit_session is None:
            return cls.disabled()
        return reject_audit_session.repair_metrics_session()

    @classmethod
    def create(
        cls, reject_audit_session: RejectAuditTsvSession | None
    ) -> "GraphCandidateRepairMetricsSession":
        """拒否監査のセッションの出力先に、メトリクスのセッションを作る。

        Parameters
        ----------
        reject_audit_session : RejectAuditTsvSession | None
            拒否監査のセッション。

        Returns
        -------
        GraphCandidateRepairMetricsSession
            メトリクスのセッション。出力先がない・外に出るときは無効なセッション。
        """
        if (
            reject_audit_session is None
            or not reject_audit_session.enabled()
            or reject_audit_session.root() is None
            or reject_audit_session.run_started_at() is None
        ):
            return cls.disabled()
        root = reject_audit_session.root()
        started = reject_audit_session.run_started_at()
        assert root is not None and started is not None  # 上で確認済み（型のため）
        filename = f"{METRICS_PREFIX}{_timestamp(started)}{METRICS_SUFFIX}"
        target = RejectAuditPathValidator.resolve_target_file(root, filename)
        if not RejectAuditPathValidator.is_contained(root, target):
            cls._log_failure("open containment violation", target)
            return cls.disabled()
        return cls(root, target, started, True)

    def record(self, result: IngestionResult | None) -> None:
        """取り込み結果から修復の件数を数える。

        Parameters
        ----------
        result : IngestionResult | None
            取り込み結果。
        """
        if not self._enabled or result is None or not result.accepted:
            return
        outcome: GraphCandidateRepairOutcome | None = (
            result.graph_candidate_repair_outcome
        )
        if outcome is None or not outcome.graph_candidate_processed():
            return
        with self._lock:
            self._processed += 1
            if outcome.repair_attempted():
                self._repair_attempt += 1
            if outcome.repair_succeeded():
                self._repair_success += 1
            if outcome.final_rejected():
                self._final_reject += 1

    def record_cleanup_outcome(self, outcome: CompensatingDeleteOutcome | None) -> None:
        """補償削除の結果を数える。

        Parameters
        ----------
        outcome : CompensatingDeleteOutcome | None
            補償削除の結果。
        """
        if not self._enabled or outcome is None:
            return
        with self._lock:
            self._cleanup_attempted += 1
            self._affected_chunk += outcome.affected_chunk_count
            status = outcome.overall_status
            if status == OverallStatus.COMPLETED:
                self._cleanup_completed += 1
            elif status == OverallStatus.SKIPPED:
                self._cleanup_skipped += 1
            elif status == OverallStatus.PARTIAL:
                self._cleanup_partial += 1
            elif status == OverallStatus.FAILED:
                self._cleanup_failed += 1

    def record_post_reject_skipped_chunk(self) -> None:
        """拒否後にスキップしたチャンクを 1 件数える。"""
        if not self._enabled:
            return
        with self._lock:
            self._post_reject_skipped += 1

    def flush(self) -> None:
        """集計を JSON ファイルに書き出す。失敗しても例外にせず警告ログだけ出す。"""
        if not self._enabled or self._root is None or self._target_file is None:
            return
        with self._lock:
            if not RejectAuditPathValidator.is_contained(self._root, self._target_file):
                self._log_failure("write containment violation", self._target_file)
                return
            try:
                self._target_file.parent.mkdir(parents=True, exist_ok=True)
                self._target_file.write_text(self._to_json(), encoding="utf-8")
            except OSError:
                self._log_failure("write io failure", self._target_file)

    def _to_json(self) -> str:
        """集計を移植元と同じ項目順・書式の JSON 文字列にする。

        Returns
        -------
        str
            JSON 文字列。
        """
        assert self._run_started_at is not None  # 有効なセッションは必ず持つ
        return (
            "{"
            '"schemaVersion":2,'
            f'"runStartedAt":"{format_instant(self._run_started_at)}",'
            f'"graphCandidateProcessedChunkCount":{self._processed},'
            f'"repairAttemptCount":{self._repair_attempt},'
            f'"repairSuccessCount":{self._repair_success},'
            f'"finalRejectCount":{self._final_reject},'
            f'"repairSuccessRate":{_rate(self._repair_success, self._repair_attempt)},'
            f'"finalRejectRate":{_rate(self._final_reject, self._processed)},'
            f'"cleanupAttemptedCount":{self._cleanup_attempted},'
            f'"cleanupCompletedCount":{self._cleanup_completed},'
            f'"cleanupSkippedCount":{self._cleanup_skipped},'
            f'"cleanupPartialCount":{self._cleanup_partial},'
            f'"cleanupFailedCount":{self._cleanup_failed},'
            f'"postRejectSkippedChunkCount":{self._post_reject_skipped},'
            f'"affectedChunkCount":{self._affected_chunk},'
            '"cleanupFailureRate":'
            f"{_rate(self._cleanup_partial + self._cleanup_failed, self._cleanup_attempted)}"
            "}"
        )

    @staticmethod
    def _log_failure(reason: str, target: Path | None) -> None:
        """失敗の理由を、伏せ字にして警告ログに出す。

        Parameters
        ----------
        reason : str
            失敗の理由。
        target : Path | None
            対象のファイル。
        """
        _log_failure("graph candidate repair metrics", reason, target)
