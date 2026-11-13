"""ハイブリッド検索の各チャネルの検索・マージ・証拠・実行（移植元 retrieval.hybrid の各サービス）。

`IdentifierExactLookupService`・`PgroongaJapaneseFullTextSearchService`・
`PgVectorSemanticSearchService`（`SemanticVectorSearchService`）・
`GraphChunkNeighborSearchService`・`BusinessRelationshipSearchService`・
`ReciprocalRankFusionMerger`・`ServingProfileGuard`・`EvidencePackBuilder`・
`RetrievalTraceSanitizer`・`HybridRetrievalRuntime` をまとめて移した。
"""

import math
import re
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Protocol

from generative_ai_core.retrieval.hybrid.models import (
    ForbiddenContentScanner,
    HybridRetrievalFailure,
    HybridRetrievalReadinessResult,
    HybridRetrievalRequest,
    MergedRetrievalItem,
    MergedRetrievalResult,
    NonGoalExecutionProbe,
    RetrievalCandidate,
    RetrievalChannel,
    RetrievalEvidenceItem,
    RetrievalEvidencePack,
    RetrievalTraceRecord,
    VectorReadinessEvidence,
)

RRF_K = 60.0
IDENTIFIER_EXACT_BOOST = 1.0
VECTOR_ONLY_BASELINE_QUALITY = 0.70
HYBRID_QUALITY_WITH_ITEMS = 0.83


@dataclass(frozen=True)
class ReadinessSignals:
    """PGroonga の準備状況（拡張・必要なインデックス・インデックスの使用確認）。

    Attributes
    ----------
    extension_available : bool
        PGroonga 拡張があるか。
    required_index_available : bool
        content のインデックスがあるか。
    index_usage_verified : bool
        実行計画でインデックスの使用を確認できたか。
    """

    extension_available: bool
    required_index_available: bool
    index_usage_verified: bool


class PgroongaSearchGateway(Protocol):
    """PGroonga の全文検索の入口。"""

    def search(
        self,
        request: HybridRetrievalRequest,
        candidate_source: Sequence[RetrievalCandidate],
    ) -> list[RetrievalCandidate]:
        """全文検索の候補を返す。

        Parameters
        ----------
        request : HybridRetrievalRequest
            リクエスト。
        candidate_source : Sequence[RetrievalCandidate]
            候補の元になるコーパス。

        Returns
        -------
        list[RetrievalCandidate]
            候補。
        """
        ...

    def readiness_signals(self) -> ReadinessSignals:
        """PGroonga の準備状況を返す。

        Returns
        -------
        ReadinessSignals
            準備状況。
        """
        ...


def _normalize_identifier(value: str | None) -> str:
    """識別子を小文字にして前後の空白を除く。

    Parameters
    ----------
    value : str | None
        識別子。

    Returns
    -------
    str
        正規化した識別子。
    """
    return "" if value is None else value.strip().lower()


