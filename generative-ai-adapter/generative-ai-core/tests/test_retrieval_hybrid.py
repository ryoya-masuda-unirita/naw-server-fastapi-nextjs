"""ハイブリッド検索（PGroonga + ベクトル + Graph）のテスト。

移植元 `CoreHybridRetrievalRuntimeBridgeContractTest`・`CorePostgreSqlProductionHybridRetrievalTest`・
`JdbcPgroongaSearchGatewaySqlContractTest`・`HybridRetrievalRuntimeFixtures` に当たるテスト、
`ProviderLlmRerankerTest` の一部を移した。DB・LLM には接続せず、PGroonga の入口・AGE の
問い合わせ・チャットは偽物に差し替える。
"""

import json
from collections.abc import Sequence
from typing import Any

from generative_ai_core.chat.models import (
    CoreChatRequest,
    CoreChatResult,
    OutputModeHint,
)
from generative_ai_core.failure import CoreFailure
from generative_ai_core.retrieval.age_graph import CoreApacheAgeGraphExpansionProvider
from generative_ai_core.retrieval.hybrid.models import (
    ForbiddenContentScanner,
    HybridRetrievalReadinessResult,
    HybridRetrievalRequest,
    MergedRetrievalItem,
    RetrievalAclContext,
    RetrievalCandidate,
    RetrievalChannel,
)
from generative_ai_core.retrieval.hybrid.services import (
    EvidencePackBuilder,
    HybridRetrievalRuntime,
    IdentifierExactLookupService,
    PgroongaJapaneseFullTextSearchService,
    PgVectorSemanticSearchService,
    ReadinessSignals,
    ReciprocalRankFusionMerger,
    RetrievalTraceSanitizer,
    ServingProfileGuard,
)
from generative_ai_core.retrieval.hybrid_bridge import (
    ENABLED_ATTRIBUTE,
    IDENTIFIER_HINTS_ATTRIBUTE,
    CoreHybridRetrievalRuntimeBridge,
)
from generative_ai_core.retrieval.models import (
    CoreGraphContextCandidate,
    CoreGraphRagSearchSetting,
    CoreProviderLlmRerankAttributes,
    CoreRetrievalRequest,
    CoreVectorSearchResult,
)
from generative_ai_core.retrieval.pgroonga_gateway import (
    JdbcPgroongaSearchGateway,
    PgroongaRow,
    index_usage_sql,
    index_usage_verified,
    search_sql,
)
from generative_ai_core.retrieval.reranker import ProviderLlmReranker
from generative_ai_core.vector.target import CoreVectorDbTarget

TARGET = CoreVectorDbTarget.pg_vector("db.invalid", "u", "p", "d", "vectors", False)
PROFILE = "serving-profile-v1"
TENANT = "tenant-default"
VECTOR = [0.1, 0.2]


def _candidate(
    chunk_id: str,
    channel: RetrievalChannel = RetrievalChannel.SEMANTIC_VECTOR,
    rank: int = 1,
    score: float = 0.5,
    **overrides: Any,
) -> RetrievalCandidate:
    """検索の候補を作る。

    Parameters
    ----------
    chunk_id : str
        チャンク ID。
    channel : RetrievalChannel
        チャネル。
    rank : int
        チャネル内の順位。
    score : float
        スコア。
    **overrides : Any
        上書きする項目。

    Returns
    -------
    RetrievalCandidate
        候補。
    """
    values: dict[str, Any] = {
        "chunk_id": chunk_id,
        "document_id": chunk_id,
        "version_id": "current",
        "source_reference": f"ref-{chunk_id}",
        "citation_target": chunk_id,
        "sanitized_snippet": f"本文 {chunk_id}",
        "channel": channel,
        "channel_rank": rank,
        "score": score,
        "serving_profile_id": PROFILE,
        "current": True,
        "tenant_id": TENANT,
        "classification_rank": 1,
        "acl_mode": "tenant_wide",
        "acl_principal_ids": (),
        "metadata": {},
    }
    values.update(overrides)
    return RetrievalCandidate(**values)


def _request(**overrides: Any) -> HybridRetrievalRequest:
    """ハイブリッド検索のリクエストを作る。

    Parameters
    ----------
    **overrides : Any
        上書きする項目。

    Returns
    -------
    HybridRetrievalRequest
        リクエスト。
    """
    values: dict[str, Any] = {
        "tenant_id": TENANT,
        "query_text_ephemeral": "出張旅費",
        "max_results": 5,
        "query_vector": VECTOR,
        "acl_context": RetrievalAclContext(
            TENANT, "default_user", ("default_principal",), 1, True
        ),
    }
    values.update(overrides)
    return HybridRetrievalRequest(**values)


