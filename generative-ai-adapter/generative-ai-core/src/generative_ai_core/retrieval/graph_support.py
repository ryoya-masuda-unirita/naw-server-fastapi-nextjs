"""Graph RAG の補助（移植元 CoreBusinessRelationshipQueryClassifier・CoreGraphSearchResultMerger・
CoreRetrievalResultValidator）。
"""

from collections.abc import Mapping, Sequence

from generative_ai_core.failure import CoreFailure
from generative_ai_core.retrieval.models import (
    CoreGraphContextCandidate,
    CoreRetrievalRequest,
    CoreRetrievalResult,
    CoreVectorSearchResult,
)

_BUSINESS_RELATIONSHIP_WORDS = (
    "relationship",
    "dependency",
    "depends",
    "causal",
    "cause",
    "impact",
    "影響",
    "依存",
    "原因",
    "関係",
)
_RELATION_PRIORITY = {
    "BUSINESS_RELATIONSHIP": 0,
    "NEXT_CHUNK": 1,
    "GRAPH_NEIGHBOR": 1,
    "SEED": 2,
}
_OTHER_PRIORITY = 3


def requires_business_relationship_traversal(
    request: CoreRetrievalRequest | None,
) -> bool:
    """クエリが業務上の関係をたどる質問かを返す。

    Parameters
    ----------
    request : CoreRetrievalRequest | None
        検索リクエスト。

    Returns
    -------
    bool
        「影響」「依存」「原因」「関係」などの語を含めば True。
    """
    query = "" if request is None else request.query.lower()
    return any(word in query for word in _BUSINESS_RELATIONSHIP_WORDS)


def _seed_ids(seed_results: Sequence[CoreVectorSearchResult] | None) -> list[str]:
    """種の ID を重複なく並べる。

    Parameters
    ----------
    seed_results : Sequence[CoreVectorSearchResult] | None
        種の検索結果。

    Returns
    -------
    list[str]
        ID の並び。
    """
    ids: dict[str, None] = {}
    for seed in seed_results or ():
        if seed.id and seed.id.strip():
            ids[seed.id] = None
    return list(ids)


class CoreGraphSearchResultMerger:
    """種のベクトル検索結果と Graph の候補を 1 つの並びにする。"""

    def merge(
        self,
        seed_results: Sequence[CoreVectorSearchResult] | None,
        candidates: Sequence[CoreGraphContextCandidate] | None,
    ) -> list[str]:
        """Graph の候補を先、種を後ろに並べた ID の列にする。

        Parameters
        ----------
        seed_results : Sequence[CoreVectorSearchResult] | None
            種の検索結果。
        candidates : Sequence[CoreGraphContextCandidate] | None
            Graph の候補。

        Returns
        -------
        list[str]
            重複のない ID の並び。候補を種の順位・関係の種類・順番・ID で並べ、続けて種を足す。
        """
        if not candidates:
            return _seed_ids(seed_results)
        ordered = sorted(
            candidates,
            key=lambda c: (
                c.source_seed_rank,
                _RELATION_PRIORITY.get(c.relation_kind, _OTHER_PRIORITY),
                c.sequence,
                c.context_id,
            ),
        )
        ids: dict[str, None] = {}
        for candidate in ordered:
            if candidate.context_id and candidate.context_id.strip():
                ids[candidate.context_id] = None
        for seed_id in _seed_ids(seed_results):
            ids[seed_id] = None
        return list(ids)


class CoreRetrievalResultValidator:
    """検索結果の ID を検証する。"""

    def validate_success(
        self,
        ordered_ids: Sequence[str | None] | None,
        graph_expanded: bool,
        evidence: Mapping[str, str] | None = None,
    ) -> CoreRetrievalResult:
        """ID を検証し、前後の空白を除いて重複を落とした成功の結果にする。

        Parameters
        ----------
        ordered_ids : Sequence[str | None] | None
            ID の並び。
        graph_expanded : bool
            Graph で広げたか。
        evidence : Mapping[str, str] | None
            証拠。

        Returns
        -------
        CoreRetrievalResult
            成功の結果。ID が null・空なら `MALFORMED_RESULT` の失敗。
        """
        if ordered_ids is None:
            return CoreRetrievalResult.of_failure(
                CoreFailure.of(
                    "MALFORMED_RESULT", "retrieval result ids must not be null"
                )
            )
        normalized: dict[str, None] = {}
        for identifier in ordered_ids:
            if identifier is None or not identifier.strip():
                return CoreRetrievalResult.of_failure(
                    CoreFailure.of(
                        "MALFORMED_RESULT", "retrieval result id must not be blank"
                    )
                )
            normalized[identifier.strip()] = None
        return CoreRetrievalResult.success(list(normalized), graph_expanded, evidence)