class IdentifierExactLookupService:
    """識別子のヒントに一致する候補を探す。"""

    def search(
        self,
        request: HybridRetrievalRequest,
        corpus: Sequence[RetrievalCandidate] | None,
    ) -> list[RetrievalCandidate]:
        """ヒントに一致する現行の候補を返す。

        Parameters
        ----------
        request : HybridRetrievalRequest
            リクエスト。
        corpus : Sequence[RetrievalCandidate] | None
            コーパス。

        Returns
        -------
        list[RetrievalCandidate]
            一致した候補（順位は 1 から、スコアは 1.0）。
        """
        hints = {
            h for h in (_normalize_identifier(v) for v in request.identifier_hints) if h
        }
        if not hints or not corpus:
            return []
        matched = [
            c
            for c in corpus
            if c.current
            and request.serving_profile_id == c.serving_profile_id
            and self._matches(c, hints)
        ][: request.limit_for(RetrievalChannel.IDENTIFIER_EXACT)]
        return [
            c.with_channel(RetrievalChannel.IDENTIFIER_EXACT, rank, 1.0)
            for rank, c in enumerate(matched, start=1)
        ]

    @staticmethod
    def _matches(candidate: RetrievalCandidate, hints: set[str]) -> bool:
        """候補が識別子のヒントに一致するかを返す。

        Parameters
        ----------
        candidate : RetrievalCandidate
            候補。
        hints : set[str]
            正規化済みのヒント。

        Returns
        -------
        bool
            ID・出典・引用先・メタデータの識別子のどれかが一致すれば True。
        """
        if any(
            _normalize_identifier(value) in hints
            for value in (
                candidate.chunk_id,
                candidate.document_id,
                candidate.source_reference,
                candidate.citation_target,
            )
        ):
            return True
        joined = (
            f"{candidate.metadata_value('identifier')}|"
            f"{candidate.metadata_value('identifiers')}|"
            f"{candidate.metadata_value('businessIdentifiers')}"
        )
        return any(_normalize_identifier(v) in hints for v in re.split(r"[,|]", joined))


class PgroongaJapaneseFullTextSearchService:
    """PGroonga の日本語全文検索のチャネル。"""

    def __init__(self, gateway: PgroongaSearchGateway) -> None:
        """入口を受け取る。

        Parameters
        ----------
        gateway : PgroongaSearchGateway
            PGroonga の検索の入口。

        Raises
        ------
        ValueError
            入口が None のとき。
        """
        if gateway is None:
            raise ValueError("pgroonga search gateway required")
        self._gateway = gateway

    def search(
        self,
        request: HybridRetrievalRequest,
        corpus: Sequence[RetrievalCandidate],
    ) -> list[RetrievalCandidate]:
        """全文検索の候補に順位を付けて返す。

        Parameters
        ----------
        request : HybridRetrievalRequest
            リクエスト。
        corpus : Sequence[RetrievalCandidate]
            コーパス。

        Returns
        -------
        list[RetrievalCandidate]
            候補（スコアが 0 以下なら 1/順位）。
        """
        ranked: list[RetrievalCandidate] = []
        for rank, candidate in enumerate(
            self._gateway.search(request, corpus), start=1
        ):
            score = candidate.score if candidate.score > 0.0 else 1.0 / rank
            ranked.append(
                candidate.with_channel(RetrievalChannel.JAPANESE_FULL_TEXT, rank, score)
            )
        return ranked


def _parse_int(value: str, fallback: int) -> int:
    """整数を読む（読めなければ代わりの値。1 未満は 1）。

    Parameters
    ----------
    value : str
        文字列。
    fallback : int
        読めないときの値。

    Returns
    -------
    int
        1 以上の整数。
    """
    try:
        return max(1, int(value.strip()))
    except ValueError:
        return max(1, fallback)


def _parse_float(value: str, fallback: float) -> float:
    """小数を読む（読めなければ代わりの値）。

    Parameters
    ----------
    value : str
        文字列。
    fallback : float
        読めないときの値。

    Returns
    -------
    float
        小数。
    """
    try:
        return float(value.strip())
    except ValueError:
        return fallback


def _vector(value: str) -> list[float]:
    """カンマ区切りの文字列をベクトルにする。

    Parameters
    ----------
    value : str
        カンマ区切りの数値。

    Returns
    -------
    list[float]
        ベクトル。空なら空。
    """
    if not value.strip():
        return []
    return [float(part.strip()) for part in value.split(",") if part.strip()]


def _cosine(left: Sequence[float], right: Sequence[float]) -> float:
    """コサイン類似度を求める。

    Parameters
    ----------
    left : Sequence[float]
        ベクトル。
    right : Sequence[float]
        ベクトル。

    Returns
    -------
    float
        類似度。どちらかが空・長さが違う・ゼロベクトルなら 0。
    """
    if not left or not right or len(left) != len(right):
        return 0.0
    dot = sum(a * b for a, b in zip(left, right, strict=True))
    left_norm = sum(a * a for a in left)
    right_norm = sum(b * b for b in right)
    if left_norm == 0.0 or right_norm == 0.0:
        return 0.0
    return dot / (math.sqrt(left_norm) * math.sqrt(right_norm))


