"""補償削除（Graph Candidate の拒否時に、書き込み済みの行を取り消す）。

移植元の CompensatingDeleteService・Request・Outcome・OwnershipScope と
CommittedRowIds を移植している。
"""

import hashlib
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import Enum

from generative_ai_core.failure import CoreFailure
from generative_ai_core.graphrag.ingestion import IngestionRejectClassification
from generative_ai_core.network.setting import CoreNetworkSetting
from generative_ai_core.vector.compensating_constants import (
    LAYER_GRAPH_RAG,
    LAYER_VECTOR,
    METADATA_COMPENSATING_LAYER,
    REASON_ALREADY_ABSENT,
    REASON_CROSS_SCOPE_BLOCKED,
    REASON_EMPTY_METADATA,
    REASON_GRAPH_NODE_UNWRITTEN,
    REASON_GRAPH_WRITE_DISABLED,
)
from generative_ai_core.vector.model import (
    CoreGraphChunkWritePayload,
    CoreGraphWriteResult,
    CoreGraphWriteSetting,
    CoreVectorDbOperation,
    CoreVectorDbPayload,
    CoreVectorDbRequest,
    CoreVectorDbRequestBuilder,
)
from generative_ai_core.vector.runtime import CoreVectorDbRuntime
from generative_ai_core.vector.target import CoreVectorDbTarget

TRIGGER_FAILURE_CODE = "LLM_CANDIDATE_OUTPUT_REJECTED"
HASH_LENGTH = 16
MALFORMED_GRAPH_RESULT = "malformed graph operation result."
ALLOWLISTED_LAYER_REASONS = frozenset(
    {
        "",
        "already_absent",
        "graph_node_unwritten",
        "graph_write_disabled",
        "empty_metadata",
        "cross_scope_blocked",
        "provider_failure",
        "graph_unavailable",
        "graph_permission_denied",
        "graph_delete_failure",
        "graph_rag_delete_failure",
        "target_not_found",
    }
)


def _strip(value: str | None) -> str:
    """None を空にして trim する。

    Parameters
    ----------
    value : str | None
        文字列。

    Returns
    -------
    str
        正規化した文字列。
    """
    return "" if value is None else value.strip()


def _set(obj: object, name: str, value: object) -> None:
    """frozen dataclass のフィールドを置き換える。

    Parameters
    ----------
    obj : object
        対象。
    name : str
        フィールド名。
    value : object
        値。
    """
    object.__setattr__(obj, name, value)


@dataclass(frozen=True)
class CommittedRow:
    """コミット済みの 1 行（移植元 CommittedRowIds.Row）。"""

    tenant_id: str = ""
    source_ref: str = ""
    job_id: str = ""
    run_id: str = ""
    provider_id: str = ""
    database_name: str = ""
    table_name: str = ""
    graph_name: str = ""
    vector_row_id: str = ""
    graph_rag_chunk_id: str = ""
    evidence_links: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        """文字列を trim し、リンクを tuple にする。"""
        for name in (
            "tenant_id", "source_ref", "job_id", "run_id", "provider_id",
            "database_name", "table_name", "graph_name", "vector_row_id",
            "graph_rag_chunk_id",
        ):  # fmt: skip
            _set(self, name, _strip(getattr(self, name)))
        _set(self, "evidence_links", tuple(self.evidence_links or ()))


@dataclass(frozen=True)
class CommittedRowIds:
    """コミット済みの行の一覧。"""

    rows: tuple[CommittedRow, ...] = ()

    def __post_init__(self) -> None:
        """行を tuple にする。"""
        _set(self, "rows", tuple(self.rows or ()))

    @classmethod
    def empty(cls) -> "CommittedRowIds":
        """空の一覧を作る。

        Returns
        -------
        CommittedRowIds
            空の一覧。
        """
        return cls(())

    @classmethod
    def of(
        cls, rows: "list[CommittedRow] | tuple[CommittedRow, ...] | None"
    ) -> "CommittedRowIds":
        """行から一覧を作る。

        Parameters
        ----------
        rows : list[CommittedRow] | tuple[CommittedRow, ...] | None
            行。

        Returns
        -------
        CommittedRowIds
            一覧。
        """
        return cls(tuple(rows or ()))

    def is_empty(self) -> bool:
        """空か。

        Returns
        -------
        bool
            行がなければ True。
        """
        return not self.rows

    def chunk_ids(self) -> frozenset[str]:
        """GraphRAG のチャンク ID の集合を返す（空は除く）。

        Returns
        -------
        frozenset[str]
            チャンク ID。
        """
        return frozenset(
            row.graph_rag_chunk_id
            for row in self.rows
            if row is not None and row.graph_rag_chunk_id.strip()
        )


