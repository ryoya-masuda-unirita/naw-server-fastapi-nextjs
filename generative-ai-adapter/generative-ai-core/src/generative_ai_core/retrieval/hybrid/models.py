"""ハイブリッド検索の値オブジェクト（移植元 jp.co.unirita.ai.core.retrieval.hybrid）。

チャネル・候補・ACL・マージ結果・準備状況・トレース・証拠パック・失敗・禁止内容スキャンを
まとめて移した。
"""

import hashlib
import math
import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from enum import Enum

from generative_ai_core.failure import sanitize

DEFAULT_TENANT = "default_tenant"
DEFAULT_SERVING_PROFILE = "serving-profile-v1"
DEFAULT_REQUEST_CONTEXT = "s04-fixture"
QUERY_DIGEST_LENGTH = 24
DEFAULT_MAX_RESULTS = 5


def _normalize(value: str | None) -> str:
    """前後の空白を除く（None は空文字）。

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


def _unique_texts(values: Sequence[str | None] | None) -> tuple[str, ...]:
    """空でない文字列の前後の空白を除き、重複を落とす。

    Parameters
    ----------
    values : Sequence[str | None] | None
        文字列の並び。

    Returns
    -------
    tuple[str, ...]
        重複のない並び。
    """
    return tuple(
        dict.fromkeys(v.strip() for v in (values or ()) if v is not None and v.strip())
    )


class RetrievalChannel(Enum):
    """検索のチャネル。"""

    IDENTIFIER_EXACT = "IDENTIFIER_EXACT"
    JAPANESE_FULL_TEXT = "JAPANESE_FULL_TEXT"
    SEMANTIC_VECTOR = "SEMANTIC_VECTOR"
    CHUNK_NEIGHBOR = "CHUNK_NEIGHBOR"
    BUSINESS_RELATIONSHIP = "BUSINESS_RELATIONSHIP"


@dataclass(frozen=True)
class RetrievalCandidate:
    """検索の候補（チャンク）。

    Attributes
    ----------
    chunk_id : str
        チャンク ID。
    document_id : str
        文書 ID。
    version_id : str
        版（`current` なら現行）。
    source_reference : str
        出典の参照（サニタイズする）。
    citation_target : str
        引用先（サニタイズする）。
    sanitized_snippet : str
        本文の抜粋（サニタイズする）。
    channel : RetrievalChannel
        検索したチャネル。
    channel_rank : int
        チャネル内の順位（1 以上）。
    score : float
        スコア。
    serving_profile_id : str
        サービングプロファイル。
    current : bool
        現行の文書か。
    tenant_id : str
        テナント。
    classification_rank : int
        機密区分の順位（1 以上）。
    acl_mode : str
        `tenant_wide` か `restricted`。
    acl_principal_ids : tuple[str, ...]
        閲覧できるプリンシパル。
    metadata : Mapping[str, str]
        追加の情報。
    """

    chunk_id: str
    document_id: str
    version_id: str = ""
    source_reference: str = ""
    citation_target: str = ""
    sanitized_snippet: str = ""
    channel: RetrievalChannel = RetrievalChannel.SEMANTIC_VECTOR
    channel_rank: int = 1
    score: float = 0.0
    serving_profile_id: str = ""
    current: bool = True
    tenant_id: str = ""
    classification_rank: int = 1
    acl_mode: str = "tenant_wide"
    acl_principal_ids: Sequence[str] = ()
    metadata: Mapping[str, str] = field(default_factory=dict, hash=False)

    def __post_init__(self) -> None:
        """項目を正規化する（出典・引用先・抜粋はサニタイズする）。

        Raises
        ------
        ValueError
            chunk_id か document_id が空のとき。
        """
        for name in ("chunk_id", "document_id"):
            value = getattr(self, name)
            if value is None or not value.strip():
                raise ValueError(f"{_camel(name)} must not be blank")
            object.__setattr__(self, name, value.strip())
        object.__setattr__(self, "version_id", _normalize(self.version_id))
        for name in ("source_reference", "citation_target", "sanitized_snippet"):
            object.__setattr__(self, name, sanitize(_normalize(getattr(self, name))))
        object.__setattr__(
            self, "channel", self.channel or RetrievalChannel.SEMANTIC_VECTOR
        )
        object.__setattr__(self, "channel_rank", max(1, self.channel_rank))
        object.__setattr__(
            self, "serving_profile_id", _normalize(self.serving_profile_id)
        )
        object.__setattr__(self, "tenant_id", _normalize(self.tenant_id))
        object.__setattr__(
            self, "classification_rank", max(1, self.classification_rank)
        )
        object.__setattr__(self, "acl_mode", _normalize(self.acl_mode) or "tenant_wide")
        object.__setattr__(
            self, "acl_principal_ids", _unique_texts(self.acl_principal_ids)
        )
        object.__setattr__(self, "metadata", dict(self.metadata or {}))

    def with_channel(
        self, channel: RetrievalChannel, rank: int, score: float
    ) -> "RetrievalCandidate":
        """チャネル・順位・スコアを差し替えた写しを返す。

        Parameters
        ----------
        channel : RetrievalChannel
            新しいチャネル。
        rank : int
            新しい順位。
        score : float
            新しいスコア。

        Returns
        -------
        RetrievalCandidate
            写し。
        """
        return RetrievalCandidate(
            self.chunk_id,
            self.document_id,
            self.version_id,
            self.source_reference,
            self.citation_target,
            self.sanitized_snippet,
            channel,
            rank,
            score,
            self.serving_profile_id,
            self.current,
            self.tenant_id,
            self.classification_rank,
            self.acl_mode,
            self.acl_principal_ids,
            self.metadata,
        )

    def visible_to(self, context: "RetrievalAclContext | None") -> bool:
        """ACL の文脈から見えるかを返す。

        Parameters
        ----------
        context : RetrievalAclContext | None
            ACL の文脈。

        Returns
        -------
        bool
            見えれば True。
        """
        return context is not None and context.can_see(self)

    def metadata_value(self, key: str) -> str:
        """追加の情報の値を返す。

        Parameters
        ----------
        key : str
            キー。

        Returns
        -------
        str
            値。なければ空文字。
        """
        return self.metadata.get(key, "")


def _camel(snake: str) -> str:
    """スネークケースをキャメルケースにする（エラーメッセージを移植元に揃えるため）。

    Parameters
    ----------
    snake : str
        スネークケースの名前。

    Returns
    -------
    str
        キャメルケースの名前。
    """
    head, *tail = snake.split("_")
    return head + "".join(part.capitalize() for part in tail)


@dataclass(frozen=True)
class RetrievalAclContext:
    """検索する人の ACL の文脈。

    Attributes
    ----------
    tenant_id : str
        テナント。
    principal_id : str
        プリンシパル。
    principal_ids : tuple[str, ...]
        所属するプリンシパルの一覧。
    clearance_rank : int
        閲覧できる機密区分の上限（1 以上）。
    guc_set : bool
        DB のリクエスト文脈（GUC）が設定済みか。
    """

    tenant_id: str = ""
    principal_id: str = ""
    principal_ids: Sequence[str] = ()
    clearance_rank: int = 1
    guc_set: bool = True

    def __post_init__(self) -> None:
        """項目を正規化する。"""
        object.__setattr__(self, "tenant_id", _normalize(self.tenant_id))
        object.__setattr__(self, "principal_id", _normalize(self.principal_id))
        object.__setattr__(self, "principal_ids", _unique_texts(self.principal_ids))
        object.__setattr__(self, "clearance_rank", max(1, self.clearance_rank))

    @classmethod
    def default_context(cls) -> "RetrievalAclContext":
        """既定のテナント・ユーザーの文脈を返す。

        Returns
        -------
        RetrievalAclContext
            既定の文脈。
        """
        return cls(DEFAULT_TENANT, "default_user", ("default_principal",), 1, True)

    def can_see(self, candidate: RetrievalCandidate | None) -> bool:
        """候補が見えるかを返す。

        Parameters
        ----------
        candidate : RetrievalCandidate | None
            候補。

        Returns
        -------
        bool
            GUC 設定済み・現行・同じテナント・機密区分が範囲内で、`tenant_wide` か
            所属プリンシパルが許可されていれば True。
        """
        if not self.guc_set or candidate is None or not candidate.current:
            return False
        if (
            self.tenant_id != candidate.tenant_id
            or candidate.classification_rank > self.clearance_rank
        ):
            return False
        if candidate.acl_mode == "tenant_wide":
            return True
        if candidate.acl_mode != "restricted":
            return False
        allowed = set(candidate.acl_principal_ids)
        return any(principal in allowed for principal in self.principal_ids)


@dataclass(frozen=True)
class MergedRetrievalItem:
    """複数のチャネルをまとめた 1 件。

    Attributes
    ----------
    candidate : RetrievalCandidate
        候補。
    merged_rank : int
        まとめた後の順位（1 以上）。
    reciprocal_rank_score : float
        RRF のスコア。
    channels : tuple[RetrievalChannel, ...]
        ヒットしたチャネル。
    channel_ranks : Mapping[RetrievalChannel, int]
        チャネルごとの順位。
    """

    candidate: RetrievalCandidate
    merged_rank: int = 1
    reciprocal_rank_score: float = 0.0
    channels: Sequence[RetrievalChannel] | None = None
    channel_ranks: Mapping[RetrievalChannel, int] = field(
        default_factory=dict, hash=False
    )

    def __post_init__(self) -> None:
        """項目を正規化する。

        Raises
        ------
        ValueError
            candidate が None のとき。
        """
        if self.candidate is None:
            raise ValueError("candidate must not be null")
        object.__setattr__(self, "merged_rank", max(1, self.merged_rank))
        channels = (
            (self.candidate.channel,) if self.channels is None else tuple(self.channels)
        )
        object.__setattr__(self, "channels", channels)
        ranks = {
            channel: max(1, rank)
            for channel, rank in (self.channel_ranks or {}).items()
            if channel is not None and rank is not None
        }
        object.__setattr__(self, "channel_ranks", ranks)

    def channel_list(self) -> tuple[RetrievalChannel, ...]:
        """ヒットしたチャネルを返す（`__post_init__` で必ず入る）。

        Returns
        -------
        tuple[RetrievalChannel, ...]
            チャネルの並び。
        """
        assert self.channels is not None
        return tuple(self.channels)


@dataclass(frozen=True)
class HybridRetrievalFailure:
    """ハイブリッド検索の失敗。

    Attributes
    ----------
    code : str
        コード（空なら `S04_RETRIEVAL_FAILURE`）。
    summary : str
        サニタイズした要約。
    """

    code: str
    summary: str = ""

    def __post_init__(self) -> None:
        """コードを整え、要約をサニタイズする。"""
        object.__setattr__(
            self, "code", _normalize(self.code) or "S04_RETRIEVAL_FAILURE"
        )
        object.__setattr__(self, "summary", sanitize(self.summary or ""))

    @classmethod
    def of(cls, code: str | None, summary: str | None) -> "HybridRetrievalFailure":
        """コードと要約から失敗を作る。

        Parameters
        ----------
        code : str | None
            コード。
        summary : str | None
            要約。

        Returns
        -------
        HybridRetrievalFailure
            失敗。
        """
        return cls(code or "", summary or "")


def _clamp_rate(value: float) -> float:
    """割合を 0〜1 に丸める（NaN は 0）。

    Parameters
    ----------
    value : float
        割合。

    Returns
    -------
    float
        丸めた割合。
    """
    if math.isnan(value) or value < 0.0:
        return 0.0
    return min(1.0, value)


@dataclass(frozen=True)
class VectorReadinessEvidence:
    """ベクトル検索の準備状況の証拠。

    Attributes
    ----------
    vector_evidence_id : str
        証拠 ID。
    serving_profile_id : str
        サービングプロファイル。
    iterative_scan_enabled : bool
        iterative scan が有効か。
    partial_hnsw_index_used : bool
        HNSW インデックスを使ったか。
    distance_plus_zero_rerank_applied : bool
        距離の再ランクを適用したか。
    vector_limit_shortfall_rate : float
        件数が足りなかった割合。
    hnsw_index_usage_rate : float
        HNSW インデックスの使用率。
    semantic_candidate_count : int
        ベクトル検索の候補数。
    failure_code : str
        失敗コード。
    """

    vector_evidence_id: str = ""
    serving_profile_id: str = ""
    iterative_scan_enabled: bool = False
    partial_hnsw_index_used: bool = False
    distance_plus_zero_rerank_applied: bool = False
    vector_limit_shortfall_rate: float = 0.0
    hnsw_index_usage_rate: float = 0.0
    semantic_candidate_count: int = 0
    failure_code: str = ""

    def __post_init__(self) -> None:
        """項目を正規化する。"""
        object.__setattr__(
            self,
            "vector_evidence_id",
            _normalize(self.vector_evidence_id) or "s04-vector-evidence",
        )
        object.__setattr__(
            self, "serving_profile_id", _normalize(self.serving_profile_id)
        )
        object.__setattr__(
            self,
            "vector_limit_shortfall_rate",
            _clamp_rate(self.vector_limit_shortfall_rate),
        )
        object.__setattr__(
            self, "hnsw_index_usage_rate", _clamp_rate(self.hnsw_index_usage_rate)
        )
        object.__setattr__(
            self, "semantic_candidate_count", max(0, self.semantic_candidate_count)
        )
        object.__setattr__(self, "failure_code", _normalize(self.failure_code))

    @classmethod
    def success(
        cls,
        evidence_id: str,
        serving_profile_id: str,
        semantic_candidate_count: int,
        shortfall_rate: float,
        hnsw_index_usage_rate: float,
    ) -> "VectorReadinessEvidence":
        """成功の証拠を作る。

        Parameters
        ----------
        evidence_id : str
            証拠 ID。
        serving_profile_id : str
            サービングプロファイル。
        semantic_candidate_count : int
            候補数。
        shortfall_rate : float
            不足の割合。
        hnsw_index_usage_rate : float
            HNSW の使用率。

        Returns
        -------
        VectorReadinessEvidence
            成功の証拠。
        """
        return cls(
            evidence_id,
            serving_profile_id,
            True,
            True,
            True,
            shortfall_rate,
            hnsw_index_usage_rate,
            semantic_candidate_count,
            "",
        )

    @classmethod
    def failure(
        cls, evidence_id: str, serving_profile_id: str, failure_code: str
    ) -> "VectorReadinessEvidence":
        """失敗の証拠を作る。

        Parameters
        ----------
        evidence_id : str
            証拠 ID。
        serving_profile_id : str
            サービングプロファイル。
        failure_code : str
            失敗コード。

        Returns
        -------
        VectorReadinessEvidence
            失敗の証拠。
        """
        return cls(
            evidence_id,
            serving_profile_id,
            False,
            False,
            False,
            1.0,
            0.0,
            0,
            failure_code,
        )

    def ready(self) -> bool:
        """準備ができているかを返す。

        Returns
        -------
        bool
            失敗コードがなく、3 つの条件が揃っていれば True。
        """
        return (
            not self.failure_code
            and self.iterative_scan_enabled
            and self.partial_hnsw_index_used
            and self.distance_plus_zero_rerank_applied
        )


def _status_for(failure_code: str | None) -> str:
    """失敗コードから準備状況を決める。

    Parameters
    ----------
    failure_code : str | None
        失敗コード。

    Returns
    -------
    str
        コードがなければ `PASS`、あれば `FAIL_CLOSED`。
    """
    return "PASS" if failure_code is None or not failure_code.strip() else "FAIL_CLOSED"


def _category_for(failure_code: str | None) -> str:
    """失敗コードから分類を決める。

    Parameters
    ----------
    failure_code : str | None
        失敗コード。

    Returns
    -------
    str
        コード（なければ空文字）。
    """
    return (
        "" if failure_code is None or not failure_code.strip() else failure_code.strip()
    )


@dataclass(frozen=True)
class HybridRetrievalReadinessResult:
    """ハイブリッド検索の準備状況。

    Attributes
    ----------
    pgroonga_available : bool
        PGroonga が使えるか。
    pgvector_available : bool
        pgvector が使えるか。
    apache_age_available : bool
        Apache AGE が使えるか。
    search_resources_ready : bool
        検索に必要なリソース（インデックス）が揃っているか。
    trace_resources_ready : bool
        トレースのリソースが揃っているか。
    forbidden_content_scan_status : str
        禁止内容スキャンの結果。
    failure_code : str
        失敗コード。
    pgroonga_extension_available : bool | None
        PGroonga 拡張があるか。省略すると `pgroonga_available`。
    pgroonga_required_index_available : bool | None
        必要なインデックスがあるか。省略すると `search_resources_ready`。
    pgroonga_index_usage_verified : bool | None
        インデックスの使用を確認できたか。省略すると両方が真か。
    readiness_status : str
        準備状況。
    failure_category : str
        失敗の分類。
    """

    pgroonga_available: bool
    pgvector_available: bool
    apache_age_available: bool
    search_resources_ready: bool
    trace_resources_ready: bool
    forbidden_content_scan_status: str = "PASS"
    failure_code: str = ""
    pgroonga_extension_available: bool | None = None
    pgroonga_required_index_available: bool | None = None
    pgroonga_index_usage_verified: bool | None = None
    readiness_status: str = ""
    failure_category: str = ""

    def __post_init__(self) -> None:
        """省略された項目を補う。"""
        code = _normalize(self.failure_code)
        object.__setattr__(self, "failure_code", code)
        extension = (
            self.pgroonga_available
            if self.pgroonga_extension_available is None
            else self.pgroonga_extension_available
        )
        index = (
            self.search_resources_ready
            if self.pgroonga_required_index_available is None
            else self.pgroonga_required_index_available
        )
        usage = (
            (self.pgroonga_available and self.search_resources_ready)
            if self.pgroonga_index_usage_verified is None
            else self.pgroonga_index_usage_verified
        )
        object.__setattr__(self, "pgroonga_extension_available", extension)
        object.__setattr__(self, "pgroonga_required_index_available", index)
        object.__setattr__(self, "pgroonga_index_usage_verified", usage)
        object.__setattr__(
            self,
            "forbidden_content_scan_status",
            _normalize(self.forbidden_content_scan_status) or "PASS",
        )
        object.__setattr__(
            self,
            "readiness_status",
            _normalize(self.readiness_status) or _status_for(code),
        )
        object.__setattr__(
            self,
            "failure_category",
            _normalize(self.failure_category) or _category_for(code),
        )

    def ready(self) -> bool:
        """すべての条件が揃っているかを返す。

        Returns
        -------
        bool
            揃っていれば True。
        """
        return (
            not self.failure_code
            and self.pgroonga_available
            and self.pgvector_available
            and self.apache_age_available
            and self.search_resources_ready
            and self.trace_resources_ready
            and bool(self.pgroonga_extension_available)
            and bool(self.pgroonga_required_index_available)
            and bool(self.pgroonga_index_usage_verified)
            and self.forbidden_content_scan_status == "PASS"
            and self.readiness_status == "PASS"
        )

    def sanitized_summary(self) -> str:
        """失敗の要約を返す。

        Returns
        -------
        str
            準備状況の要約（値は真偽だけ）。
        """
        if self.ready():
            return (
                "hybrid retrieval readiness PASS: extension=true, index=true, "
                "indexUsage=verified"
            )
        usage = "verified" if self.pgroonga_index_usage_verified else "unverified"
        return (
            f"hybrid retrieval readiness {self.readiness_status}: "
            f"extension={_lower(self.pgroonga_extension_available)}, "
            f"index={_lower(self.pgroonga_required_index_available)}, "
            f"indexUsage={usage}, category={self.failure_category}"
        )


def _lower(value: bool | None) -> str:
    """真偽値を `true`/`false` にする（移植元 Boolean.toString）。

    Parameters
    ----------
    value : bool | None
        真偽値。

    Returns
    -------
    str
        `true` か `false`。
    """
    return "true" if value else "false"


@dataclass(frozen=True)
class NonGoalExecutionProbe:
    """非目標の処理（Graph 投影など）を実行していないことを示す計測。

    Attributes
    ----------
    probe_id : str
        計測 ID。
    """

    probe_id: str = "s04-non-goal-probe"

    def __post_init__(self) -> None:
        """ID を整える。"""
        object.__setattr__(
            self, "probe_id", _normalize(self.probe_id) or "s04-non-goal-probe"
        )

    @classmethod
    def zero(cls, probe_id: str) -> "NonGoalExecutionProbe":
        """すべて 0 の計測を作る。

        Parameters
        ----------
        probe_id : str
            計測 ID。

        Returns
        -------
        NonGoalExecutionProbe
            計測。
        """
        return cls(probe_id)


@dataclass(frozen=True)
class RetrievalTraceRecord:
    """検索のトレース（クエリ本文は持たない）。

    Attributes
    ----------
    trace_id : str
        トレース ID。
    request_context_id : str
        リクエスト文脈 ID。
    query_digest : str
        クエリのダイジェスト。
    serving_profile_id : str
        サービングプロファイル。
    channel_candidate_counts : Mapping[RetrievalChannel, int]
        チャネルごとの候補数。
    merged_result_count : int
        まとめた結果の件数。
    vector_evidence_id : str
        ベクトル証拠 ID。
    readiness_status : str
        準備状況。
    failure_code : str
        失敗コード。
    forbidden_content_scan_status : str
        禁止内容スキャンの結果。
    non_goal_probe_id : str
        非目標計測 ID。
    channel_ranks : str
        チャネルの先頭順位。
    """

    trace_id: str
    request_context_id: str
    query_digest: str
    serving_profile_id: str
    channel_candidate_counts: Mapping[RetrievalChannel, int]
    merged_result_count: int
    vector_evidence_id: str
    readiness_status: str
    failure_code: str
    forbidden_content_scan_status: str
    non_goal_probe_id: str
    channel_ranks: str


@dataclass(frozen=True)
class RetrievalEvidenceItem:
    """証拠パックの 1 件。

    Attributes
    ----------
    chunk_id : str
        チャンク ID。
    document_id : str
        文書 ID。
    citation_target : str
        引用先（サニタイズする）。
    source_reference : str
        出典（サニタイズする）。
    channels : tuple[RetrievalChannel, ...]
        チャネル。
    rank_contribution : float
        順位への寄与。
    sanitized_source_metadata : Mapping[str, str]
        サニタイズしたメタデータ。
    """

    chunk_id: str
    document_id: str
    citation_target: str
    source_reference: str
    channels: Sequence[RetrievalChannel]
    rank_contribution: float
    sanitized_source_metadata: Mapping[str, str]

    def __post_init__(self) -> None:
        """項目を正規化・サニタイズする。"""
        object.__setattr__(self, "chunk_id", _normalize(self.chunk_id))
        object.__setattr__(self, "document_id", _normalize(self.document_id))
        object.__setattr__(
            self, "citation_target", sanitize(_normalize(self.citation_target))
        )
        object.__setattr__(
            self, "source_reference", sanitize(_normalize(self.source_reference))
        )
        object.__setattr__(self, "channels", tuple(self.channels or ()))
        object.__setattr__(
            self,
            "sanitized_source_metadata",
            {
                _normalize(key): sanitize(_normalize(value))
                for key, value in (self.sanitized_source_metadata or {}).items()
            },
        )


@dataclass(frozen=True)
class RetrievalEvidencePack:
    """証拠パック。

    Attributes
    ----------
    evidence_pack_id : str
        証拠パック ID。
    items : tuple[RetrievalEvidenceItem, ...]
        証拠。
    vector_only_baseline_quality : float
        ベクトルだけの品質。
    hybrid_quality : float
        ハイブリッドの品質。
    """

    evidence_pack_id: str
    items: Sequence[RetrievalEvidenceItem]
    vector_only_baseline_quality: float
    hybrid_quality: float

    def __post_init__(self) -> None:
        """項目を正規化する。"""
        object.__setattr__(
            self,
            "evidence_pack_id",
            _normalize(self.evidence_pack_id) or "s04-evidence",
        )
        object.__setattr__(self, "items", tuple(self.items or ()))


@dataclass(frozen=True)
class MergedRetrievalResult:
    """ハイブリッド検索のまとめた結果。

    Attributes
    ----------
    items : tuple[MergedRetrievalItem, ...]
        まとめた結果。
    evidence_pack : RetrievalEvidencePack | None
        証拠パック。
    trace_record : RetrievalTraceRecord | None
        トレース。
    vector_evidence : VectorReadinessEvidence | None
        ベクトルの準備状況。
    non_goal_execution_probe : NonGoalExecutionProbe
        非目標の計測。
    failure : HybridRetrievalFailure | None
        失敗。
    """

    items: Sequence[MergedRetrievalItem] = ()
    evidence_pack: RetrievalEvidencePack | None = None
    trace_record: RetrievalTraceRecord | None = None
    vector_evidence: VectorReadinessEvidence | None = None
    non_goal_execution_probe: NonGoalExecutionProbe | None = None
    failure: HybridRetrievalFailure | None = None

    def __post_init__(self) -> None:
        """項目を正規化する。"""
        object.__setattr__(self, "items", tuple(self.items or ()))
        if self.non_goal_execution_probe is None:
            object.__setattr__(
                self,
                "non_goal_execution_probe",
                NonGoalExecutionProbe.zero("s04-non-goal-probe"),
            )

    @classmethod
    def of_failure(
        cls,
        failure: HybridRetrievalFailure,
        trace_record: RetrievalTraceRecord | None,
        vector_evidence: VectorReadinessEvidence | None,
    ) -> "MergedRetrievalResult":
        """失敗の結果を作る。

        Parameters
        ----------
        failure : HybridRetrievalFailure
            失敗。
        trace_record : RetrievalTraceRecord | None
            トレース。
        vector_evidence : VectorReadinessEvidence | None
            ベクトルの準備状況。

        Returns
        -------
        MergedRetrievalResult
            失敗の結果。
        """
        return cls(
            (),
            RetrievalEvidencePack("s04-evidence-failure", (), 0.0, 0.0),
            trace_record,
            vector_evidence,
            NonGoalExecutionProbe.zero("s04-non-goal-probe"),
            failure,
        )

    def ordered_chunk_ids(self) -> list[str]:
        """まとめた結果のチャンク ID を順に返す。

        Returns
        -------
        list[str]
            チャンク ID の並び。
        """
        return [item.candidate.chunk_id for item in self.items]


@dataclass(frozen=True)
class HybridRetrievalRequest:
    """ハイブリッド検索のリクエスト。

    Attributes
    ----------
    tenant_id : str
        テナント。
    request_context_id : str
        リクエスト文脈 ID。
    query_text_ephemeral : str
        クエリ本文（保存しない）。
    max_results : int
        最大件数（1 以上）。
    serving_profile_id : str
        サービングプロファイル。
    identifier_hints : tuple[str, ...]
        識別子のヒント。
    query_vector : tuple[float, ...]
        クエリのベクトル。
    acl_context : RetrievalAclContext | None
        ACL の文脈。
    channel_limits : Mapping[RetrievalChannel, int]
        チャネルごとの上限。
    trace_requested : bool
        トレースを書くか。
    """

    tenant_id: str = DEFAULT_TENANT
    request_context_id: str = DEFAULT_REQUEST_CONTEXT
    query_text_ephemeral: str = ""
    max_results: int = DEFAULT_MAX_RESULTS
    serving_profile_id: str = DEFAULT_SERVING_PROFILE
    identifier_hints: Sequence[str] = ()
    query_vector: Sequence[float] = ()
    acl_context: RetrievalAclContext | None = None
    channel_limits: Mapping[RetrievalChannel, int] = field(
        default_factory=dict, hash=False
    )
    trace_requested: bool = True

    def __post_init__(self) -> None:
        """項目を正規化する（チャネルごとの上限は全チャネル分に補う）。"""
        object.__setattr__(self, "tenant_id", _normalize(self.tenant_id))
        object.__setattr__(
            self, "request_context_id", _normalize(self.request_context_id)
        )
        object.__setattr__(
            self, "query_text_ephemeral", _normalize(self.query_text_ephemeral)
        )
        max_results = max(1, self.max_results)
        object.__setattr__(self, "max_results", max_results)
        object.__setattr__(
            self, "serving_profile_id", _normalize(self.serving_profile_id)
        )
        object.__setattr__(
            self, "identifier_hints", _unique_texts(self.identifier_hints)
        )
        object.__setattr__(self, "query_vector", tuple(self.query_vector or ()))
        object.__setattr__(
            self,
            "acl_context",
            self.acl_context or RetrievalAclContext.default_context(),
        )
        limits = {
            channel: max(1, (self.channel_limits or {}).get(channel, max_results))
            for channel in RetrievalChannel
        }
        object.__setattr__(self, "channel_limits", limits)

    def query_digest(self) -> str:
        """テナント・文脈・クエリ・ヒントの SHA-256 の先頭 24 文字を返す。

        Returns
        -------
        str
            ダイジェスト。
        """
        hints = "[" + ", ".join(self.identifier_hints) + "]"
        value = (
            f"{self.tenant_id}|{self.request_context_id}|"
            f"{self.query_text_ephemeral}|{hints}"
        )
        return hashlib.sha256(value.encode("utf-8")).hexdigest()[:QUERY_DIGEST_LENGTH]

    def limit_for(self, channel: RetrievalChannel) -> int:
        """チャネルの上限を返す。

        Parameters
        ----------
        channel : RetrievalChannel
            チャネル。

        Returns
        -------
        int
            上限。
        """
        return self.channel_limits.get(channel, self.max_results)


_FORBIDDEN_PATTERNS: dict[str, re.Pattern[str]] = {
    "credential": re.compile(
        r"(?i)(api[_-]?key|proxy[_-]?pass|password|bearer\s+\S+|sk-[A-Za-z0-9_-]+)"
    ),
    "internal_url": re.compile(
        r"(?i)(https?://)?(localhost|127\.0\.0\.1|10\.|172\.(1[6-9]|2\d|3[0-1])\.|"
        r"192\.168\.|[^\s/]+\.internal|internal\.example)"
    ),
    "raw_restricted_content": re.compile(r"(?i)raw[_ -]?restricted|restricted secret"),
    "private_identifier": re.compile(r"(?i)private[_ -]?identifier|customer[_ -]?id"),
    "live_provider_response": re.compile(r"(?i)live[_ -]?provider[_ -]?response"),
    "production_data": re.compile(r"(?i)production[_ -]?data|real[_ -]?customer"),
}


@dataclass(frozen=True)
class ForbiddenContentScanResult:
    """禁止内容スキャンの結果。

    Attributes
    ----------
    findings : tuple[str, ...]
        見つかった種類。
    """

    findings: Sequence[str] = ()

    def __post_init__(self) -> None:
        """項目を不変にする。"""
        object.__setattr__(self, "findings", tuple(self.findings or ()))

    def passed(self) -> bool:
        """見つからなかったかを返す。

        Returns
        -------
        bool
            見つからなければ True。
        """
        return not self.findings

    def status(self) -> str:
        """結果を `PASS`/`FAIL` で返す。

        Returns
        -------
        str
            `PASS` か `FAIL`。
        """
        return "PASS" if self.passed() else "FAIL"


class ForbiddenContentScanner:
    """資格情報・内部 URL などの混入を調べる。"""

    def scan(self, *values: str | None) -> ForbiddenContentScanResult:
        """文字列に禁止内容が含まれるかを調べる。

        Parameters
        ----------
        *values : str | None
            調べる文字列。

        Returns
        -------
        ForbiddenContentScanResult
            見つかった種類（重複なし）。
        """
        findings: list[str] = []
        for value in values:
            if value is None or not value.strip():
                continue
            for name, pattern in _FORBIDDEN_PATTERNS.items():
                if pattern.search(value):
                    findings.append(name)
        return ForbiddenContentScanResult(tuple(dict.fromkeys(findings)))