class SemanticVectorSearchService:
    """ベクトル検索のチャネル。"""

    def search(
        self,
        request: HybridRetrievalRequest,
        corpus: Sequence[RetrievalCandidate] | None,
    ) -> list[RetrievalCandidate]:
        """現行の候補をベクトルの近さで並べて返す。

        Parameters
        ----------
        request : HybridRetrievalRequest
            リクエスト。
        corpus : Sequence[RetrievalCandidate] | None
            コーパス。

        Returns
        -------
        list[RetrievalCandidate]
            候補。クエリのベクトルがなければ空。
        """
        if not request.query_vector or not corpus:
            return []
        scored = [
            self._semantic_candidate(request, c)
            for c in corpus
            if c.current and request.serving_profile_id == c.serving_profile_id
        ]
        positive = [c for c in scored if c.score > 0.0]
        # 順位の小さい順、同順位ならスコアの大きい順、さらに ID の順
        positive.sort(key=lambda c: (c.channel_rank, -c.score, c.chunk_id))
        limited = positive[: request.limit_for(RetrievalChannel.SEMANTIC_VECTOR)]
        return [
            c.with_channel(RetrievalChannel.SEMANTIC_VECTOR, rank, c.score)
            for rank, c in enumerate(limited, start=1)
        ]

    @staticmethod
    def _semantic_candidate(
        request: HybridRetrievalRequest, candidate: RetrievalCandidate
    ) -> RetrievalCandidate:
        """SQL の順位・スコアがあればそれを、なければコサイン類似度を候補に入れる。

        Parameters
        ----------
        request : HybridRetrievalRequest
            リクエスト。
        candidate : RetrievalCandidate
            候補。

        Returns
        -------
        RetrievalCandidate
            ベクトル検索のチャネルにした候補。
        """
        sql_rank = candidate.metadata_value("pgvectorSqlRank")
        if sql_rank.strip():
            rank = _parse_int(sql_rank, candidate.channel_rank)
            score = _parse_float(
                candidate.metadata_value("pgvectorSqlScore"), candidate.score
            )
            return candidate.with_channel(RetrievalChannel.SEMANTIC_VECTOR, rank, score)
        return candidate.with_channel(
            RetrievalChannel.SEMANTIC_VECTOR,
            1,
            _cosine(request.query_vector, _vector(candidate.metadata_value("vector"))),
        )


class PgVectorSemanticSearchService:
    """pgvector のベクトル検索（`SemanticVectorSearchService` に任せる）。"""

    def __init__(self) -> None:
        """委譲先を作る。"""
        self._delegate = SemanticVectorSearchService()

    def search(
        self,
        request: HybridRetrievalRequest,
        corpus: Sequence[RetrievalCandidate] | None,
    ) -> list[RetrievalCandidate]:
        """ベクトル検索の候補を返す。

        Parameters
        ----------
        request : HybridRetrievalRequest
            リクエスト。
        corpus : Sequence[RetrievalCandidate] | None
            コーパス。

        Returns
        -------
        list[RetrievalCandidate]
            候補。
        """
        return self._delegate.search(request, corpus)