# 移植元は CommittedRowIds.Row として参照する
CommittedRowIds.Row = CommittedRow  # type: ignore[attr-defined]


@dataclass(frozen=True)
class CompensatingDeleteOwnershipScope:
    """補償削除してよい行の範囲（所有者の一致を確かめる）。"""

    tenant_id: str = ""
    source_ref: str = ""
    job_id: str = ""
    run_id: str = ""
    provider_id: str = ""
    database_name: str = ""
    table_name: str = ""
    graph_name: str = ""

    def __post_init__(self) -> None:
        """文字列を trim し、プロバイダ ID を小文字にする。"""
        for name in (
            "tenant_id", "source_ref", "job_id", "run_id", "database_name",
            "table_name", "graph_name",
        ):  # fmt: skip
            _set(self, name, _strip(getattr(self, name)))
        _set(self, "provider_id", _strip(self.provider_id).lower())

    def matches(self, row: CommittedRow | None) -> bool:
        """行がこの範囲の持ち物か。

        Parameters
        ----------
        row : CommittedRow | None
            コミット済みの行。

        Returns
        -------
        bool
            すべての項目が一致すれば True。
        """
        if row is None:
            return False
        return (
            self.tenant_id == row.tenant_id
            and self.source_ref == row.source_ref
            and self.job_id == row.job_id
            and self.run_id == row.run_id
            and self.provider_id == _strip(row.provider_id).lower()
            and self.database_name == row.database_name
            and self.table_name == row.table_name
            and self.graph_name == row.graph_name
        )


class OverallStatus(Enum):
    """補償削除全体の状態。"""

    COMPLETED = "COMPLETED"
    PARTIAL = "PARTIAL"
    FAILED = "FAILED"
    SKIPPED = "SKIPPED"


class RowStatus(Enum):
    """1 行の状態。"""

    DELETED = "DELETED"
    SKIPPED = "SKIPPED"
    BLOCKED = "BLOCKED"
    FAILED = "FAILED"


class LayerStatus(Enum):
    """層（vector・AGE・GraphRAG）ごとの状態。"""

    DELETED = "DELETED"
    SKIPPED = "SKIPPED"
    FAILED = "FAILED"
    BLOCKED = "BLOCKED"
    DISABLED = "DISABLED"


def safe_hash(value: str | None) -> str:
    """値を SHA-256 の先頭 16 桁にする（ログに生の ID を出さないため）。

    Parameters
    ----------
    value : str | None
        元の値。

    Returns
    -------
    str
        16 桁の 16 進文字列。
    """
    digest = hashlib.sha256((value or "").encode("utf-8")).hexdigest()
    return digest[:HASH_LENGTH]


def sanitize_layer_reason(reason: str | None) -> str:
    """層の理由を許可リストにあるものだけにする。

    Parameters
    ----------
    reason : str | None
        理由。

    Returns
    -------
    str
        許可された理由。それ以外は空。
    """
    normalized = _strip(reason)
    return normalized if normalized in ALLOWLISTED_LAYER_REASONS else ""


@dataclass(frozen=True)
class RowOutcome:
    """1 行の補償削除の結果（移植元 CompensatingDeleteOutcome.RowOutcome）。"""

    safe_vector_row_id_hash: str = ""
    safe_chunk_id_hash: str = ""
    status: RowStatus = RowStatus.SKIPPED
    reason: str = ""
    vector_layer_status: LayerStatus = LayerStatus.SKIPPED
    age_layer_status: LayerStatus = LayerStatus.SKIPPED
    graph_rag_layer_status: LayerStatus = LayerStatus.SKIPPED
    vector_layer_reason: str = ""
    age_layer_reason: str = ""
    graph_rag_layer_reason: str = ""

    def __post_init__(self) -> None:
        """未指定を補い、層の理由を許可リストで絞る。"""
        _set(self, "safe_vector_row_id_hash", self.safe_vector_row_id_hash or "")
        _set(self, "safe_chunk_id_hash", self.safe_chunk_id_hash or "")
        _set(self, "status", self.status or RowStatus.SKIPPED)
        _set(self, "reason", self.reason or "")
        _set(
            self, "vector_layer_status", self.vector_layer_status or LayerStatus.SKIPPED
        )
        _set(self, "age_layer_status", self.age_layer_status or LayerStatus.SKIPPED)
        _set(
            self,
            "graph_rag_layer_status",
            self.graph_rag_layer_status or LayerStatus.SKIPPED,
        )
        _set(
            self, "vector_layer_reason", sanitize_layer_reason(self.vector_layer_reason)
        )
        _set(self, "age_layer_reason", sanitize_layer_reason(self.age_layer_reason))
        _set(
            self,
            "graph_rag_layer_reason",
            sanitize_layer_reason(self.graph_rag_layer_reason),
        )