def test_acl_context_visibility_rules() -> None:
    """ACL は GUC 設定済み・現行・同一テナント・機密区分が範囲内で、制限付きは所属で判定すること"""
    context = RetrievalAclContext(TENANT, "u", ("p1",), 2, True)

    assert context.can_see(_candidate("a"))
    assert not context.can_see(_candidate("a", current=False))
    assert not context.can_see(_candidate("a", tenant_id="other"))
    assert not context.can_see(_candidate("a", classification_rank=3))
    assert not RetrievalAclContext(TENANT, "u", ("p1",), 2, False).can_see(
        _candidate("a")
    )
    restricted = _candidate("a", acl_mode="restricted", acl_principal_ids=("p1", "p2"))
    assert context.can_see(restricted)
    assert not RetrievalAclContext(TENANT, "u", ("zzz",), 2, True).can_see(restricted)
    assert not context.can_see(_candidate("a", acl_mode="weird"))


def test_candidate_sanitizes_text_and_normalizes() -> None:
    """候補の出典・抜粋は秘密と URL を伏せ、順位は 1 以上、ACL の既定は tenant_wide になること"""
    candidate = _candidate(
        "a",
        sanitized_snippet="詳細は https://internal.example/x を見て token=abc",
        channel_rank=0,
        acl_mode=" ",
    )

    assert "internal.example" not in candidate.sanitized_snippet
    assert "abc" not in candidate.sanitized_snippet
    assert candidate.channel_rank == 1
    assert candidate.acl_mode == "tenant_wide"


def test_rrf_merger_scores_orders_and_limits() -> None:
    """RRF は 1/(60+順位) を足してスコアの大きい順に並べ、識別子の完全一致を優先すること"""
    request = _request(max_results=2)
    vector = [_candidate("a", rank=1), _candidate("b", rank=2), _candidate("c", rank=3)]
    full_text = [_candidate("b", RetrievalChannel.JAPANESE_FULL_TEXT, rank=1)]
    exact = [_candidate("c", RetrievalChannel.IDENTIFIER_EXACT, rank=1, score=1.0)]

    items = ReciprocalRankFusionMerger().merge(request, [exact, full_text, vector])

    assert [i.candidate.chunk_id for i in items] == ["c", "b"]
    assert items[0].reciprocal_rank_score == 1.0 / 61 + 1.0 / 63 + 1.0
    assert items[1].channel_list() == (
        RetrievalChannel.JAPANESE_FULL_TEXT,
        RetrievalChannel.SEMANTIC_VECTOR,
    )
    assert items[1].channel_ranks[RetrievalChannel.JAPANESE_FULL_TEXT] == 1
    assert [i.merged_rank for i in items] == [1, 2]


def test_rrf_merger_drops_candidates_hidden_by_acl() -> None:
    """ACL で見えない候補はまとめた結果に入れないこと"""
    request = _request()
    hidden = _candidate("h", tenant_id="other")

    items = ReciprocalRankFusionMerger().merge(request, [[hidden, _candidate("v")]])

    assert [i.candidate.chunk_id for i in items] == ["v"]


def test_identifier_lookup_matches_hints_case_insensitively() -> None:
    """識別子のヒントは大文字小文字を無視して ID・メタデータの識別子に一致させること"""
    corpus = [
        _candidate("ABC-1"),
        _candidate("x", metadata={"identifiers": "foo|BAR"}),
        _candidate("other"),
    ]

    found = IdentifierExactLookupService().search(
        _request(identifier_hints=["abc-1", "bar"]), corpus
    )

    assert [c.chunk_id for c in found] == ["ABC-1", "x"]
    assert all(
        c.channel is RetrievalChannel.IDENTIFIER_EXACT and c.score == 1.0 for c in found
    )
    assert IdentifierExactLookupService().search(_request(), corpus) == []