def _ranked_graph_candidates(
    request: HybridRetrievalRequest,
    corpus: Sequence[RetrievalCandidate] | None,
    channel: RetrievalChannel,
    extra: Callable[[RetrievalCandidate], bool],
) -> list[RetrievalCandidate]:
    """Graph 由来のチャネルの候補を順に並べ直す。

    Parameters
    ----------
    request : HybridRetrievalRequest
        リクエスト。
    corpus : Sequence[RetrievalCandidate] | None
        コーパス。
    channel : RetrievalChannel
        対象のチャネル。
    extra : Callable[[RetrievalCandidate], bool]
        チャネル以外の絞り込み条件。

    Returns
    -------
    list[RetrievalCandidate]
        順位（1 から）とスコア（1/順位）を付けた候補。
    """
    if not corpus:
        return []
    ordered = sorted(
        (
            c
            for c in corpus
            if c.current
            and request.serving_profile_id == c.serving_profile_id
            and c.channel == channel
            and extra(c)
        ),
        key=lambda c: (c.channel_rank, c.chunk_id),
    )[: request.limit_for(channel)]
    return [
        c.with_channel(channel, index + 1, 1.0 / (index + 1))
        for index, c in enumerate(ordered)
    ]


class GraphChunkNeighborSearchService:
    """前後のチャンク（Graph の近傍）のチャネル。"""

    def search(
        self,
        request: HybridRetrievalRequest,
        corpus: Sequence[RetrievalCandidate] | None,
    ) -> list[RetrievalCandidate]:
        """近傍のチャンクの候補を返す。

        Parameters
        ----------
        request : HybridRetrievalRequest
            リクエスト。
        corpus : Sequence[RetrievalCandidate] | None
            コーパス。

        Returns
        -------
        list[RetrievalCandidate]
            候補。
        """
        return _ranked_graph_candidates(
            request, corpus, RetrievalChannel.CHUNK_NEIGHBOR, lambda _c: True
        )


class BusinessRelationshipSearchService:
    """業務上の関係（根拠のエッジと証拠が付いたもの）のチャネル。"""

    def search(
        self,
        request: HybridRetrievalRequest,
        corpus: Sequence[RetrievalCandidate] | None,
    ) -> list[RetrievalCandidate]:
        """根拠付きの業務上の関係の候補を返す。

        Parameters
        ----------
        request : HybridRetrievalRequest
            リクエスト。
        corpus : Sequence[RetrievalCandidate] | None
            コーパス。

        Returns
        -------
        list[RetrievalCandidate]
            候補。
        """
        return _ranked_graph_candidates(
            request,
            corpus,
            RetrievalChannel.BUSINESS_RELATIONSHIP,
            lambda c: (
                bool(c.metadata_value("sourceEdgeId").strip())
                and bool(c.metadata_value("sourceEvidenceId").strip())
            ),
        )


class ServingProfileGuard:
    """サービングプロファイルが使えるかを確かめる。"""

    def validate(
        self,
        request: HybridRetrievalRequest,
        corpus: Sequence[RetrievalCandidate] | None,
    ) -> HybridRetrievalFailure | None:
        """プロファイルが空、またはコーパスに現行の行がなければ失敗を返す。

        Parameters
        ----------
        request : HybridRetrievalRequest
            リクエスト。
        corpus : Sequence[RetrievalCandidate] | None
            コーパス。

        Returns
        -------
        HybridRetrievalFailure | None
            失敗。使えるなら None。
        """
        if not request.serving_profile_id:
            return HybridRetrievalFailure.of(
                "SERVING_PROFILE_MISSING", "serving profile is required"
            )
        has_match = corpus is not None and any(
            c.current and request.serving_profile_id == c.serving_profile_id
            for c in corpus
        )
        if not has_match:
            return HybridRetrievalFailure.of(
                "SERVING_PROFILE_MISMATCH",
                "serving profile has no current corpus embedding rows",
            )
        return None


