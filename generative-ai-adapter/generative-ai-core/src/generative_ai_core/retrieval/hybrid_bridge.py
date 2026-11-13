"""PostgreSQL の検索をハイブリッド検索（PGroonga + ベクトル + Graph）に橋渡しする
（移植元 CoreHybridRetrievalBridge・CoreHybridRetrievalRuntimeBridge）。

ベクトル検索の結果を種にして、PGroonga の準備状況を確かめ、必要なら AGE で近傍を広げ、
識別子・全文・ベクトル・Graph の各チャネルを RRF でまとめ、LLM でリランクする。結果の
`evidence` に、RAG Context JSON を作るための `content.<id>`・`score.<id>`・
`signal.pgroonga.<id>`・`graphEvidence.*` などを入れる。
"""

import logging
from collections.abc import Callable, Mapping, Sequence
from typing import Protocol

from generative_ai_core.failure import CoreFailure
from generative_ai_core.retrieval.age_graph import CoreApacheAgeGraphExpansionProvider
from generative_ai_core.retrieval.graph_support import (
    requires_business_relationship_traversal,
)
from generative_ai_core.retrieval.hybrid.models import (
    HybridRetrievalReadinessResult,
    HybridRetrievalRequest,
    MergedRetrievalItem,
    MergedRetrievalResult,
    RetrievalAclContext,
    RetrievalCandidate,
    RetrievalChannel,
)
from generative_ai_core.retrieval.hybrid.services import (
    EvidencePackBuilder,
    HybridRetrievalRuntime,
    IdentifierExactLookupService,
    PgroongaJapaneseFullTextSearchService,
    PgroongaSearchGateway,
    PgVectorSemanticSearchService,
    ReadinessSignals,
    ReciprocalRankFusionMerger,
    RetrievalTraceSanitizer,
    ServingProfileGuard,
)
from generative_ai_core.retrieval.models import (
    CoreGraphContextCandidate,
    CoreRetrievalRequest,
    CoreRetrievalResult,
    CoreVectorSearchResult,
)
from generative_ai_core.retrieval.pgroonga_gateway import JdbcPgroongaSearchGateway
from generative_ai_core.retrieval.postgresql_search import (
    CorePostgreSqlSearchClient,
    tenant_id_of,
)
from generative_ai_core.retrieval.query_embedding import QueryEmbeddingGenerator
from generative_ai_core.retrieval.reranker import ProviderLlmReranker
from generative_ai_core.vector.target import CoreVectorDbTarget

logger = logging.getLogger(__name__)

ENABLED_ATTRIBUTE = "s04.hybridRetrievalRuntime"
SERVING_PROFILE_ATTRIBUTE = "s04.servingProfileId"
IDENTIFIER_HINTS_ATTRIBUTE = "s04.identifierHints"
REQUEST_CONTEXT_ATTRIBUTE = "s04.requestContextId"
DEFAULT_SERVING_PROFILE_ID = "serving-profile-v1"
DEFAULT_REQUEST_CONTEXT_ID = "core-postgresql"
_GRAPH_EVIDENCE_PREFIXES = (
    "graphEvidence.reasonType.",
    "graphEvidence.pathText.",
    "graphEvidence.graphDepth.",
)
_UNSAFE_PATH_MARKERS = ("RAG_CONTEXT_BEGIN", "RAG_CONTEXT_END")
_UNSAFE_ROLE_MARKERS = ("system:", "developer:", "assistant:")


class CoreHybridRetrievalBridge(Protocol):
    """ハイブリッド検索の橋渡し。"""

    def should_run(self, request: CoreRetrievalRequest | None) -> bool:
        """ハイブリッド検索を実行するかを返す。

        Parameters
        ----------
        request : CoreRetrievalRequest | None
            検索リクエスト。

        Returns
        -------
        bool
            実行するなら True。
        """
        ...

    def retrieve(
        self,
        request: CoreRetrievalRequest,
        search_client: CorePostgreSqlSearchClient,
        embedding_generator: QueryEmbeddingGenerator,
    ) -> CoreRetrievalResult:
        """ハイブリッド検索を実行する。

        Parameters
        ----------
        request : CoreRetrievalRequest
            検索リクエスト。
        search_client : CorePostgreSqlSearchClient
            ベクトル検索の問い合わせ。
        embedding_generator : QueryEmbeddingGenerator
            クエリのベクトル化。

        Returns
        -------
        CoreRetrievalResult
            検索結果。
        """
        ...