def test_semantic_search_uses_sql_rank_or_cosine() -> None:
    """ベクトル検索は SQL の順位・スコアがあればそれを、なければメタデータのベクトルのコサインを使うこと"""
    corpus = [
        _candidate("sql", metadata={"pgvectorSqlRank": "2", "pgvectorSqlScore": "0.9"}),
        _candidate("cos", metadata={"vector": "0.1,0.2"}),
        _candidate("zero", metadata={"vector": "0,0"}),
    ]

    found = PgVectorSemanticSearchService().search(_request(), corpus)

    assert [c.chunk_id for c in found] == ["cos", "sql"]
    assert [c.channel_rank for c in found] == [1, 2]
    assert found[0].score > 0.99
    assert (
        PgVectorSemanticSearchService().search(_request(query_vector=[]), corpus) == []
    )


def test_serving_profile_guard() -> None:
    """プロファイルが空、または現行の行がなければ失敗にすること"""
    guard = ServingProfileGuard()

    def code(request: HybridRetrievalRequest) -> str | None:
        failure = guard.validate(request, [_candidate("a")])
        return None if failure is None else failure.code

    assert code(_request(serving_profile_id="")) == "SERVING_PROFILE_MISSING"
    assert code(_request(serving_profile_id="other")) == "SERVING_PROFILE_MISMATCH"
    assert code(_request()) is None


class FakeGateway:
    """PGroonga の偽の入口。"""

    def __init__(
        self,
        rows: list[RetrievalCandidate] | None = None,
        signals: ReadinessSignals | None = None,
    ) -> None:
        """全文検索の結果と準備状況を決める。

        Parameters
        ----------
        rows : list[RetrievalCandidate] | None
            全文検索の結果。
        signals : ReadinessSignals | None
            準備状況。省略すると揃っている。
        """
        self.rows = rows or []
        self.signals = signals or ReadinessSignals(True, True, True)

    def search(
        self,
        request: HybridRetrievalRequest,
        candidate_source: Sequence[RetrievalCandidate],
    ) -> list[RetrievalCandidate]:
        """決めた結果を返す。

        Parameters
        ----------
        request : HybridRetrievalRequest
            使わない。
        candidate_source : Sequence[RetrievalCandidate]
            使わない。

        Returns
        -------
        list[RetrievalCandidate]
            結果。
        """
        return self.rows

    def readiness_signals(self) -> ReadinessSignals:
        """決めた準備状況を返す。

        Returns
        -------
        ReadinessSignals
            準備状況。
        """
        return self.signals


def test_runtime_fails_closed_when_not_ready() -> None:
    """準備ができていなければ、検索せず失敗（フェイルクローズ）と失敗のトレースを返すこと"""
    readiness = HybridRetrievalReadinessResult(
        True, True, True, False, True, "PASS", "PGROONGA_INDEX_UNAVAILABLE"
    )
    runtime = HybridRetrievalRuntime(
        IdentifierExactLookupService(),
        PgroongaJapaneseFullTextSearchService(FakeGateway()),
        PgVectorSemanticSearchService(),
        ServingProfileGuard(),
        ReciprocalRankFusionMerger(),
        EvidencePackBuilder(),
        RetrievalTraceSanitizer(),
        readiness,
    )

    result = runtime.retrieve(_request(), [_candidate("a")])

    assert result.failure is not None
    assert result.failure.code == "PGROONGA_INDEX_UNAVAILABLE"
    assert result.trace_record is not None
    assert result.trace_record.failure_code == "PGROONGA_INDEX_UNAVAILABLE"
    assert result.items == ()
    assert "category=PGROONGA_INDEX_UNAVAILABLE" in readiness.sanitized_summary()


def test_trace_does_not_contain_query_text() -> None:
    """トレースはクエリ本文を持たず、ダイジェストだけを持つこと"""
    request = _request(query_text_ephemeral="秘密の質問")
    runtime = HybridRetrievalRuntime(
        IdentifierExactLookupService(),
        PgroongaJapaneseFullTextSearchService(FakeGateway()),
        PgVectorSemanticSearchService(),
        ServingProfileGuard(),
        ReciprocalRankFusionMerger(),
        EvidencePackBuilder(),
        RetrievalTraceSanitizer(),
        HybridRetrievalReadinessResult(True, True, True, True, True),
    )

    result = runtime.retrieve(
        request, [_candidate("a", metadata={"vector": "0.1,0.2"})]
    )

    assert result.failure is None
    assert result.trace_record is not None
    assert "秘密の質問" not in repr(result.trace_record)
    assert result.trace_record.query_digest == request.query_digest()
    assert len(request.query_digest()) == 24
    assert result.evidence_pack is not None
    assert (
        result.evidence_pack.items[0].sanitized_source_metadata["secretIncluded"]
        == "false"
    )