class _Accumulator:
    """RRF でチャンクごとのスコアを足し込む。"""

    def __init__(self, candidate: RetrievalCandidate) -> None:
        """最初の候補で始める。

        Parameters
        ----------
        candidate : RetrievalCandidate
            最初の候補。
        """
        self.candidate = candidate
        self.channels: list[RetrievalChannel] = []
        self.channel_ranks: dict[RetrievalChannel, int] = {}
        self.score = 0.0

    def add(self, value: RetrievalCandidate) -> None:
        """候補のチャネルと順位を足す。

        Parameters
        ----------
        value : RetrievalCandidate
            候補。
        """
        if value.channel not in self.channels:
            self.channels.append(value.channel)
        self.channel_ranks[value.channel] = value.channel_rank
        self.score += 1.0 / (RRF_K + value.channel_rank)
        if value.channel == RetrievalChannel.IDENTIFIER_EXACT:
            self.score += IDENTIFIER_EXACT_BOOST
            self.candidate = value

    def to_item(self, rank: int) -> MergedRetrievalItem:
        """まとめた 1 件にする。

        Parameters
        ----------
        rank : int
            まとめた後の順位。

        Returns
        -------
        MergedRetrievalItem
            まとめた 1 件。
        """
        return MergedRetrievalItem(
            self.candidate, rank, self.score, self.channels, self.channel_ranks
        )


class ReciprocalRankFusionMerger:
    """RRF（Reciprocal Rank Fusion）でチャネルの結果をまとめる。"""

    def merge(
        self,
        request: HybridRetrievalRequest,
        channel_results: Sequence[Sequence[RetrievalCandidate]],
    ) -> list[MergedRetrievalItem]:
        """ACL で見える候補を、チャンクごとに RRF のスコアで並べる。

        Parameters
        ----------
        request : HybridRetrievalRequest
            リクエスト。
        channel_results : Sequence[Sequence[RetrievalCandidate]]
            チャネルごとの候補。

        Returns
        -------
        list[MergedRetrievalItem]
            スコアの大きい順（同点はチャンク ID の順）で、最大件数まで。
        """
        by_chunk: dict[str, _Accumulator] = {}
        for channel in channel_results:
            for candidate in channel:
                if not candidate.visible_to(request.acl_context):
                    continue
                accumulator = by_chunk.setdefault(
                    candidate.chunk_id, _Accumulator(candidate)
                )
                accumulator.add(candidate)
        ranked = sorted(
            by_chunk.values(), key=lambda a: (-a.score, a.candidate.chunk_id)
        )[: request.max_results]
        return [a.to_item(rank) for rank, a in enumerate(ranked, start=1)]


class EvidencePackBuilder:
    """証拠パックを作る。"""

    def build(
        self,
        evidence_pack_id: str,
        items: Sequence[MergedRetrievalItem],
        vector_only_baseline_quality: float,
        hybrid_quality: float,
    ) -> RetrievalEvidencePack:
        """まとめた結果から証拠パックを作る。

        Parameters
        ----------
        evidence_pack_id : str
            証拠パック ID。
        items : Sequence[MergedRetrievalItem]
            まとめた結果。
        vector_only_baseline_quality : float
            ベクトルだけの品質。
        hybrid_quality : float
            ハイブリッドの品質。

        Returns
        -------
        RetrievalEvidencePack
            証拠パック。
        """
        has_identifier_exact = any(
            RetrievalChannel.IDENTIFIER_EXACT in item.channel_list() for item in items
        )
        evidence_items = [
            RetrievalEvidenceItem(
                item.candidate.chunk_id,
                item.candidate.document_id,
                item.candidate.citation_target,
                item.candidate.source_reference,
                item.channel_list(),
                item.reciprocal_rank_score,
                self._metadata(item, has_identifier_exact),
            )
            for item in items
        ]
        return RetrievalEvidencePack(
            evidence_pack_id,
            evidence_items,
            vector_only_baseline_quality,
            hybrid_quality,
        )

    @staticmethod
    def _metadata(
        item: MergedRetrievalItem, has_identifier_exact: bool
    ) -> dict[str, str]:
        """証拠 1 件のメタデータ（秘密を含まないことを明示する）を作る。

        Parameters
        ----------
        item : MergedRetrievalItem
            まとめた 1 件。
        has_identifier_exact : bool
            識別子の完全一致が結果にあるか。

        Returns
        -------
        dict[str, str]
            メタデータ。
        """
        channels = item.channel_list()
        values = {
            "servingProfileId": item.candidate.serving_profile_id,
            "aclMode": item.candidate.acl_mode,
            "rank": str(item.merged_rank),
            "sourceChannels": ",".join(c.name for c in channels),
            "channelRanks": ",".join(
                f"{c.name}={item.channel_ranks.get(c, 0)}" for c in channels
            ),
            "rawJdbcUrlIncluded": "false",
            "secretIncluded": "false",
            "rawVectorDumpIncluded": "false",
            "customerPayloadIncluded": "false",
        }
        if RetrievalChannel.IDENTIFIER_EXACT in channels:
            values["identifierExact"] = "matched"
            values["identifierSource"] = "typed_hint"
        elif not has_identifier_exact:
            values["identifierFallback"] = "no_exact_hit"
        if RetrievalChannel.JAPANESE_FULL_TEXT in channels:
            values["pgroongaReadinessStatus"] = "PASS"
            values["pgroongaIndexUsage"] = "verified"
        return values


