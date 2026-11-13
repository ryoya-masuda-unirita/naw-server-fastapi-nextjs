"""取り込みの結果と、その部品（移植元 IngestionResult ほか）。"""

from dataclasses import dataclass, field, replace
from enum import Enum

from generative_ai_core.failure import sanitize


def _normalize(value: str | None, fallback: str | None) -> str | None:
    """空白だけなら代わりの値、そうでなければ前後の空白を除く。

    Parameters
    ----------
    value : str | None
        値。
    fallback : str | None
        代わりの値。

    Returns
    -------
    str | None
        整えた値。
    """
    if value is None or not value.strip():
        return fallback
    return value.strip()


@dataclass(frozen=True)
class IngestionAdmissionDecision:
    """受け入れ判定の結果。"""

    accepted: bool
    status: str
    failure_code: str | None

    @classmethod
    def accept(cls) -> "IngestionAdmissionDecision":
        """受け入れを返す。

        Returns
        -------
        IngestionAdmissionDecision
            受け入れ。
        """
        return cls(True, "ACCEPTED", None)

    @classmethod
    def reject(cls, failure_code: str) -> "IngestionAdmissionDecision":
        """拒否を返す。

        Parameters
        ----------
        failure_code : str
            拒否コード。

        Returns
        -------
        IngestionAdmissionDecision
            拒否。
        """
        return cls(False, "REJECTED", failure_code)


@dataclass(frozen=True)
class IngestionNonGoalProbe:
    """取り込みが対象外の処理を呼んでいないことの計測（常に 0 が正）。"""

    live_embedding_provider_calls: int = 0
    retrieval_calls: int = 0
    answer_generation_calls: int = 0
    graph_db_worker_calls: int = 0
    outbox_consumer_calls: int = 0
    router_calls: int = 0
    accuracy_evaluation_calls: int = 0

    @classmethod
    def zero(cls) -> "IngestionNonGoalProbe":
        """すべて 0 の計測を返す。

        Returns
        -------
        IngestionNonGoalProbe
            すべて 0 の計測。
        """
        return cls()

    def all_zero(self) -> bool:
        """すべて 0 か。

        Returns
        -------
        bool
            すべて 0 なら True。
        """
        return not any(
            (
                self.live_embedding_provider_calls,
                self.retrieval_calls,
                self.answer_generation_calls,
                self.graph_db_worker_calls,
                self.outbox_consumer_calls,
                self.router_calls,
                self.accuracy_evaluation_calls,
            )
        )


@dataclass(frozen=True)
class IngestionSchemaReadiness:
    """取り込み先のスキーマが使える状態か。"""

    ready: bool
    status: str | None = None
    failure_code: str | None = None

    def __post_init__(self) -> None:
        """状態・失敗コードの既定値を補う。"""
        object.__setattr__(
            self,
            "status",
            _normalize(self.status, "ready" if self.ready else "missing"),
        )
        object.__setattr__(
            self,
            "failure_code",
            _normalize(self.failure_code, None if self.ready else "SCHEMA_NOT_READY"),
        )

    @classmethod
    def available(cls) -> "IngestionSchemaReadiness":
        """使える状態を返す。

        Returns
        -------
        IngestionSchemaReadiness
            使える状態。
        """
        return cls(True, "ready", None)

    @classmethod
    def missing(cls, failure_code: str) -> "IngestionSchemaReadiness":
        """スキーマがない状態を返す。

        Parameters
        ----------
        failure_code : str
            失敗コード。

        Returns
        -------
        IngestionSchemaReadiness
            ない状態。
        """
        return cls(False, "missing", failure_code)

    @classmethod
    def incompatible(cls, failure_code: str) -> "IngestionSchemaReadiness":
        """スキーマが合わない状態を返す。

        Parameters
        ----------
        failure_code : str
            失敗コード。

        Returns
        -------
        IngestionSchemaReadiness
            合わない状態。
        """
        return cls(False, "incompatible", failure_code)