def test_forbidden_content_scanner() -> None:
    """資格情報・内部 URL などの混入を種類ごとに検出すること"""
    scan = ForbiddenContentScanner().scan("api_key=abc", "http://localhost:8080", "ok")

    assert scan.findings == ("credential", "internal_url")
    assert scan.status() == "FAIL"
    assert ForbiddenContentScanner().scan("普通の文章").status() == "PASS"


def _seed(identifier: str, rank: int) -> CoreVectorSearchResult:
    """ベクトル検索の結果を作る。

    Parameters
    ----------
    identifier : str
        チャンク ID。
    rank : int
        順位。

    Returns
    -------
    CoreVectorSearchResult
        結果。
    """
    return CoreVectorSearchResult(
        identifier,
        f"本文 {identifier}",
        rank,
        {
            f"sourceRef.{identifier}": f"file-{identifier}",
            f"sourceFilePath.{identifier}": f"/p/{identifier}",
        },
    )


class FakeSearchClient:
    """ベクトル検索の偽の問い合わせ。"""

    def __init__(self, results: list[CoreVectorSearchResult]) -> None:
        """返す結果を決める。

        Parameters
        ----------
        results : list[CoreVectorSearchResult]
            返す結果。
        """
        self.results = results

    def search(
        self,
        target: Any,
        query_vector: Any,
        max_results: Any,
        current_only: bool = False,
        tenant_id: str = "",
    ) -> list[CoreVectorSearchResult]:
        """決めた結果を返す。

        Parameters
        ----------
        target : Any
            使わない。
        query_vector : Any
            使わない。
        max_results : Any
            使わない。
        current_only : bool
            使わない。
        tenant_id : str
            使わない。

        Returns
        -------
        list[CoreVectorSearchResult]
            結果。
        """
        return self.results


class FixedEmbedding:
    """決まったベクトルを返す偽の埋め込み。"""

    def embed(self, request: CoreRetrievalRequest) -> list[float]:
        """固定のベクトルを返す。

        Parameters
        ----------
        request : CoreRetrievalRequest
            使わない。

        Returns
        -------
        list[float]
            ベクトル。
        """
        return list(VECTOR)


def _retrieval_request(
    query: str = "出張旅費", *, graph: bool = False, **attributes: Any
) -> CoreRetrievalRequest:
    """ハイブリッド検索を有効にした検索リクエストを作る。

    Parameters
    ----------
    query : str
        検索文字列。
    graph : bool
        Graph RAG を有効にするか。
    **attributes : str
        追加の属性。

    Returns
    -------
    CoreRetrievalRequest
        リクエスト。
    """
    builder = (
        CoreRetrievalRequest.builder("PostgreSQL")
        .query(query)
        .max_results(3)
        .vector_db_target(TARGET)
        .attribute(ENABLED_ATTRIBUTE, "enabled")
    )
    if graph:
        builder.graph_rag_search_setting(
            CoreGraphRagSearchSetting.enabled_for("g", "PostgreSQL")
        )
    for key, value in attributes.items():
        builder.attribute(key.replace("__", "."), value)
    return builder.build()


class NoRerank(ProviderLlmReranker):
    """リランクをしない（そのまま返す）リランカー。"""


def test_bridge_merges_vector_and_pgroonga_and_builds_evidence() -> None:
    """ベクトルと全文の結果をまとめ、RAG Context 用の証拠（本文・出典・スコア・信号）を作ること"""
    full_text = [
        _candidate("b", RetrievalChannel.JAPANESE_FULL_TEXT, rank=1, score=2.0)
    ]
    bridge = CoreHybridRetrievalRuntimeBridge(lambda _t: FakeGateway(full_text))

    result = bridge.retrieve(
        _retrieval_request(),
        FakeSearchClient([_seed("a", 1), _seed("b", 2)]),
        FixedEmbedding(),
    )

    assert result.failure is None
    assert result.ordered_ids == ("b", "a")
    evidence = result.evidence
    assert evidence["hybridRetrievalRuntime"] == "enabled"
    assert evidence["signal.pgroonga.b"] == "true"
    assert evidence["signal.pgroonga.a"] == "false"
    assert evidence["content.a"] == "本文 a"
    assert evidence["sourceRef.a"] == "file-a"
    assert evidence["sourceFilePath.a"] == "/p/a"
    assert float(evidence["score.b"]) > float(evidence["score.a"])
    assert evidence["pgroonga.fullTextCandidateCount"] == "1"
    assert evidence["rerank.status"] == "disabled"
    assert not result.graph_expanded