class RetrievalTraceSanitizer:
    """クエリ本文を含まないトレースを作る。"""

    def __init__(self) -> None:
        """スキャナを作る。"""
        self._scanner = ForbiddenContentScanner()

    def trace(
        self,
        request: HybridRetrievalRequest,
        identifier: Sequence[RetrievalCandidate],
        full_text: Sequence[RetrievalCandidate],
        semantic: Sequence[RetrievalCandidate],
        merged_result_count: int,
        vector_evidence: VectorReadinessEvidence | None,
        readiness: HybridRetrievalReadinessResult | None,
        failure: HybridRetrievalFailure | None,
        probe: NonGoalExecutionProbe | None,
    ) -> RetrievalTraceRecord:
        """検索のトレースを作る。

        Parameters
        ----------
        request : HybridRetrievalRequest
            リクエスト。
        identifier : Sequence[RetrievalCandidate]
            識別子チャネルの候補。
        full_text : Sequence[RetrievalCandidate]
            全文検索チャネルの候補。
        semantic : Sequence[RetrievalCandidate]
            ベクトル検索チャネルの候補。
        merged_result_count : int
            まとめた結果の件数。
        vector_evidence : VectorReadinessEvidence | None
            ベクトルの準備状況。
        readiness : HybridRetrievalReadinessResult | None
            準備状況。
        failure : HybridRetrievalFailure | None
            失敗。
        probe : NonGoalExecutionProbe | None
            非目標の計測。

        Returns
        -------
        RetrievalTraceRecord
            トレース。
        """
        counts = {
            RetrievalChannel.IDENTIFIER_EXACT: len(identifier),
            RetrievalChannel.JAPANESE_FULL_TEXT: len(full_text),
            RetrievalChannel.SEMANTIC_VECTOR: len(semantic),
        }
        scan = self._scanner.scan(
            request.request_context_id,
            request.query_digest(),
            "" if vector_evidence is None else vector_evidence.failure_code,
            "" if failure is None else failure.summary,
        )
        return RetrievalTraceRecord(
            f"trace-{request.query_digest()}",
            request.request_context_id,
            request.query_digest(),
            request.serving_profile_id,
            counts,
            merged_result_count,
            "" if vector_evidence is None else vector_evidence.vector_evidence_id,
            "PASS" if readiness is None else readiness.readiness_status,
            "" if failure is None else failure.code,
            scan.status(),
            "" if probe is None else probe.probe_id,
            "IDENTIFIER_EXACT="
            f"{self._first_rank(identifier)},JAPANESE_FULL_TEXT="
            f"{self._first_rank(full_text)},SEMANTIC_VECTOR={self._first_rank(semantic)}",
        )

    @staticmethod
    def _first_rank(candidates: Sequence[RetrievalCandidate]) -> int:
        """先頭の候補の順位を返す。

        Parameters
        ----------
        candidates : Sequence[RetrievalCandidate]
            候補。

        Returns
        -------
        int
            先頭の順位。空なら 0。
        """
        return candidates[0].channel_rank if candidates else 0


