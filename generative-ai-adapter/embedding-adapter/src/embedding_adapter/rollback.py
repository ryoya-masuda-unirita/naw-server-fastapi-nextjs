"""Graph Candidate の拒否時の補償削除（移植元 embedding.rollback）。"""

import threading

from generative_ai_core.graphrag.ingestion import IngestionRejectClassification
from generative_ai_core.network import CoreNetworkSetting
from generative_ai_core.vector import (
    CommittedRow,
    CommittedRowIds,
    CompensatingDeleteOutcome,
    CompensatingDeleteOwnershipScope,
    CompensatingDeleteRequest,
    CompensatingDeleteService,
    CoreVectorDbRuntime,
    CoreVectorDbTarget,
    OverallStatus,
)

LLM_CANDIDATE_OUTPUT_REJECTED = "LLM_CANDIDATE_OUTPUT_REJECTED"


class FileCommittedRowTracker:
    """ファイル（取り込み元）ごとに、コミット済みのベクトル行を覚えておく。"""

    def __init__(self) -> None:
        """空の状態で作る。"""
        self._lock = threading.Lock()
        self._rows_by_source_ref: dict[str, list[CommittedRow]] = {}
        self._rollback_completed_sources: set[str] = set()

    def register(self, source_ref: str | None, row: CommittedRow | None) -> None:
        """コミット済みの行を登録する。同じベクトル行 ID は重ねて登録しない。

        Parameters
        ----------
        source_ref : str | None
            取り込み元の参照。空なら何もしない。
        row : CommittedRow | None
            コミット済みの行。ベクトル行 ID が空なら何もしない。
        """
        if source_ref is None or not source_ref.strip() or row is None:
            return
        if not row.vector_row_id.strip():
            return
        with self._lock:
            rows = list(self._rows_by_source_ref.get(source_ref, []))
            if not any(r.vector_row_id == row.vector_row_id for r in rows):
                rows.append(row)
            self._rows_by_source_ref[source_ref] = rows

    def file_rows(self, source_ref: str) -> CommittedRowIds:
        """取り込み元に登録された行を返す。

        Parameters
        ----------
        source_ref : str
            取り込み元の参照。

        Returns
        -------
        CommittedRowIds
            登録された行（なければ空）。
        """
        with self._lock:
            return CommittedRowIds.of(
                list(self._rows_by_source_ref.get(source_ref, []))
            )

    def clear(self, source_ref: str | None) -> None:
        """取り込み元の行の登録を消す。

        Parameters
        ----------
        source_ref : str | None
            取り込み元の参照。空なら何もしない。
        """
        if source_ref is None or not source_ref.strip():
            return
        with self._lock:
            self._rows_by_source_ref.pop(source_ref, None)

    def mark_rollback_completed(self, source_ref: str | None) -> None:
        """取り込み元の補償削除が済んだことを記録する。

        Parameters
        ----------
        source_ref : str | None
            取り込み元の参照。空なら何もしない。
        """
        if source_ref is None or not source_ref.strip():
            return
        with self._lock:
            self._rollback_completed_sources.add(source_ref)

    def is_rollback_completed(self, source_ref: str | None) -> bool:
        """補償削除が済んでいるか。

        Parameters
        ----------
        source_ref : str | None
            取り込み元の参照。

        Returns
        -------
        bool
            済んでいれば True。
        """
        with self._lock:
            return source_ref in self._rollback_completed_sources

    def debug_counts(self) -> dict[str, int] | None:
        """取り込み元ごとの登録行数を返す（デバッグ用）。

        Returns
        -------
        dict[str, int] | None
            取り込み元 → 行数。何も登録がなければ None。
        """
        with self._lock:
            if not self._rows_by_source_ref:
                return None
            return {k: len(v) for k, v in self._rows_by_source_ref.items()}


class GraphCandidateCompensatingDeleteHook:
    """Graph Candidate の拒否時に、登録済みの行を補償削除する。"""

    def __init__(
        self,
        tracker: FileCommittedRowTracker | None,
        service: CompensatingDeleteService | None,
    ) -> None:
        """トラッカーと削除サービスを受け取る。None なら既定を使う。

        Parameters
        ----------
        tracker : FileCommittedRowTracker | None
            コミット済みの行のトラッカー。
        service : CompensatingDeleteService | None
            補償削除サービス。
        """
        self._tracker = tracker if tracker is not None else FileCommittedRowTracker()
        self._service = (
            service
            if service is not None
            else CompensatingDeleteService(CoreVectorDbRuntime())
        )
        self._last_outcomes: dict[str, CompensatingDeleteOutcome] = {}

    def execute(
        self,
        scope: CompensatingDeleteOwnershipScope,
        source_ref: str,
        trigger_failure_code: str,
        reject_chunk_id: str,
        network_setting: CoreNetworkSetting,
        target: CoreVectorDbTarget,
    ) -> CompensatingDeleteOutcome:
        """取り込み元の登録済みの行を補償削除する。

        完了または対象なしのときは、トラッカーの登録を消して済みとして記録する。

        Parameters
        ----------
        scope : CompensatingDeleteOwnershipScope
            削除してよい行の範囲。
        source_ref : str
            取り込み元の参照。
        trigger_failure_code : str
            削除のきっかけになった失敗コード。
        reject_chunk_id : str
            拒否されたチャンクの ID。
        network_setting : CoreNetworkSetting
            ネットワーク設定。
        target : CoreVectorDbTarget
            ベクトルDB の接続先。

        Returns
        -------
        CompensatingDeleteOutcome
            補償削除の結果。
        """
        row_ids = self._tracker.file_rows(source_ref)
        outcome = self._service.execute(
            CompensatingDeleteRequest(
                scope,
                row_ids,
                trigger_failure_code,
                bool(scope.graph_name.strip()),
                reject_chunk_id,
                network_setting,
                target,
            )
        )
        self._last_outcomes[source_ref] = outcome
        if outcome.overall_status in (OverallStatus.COMPLETED, OverallStatus.SKIPPED):
            self._tracker.clear(source_ref)
            self._tracker.mark_rollback_completed(source_ref)
        return outcome

    def should_execute(
        self, source_ref: str | None, learnable_reject_code: str | None
    ) -> bool:
        """補償削除を実行すべきか。

        Parameters
        ----------
        source_ref : str | None
            取り込み元の参照。
        learnable_reject_code : str | None
            学習可能な拒否のコード。

        Returns
        -------
        bool
            すでに補償削除済みか、致命的でない LLM 候補出力の拒否なら True。
        """
        if self._tracker.is_rollback_completed(source_ref):
            return True
        return (
            learnable_reject_code == LLM_CANDIDATE_OUTPUT_REJECTED
            and IngestionRejectClassification.is_non_critical(learnable_reject_code)
        )

    def last_outcome(self, source_ref: str) -> CompensatingDeleteOutcome | None:
        """直近の補償削除の結果を返す。

        Parameters
        ----------
        source_ref : str
            取り込み元の参照。

        Returns
        -------
        CompensatingDeleteOutcome | None
            結果。実行していなければ None。
        """
        return self._last_outcomes.get(source_ref)