def _first_non_blank(*values: str | None) -> str:
    """最初の空でない値を返す。

    Parameters
    ----------
    *values : str | None
        候補。

    Returns
    -------
    str
        前後の空白を除いた最初の空でない値。なければ空文字。
    """
    for value in values:
        if value is not None and value.strip():
            return value.strip()
    return ""


def _safe_graph_path_value(value: str | None) -> bool:
    """グラフのパスに使ってよい文字列かを返す。

    Parameters
    ----------
    value : str | None
        文字列。

    Returns
    -------
    bool
        空でなく、括弧・制御文字・コンテキストの境界語・ロール語を含まなければ True。
    """
    if value is None or not value.strip() or "(" in value or ")" in value:
        return False
    lower = value.lower()
    return (
        all(ord(ch) >= 0x20 for ch in value)
        and not any(marker in value for marker in _UNSAFE_PATH_MARKERS)
        and not any(marker in lower for marker in _UNSAFE_ROLE_MARKERS)
    )


def _graph_path_text(candidate: CoreGraphContextCandidate | None) -> str:
    """根拠付きの業務上の関係を `A --BUSINESS_RELATIONSHIP(根拠)--> B` の形にする。

    Parameters
    ----------
    candidate : CoreGraphContextCandidate | None
        Graph の候補。

    Returns
    -------
    str
        パスの文字列。組み立てられなければ空文字。
    """
    if candidate is None or not candidate.is_evidence_linked_business_relationship():
        return ""
    source = _first_non_blank(candidate.source_seed_id, candidate.source_edge_id)
    target = _first_non_blank(
        candidate.context_id, candidate.chunk_id, candidate.vector_row_id
    )
    edge_label = _first_non_blank(
        candidate.source_evidence_id, candidate.source_edge_id
    )
    if not (
        _safe_graph_path_value(source)
        and _safe_graph_path_value(target)
        and _safe_graph_path_value(edge_label)
    ):
        return ""
    return f"{source} --BUSINESS_RELATIONSHIP({edge_label})--> {target}"


def _is_chunk_neighbor(candidate: CoreGraphContextCandidate) -> bool:
    """前後のチャンク・近傍の候補かを返す。

    Parameters
    ----------
    candidate : CoreGraphContextCandidate
        Graph の候補。

    Returns
    -------
    bool
        `NEXT_CHUNK` か `GRAPH_NEIGHBOR` なら True。
    """
    return candidate.relation_kind in ("NEXT_CHUNK", "GRAPH_NEIGHBOR")


def _graph_channel(candidate: CoreGraphContextCandidate) -> RetrievalChannel | None:
    """Graph の候補が入るチャネルを返す。

    Parameters
    ----------
    candidate : CoreGraphContextCandidate
        Graph の候補。

    Returns
    -------
    RetrievalChannel | None
        チャネル。どちらでもなければ None。
    """
    if candidate.is_evidence_linked_business_relationship():
        return RetrievalChannel.BUSINESS_RELATIONSHIP
    if _is_chunk_neighbor(candidate):
        return RetrievalChannel.CHUNK_NEIGHBOR
    return None