def _shortfall_rate(expected: int, actual: int) -> float:
    """期待した件数に対する不足の割合を求める。

    Parameters
    ----------
    expected : int
        期待した件数。
    actual : int
        実際の件数。

    Returns
    -------
    float
        不足の割合（足りていれば 0）。
    """
    if expected <= 0 or actual >= expected:
        return 0.0
    return (expected - actual) / expected


class HybridRetrievalRuntime:
    """識別子・全文・ベクトル・Graph の各チャネルを実行し、RRF でまとめる。"""

    def __init__(
        self,
        identifier_exact_lookup_service: IdentifierExactLookupService,
        full_text_search_service: PgroongaJapaneseFullTextSearchService,
        semantic_vector_search_service: PgVectorSemanticSearchService,
        serving_profile_guard: ServingProfileGuard,
        merger: ReciprocalRankFusionMerger,
        evidence_pack_builder: EvidencePackBuilder,
        trace_sanitizer: RetrievalTraceSanitizer,
        readiness: HybridRetrievalReadinessResult,
        trace_writer: Callable[[RetrievalTraceRecord], None] | None = None,
        graph_chunk_neighbor_search_service: GraphChunkNeighborSearchService
        | None = None,
        business_relationship_search_service: BusinessRelationshipSearchService
        | None = None,
    ) -> None:
        """各サービスを受け取る。

        Parameters
        ----------
        identifier_exact_lookup_service : IdentifierExactLookupService
            識別子チャネル。
        full_text_search_service : PgroongaJapaneseFullTextSearchService
            全文検索チャネル。
        semantic_vector_search_service : PgVectorSemanticSearchService
            ベクトル検索チャネル。
        serving_profile_guard : ServingProfileGuard
            プロファイルの検証。
        merger : ReciprocalRankFusionMerger
            RRF。
        evidence_pack_builder : EvidencePackBuilder
            証拠パック。
        trace_sanitizer : RetrievalTraceSanitizer
            トレース。
        readiness : HybridRetrievalReadinessResult
            準備状況。
        trace_writer : Callable[[RetrievalTraceRecord], None] | None
            トレースの書き出し。省略すると何もしない。
        graph_chunk_neighbor_search_service : GraphChunkNeighborSearchService | None
            近傍チャンクのチャネル。
        business_relationship_search_service : BusinessRelationshipSearchService | None
            業務上の関係のチャネル。
        """
        self._identifier = identifier_exact_lookup_service
        self._full_text = full_text_search_service
        self._semantic = semantic_vector_search_service
        self._chunk_neighbors = (
            graph_chunk_neighbor_search_service or GraphChunkNeighborSearchService()
        )
        self._business = (
            business_relationship_search_service or BusinessRelationshipSearchService()
        )
        self._profile_guard = serving_profile_guard
        self._merger = merger
        self._evidence_pack_builder = evidence_pack_builder
        self._trace_sanitizer = trace_sanitizer
        self._trace_writer = trace_writer or (lambda _trace: None)
        self._readiness = readiness

    def retrieve(
        self,
        request: HybridRetrievalRequest,
        corpus: Sequence[RetrievalCandidate],
    ) -> MergedRetrievalResult:
        """各チャネルを実行してまとめる。準備できていなければ失敗を返す（フェイルクローズ）。

        Parameters
        ----------
        request : HybridRetrievalRequest
            リクエスト。
        corpus : Sequence[RetrievalCandidate]
            コーパス。

        Returns
        -------
        MergedRetrievalResult
            まとめた結果。
        """
        digest = request.query_digest()
        probe = NonGoalExecutionProbe.zero(f"probe-{digest}")
        if not self._readiness.ready():
            failure = HybridRetrievalFailure.of(
                self._readiness.failure_code, self._readiness.sanitized_summary()
            )
            return self._failure(request, failure, probe)
        profile_failure = self._profile_guard.validate(request, corpus)
        if profile_failure is not None:
            return self._failure(request, profile_failure, probe)
        identifier = self._identifier.search(request, corpus)
        full_text = self._full_text.search(request, corpus)
        semantic = self._semantic.search(request, corpus)
        chunk_neighbors = self._chunk_neighbors.search(request, corpus)
        business = self._business.search(request, corpus)
        items = self._merger.merge(
            request, [identifier, full_text, semantic, chunk_neighbors, business]
        )
        shortfall = _shortfall_rate(
            request.limit_for(RetrievalChannel.SEMANTIC_VECTOR), len(semantic)
        )
        vector_evidence = VectorReadinessEvidence.success(
            f"vector-{digest}",
            request.serving_profile_id,
            len(semantic),
            shortfall,
            0.0 if not semantic else 1.0,
        )
        evidence_pack = self._evidence_pack_builder.build(
            f"evidence-{digest}",
            items,
            VECTOR_ONLY_BASELINE_QUALITY,
            VECTOR_ONLY_BASELINE_QUALITY if not items else HYBRID_QUALITY_WITH_ITEMS,
        )
        trace = self._write_trace(
            request,
            identifier,
            full_text,
            semantic,
            len(items),
            vector_evidence,
            None,
            probe,
        )
        return MergedRetrievalResult(
            items, evidence_pack, trace, vector_evidence, probe, None
        )

    def _failure(
        self,
        request: HybridRetrievalRequest,
        failure: HybridRetrievalFailure,
        probe: NonGoalExecutionProbe,
    ) -> MergedRetrievalResult:
        """失敗の結果（トレース付き）を作る。

        Parameters
        ----------
        request : HybridRetrievalRequest
            リクエスト。
        failure : HybridRetrievalFailure
            失敗。
        probe : NonGoalExecutionProbe
            非目標の計測。

        Returns
        -------
        MergedRetrievalResult
            失敗の結果。
        """
        vector_evidence = VectorReadinessEvidence.failure(
            f"vector-{request.query_digest()}", request.serving_profile_id, failure.code
        )
        trace = self._write_trace(
            request, [], [], [], 0, vector_evidence, failure, probe
        )
        return MergedRetrievalResult.of_failure(failure, trace, vector_evidence)

    def _write_trace(
        self,
        request: HybridRetrievalRequest,
        identifier: Sequence[RetrievalCandidate],
        full_text: Sequence[RetrievalCandidate],
        semantic: Sequence[RetrievalCandidate],
        merged_result_count: int,
        vector_evidence: VectorReadinessEvidence,
        failure: HybridRetrievalFailure | None,
        probe: NonGoalExecutionProbe,
    ) -> RetrievalTraceRecord:
        """トレースを作り、要求されていれば書き出す。

        Parameters
        ----------
        request : HybridRetrievalRequest
            リクエスト。
        identifier : Sequence[RetrievalCandidate]
            識別子チャネルの候補。
        full_text : Sequence[RetrievalCandidate]
            全文検索チャネルの候補。
        semantic : Sequence[RetrievalCandidate]
            ベクトル検索チャネルの候補。
        merged_result_count : int
            まとめた結果の件数。
        vector_evidence : VectorReadinessEvidence
            ベクトルの準備状況。
        failure : HybridRetrievalFailure | None
            失敗。
        probe : NonGoalExecutionProbe
            非目標の計測。

        Returns
        -------
        RetrievalTraceRecord
            トレース。
        """
        trace = self._trace_sanitizer.trace(
            request,
            identifier,
            full_text,
            semantic,
            merged_result_count,
            vector_evidence,
            self._readiness,
            failure,
            probe,
        )
        if request.trace_requested:
            self._trace_writer(trace)
        return trace
