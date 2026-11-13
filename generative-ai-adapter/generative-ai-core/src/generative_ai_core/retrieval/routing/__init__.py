"""クエリの分類と検索戦略の選択（移植元 jp.co.unirita.ai.core.retrieval.routing）。

`RuntimeQueryClassification`・`RuntimeQueryClassifier`・`RuntimeRetrievalStrategySelector`
をまとめて移した。
"""

import re
from collections.abc import Mapping
from dataclasses import dataclass

from generative_ai_core.retrieval.models import CoreRetrievalRequest
from generative_ai_core.retrieval.releasegate import (
    QueryType,
    RetrievalStrategy,
    expected_strategies,
)

_IDENTIFIER_TOKEN = re.compile(r"\b[A-Z][A-Z0-9_/-]{2,}\d+[A-Z0-9_/-]*\b")
_EXPLICIT_KEYS = ("query.type", "queryType", "runtime.queryType")
DEFAULT_REASON = "DEFAULT_NON_AGE_QA"
DEFAULT_SOURCE = "deterministic"
RELATIONSHIP_CONFIDENCE = 0.9
NON_GRAPH_CONFIDENCE = 0.8


@dataclass(frozen=True)
class RuntimeQueryClassification:
    """クエリ分類の結果。

    Attributes
    ----------
    query_type : QueryType
        クエリ種別（None なら FAQ_QA）。
    confidence : float
        確信度（0.0〜1.0 に丸める）。
    source : str
        分類の根拠（`deterministic`・`request_attribute`）。
    sanitized_reason_code : str
        理由コード。
    """

    query_type: QueryType = QueryType.FAQ_QA
    confidence: float = 0.0
    source: str = DEFAULT_SOURCE
    sanitized_reason_code: str = DEFAULT_REASON

    def __post_init__(self) -> None:
        """項目を正規化する。"""
        object.__setattr__(self, "query_type", self.query_type or QueryType.FAQ_QA)
        object.__setattr__(self, "confidence", min(1.0, max(0.0, self.confidence)))
        object.__setattr__(
            self, "source", (self.source or "").strip() or DEFAULT_SOURCE
        )
        object.__setattr__(
            self,
            "sanitized_reason_code",
            (self.sanitized_reason_code or "").strip() or DEFAULT_REASON,
        )


def _contains_any(value: str, *needles: str) -> bool:
    """文字列がいずれかの語を含むかを返す。

    Parameters
    ----------
    value : str
        調べる文字列。
    *needles : str
        探す語。

    Returns
    -------
    bool
        含めば True。
    """
    return any(needle in value for needle in needles)


def _explicit_query_type(attributes: Mapping[str, str]) -> QueryType | None:
    """属性で明示されたクエリ種別を返す。

    Parameters
    ----------
    attributes : Mapping[str, str]
        リクエストの属性。

    Returns
    -------
    QueryType | None
        明示された種別。なし・不正なら None。
    """
    value = None
    for key in _EXPLICIT_KEYS:
        if key in attributes:
            value = attributes[key]
            break
    if value is None or not value.strip():
        return None
    try:
        return QueryType[value.strip().upper()]
    except KeyError:
        return None