def _unique_graph_candidates(
    candidates: Sequence[CoreGraphContextCandidate] | None,
) -> list[CoreGraphContextCandidate]:
    """関係の種類・コンテキスト・エッジ・証拠が同じ候補を 1 つにする。

    Parameters
    ----------
    candidates : Sequence[CoreGraphContextCandidate] | None
        Graph の候補。

    Returns
    -------
    list[CoreGraphContextCandidate]
        重複のない候補（最初のものを残す）。
    """
    unique: dict[str, CoreGraphContextCandidate] = {}
    for candidate in candidates or ():
        key = (
            f"{candidate.relation_kind}|{candidate.context_id}|"
            f"{candidate.source_edge_id}|{candidate.source_evidence_id}"
        )
        unique.setdefault(key, candidate)
    return list(unique.values())


def _graph_candidate(
    candidate: CoreGraphContextCandidate,
    channel: RetrievalChannel,
    rank: int,
    serving_profile_id: str,
    tenant_id: str,
) -> RetrievalCandidate:
    """Graph の候補を検索の候補にする。

    Parameters
    ----------
    candidate : CoreGraphContextCandidate
        Graph の候補。
    channel : RetrievalChannel
        チャネル。
    rank : int
        順位。
    serving_profile_id : str
        サービングプロファイル。
    tenant_id : str
        テナント。

    Returns
    -------
    RetrievalCandidate
        検索の候補。
    """
    return RetrievalCandidate(
        candidate.context_id,
        candidate.context_id,
        "current",
        "business-graph",
        candidate.source_evidence_id or candidate.context_id,
        "graph relationship candidate",
        channel,
        rank,
        1.0 / rank,
        serving_profile_id,
        True,
        tenant_id,
        1,
        "tenant_wide",
        (),
        {
            "relationKind": candidate.relation_kind,
            "sourceSeedId": candidate.source_seed_id,
            "sourceEdgeId": candidate.source_edge_id,
            "sourceEvidenceId": candidate.source_evidence_id,
            "candidateTrust": candidate.candidate_trust,
        },
    )


def _graph_corpus(
    candidates: Sequence[CoreGraphContextCandidate],
    serving_profile_id: str,
    tenant_id: str,
) -> list[RetrievalCandidate]:
    """Graph の候補のうち、チャネルが決まるものを検索の候補にする。

    Parameters
    ----------
    candidates : Sequence[CoreGraphContextCandidate]
        Graph の候補。
    serving_profile_id : str
        サービングプロファイル。
    tenant_id : str
        テナント。

    Returns
    -------
    list[RetrievalCandidate]
        検索の候補（順位は 1 から）。
    """
    result: list[RetrievalCandidate] = []
    rank = 1
    for candidate in candidates:
        channel = _graph_channel(candidate)
        if channel is None:
            continue
        result.append(
            _graph_candidate(candidate, channel, rank, serving_profile_id, tenant_id)
        )
        rank += 1
    return result


def _vector_candidate(
    result: CoreVectorSearchResult, serving_profile_id: str, tenant_id: str
) -> RetrievalCandidate:
    """ベクトル検索の 1 行を検索の候補にする。

    Parameters
    ----------
    result : CoreVectorSearchResult
        ベクトル検索の 1 行。
    serving_profile_id : str
        サービングプロファイル。
    tenant_id : str
        テナント。

    Returns
    -------
    RetrievalCandidate
        検索の候補（スコアは 1/順位）。
    """
    rank = max(1, result.rank)
    score = 1.0 / rank
    metadata = dict(result.evidence)
    source_ref = _first_non_blank(metadata.get(f"sourceRef.{result.id}"), result.id)
    metadata["identifiers"] = result.id
    metadata["pgvectorSqlRank"] = str(rank)
    metadata["pgvectorSqlScore"] = repr(score)
    return RetrievalCandidate(
        result.id,
        result.id,
        "current",
        source_ref,
        result.id,
        result.content,
        RetrievalChannel.SEMANTIC_VECTOR,
        rank,
        score,
        serving_profile_id,
        True,
        tenant_id,
        1,
        "tenant_wide",
        (),
        metadata,
    )