def test_bridge_fails_closed_when_pgroonga_is_not_ready() -> None:
    """PGroonga の準備ができていなければ、ベクトルだけの成功にせず PGROONGA_* の失敗にすること"""
    for signals, code in (
        (ReadinessSignals(False, False, False), "PGROONGA_UNAVAILABLE"),
        (ReadinessSignals(True, False, False), "PGROONGA_INDEX_UNAVAILABLE"),
        (ReadinessSignals(True, True, False), "PGROONGA_INDEX_USAGE_UNVERIFIED"),
    ):
        bridge = CoreHybridRetrievalRuntimeBridge(
            lambda _t, s=signals: FakeGateway([], s)  # type: ignore[misc]
        )

        result = bridge.retrieve(
            _retrieval_request(), FakeSearchClient([_seed("a", 1)]), FixedEmbedding()
        )

        assert result.failure is not None
        assert result.failure.code == code
        assert result.ordered_ids == ()


class FakeGraphClient:
    """AGE の偽の問い合わせ。"""

    def __init__(
        self,
        candidates: list[CoreGraphContextCandidate] | None = None,
        error: Exception | None = None,
    ) -> None:
        """返す候補と投げる例外を決める。

        Parameters
        ----------
        candidates : list[CoreGraphContextCandidate] | None
            種ごとに返す候補。
        error : Exception | None
            `ensure_graph_readable` で投げる例外。
        """
        self.candidates = candidates or []
        self.error = error

    def ensure_graph_readable(self, target: Any, graph_name: str) -> None:
        """graph が読めることを確かめる（偽: 例外を投げるだけ）。

        Parameters
        ----------
        target : Any
            使わない。
        graph_name : str
            使わない。
        """
        if self.error is not None:
            raise self.error

    def query_candidates(
        self, target: Any, graph_name: str, seed: CoreVectorSearchResult
    ) -> list[CoreGraphContextCandidate]:
        """決めた候補を返す。

        Parameters
        ----------
        target : Any
            使わない。
        graph_name : str
            使わない。
        seed : CoreVectorSearchResult
            使わない。

        Returns
        -------
        list[CoreGraphContextCandidate]
            候補。
        """
        return self.candidates


def _business(
    context_id: str, evidence_id: str = "ev-1", edge_id: str = "edge-1"
) -> CoreGraphContextCandidate:
    """根拠付きの業務上の関係の候補を作る。

    Parameters
    ----------
    context_id : str
        コンテキスト ID。
    evidence_id : str
        根拠の証拠 ID。
    edge_id : str
        根拠のエッジ ID。

    Returns
    -------
    CoreGraphContextCandidate
        候補。
    """
    return CoreGraphContextCandidate(
        context_id,
        context_id,
        context_id,
        "file",
        3,
        "a",
        1,
        "BUSINESS_RELATIONSHIP",
        edge_id,
        evidence_id,
        "high",
        "/p/rel",
    )


def test_bridge_graph_expansion_adds_business_relationship_path() -> None:
    """Graph で広げた業務上の関係の候補は、根拠付きのパスを証拠に入れ、graphExpanded になること"""
    graph = CoreApacheAgeGraphExpansionProvider(FakeGraphClient([_business("rel")]))
    bridge = CoreHybridRetrievalRuntimeBridge(lambda _t: FakeGateway(), graph)

    result = bridge.retrieve(
        _retrieval_request("影響範囲", graph=True),
        FakeSearchClient([_seed("a", 1)]),
        FixedEmbedding(),
    )

    assert result.failure is None
    assert result.graph_expanded
    assert "rel" in result.ordered_ids
    assert (
        result.evidence["graphEvidence.pathText.rel"]
        == "a --BUSINESS_RELATIONSHIP(ev-1)--> rel"
    )
    assert result.evidence["graphEvidence.graphDepth.rel"] == "1"
    assert result.evidence["businessRelationship.candidateCount"] == "1"
    assert result.evidence["businessRelationship.evidenceLinked"] == "true"


