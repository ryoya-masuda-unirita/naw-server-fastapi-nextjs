"""Graph Candidate ジョブの結果の出力（移植元 embedding.output）。"""

import logging
from datetime import UTC, datetime
from enum import Enum
from pathlib import Path

from generative_ai_core.failure import sanitize

logger = logging.getLogger(__name__)


class Outcome(Enum):
    """ジョブ全体の結果（移植元 JobOutputRunContext.Outcome）。"""

    SUCCESS = "SUCCESS"
    WARNING = "WARNING"
    ERROR = "ERROR"


class JobOutputRunContext:
    """1 回のジョブで起きた Graph Candidate の拒否・失敗を覚えておく。

    無効（disabled）の間はすべての記録を無視する。
    """

    def __init__(self, enabled: bool) -> None:
        """有効か無効かを指定して作る。

        Parameters
        ----------
        enabled : bool
            有効にするか。
        """
        self._enabled = enabled
        self._rejected_source_paths: set[str] = set()
        self._learnable_reject_observed = False
        self._fail_closed_observed = False

    @classmethod
    def enabled(cls) -> "JobOutputRunContext":
        """有効なコンテキストを作る。

        Returns
        -------
        JobOutputRunContext
            有効なコンテキスト。
        """
        return cls(True)

    @classmethod
    def disabled(cls) -> "JobOutputRunContext":
        """無効なコンテキストを作る。

        Returns
        -------
        JobOutputRunContext
            無効なコンテキスト。
        """
        return cls(False)

    def is_enabled(self) -> bool:
        """有効か。

        Returns
        -------
        bool
            有効なら True。
        """
        return self._enabled

    def is_rejected(self, input_file_path: str | None) -> bool:
        """入力ファイルがすでに拒否されたか。

        Parameters
        ----------
        input_file_path : str | None
            入力ファイルのパス。

        Returns
        -------
        bool
            拒否済みなら True。
        """
        if not self._enabled or input_file_path is None or not input_file_path.strip():
            return False
        return input_file_path.strip() in self._rejected_source_paths

    def mark_learnable_reject(self, source_file_path: str | None) -> None:
        """学習可能な拒否が起きたことを記録する。

        Parameters
        ----------
        source_file_path : str | None
            拒否された取り込み元ファイルのパス。
        """
        if not self._enabled:
            return
        self._learnable_reject_observed = True
        if source_file_path is not None and source_file_path.strip():
            self._rejected_source_paths.add(source_file_path.strip())

    def mark_fail_closed(self) -> None:
        """フェイルクローズ（後始末の失敗など）が起きたことを記録する。"""
        if not self._enabled:
            return
        self._fail_closed_observed = True

    def compute_outcome(self) -> Outcome:
        """記録からジョブ全体の結果を決める。

        Returns
        -------
        Outcome
            フェイルクローズがあれば ERROR、拒否があれば WARNING、なければ SUCCESS。
        """
        if self._fail_closed_observed:
            return Outcome.ERROR
        if self._learnable_reject_observed:
            return Outcome.WARNING
        return Outcome.SUCCESS


# 移植元の入れ子の列挙型（JobOutputRunContext.Outcome）と同じ名前でも引けるようにする
JobOutputRunContext.Outcome = Outcome  # type: ignore[attr-defined]


class JobOutcomeMarkerWriter:
    """ジョブの結果を出力ディレクトリに TSV で書く。"""

    FILE_NAME = "graph-candidate-job-outcome.tsv"
    HEADER = "outcome\trecordedAt"

    def write(self, output_dir: Path | None, outcome: Outcome | None) -> None:
        """結果のマーカーファイルを書く。書けなくても例外にせず警告ログだけ出す。

        Parameters
        ----------
        output_dir : Path | None
            出力ディレクトリ。
        outcome : Outcome | None
            ジョブの結果。どちらかが None なら何もしない。
        """
        if output_dir is None or outcome is None:
            return
        try:
            output_dir.mkdir(parents=True, exist_ok=True)
            recorded_at = (
                datetime.now(UTC)
                .isoformat(timespec="microseconds")
                .replace("+00:00", "Z")
            )
            content = f"{self.HEADER}\n{outcome.name}\t{recorded_at}\n"
            (output_dir / self.FILE_NAME).write_text(content, encoding="utf-8")
        except OSError:
            logger.warning(
                sanitize("graph-candidate job outcome marker write failed"),
                exc_info=True,
            )