def _vector_only_items(
    candidates: Sequence[RetrievalCandidate],
) -> list[MergedRetrievalItem]:
    """ベクトル検索だけの並びにする（リランクが使えないときの戻り先）。

    Parameters
    ----------
    candidates : Sequence[RetrievalCandidate]
        ベクトル検索の候補。

    Returns
    -------
    list[MergedRetrievalItem]
        ベクトル検索の順位のままの並び。
    """
    items: list[MergedRetrievalItem] = []
    for rank, candidate in enumerate(candidates, start=1):
        items.append(
            MergedRetrievalItem(
                candidate.with_channel(
                    RetrievalChannel.SEMANTIC_VECTOR, rank, 1.0 / rank
                ),
                rank,
                1.0 / rank,
                [RetrievalChannel.SEMANTIC_VECTOR],
                {RetrievalChannel.SEMANTIC_VECTOR: rank},
            )
        )
    return items


def _readiness_failure_code(signals: ReadinessSignals) -> str:
    """PGroonga の準備状況から失敗コードを決める。

    Parameters
    ----------
    signals : ReadinessSignals
        準備状況。

    Returns
    -------
    str
        失敗コード。揃っていれば空文字。
    """
    if not signals.extension_available:
        return "PGROONGA_UNAVAILABLE"
    if not signals.required_index_available:
        return "PGROONGA_INDEX_UNAVAILABLE"
    if not signals.index_usage_verified:
        return "PGROONGA_INDEX_USAGE_UNVERIFIED"
    return ""


def _readiness(signals: ReadinessSignals) -> HybridRetrievalReadinessResult:
    """PGroonga の準備状況をハイブリッド検索の準備状況にする。

    Parameters
    ----------
    signals : ReadinessSignals
        PGroonga の準備状況。

    Returns
    -------
    HybridRetrievalReadinessResult
        準備状況（PGroonga が揃っていなければフェイルクローズ）。
    """
    code = _readiness_failure_code(signals)
    return HybridRetrievalReadinessResult(
        signals.extension_available,
        True,
        True,
        signals.required_index_available,
        True,
        "PASS",
        code,
        signals.extension_available,
        signals.required_index_available,
        signals.index_usage_verified,
        "PASS" if not code else "FAIL_CLOSED",
        code,
    )


def _is_graph_evidence_key(key: str | None) -> bool:
    """Graph の根拠のキーかを返す。

    Parameters
    ----------
    key : str | None
        キー。

    Returns
    -------
    bool
        そうなら True。
    """
    return key is not None and key.startswith(_GRAPH_EVIDENCE_PREFIXES)


def _add_context_evidence(
    values: dict[str, str],
    item: MergedRetrievalItem,
    graph_candidate: CoreGraphContextCandidate | None,
) -> None:
    """1 件分の証拠（スコア・信号・本文・出典・Graph の根拠）を足す。

    Parameters
    ----------
    values : dict[str, str]
        証拠（書き込み先）。
    item : MergedRetrievalItem
        まとめた 1 件。
    graph_candidate : CoreGraphContextCandidate | None
        同じコンテキストの Graph の候補。
    """
    candidate = item.candidate
    identifier = candidate.chunk_id
    values[f"score.{identifier}"] = repr(item.reciprocal_rank_score)
    values[f"signal.pgroonga.{identifier}"] = _bool(
        RetrievalChannel.JAPANESE_FULL_TEXT in item.channel_list()
    )
    if RetrievalChannel.SEMANTIC_VECTOR in item.channel_list():
        values.setdefault(f"content.{identifier}", candidate.sanitized_snippet)
        values.setdefault(
            f"sourceRef.{identifier}",
            _first_non_blank(
                candidate.metadata_value(f"sourceRef.{identifier}"),
                candidate.source_reference,
                identifier,
            ),
        )
        source_file_path = candidate.metadata_value(f"sourceFilePath.{identifier}")
        if source_file_path.strip():
            values.setdefault(f"sourceFilePath.{identifier}", source_file_path)
    for key, value in candidate.metadata.items():
        if value and value.strip() and _is_graph_evidence_key(key):
            values.setdefault(key, value)
    path_text = _graph_path_text(graph_candidate)
    if path_text:
        values[f"graphEvidence.reasonType.{identifier}"] = "graph_path"
        values[f"graphEvidence.pathText.{identifier}"] = path_text
        values[f"graphEvidence.graphDepth.{identifier}"] = "1"