def test_bridge_graph_failure_is_not_replaced_by_vector_only_success() -> None:
    """Graph の展開が失敗したら、ベクトルだけの成功に切り替えず、その失敗を返すこと"""
    graph = CoreApacheAgeGraphExpansionProvider(FakeGraphClient([]))
    bridge = CoreHybridRetrievalRuntimeBridge(lambda _t: FakeGateway(), graph)

    result = bridge.retrieve(
        _retrieval_request("影響範囲", graph=True),
        FakeSearchClient([_seed("a", 1)]),
        FixedEmbedding(),
    )

    assert result.failure is not None
    assert result.failure.code == "GRAPH_DATA_MISSING"
    assert result.evidence["businessRelationship.candidateCount"] == "0"


def test_age_provider_failure_classification() -> None:
    """AGE の展開の失敗を、設定不正・データなし・使えない・問い合わせ失敗に分類すること"""
    seeds = [_seed("a", 1)]
    request = _retrieval_request("影響", graph=True)

    def code(
        client: FakeGraphClient, req: CoreRetrievalRequest = request
    ) -> str | None:
        failure = CoreApacheAgeGraphExpansionProvider(client).expand(req, seeds).failure
        return None if failure is None else failure.code

    assert code(FakeGraphClient(error=RuntimeError("AGE graph does not exist"))) == (
        "GRAPH_UNAVAILABLE"
    )
    assert code(FakeGraphClient(error=RuntimeError("timeout"))) == "GRAPH_QUERY_FAILURE"
    assert (
        code(FakeGraphClient(error=ValueError("bad"))) == "GRAPH_CONFIGURATION_FAILURE"
    )
    no_business = FakeGraphClient(
        [CoreGraphContextCandidate("n", relation_kind="NEXT_CHUNK")]
    )
    assert code(no_business) == "BUSINESS_GRAPH_DATA_MISSING"
    plain = _retrieval_request("手順", graph=True)
    assert code(no_business, plain) is None
    empty = CoreApacheAgeGraphExpansionProvider(FakeGraphClient()).expand(request, [])
    assert empty.failure is not None
    assert empty.failure.code == "BUSINESS_GRAPH_DATA_MISSING"
    assert (
        CoreApacheAgeGraphExpansionProvider(FakeGraphClient())
        .expand(plain, [])
        .candidates
        == ()
    )


def test_bridge_identifier_hints_attribute() -> None:
    """属性 `s04.identifierHints` の識別子を完全一致のチャネルに使うこと"""
    full = [_candidate("zz", RetrievalChannel.JAPANESE_FULL_TEXT, rank=1)]
    bridge = CoreHybridRetrievalRuntimeBridge(lambda _t: FakeGateway(full))
    hints: dict[str, Any] = {IDENTIFIER_HINTS_ATTRIBUTE.replace(".", "__"): "a, ,a"}
    request = _retrieval_request(**hints)

    result = bridge.retrieve(
        request, FakeSearchClient([_seed("a", 1), _seed("b", 2)]), FixedEmbedding()
    )

    assert result.ordered_ids[0] == "a"
    assert result.ordered_ids[1:] and "zz" in result.ordered_ids


def test_pgroonga_gateway_sql_and_index_usage() -> None:
    """全文検索・実行計画の SQL と、インデックス使用の判定が移植元どおりであること"""
    assert search_sql("vectors") == (
        "select id, content, pgroonga_score(tableoid, ctid) pgroonga_score "
        "from public.vectors where content &@~ %s order by pgroonga_score desc, id asc limit %s"
    )
    assert index_usage_sql("vectors") == (
        "explain (format text, costs off) select id from public.vectors "
        "where content &@~ %s order by pgroonga_score(tableoid, ctid) desc, id asc limit 1"
    )
    index = "vectors_pgroonga_content_idx"
    assert index_usage_verified([f'Index Scan using "{index}" on vectors'], index)
    assert index_usage_verified([f"Bitmap Index Scan on {index}"], index)
    assert not index_usage_verified(["Seq Scan on vectors"], index)
    assert not index_usage_verified(None, index)
    assert not index_usage_verified([f"Index Scan using {index}_x on t"], index)