@dataclass(frozen=True)
class IngestionChunkDiffSummary:
    """チャンクの差分の要約。"""

    changed: bool
    added_chunks: int
    unchanged_chunks: int
    stale_chunks: int
    current_chunks: int
    previous_content_hash: str | None
    current_content_hash: str | None

    @classmethod
    def none(cls, content_hash: str | None) -> "IngestionChunkDiffSummary":
        """変更なしの要約を返す。

        Parameters
        ----------
        content_hash : str | None
            内容のハッシュ。

        Returns
        -------
        IngestionChunkDiffSummary
            変更なし。
        """
        return cls(False, 0, 1, 0, 1, content_hash, content_hash)

    @classmethod
    def initial(cls, content_hash: str | None) -> "IngestionChunkDiffSummary":
        """初回登録の要約を返す。

        Parameters
        ----------
        content_hash : str | None
            内容のハッシュ。

        Returns
        -------
        IngestionChunkDiffSummary
            初回登録。
        """
        return cls(True, 1, 0, 0, 1, None, content_hash)

    @classmethod
    def replacement(
        cls, previous_content_hash: str | None, current_content_hash: str | None
    ) -> "IngestionChunkDiffSummary":
        """差し替えの要約を返す。

        Parameters
        ----------
        previous_content_hash : str | None
            差し替え前のハッシュ。
        current_content_hash : str | None
            差し替え後のハッシュ。

        Returns
        -------
        IngestionChunkDiffSummary
            差し替え。
        """
        return cls(True, 1, 0, 1, 1, previous_content_hash, current_content_hash)


class GraphCandidateRepairOutcome(Enum):
    """Graph Candidate の修復の結果。値は (処理した, 修復を試した, 修復成功, 最終拒否)。"""

    NOT_PROCESSED = (False, False, False, False)
    NO_REPAIR = (True, False, False, False)
    REJECTED_WITHOUT_REPAIR = (True, False, False, True)
    REPAIR_SUCCEEDED = (True, True, True, False)
    REPAIR_REJECTED = (True, True, False, True)

    def graph_candidate_processed(self) -> bool:
        """Graph Candidate を処理したか。

        Returns
        -------
        bool
            処理したら True。
        """
        return self.value[0]

    def repair_attempted(self) -> bool:
        """修復を試したか。

        Returns
        -------
        bool
            試したら True。
        """
        return self.value[1]

    def repair_succeeded(self) -> bool:
        """修復に成功したか。

        Returns
        -------
        bool
            成功したら True。
        """
        return self.value[2]

    def final_rejected(self) -> bool:
        """最終的に拒否されたか。

        Returns
        -------
        bool
            拒否されたら True。
        """
        return self.value[3]