def _bool(value: bool) -> str:
    """真偽値を `true`/`false` にする（移植元 Boolean.toString）。

    Parameters
    ----------
    value : bool
        真偽値。

    Returns
    -------
    str
        `true` か `false`。
    """
    return "true" if value else "false"


def _evidence(
    signals: ReadinessSignals,
    result: MergedRetrievalResult | None,
    graph_candidates: Sequence[CoreGraphContextCandidate] = (),
) -> dict[str, str]:
    """検索全体の証拠を作る。

    Parameters
    ----------
    signals : ReadinessSignals
        PGroonga の準備状況。
    result : MergedRetrievalResult | None
        まとめた結果。
    graph_candidates : Sequence[CoreGraphContextCandidate]
        Graph の候補。

    Returns
    -------
    dict[str, str]
        証拠。
    """
    values: dict[str, str] = {
        "hybridRetrievalRuntime": "enabled",
        "pgroonga.extensionAvailable": _bool(signals.extension_available),
        "pgroonga.requiredIndexAvailable": _bool(signals.required_index_available),
        "pgroonga.indexUsageVerified": _bool(signals.index_usage_verified),
        "pgvector.channelReady": "true",
    }
    if result is not None and result.vector_evidence is not None:
        values["pgvector.semanticCandidateCount"] = str(
            result.vector_evidence.semantic_candidate_count
        )
        values["pgvector.vectorEvidenceId"] = result.vector_evidence.vector_evidence_id
    if result is not None and result.trace_record is not None:
        trace = result.trace_record
        values["readinessStatus"] = trace.readiness_status
        values["failureCode"] = trace.failure_code
        values["pgroonga.fullTextCandidateCount"] = str(
            trace.channel_candidate_counts.get(RetrievalChannel.JAPANESE_FULL_TEXT, 0)
        )
        values["mergedResultCount"] = str(trace.merged_result_count)
    if result is not None:
        by_context: dict[str, CoreGraphContextCandidate] = {}
        for candidate in graph_candidates:
            by_context.setdefault(candidate.context_id, candidate)
        for item in result.items:
            _add_context_evidence(values, item, by_context.get(item.candidate.chunk_id))
    return values


def _has_graph_evidence(evidence: Mapping[str, str]) -> bool:
    """証拠に Graph のパスがあるかを返す。

    Parameters
    ----------
    evidence : Mapping[str, str]
        証拠。

    Returns
    -------
    bool
        あれば True。
    """
    return any(key.startswith("graphEvidence.pathText.") for key in evidence)


def _identifier_hints(request: CoreRetrievalRequest) -> list[str]:
    """属性のカンマ区切りの識別子ヒントを読む。

    Parameters
    ----------
    request : CoreRetrievalRequest
        検索リクエスト。

    Returns
    -------
    list[str]
        重複のないヒント。
    """
    configured = request.attributes.get(IDENTIFIER_HINTS_ATTRIBUTE, "")
    if not configured.strip():
        return []
    return list(dict.fromkeys(p.strip() for p in configured.split(",") if p.strip()))


def _require_target(request: CoreRetrievalRequest | None) -> CoreVectorDbTarget:
    """ベクトルDB の接続先を取り出して、必須項目を確かめる。

    Parameters
    ----------
    request : CoreRetrievalRequest | None
        検索リクエスト。

    Returns
    -------
    CoreVectorDbTarget
        接続先。

    Raises
    ------
    ValueError
        接続先がない、または必須項目が空のとき。
    """
    if request is None or request.vector_db_target is None:
        raise ValueError("vector database target required")
    target = request.vector_db_target
    target.required_endpoint()
    target.required_user_name()
    target.required_database_name()
    target.required_table_name()
    return target