class FakeOperations:
    """PGroonga への偽の問い合わせ。"""

    def __init__(self, rows: list[PgroongaRow], error: Exception | None = None) -> None:
        """返す行と投げる例外を決める。

        Parameters
        ----------
        rows : list[PgroongaRow]
            返す行。
        error : Exception | None
            準備状況の確認で投げる例外。
        """
        self.rows = rows
        self.error = error
        self.calls: list[tuple[str, str, int]] = []

    def readiness_signals(self, table_name: str) -> ReadinessSignals:
        """準備状況を返す（偽）。

        Parameters
        ----------
        table_name : str
            使わない。

        Returns
        -------
        ReadinessSignals
            準備状況。
        """
        if self.error is not None:
            raise self.error
        return ReadinessSignals(True, True, True)

    def search(
        self, table_name: str, query: str, max_results: int
    ) -> list[PgroongaRow]:
        """呼び出しを記録して行を返す。

        Parameters
        ----------
        table_name : str
            テーブル名。
        query : str
            検索文字列。
        max_results : int
            最大件数。

        Returns
        -------
        list[PgroongaRow]
            行。
        """
        self.calls.append((table_name, query, max_results))
        return self.rows


def test_pgroonga_gateway_search_and_fail_closed_readiness() -> None:
    """全文検索の行を候補にし、準備状況を調べられなければすべて偽（フェイルクローズ）にすること"""
    operations = FakeOperations([PgroongaRow("c1", "本文 token=zzz", 2.5)])
    gateway = JdbcPgroongaSearchGateway(TARGET, operations)

    candidates = gateway.search(_request(max_results=4), [])

    assert operations.calls == [("vectors", "出張旅費", 4)]
    assert candidates[0].chunk_id == "c1"
    assert candidates[0].score == 2.5
    assert "zzz" not in candidates[0].sanitized_snippet
    assert candidates[0].metadata["rawQueryPersisted"] == "false"
    assert gateway.readiness_signals() == ReadinessSignals(True, True, True)
    broken = JdbcPgroongaSearchGateway(TARGET, FakeOperations([], RuntimeError("down")))
    assert broken.readiness_signals() == ReadinessSignals(False, False, False)


class ScriptedChat:
    """決めた応答を返し、受け取ったリクエストを記録する偽のチャット。"""

    def __init__(
        self,
        answer: str | None = None,
        error: Exception | None = None,
        failure: CoreFailure | None = None,
    ) -> None:
        """応答・例外・失敗を決める。

        Parameters
        ----------
        answer : str | None
            返す回答。
        error : Exception | None
            投げる例外。
        failure : CoreFailure | None
            返す失敗。
        """
        self.answer = answer
        self.error = error
        self.failure = failure
        self.requests: list[CoreChatRequest] = []

    def __call__(self, request: CoreChatRequest) -> CoreChatResult:
        """記録して結果を返す。

        Parameters
        ----------
        request : CoreChatRequest
            チャットのリクエスト。

        Returns
        -------
        CoreChatResult
            結果。
        """
        self.requests.append(request)
        if self.error is not None:
            raise self.error
        if self.failure is not None:
            return CoreChatResult(failure=self.failure)
        return CoreChatResult.success(self.answer or "", [], OutputModeHint.CHAT_TEXT)


def _items(*ids: str) -> list[MergedRetrievalItem]:
    """まとめた結果の候補を作る。

    Parameters
    ----------
    *ids : str
        チャンク ID。

    Returns
    -------
    list[MergedRetrievalItem]
        候補。
    """
    return [
        MergedRetrievalItem(
            _candidate(i), rank, 1.0 / rank, [RetrievalChannel.SEMANTIC_VECTOR]
        )
        for rank, i in enumerate(ids, start=1)
    ]


def _rerank_request(provider: str = "OpenAI", **overrides: str) -> CoreRetrievalRequest:
    """リランクを有効にした検索リクエストを作る。

    Parameters
    ----------
    provider : str
        リランクのプロバイダ。
    **overrides : str
        上書きする属性（キーは属性名の末尾）。

    Returns
    -------
    CoreRetrievalRequest
        リクエスト。
    """
    attributes = CoreProviderLlmRerankAttributes
    values = {
        attributes.ENABLED: "enabled",
        attributes.PROVIDER: provider,
        attributes.ENDPOINT: "https://rerank.invalid",
        attributes.CREDENTIAL: "rerank-key",
        attributes.CREDENTIAL_KIND: "api_key",
        attributes.MODEL: "rerank-model",
        attributes.TENANT_ID: "tenant",
        attributes.TIMEOUT_SECONDS: "180",
    }
    values.update({getattr(attributes, k): v for k, v in overrides.items()})
    builder = CoreRetrievalRequest.builder("PostgreSQL").query("質問")
    for key, value in values.items():
        builder.attribute(key, value)
    return builder.build()