def _now() -> str:
    """現在時刻（UTC・ISO 8601）を返す。

    Returns
    -------
    str
        時刻の文字列。
    """
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


@dataclass(frozen=True)
class CompensatingDeleteOutcome:
    """補償削除全体の結果。"""

    overall_status: OverallStatus = OverallStatus.SKIPPED
    trigger_failure_code: str = ""
    safe_source_ref_hash: str = ""
    safe_chunk_id_hash: str = ""
    completed_at: str | None = None
    row_outcomes: tuple[RowOutcome, ...] = ()
    affected_chunk_count: int = 0

    ALLOWLISTED_LAYER_REASONS = ALLOWLISTED_LAYER_REASONS

    def __post_init__(self) -> None:
        """未指定を補う。"""
        _set(self, "overall_status", self.overall_status or OverallStatus.SKIPPED)
        _set(self, "trigger_failure_code", _strip(self.trigger_failure_code))
        _set(self, "safe_source_ref_hash", self.safe_source_ref_hash or "")
        _set(self, "safe_chunk_id_hash", self.safe_chunk_id_hash or "")
        _set(self, "completed_at", self.completed_at or _now())
        _set(self, "row_outcomes", tuple(self.row_outcomes or ()))
        _set(self, "affected_chunk_count", max(0, self.affected_chunk_count))

    @classmethod
    def _of(
        cls,
        status: OverallStatus,
        trigger_failure_code: str,
        source_ref: str,
        chunk_id: str,
        row_outcomes: "list[RowOutcome] | tuple[RowOutcome, ...]",
        affected_chunk_count: int,
    ) -> "CompensatingDeleteOutcome":
        """状態を指定して結果を作る。

        Parameters
        ----------
        status : OverallStatus
            全体の状態。
        trigger_failure_code : str
            契機になった失敗コード。
        source_ref : str
            ソース参照（ハッシュにする）。
        chunk_id : str
            チャンク ID（ハッシュにする）。
        row_outcomes : list[RowOutcome] | tuple[RowOutcome, ...]
            行ごとの結果。
        affected_chunk_count : int
            対象のチャンク数。

        Returns
        -------
        CompensatingDeleteOutcome
            結果。
        """
        return cls(
            status, trigger_failure_code, safe_hash(source_ref), safe_hash(chunk_id),
            _now(), tuple(row_outcomes), affected_chunk_count,
        )  # fmt: skip

    @classmethod
    def skipped(
        cls, trigger_failure_code: str, source_ref: str, chunk_id: str,
        affected_chunk_count: int,
    ) -> "CompensatingDeleteOutcome":  # fmt: skip
        """何もしなかった結果を作る。

        Parameters
        ----------
        trigger_failure_code : str
            契機になった失敗コード。
        source_ref : str
            ソース参照。
        chunk_id : str
            チャンク ID。
        affected_chunk_count : int
            対象のチャンク数。

        Returns
        -------
        CompensatingDeleteOutcome
            SKIPPED の結果。
        """
        return cls._of(
            OverallStatus.SKIPPED, trigger_failure_code, source_ref, chunk_id, (),
            affected_chunk_count,
        )  # fmt: skip

    @classmethod
    def completed(
        cls, trigger_failure_code: str, source_ref: str, chunk_id: str,
        row_outcomes: "list[RowOutcome]", affected_chunk_count: int,
    ) -> "CompensatingDeleteOutcome":  # fmt: skip
        """完了の結果を作る。

        Parameters
        ----------
        trigger_failure_code : str
            契機になった失敗コード。
        source_ref : str
            ソース参照。
        chunk_id : str
            チャンク ID。
        row_outcomes : list[RowOutcome]
            行ごとの結果。
        affected_chunk_count : int
            対象のチャンク数。

        Returns
        -------
        CompensatingDeleteOutcome
            COMPLETED の結果。
        """
        return cls._of(
            OverallStatus.COMPLETED, trigger_failure_code, source_ref, chunk_id,
            row_outcomes, affected_chunk_count,
        )  # fmt: skip

    @classmethod
    def partial(
        cls, trigger_failure_code: str, source_ref: str, chunk_id: str,
        row_outcomes: "list[RowOutcome]", affected_chunk_count: int,
    ) -> "CompensatingDeleteOutcome":  # fmt: skip
        """一部だけ成功した結果を作る。

        Parameters
        ----------
        trigger_failure_code : str
            契機になった失敗コード。
        source_ref : str
            ソース参照。
        chunk_id : str
            チャンク ID。
        row_outcomes : list[RowOutcome]
            行ごとの結果。
        affected_chunk_count : int
            対象のチャンク数。

        Returns
        -------
        CompensatingDeleteOutcome
            PARTIAL の結果。
        """
        return cls._of(
            OverallStatus.PARTIAL, trigger_failure_code, source_ref, chunk_id,
            row_outcomes, affected_chunk_count,
        )  # fmt: skip

    @classmethod
    def failed(
        cls, trigger_failure_code: str, source_ref: str, chunk_id: str,
        row_outcomes: "list[RowOutcome]", affected_chunk_count: int,
    ) -> "CompensatingDeleteOutcome":  # fmt: skip
        """失敗の結果を作る。

        Parameters
        ----------
        trigger_failure_code : str
            契機になった失敗コード。
        source_ref : str
            ソース参照。
        chunk_id : str
            チャンク ID。
        row_outcomes : list[RowOutcome]
            行ごとの結果。
        affected_chunk_count : int
            対象のチャンク数。

        Returns
        -------
        CompensatingDeleteOutcome
            FAILED の結果。
        """
        return cls._of(
            OverallStatus.FAILED, trigger_failure_code, source_ref, chunk_id,
            row_outcomes, affected_chunk_count,
        )  # fmt: skip

    safe_hash = staticmethod(safe_hash)
    sanitize_layer_reason = staticmethod(sanitize_layer_reason)