@dataclass(frozen=True)
class IngestionResult:
    """1 つの取り込みの結果。生成時に失敗の伏せ字・既定値を補う。"""

    accepted: bool
    status: str | None = None
    failure_code: str | None = None
    failure_summary: str | None = None
    tenant_id: str | None = None
    source_ref: str | None = None
    document_id: str | None = None
    document_version_id: str | None = None
    chunk_id: str | None = None
    content_hash: str | None = None
    idempotent: bool = False
    duplicate_report_only: bool = False
    documents_created: int = 0
    versions_created: int = 0
    chunks_created: int = 0
    identifiers_created: int = 0
    entities_created: int = 0
    edges_created: int = 0
    evidence_created: int = 0
    embedding_queue_rows_created: int = 0
    projection_events_created: int = 0
    outbox_rows_created: int = 0
    acl_materialization_rows_created: int = 0
    stale_versions: int = 0
    stale_chunks: int = 0
    schema_readiness: str | None = None
    chunk_diff_summary: IngestionChunkDiffSummary | None = None
    non_goal_execution: IngestionNonGoalProbe | None = None
    evidence_links: tuple[str, ...] = field(default_factory=tuple)
    learnable_reject_code: str | None = None
    learnable_reject_summary: str | None = None
    graph_candidate_repair_outcome: GraphCandidateRepairOutcome | None = None

    def __post_init__(self) -> None:
        """移植元のコンストラクタと同じ規則で既定値・伏せ字を補う。"""
        set_ = object.__setattr__
        accepted = self.accepted
        set_(
            self,
            "status",
            _normalize(self.status, "ACCEPTED" if accepted else "REJECTED"),
        )
        set_(
            self,
            "failure_code",
            None if accepted else _normalize(self.failure_code, "INGESTION_REJECTED"),
        )
        set_(
            self,
            "failure_summary",
            None
            if accepted
            else sanitize(_normalize(self.failure_summary, "Ingestion failed closed.")),
        )
        set_(self, "schema_readiness", _normalize(self.schema_readiness, "not checked"))
        set_(
            self,
            "chunk_diff_summary",
            self.chunk_diff_summary
            or IngestionChunkDiffSummary.none(self.content_hash),
        )
        set_(
            self,
            "non_goal_execution",
            self.non_goal_execution or IngestionNonGoalProbe.zero(),
        )
        set_(self, "evidence_links", tuple(self.evidence_links or ()))
        outcome = (
            self.graph_candidate_repair_outcome
            or GraphCandidateRepairOutcome.NOT_PROCESSED
        )
        reject_code = self.learnable_reject_code
        reject_summary = self.learnable_reject_summary
        if not accepted:
            reject_code = None
            reject_summary = None
            outcome = GraphCandidateRepairOutcome.NOT_PROCESSED
        elif reject_code is not None:
            reject_summary = (
                None if reject_summary is None else sanitize(reject_summary)
            )
        else:
            reject_summary = None
        set_(self, "learnable_reject_code", reject_code)
        set_(self, "learnable_reject_summary", reject_summary)
        set_(self, "graph_candidate_repair_outcome", outcome)

    @classmethod
    def rejected(
        cls,
        request: "object | None",
        failure_code: str | None,
        failure_summary: str | None,
        schema_readiness: str | None,
    ) -> "IngestionResult":
        """拒否の結果を作る（作成数はすべて 0）。

        Parameters
        ----------
        request : object | None
            取り込みの要求（`tenant_id`・`source_ref` を持つもの）。None 可。
        failure_code : str | None
            拒否コード。
        failure_summary : str | None
            拒否の要約。
        schema_readiness : str | None
            スキーマの状態。

        Returns
        -------
        IngestionResult
            拒否の結果。
        """
        tenant_id = getattr(request, "tenant_id", None)
        source_ref = getattr(request, "source_ref", None)
        return cls(
            accepted=False,
            status="REJECTED",
            failure_code=failure_code,
            failure_summary=failure_summary,
            tenant_id=tenant_id,
            source_ref=source_ref,
            schema_readiness=schema_readiness,
            chunk_diff_summary=IngestionChunkDiffSummary.none(None),
            non_goal_execution=IngestionNonGoalProbe.zero(),
        )

    def zero_state(self) -> bool:
        """何も作成していないか。

        Returns
        -------
        bool
            作成数がすべて 0 なら True。
        """
        return not any(
            (
                self.documents_created,
                self.versions_created,
                self.chunks_created,
                self.identifiers_created,
                self.entities_created,
                self.edges_created,
                self.evidence_created,
                self.embedding_queue_rows_created,
                self.projection_events_created,
                self.outbox_rows_created,
                self.acl_materialization_rows_created,
            )
        )

    def with_counts(
        self,
        identifiers_created: int,
        entities_created: int,
        edges_created: int,
        evidence_created: int,
        embedding_queue_rows_created: int,
        outbox_rows_created: int,
        acl_materialization_rows_created: int,
    ) -> "IngestionResult":
        """実際に挿入した件数で作成数を置き換えた結果を返す。

        Parameters
        ----------
        identifiers_created : int
            識別子の作成数。
        entities_created : int
            エンティティの作成数。
        edges_created : int
            エッジの作成数。
        evidence_created : int
            根拠の作成数。
        embedding_queue_rows_created : int
            埋め込みキューの作成数。
        outbox_rows_created : int
            アウトボックスの作成数。
        acl_materialization_rows_created : int
            ACL 実体化の作成数。

        Returns
        -------
        IngestionResult
            置き換えた結果。
        """
        return replace(
            self,
            identifiers_created=identifiers_created,
            entities_created=entities_created,
            edges_created=edges_created,
            evidence_created=evidence_created,
            embedding_queue_rows_created=embedding_queue_rows_created,
            outbox_rows_created=outbox_rows_created,
            acl_materialization_rows_created=acl_materialization_rows_created,
        )

    def with_learnable_reject(
        self, code: str | None, summary: str | None
    ) -> "IngestionResult":
        """学習可能な拒否（Graph Candidate の拒否）を付けた結果を返す。

        Parameters
        ----------
        code : str | None
            拒否コード。
        summary : str | None
            拒否の要約。

        Returns
        -------
        IngestionResult
            拒否を付けた結果。
        """
        return replace(
            self, learnable_reject_code=code, learnable_reject_summary=summary
        )

    def with_graph_candidate_repair_outcome(
        self, outcome: GraphCandidateRepairOutcome
    ) -> "IngestionResult":
        """修復の結果を付けた結果を返す。

        Parameters
        ----------
        outcome : GraphCandidateRepairOutcome
            修復の結果。

        Returns
        -------
        IngestionResult
            修復の結果を付けた結果。
        """
        return replace(self, graph_candidate_repair_outcome=outcome)