class RuntimeQueryClassifier:
    """クエリを決まった語で分類する（LLM は使わない）。"""

    def classify(
        self, request: CoreRetrievalRequest | None
    ) -> RuntimeQueryClassification:
        """リクエストのクエリ種別を決める。

        Parameters
        ----------
        request : CoreRetrievalRequest | None
            検索リクエスト。

        Returns
        -------
        RuntimeQueryClassification
            分類の結果。
        """
        if request is None:
            return RuntimeQueryClassification(QueryType.FAQ_QA, 0.0)
        explicit = _explicit_query_type(request.attributes)
        if explicit is not None:
            return RuntimeQueryClassification(
                explicit, 1.0, "request_attribute", "ATTRIBUTE_QUERY_TYPE"
            )
        normalized = request.query.lower()

        def relationship(
            query_type: QueryType, reason: str
        ) -> RuntimeQueryClassification:
            """グラフを使う分類を作る。

            Parameters
            ----------
            query_type : QueryType
                種別。
            reason : str
                理由コード。

            Returns
            -------
            RuntimeQueryClassification
                分類。
            """
            return RuntimeQueryClassification(
                query_type, RELATIONSHIP_CONFIDENCE, DEFAULT_SOURCE, reason
            )

        def non_graph(query_type: QueryType, reason: str) -> RuntimeQueryClassification:
            """グラフを使わない分類を作る。

            Parameters
            ----------
            query_type : QueryType
                種別。
            reason : str
                理由コード。

            Returns
            -------
            RuntimeQueryClassification
                分類。
            """
            return RuntimeQueryClassification(
                query_type, NON_GRAPH_CONFIDENCE, DEFAULT_SOURCE, reason
            )

        if _contains_any(
            normalized, "business impact", "customer impact", "operational impact"
        ):
            return relationship(QueryType.BUSINESS_IMPACT, "KEYWORD_BUSINESS_IMPACT")
        if _contains_any(
            normalized, "control gap", "missing control", "compliance gap"
        ):
            return relationship(QueryType.CONTROL_GAP, "KEYWORD_CONTROL_GAP")
        if _contains_any(
            normalized, "dependency", "depends on", "upstream", "downstream"
        ):
            return relationship(
                QueryType.DEPENDENCY_LOOKUP, "KEYWORD_DEPENDENCY_LOOKUP"
            )
        if _contains_any(normalized, "similar", "similarity", "related cases"):
            return non_graph(QueryType.CASE_SIMILARITY, "KEYWORD_CASE_SIMILARITY")
        if _contains_any(normalized, "ticket", "incident"):
            return non_graph(QueryType.TICKET_LOOKUP, "KEYWORD_TICKET_LOOKUP")
        if _contains_any(normalized, "document", "doc ", "manual section"):
            return non_graph(QueryType.DOCUMENT_LOOKUP, "KEYWORD_DOCUMENT_LOOKUP")
        if _IDENTIFIER_TOKEN.search(request.query):
            return non_graph(QueryType.IDENTIFIER_LOOKUP, "PATTERN_IDENTIFIER_LOOKUP")
        if _contains_any(normalized, "policy", "rule", "standard"):
            return non_graph(QueryType.POLICY_QA, "KEYWORD_POLICY_QA")
        if _contains_any(normalized, "procedure", "how do i", "how to", "steps"):
            return non_graph(QueryType.PROCEDURE_QA, "KEYWORD_PROCEDURE_QA")
        if _contains_any(normalized, "manual", "guide"):
            return non_graph(QueryType.MANUAL_QA, "KEYWORD_MANUAL_QA")
        return non_graph(QueryType.FAQ_QA, DEFAULT_REASON)


class RuntimeRetrievalStrategySelector:
    """クエリ種別から検索戦略を選ぶ。"""

    def select(self, query_type: QueryType) -> list[RetrievalStrategy]:
        """クエリ種別に決まっている検索戦略を返す。

        Parameters
        ----------
        query_type : QueryType
            クエリ種別。

        Returns
        -------
        list[RetrievalStrategy]
            検索戦略の並び。
        """
        return expected_strategies(query_type)

    def requires_graph_db(self, strategies: list[RetrievalStrategy]) -> bool:
        """検索戦略に Graph DB が要るかを返す。

        Parameters
        ----------
        strategies : list[RetrievalStrategy]
            検索戦略の並び。

        Returns
        -------
        bool
            AGE を使う戦略があれば True。
        """
        return (
            RetrievalStrategy.SQL_AGE in strategies
            or RetrievalStrategy.SQL_AGE_EVIDENCE in strategies
        )