def test_reranker_applies_llm_order_and_sends_json_prompt() -> None:
    """LLM が返した順に並べ替え、質問と候補の抜粋を JSON で渡し、証拠に適用の記録を入れること"""
    chat = ScriptedChat(json.dumps({"ordered_ids": ["b", "a"]}))

    result = ProviderLlmReranker(chat).rerank(_rerank_request(), _items("a", "b"))

    assert [i.candidate.chunk_id for i in result.items] == ["b", "a"]
    assert result.evidence["rerank.status"] == "applied"
    assert result.evidence["rerank.candidateCount"] == "2"
    prompt = json.loads(chat.requests[0].messages[1].content)
    assert prompt["question"] == "質問"
    assert [c["id"] for c in prompt["candidates"]] == ["a", "b"]
    assert chat.requests[0].candidate_json_response_requested()


def test_reranker_degrades_to_vector_only_on_provider_trouble() -> None:
    """LLM の失敗・空の応答・不正な並びは、ベクトルだけの並びに戻して degraded にすること"""
    vector_only = _items("v1", "v2")
    cases = [
        (ScriptedChat(error=RuntimeError("boom")), "provider_failure"),
        (ScriptedChat(failure=CoreFailure.of("X", "y")), "provider_failure"),
        (ScriptedChat(answer=" "), "empty_response"),
        (ScriptedChat(answer="not json"), "invalid_order"),
        (ScriptedChat(answer='{"ordered_ids": ["a"]}'), "invalid_order"),
        (ScriptedChat(answer='{"ordered_ids": ["a", "a"]}'), "invalid_order"),
        (ScriptedChat(answer='{"ordered_ids": ["a", "zzz"]}'), "invalid_order"),
    ]
    for chat, reason in cases:
        result = ProviderLlmReranker(chat).rerank(
            _rerank_request(), _items("a", "b"), vector_only
        )

        assert [i.candidate.chunk_id for i in result.items] == ["v1", "v2"], reason
        assert result.evidence["rerank.status"] == "degraded"
        assert result.evidence["rerank.reason"] == reason
        assert result.evidence["rerank.fallback"] == "vector_only"
        assert result.failure is None


def test_reranker_disabled_cases() -> None:
    """PostgreSQL 以外・無効・候補 1 件以下はリランクせず、そのまま返すこと"""
    chat = ScriptedChat('{"ordered_ids": []}')
    reranker = ProviderLlmReranker(chat)
    azure = CoreRetrievalRequest.builder("AzureOpenAI").build()
    disabled = CoreRetrievalRequest.builder("PostgreSQL").build()

    assert (
        reranker.rerank(azure, _items("a", "b")).evidence["rerank.reason"]
        == "non_postgresql"
    )
    assert (
        reranker.rerank(disabled, _items("a", "b")).evidence["rerank.reason"]
        == "not_enabled"
    )
    assert reranker.rerank(_rerank_request(), _items("a")).evidence[
        "rerank.reason"
    ] == ("candidate_count_le_1")
    assert chat.requests == []


def test_reranker_invalid_configuration_fails_with_reason() -> None:
    """リランクの設定が不正なら RERANK_PROVIDER_CONFIGURATION_INVALID の失敗にすること"""
    cases = {
        "missing_provider": _rerank_request(provider=""),
        "unsupported_provider": _rerank_request(provider="Anthropic"),
        "missing_endpoint": _rerank_request(ENDPOINT=""),
        "missing_credential": _rerank_request(CREDENTIAL=""),
        "missing_model": _rerank_request(MODEL=""),
        "missing_tenant": _rerank_request(provider="SecuAiGent", TENANT_ID=""),
        "invalid_timeout": _rerank_request(TIMEOUT_SECONDS="5"),
    }
    chat = ScriptedChat('{"ordered_ids": []}')
    for reason, request in cases.items():
        result = ProviderLlmReranker(chat).rerank(request, _items("a", "b"))

        assert result.failure is not None, reason
        assert result.failure.code == "RERANK_PROVIDER_CONFIGURATION_INVALID"
        assert result.evidence["rerank.reason"] == reason
        assert result.evidence["rerank.status"] == "failed"
    assert chat.requests == []