@dataclass(frozen=True)
class CompensatingDeleteRequest:
    """補償削除の要求。"""

    ownership_scope: CompensatingDeleteOwnershipScope = field(
        default_factory=CompensatingDeleteOwnershipScope
    )
    committed_row_ids: CommittedRowIds = field(default_factory=CommittedRowIds.empty)
    trigger_failure_code: str = ""
    graph_write_enabled: bool = False
    reject_chunk_id: str = ""
    network_setting: CoreNetworkSetting = field(
        default_factory=CoreNetworkSetting.defaults
    )
    target: CoreVectorDbTarget = field(default_factory=CoreVectorDbTarget)

    def __post_init__(self) -> None:
        """未指定を既定値で補う。"""
        _set(
            self,
            "ownership_scope",
            self.ownership_scope or CompensatingDeleteOwnershipScope(),
        )
        _set(
            self, "committed_row_ids", self.committed_row_ids or CommittedRowIds.empty()
        )
        _set(self, "trigger_failure_code", _strip(self.trigger_failure_code))
        _set(self, "reject_chunk_id", _strip(self.reject_chunk_id))
        _set(
            self,
            "network_setting",
            self.network_setting or CoreNetworkSetting.defaults(),
        )
        _set(self, "target", self.target or CoreVectorDbTarget())

    def trigger_enabled(self) -> bool:
        """補償削除を起動する契機か。

        Returns
        -------
        bool
            LLM 候補出力の拒否（致命的でない拒否）のときだけ True。
        """
        return self.trigger_failure_code == TRIGGER_FAILURE_CODE and (
            IngestionRejectClassification.is_non_critical(self.trigger_failure_code)
        )


@dataclass(frozen=True)
class _LayerOutcome:
    """層ごとの結果（内部用）。"""

    status: LayerStatus
    reason: str = field(default="")


def _normalized_summary(failure: CoreFailure) -> str:
    """失敗の要約を小文字にする。

    Parameters
    ----------
    failure : CoreFailure
        失敗。

    Returns
    -------
    str
        小文字の要約。
    """
    return (failure.summary or "").lower()