class CoreHybridRetrievalRuntimeBridge:
    """ハイブリッド検索の実行（属性 `s04.hybridRetrievalRuntime=enabled` のとき）。"""

    def __init__(
        self,
        pgroonga_gateway_factory: Callable[[CoreVectorDbTarget], PgroongaSearchGateway]
        | None = None,
        graph_expansion_provider: CoreApacheAgeGraphExpansionProvider | None = None,
        provider_llm_reranker: ProviderLlmReranker | None = None,
    ) -> None:
        """差し替えられる部品を受け取る。

        Parameters
        ----------
        pgroonga_gateway_factory : Callable[[CoreVectorDbTarget], PgroongaSearchGateway] | None
            接続先から PGroonga の入口を作る関数。省略すると psycopg の実装。
        graph_expansion_provider : CoreApacheAgeGraphExpansionProvider | None
            Graph で広げる部品。
        provider_llm_reranker : ProviderLlmReranker | None
            LLM のリランク。
        """
        self._gateway_factory = pgroonga_gateway_factory or JdbcPgroongaSearchGateway
        self._graph_expansion = (
            graph_expansion_provider or CoreApacheAgeGraphExpansionProvider()
        )
        self._reranker = provider_llm_reranker or ProviderLlmReranker()

    def should_run(self, request: CoreRetrievalRequest | None) -> bool:
        """ハイブリッド検索を実行するかを返す。

        Parameters
        ----------
        request : CoreRetrievalRequest | None
            検索リクエスト。

        Returns
        -------
        bool
            属性が `enabled` なら True。
        """
        return (
            request is not None
            and request.attributes.get(ENABLED_ATTRIBUTE, "").lower() == "enabled"
        )

    def _should_expand_graph(self, request: CoreRetrievalRequest) -> bool:
        """Graph で広げるかを返す。

        Parameters
        ----------
        request : CoreRetrievalRequest
            検索リクエスト。

        Returns
        -------
        bool
            Graph 検索が有効、または業務上の関係をたどる質問なら True。
        """
        return (
            request.graph_setting().should_run_graph_search()
            or requires_business_relationship_traversal(request)
        )

    def retrieve(
        self,
        request: CoreRetrievalRequest,
        search_client: CorePostgreSqlSearchClient,
        embedding_generator: QueryEmbeddingGenerator,
    ) -> CoreRetrievalResult:
        """ベクトル検索 → PGroonga の準備確認 → Graph → RRF → リランクの順に実行する。

        Parameters
        ----------
        request : CoreRetrievalRequest
            検索リクエスト。
        search_client : CorePostgreSqlSearchClient
            ベクトル検索の問い合わせ。
        embedding_generator : QueryEmbeddingGenerator
            クエリのベクトル化。

        Returns
        -------
        CoreRetrievalResult
            検索結果。

        Raises
        ------
        ValueError
            接続先がない、またはクエリのベクトルが空のとき。
        """
        target = _require_target(request)
        query_vector = embedding_generator.embed(request)
        if not query_vector:
            raise ValueError("query vector must not be empty")
        tenant_id = tenant_id_of(request)
        vector_results = search_client.search(
            target,
            query_vector,
            request.max_results,
            request.graph_setting().should_run_graph_search(),
            tenant_id,
        )
        serving_profile_id = request.attributes.get(
            SERVING_PROFILE_ATTRIBUTE, DEFAULT_SERVING_PROFILE_ID
        )
        hybrid_request = HybridRetrievalRequest(
            tenant_id=tenant_id,
            request_context_id=request.attributes.get(
                REQUEST_CONTEXT_ATTRIBUTE, DEFAULT_REQUEST_CONTEXT_ID
            ),
            query_text_ephemeral=request.query,
            identifier_hints=_identifier_hints(request),
            serving_profile_id=serving_profile_id,
            query_vector=query_vector,
            max_results=request.max_results,
            acl_context=RetrievalAclContext(
                tenant_id, "default_user", ("default_principal",), 1, True
            ),
        )
        pgroonga_gateway = self._gateway_factory(target)
        signals = pgroonga_gateway.readiness_signals()
        readiness = _readiness(signals)
        vector_corpus = [
            _vector_candidate(r, serving_profile_id, tenant_id) for r in vector_results
        ]
        hybrid_corpus = list(vector_corpus)
        graph_candidates: list[CoreGraphContextCandidate] = []
        if readiness.ready() and self._should_expand_graph(request):
            graph_result = self._graph_expansion.expand(request, vector_results)
            if graph_result.failure is not None:
                failure_evidence = _evidence(signals, None)
                failure_evidence["businessRelationship.candidateCount"] = "0"
                failure_evidence["businessRelationship.evidenceLinked"] = "false"
                return CoreRetrievalResult.of_failure(
                    graph_result.failure, failure_evidence
                )
            graph_candidates = _unique_graph_candidates(graph_result.candidates)
            hybrid_corpus.extend(
                _graph_corpus(
                    graph_candidates, serving_profile_id, hybrid_request.tenant_id
                )
            )
        hybrid_result = self._runtime(pgroonga_gateway, readiness).retrieve(
            hybrid_request, hybrid_corpus
        )
        if hybrid_result.failure is not None:
            rerank_items: Sequence[MergedRetrievalItem] = hybrid_result.items
            rerank_evidence: Mapping[str, str] = {}
            rerank_failure: CoreFailure | None = None
        else:
            rerank = self._reranker.rerank(
                request, hybrid_result.items, _vector_only_items(vector_corpus)
            )
            rerank_items = rerank.items
            rerank_evidence = rerank.evidence
            rerank_failure = rerank.failure
        output_result = MergedRetrievalResult(
            rerank_items,
            hybrid_result.evidence_pack,
            hybrid_result.trace_record,
            hybrid_result.vector_evidence,
            hybrid_result.non_goal_execution_probe,
            hybrid_result.failure,
        )
        evidence_result = None if rerank_failure is not None else output_result
        evidence = _evidence(signals, evidence_result, graph_candidates)
        evidence.update(rerank_evidence)
        evidence["chunkNeighbor.candidateCount"] = str(
            sum(1 for c in graph_candidates if _is_chunk_neighbor(c))
        )
        linked = [
            c for c in graph_candidates if c.is_evidence_linked_business_relationship()
        ]
        evidence["businessRelationship.candidateCount"] = str(len(linked))
        evidence["businessRelationship.evidenceLinked"] = _bool(bool(linked))
        if hybrid_result.failure is not None:
            return CoreRetrievalResult.of_failure(
                CoreFailure.of(
                    hybrid_result.failure.code, hybrid_result.failure.summary
                ),
                evidence,
            )
        if rerank_failure is not None:
            return CoreRetrievalResult.of_failure(rerank_failure, evidence)
        return CoreRetrievalResult.success(
            output_result.ordered_chunk_ids(), _has_graph_evidence(evidence), evidence
        )

    @staticmethod
    def _runtime(
        pgroonga_gateway: PgroongaSearchGateway,
        readiness: HybridRetrievalReadinessResult,
    ) -> HybridRetrievalRuntime:
        """チャネルを組み合わせたハイブリッド検索を作る。

        Parameters
        ----------
        pgroonga_gateway : PgroongaSearchGateway
            PGroonga の入口。
        readiness : HybridRetrievalReadinessResult
            準備状況。

        Returns
        -------
        HybridRetrievalRuntime
            ハイブリッド検索。
        """
        return HybridRetrievalRuntime(
            IdentifierExactLookupService(),
            PgroongaJapaneseFullTextSearchService(pgroonga_gateway),
            PgVectorSemanticSearchService(),
            ServingProfileGuard(),
            ReciprocalRankFusionMerger(),
            EvidencePackBuilder(),
            RetrievalTraceSanitizer(),
            readiness,
        )