def _is_malformed_graph_failure(failure: CoreFailure | None) -> bool:
    """Graph の結果形式エラーか。

    Parameters
    ----------
    failure : CoreFailure | None
        失敗。

    Returns
    -------
    bool
        形式エラーなら True。
    """
    return failure is not None and (
        failure.code == "GRAPH_MALFORMED_RESULT"
        or MALFORMED_GRAPH_RESULT in _normalized_summary(failure)
    )


def _is_real_graph_failure_code(failure: CoreFailure) -> bool:
    """接続・権限・AGE 利用不可・設定不正の本物の失敗か（コードだけで判定）。

    Parameters
    ----------
    failure : CoreFailure
        失敗。

    Returns
    -------
    bool
        該当すれば True。
    """
    return failure.code in (
        "GRAPH_PERMISSION_DENIED",
        "GRAPH_UNAVAILABLE",
        "GRAPH_AGE_UNAVAILABLE",
        "GRAPH_CONFIGURATION_FAILURE",
    )


def _graph_failure_reason_from_code(code: str) -> str:
    """失敗コードから層の理由を決める。

    Parameters
    ----------
    code : str
        失敗コード。

    Returns
    -------
    str
        理由。
    """
    if code == "GRAPH_PERMISSION_DENIED":
        return "graph_permission_denied"
    if code in ("GRAPH_UNAVAILABLE", "GRAPH_AGE_UNAVAILABLE"):
        return "graph_unavailable"
    return "provider_failure"


def _graph_failure_reason(
    failure: CoreFailure | None, graph_result: CoreGraphWriteResult | None
) -> str:
    """Graph 層の失敗理由を決める。

    Parameters
    ----------
    failure : CoreFailure | None
        失敗。
    graph_result : CoreGraphWriteResult | None
        Graph の結果。

    Returns
    -------
    str
        理由。
    """
    if _is_malformed_graph_failure(failure):
        return "provider_failure"
    if (
        graph_result is not None
        and graph_result.cause_category.strip()
        and graph_result.cause_category != "NONE"
    ):
        category = graph_result.cause_category
        if category == "GRAPH_PERMISSION_DENIED":
            return "graph_permission_denied"
        if category in ("GRAPH_UNAVAILABLE", "GRAPH_AGE_UNAVAILABLE"):
            return "graph_unavailable"
        if category == "GRAPH_DELETE_FAILURE":
            return "graph_delete_failure"
    if failure is not None and _is_real_graph_failure_code(failure):
        return _graph_failure_reason_from_code(failure.code)
    return "provider_failure"


def _graph_benign_reason(graph_result: CoreGraphWriteResult | None) -> str:
    """Graph 層の「対象なし」の理由を決める。

    Parameters
    ----------
    graph_result : CoreGraphWriteResult | None
        Graph の結果。

    Returns
    -------
    str
        理由。
    """
    if graph_result is not None and (
        graph_result.cause_category == REASON_GRAPH_NODE_UNWRITTEN
    ):
        return REASON_GRAPH_NODE_UNWRITTEN
    return REASON_ALREADY_ABSENT


class CompensatingDeleteService:
    """拒否された取り込みで書いた行を、vector・AGE・GraphRAG の各層から消す。"""

    METADATA_COMPENSATING_LAYER = METADATA_COMPENSATING_LAYER
    LAYER_VECTOR = LAYER_VECTOR
    LAYER_GRAPH_RAG = LAYER_GRAPH_RAG
    REASON_ALREADY_ABSENT = REASON_ALREADY_ABSENT
    REASON_GRAPH_NODE_UNWRITTEN = REASON_GRAPH_NODE_UNWRITTEN
    REASON_GRAPH_WRITE_DISABLED = REASON_GRAPH_WRITE_DISABLED
    REASON_EMPTY_METADATA = REASON_EMPTY_METADATA
    REASON_CROSS_SCOPE_BLOCKED = REASON_CROSS_SCOPE_BLOCKED

    def __init__(self, runtime: CoreVectorDbRuntime | None = None) -> None:
        """実行に使う runtime を受け取る。

        Parameters
        ----------
        runtime : CoreVectorDbRuntime | None
            ベクトルDB の runtime。省略時は既定のもの。
        """
        self._runtime = runtime if runtime is not None else CoreVectorDbRuntime()

    def execute(
        self, request: CompensatingDeleteRequest | None
    ) -> CompensatingDeleteOutcome:
        """補償削除を実行する。

        Parameters
        ----------
        request : CompensatingDeleteRequest | None
            要求。

        Returns
        -------
        CompensatingDeleteOutcome
            結果。
        """
        if request is None:
            return CompensatingDeleteOutcome.skipped("", "", "", 0)
        scope = request.ownership_scope
        committed = request.committed_row_ids
        if not request.trigger_enabled():
            return CompensatingDeleteOutcome.skipped(
                request.trigger_failure_code, scope.source_ref,
                request.reject_chunk_id, len(committed.chunk_ids()),
            )  # fmt: skip
        if committed.is_empty():
            return CompensatingDeleteOutcome.skipped(
                request.trigger_failure_code,
                scope.source_ref,
                request.reject_chunk_id,
                0,
            )
        outcomes = [self._delete_single_row(request, row) for row in committed.rows]
        return self._build_outcome(request, outcomes)

    def _delete_single_row(
        self, request: CompensatingDeleteRequest, row: CommittedRow
    ) -> RowOutcome:
        """1 行を 3 つの層から消す。

        Parameters
        ----------
        request : CompensatingDeleteRequest
            要求。
        row : CommittedRow
            対象の行。

        Returns
        -------
        RowOutcome
            行の結果。
        """
        vector_hash = safe_hash(row.vector_row_id)
        chunk_hash = safe_hash(row.graph_rag_chunk_id)
        if not request.ownership_scope.matches(row):
            return RowOutcome(
                vector_hash, chunk_hash, RowStatus.BLOCKED, REASON_CROSS_SCOPE_BLOCKED,
                LayerStatus.BLOCKED, LayerStatus.BLOCKED, LayerStatus.BLOCKED,
                REASON_CROSS_SCOPE_BLOCKED, REASON_CROSS_SCOPE_BLOCKED,
                REASON_CROSS_SCOPE_BLOCKED,
            )  # fmt: skip
        vector_layer = self._execute_vector_layer(request, row)
        age_layer = self._execute_age_layer(request, row)
        graph_rag_layer = self._execute_graph_rag_layer(request, row)

        row_status = self._aggregate_row_status(
            vector_layer, age_layer, graph_rag_layer
        )
        row_reason = REASON_ALREADY_ABSENT if row_status == RowStatus.SKIPPED else ""
        if row_status == RowStatus.FAILED:
            row_reason = self._first_failed_layer_reason(
                vector_layer, age_layer, graph_rag_layer
            )
        return RowOutcome(
            vector_hash, chunk_hash, row_status, row_reason,
            vector_layer.status, age_layer.status, graph_rag_layer.status,
            vector_layer.reason, age_layer.reason, graph_rag_layer.reason,
        )  # fmt: skip

    def _execute_vector_layer(
        self, request: CompensatingDeleteRequest, row: CommittedRow
    ) -> _LayerOutcome:
        """vector 層（pgvector の行）を消す。

        Parameters
        ----------
        request : CompensatingDeleteRequest
            要求。
        row : CommittedRow
            対象の行。

        Returns
        -------
        _LayerOutcome
            層の結果。
        """
        result = self._runtime.execute(
            self._base_builder(request, row, CoreVectorDbOperation.DELETE)
            .graph_write_setting(CoreGraphWriteSetting.disabled())
            .metadata(METADATA_COMPENSATING_LAYER, LAYER_VECTOR)
            .build()
        )
        if result.success:
            return _LayerOutcome(LayerStatus.DELETED, "")
        if self._is_vector_already_absent(result.failure):
            return _LayerOutcome(LayerStatus.SKIPPED, REASON_ALREADY_ABSENT)
        return _LayerOutcome(LayerStatus.FAILED, "provider_failure")

    def _execute_age_layer(
        self, request: CompensatingDeleteRequest, row: CommittedRow
    ) -> _LayerOutcome:
        """AGE 層（Graph のノード）を消す。

        Parameters
        ----------
        request : CompensatingDeleteRequest
            要求。
        row : CommittedRow
            対象の行。

        Returns
        -------
        _LayerOutcome
            層の結果。
        """
        if not request.graph_write_enabled:
            return _LayerOutcome(LayerStatus.DISABLED, REASON_GRAPH_WRITE_DISABLED)
        result = self._runtime.execute(
            self._base_builder(request, row, CoreVectorDbOperation.GRAPH_DELETE)
            .graph_write_setting(
                CoreGraphWriteSetting.enabled_with(request.ownership_scope.graph_name)
            )
            .graph_chunk_payload(
                CoreGraphChunkWritePayload.delete_ids([row.vector_row_id])
            )
            .build()
        )
        if result.success:
            if (
                result.graph_result is not None
                and result.graph_result.is_absent_skipped()
            ):
                return _LayerOutcome(
                    LayerStatus.SKIPPED, result.graph_result.cause_category
                )
            return _LayerOutcome(LayerStatus.DELETED, "")
        if _is_malformed_graph_failure(result.failure):
            return _LayerOutcome(
                LayerStatus.FAILED,
                _graph_failure_reason(result.failure, result.graph_result),
            )
        if self._is_graph_benign_absence(result.failure, result.graph_result):
            return _LayerOutcome(
                LayerStatus.SKIPPED, _graph_benign_reason(result.graph_result)
            )
        return _LayerOutcome(
            LayerStatus.FAILED,
            _graph_failure_reason(result.failure, result.graph_result),
        )

    def _execute_graph_rag_layer(
        self, request: CompensatingDeleteRequest, row: CommittedRow
    ) -> _LayerOutcome:
        """GraphRAG 層（graphrag_s02 のチャンク）を消す。

        Parameters
        ----------
        request : CompensatingDeleteRequest
            要求。
        row : CommittedRow
            対象の行。

        Returns
        -------
        _LayerOutcome
            層の結果。
        """
        if not row.tenant_id.strip() or not row.graph_rag_chunk_id.strip():
            return _LayerOutcome(LayerStatus.SKIPPED, REASON_EMPTY_METADATA)
        result = self._runtime.execute(
            self._base_builder(request, row, CoreVectorDbOperation.DELETE)
            .graph_write_setting(CoreGraphWriteSetting.disabled())
            .metadata(METADATA_COMPENSATING_LAYER, LAYER_GRAPH_RAG)
            .build()
        )
        if result.success:
            if (
                result.graph_result is not None
                and result.graph_result.is_absent_skipped()
            ):
                return _LayerOutcome(LayerStatus.SKIPPED, REASON_ALREADY_ABSENT)
            return _LayerOutcome(LayerStatus.DELETED, "")
        return _LayerOutcome(LayerStatus.FAILED, "graph_rag_delete_failure")

    @staticmethod
    def _base_builder(
        request: CompensatingDeleteRequest,
        row: CommittedRow,
        operation: CoreVectorDbOperation,
    ) -> CoreVectorDbRequestBuilder:
        """3 層で共通の要求の Builder を作る。

        Parameters
        ----------
        request : CompensatingDeleteRequest
            要求。
        row : CommittedRow
            対象の行。
        operation : CoreVectorDbOperation
            操作。

        Returns
        -------
        CoreVectorDbRequestBuilder
            Builder。
        """
        return (
            CoreVectorDbRequest.builder(request.ownership_scope.provider_id, operation)
            .network_setting(request.network_setting)
            .target(request.target)
            .payload(CoreVectorDbPayload.delete(row.vector_row_id))
            .metadata("tenantId", row.tenant_id)
            .metadata("graphRagChunkId", row.graph_rag_chunk_id)
            .metadata("graphRagSourceRef", row.source_ref)
        )

    @staticmethod
    def _aggregate_row_status(*layers: _LayerOutcome) -> RowStatus:
        """3 層の結果から行の状態を決める。

        Parameters
        ----------
        *layers : _LayerOutcome
            vector・AGE・GraphRAG の結果。

        Returns
        -------
        RowStatus
            失敗が 1 つでもあれば FAILED、削除が 1 つでもあれば DELETED、他は SKIPPED。
        """
        if any(layer.status == LayerStatus.FAILED for layer in layers):
            return RowStatus.FAILED
        if any(layer.status == LayerStatus.DELETED for layer in layers):
            return RowStatus.DELETED
        return RowStatus.SKIPPED

    @staticmethod
    def _first_failed_layer_reason(*layers: _LayerOutcome) -> str:
        """最初に失敗した層の理由を返す（vector → AGE → GraphRAG の順）。

        Parameters
        ----------
        *layers : _LayerOutcome
            vector・AGE・GraphRAG の結果。

        Returns
        -------
        str
            理由。どれも失敗でなければ最後の層の理由。
        """
        vector_layer, age_layer, graph_rag_layer = layers
        if vector_layer.status == LayerStatus.FAILED:
            return vector_layer.reason
        if age_layer.status == LayerStatus.FAILED:
            return age_layer.reason
        return graph_rag_layer.reason

    @staticmethod
    def _build_outcome(
        request: CompensatingDeleteRequest, outcomes: list[RowOutcome]
    ) -> CompensatingDeleteOutcome:
        """行ごとの結果から全体の結果を作る。

        Parameters
        ----------
        request : CompensatingDeleteRequest
            要求。
        outcomes : list[RowOutcome]
            行ごとの結果。

        Returns
        -------
        CompensatingDeleteOutcome
            全体の結果。
        """
        assert (
            request.ownership_scope is not None
            and request.committed_row_ids is not None
        )
        has_failed = any(o.status == RowStatus.FAILED for o in outcomes)
        has_deleted = any(o.status == RowStatus.DELETED for o in outcomes)
        all_skipped = all(
            o.status in (RowStatus.SKIPPED, RowStatus.BLOCKED) for o in outcomes
        )
        count = len(request.committed_row_ids.chunk_ids())
        source_ref = request.ownership_scope.source_ref
        code = request.trigger_failure_code
        chunk_id = request.reject_chunk_id
        if all_skipped:
            return CompensatingDeleteOutcome(
                OverallStatus.SKIPPED, code, safe_hash(source_ref), safe_hash(chunk_id),
                _now(), tuple(outcomes), count,
            )  # fmt: skip
        if has_failed and has_deleted:
            return CompensatingDeleteOutcome.partial(
                code, source_ref, chunk_id, outcomes, count
            )
        if has_failed:
            return CompensatingDeleteOutcome.failed(
                code, source_ref, chunk_id, outcomes, count
            )
        return CompensatingDeleteOutcome.completed(
            code, source_ref, chunk_id, outcomes, count
        )

    def is_already_absent(self, failure: CoreFailure | None) -> bool:
        """vector・Graph いずれかで「すでにない」ことによる失敗か。

        接続・権限・AGE 利用不可の失敗は、メッセージに「not found」が含まれても
        本物の失敗のままにする。

        Parameters
        ----------
        failure : CoreFailure | None
            失敗。

        Returns
        -------
        bool
            対象不在なら True。
        """
        return self._is_vector_already_absent(failure) or (
            not _is_malformed_graph_failure(failure)
            and self._is_graph_benign_absence_message(failure)
        )

    @staticmethod
    def _is_vector_already_absent(failure: CoreFailure | None) -> bool:
        """vector 層で対象がなかった失敗か。

        Parameters
        ----------
        failure : CoreFailure | None
            失敗。

        Returns
        -------
        bool
            対象不在なら True。
        """
        if failure is None:
            return False
        if failure.code == "TARGET_NOT_FOUND":
            return True
        summary = _normalized_summary(failure)
        return "target vector row not found" in summary or "already absent" in summary

    def _is_graph_benign_absence(
        self, failure: CoreFailure | None, graph_result: CoreGraphWriteResult | None
    ) -> bool:
        """Graph 層で対象がなかっただけの失敗か。

        Parameters
        ----------
        failure : CoreFailure | None
            失敗。
        graph_result : CoreGraphWriteResult | None
            Graph の結果。

        Returns
        -------
        bool
            対象不在なら True。
        """
        if _is_malformed_graph_failure(failure):
            return False
        if graph_result is not None and graph_result.is_absent_skipped():
            return True
        return self._is_graph_benign_absence_message(failure)

    @staticmethod
    def _is_graph_benign_absence_message(failure: CoreFailure | None) -> bool:
        """失敗メッセージが「対象不在」を示すか（本物の Graph 失敗は除く）。

        Parameters
        ----------
        failure : CoreFailure | None
            失敗。

        Returns
        -------
        bool
            対象不在なら True。
        """
        if failure is None:
            return False
        summary = _normalized_summary(failure)
        if _is_real_graph_failure_code(failure) or (
            "age graph is unavailable or missing." in summary
        ):
            return False
        return (
            MALFORMED_GRAPH_RESULT in summary
            or "graph_node_unwritten" in summary
            or "already absent" in summary
        )
