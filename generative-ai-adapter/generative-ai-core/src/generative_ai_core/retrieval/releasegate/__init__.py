"""検索ルーターが使うクエリ種別と検索戦略（移植元 `retrieval.releasegate` のうち実行時に使う部分）。

移植元の `releasegate` パッケージは、合成データだけで動くリリース判定の証拠モデル
（`MetricCatalog`・`ReleaseGateEvaluator` など）で、プロバイダも DB も呼ばない。実行時の
検索から使われているのは `QueryType`・`RetrievalStrategy`・`RouterEvaluator.expectedStrategies`
だけなので、この 3 つだけを移した。評価系は移植しない（03_詳細設計.md）。
"""

from enum import Enum


class QueryType(Enum):
    """クエリの種別。値は (名前, Graph DB が必要か)。

    同じ値の定数は別名になってしまうため、名前も値に含める。
    """

    POLICY_QA = ("POLICY_QA", False)
    PROCEDURE_QA = ("PROCEDURE_QA", False)
    FAQ_QA = ("FAQ_QA", False)
    MANUAL_QA = ("MANUAL_QA", False)
    IDENTIFIER_LOOKUP = ("IDENTIFIER_LOOKUP", False)
    TICKET_LOOKUP = ("TICKET_LOOKUP", False)
    DOCUMENT_LOOKUP = ("DOCUMENT_LOOKUP", False)
    CASE_SIMILARITY = ("CASE_SIMILARITY", False)
    BUSINESS_IMPACT = ("BUSINESS_IMPACT", True)
    CONTROL_GAP = ("CONTROL_GAP", True)
    DEPENDENCY_LOOKUP = ("DEPENDENCY_LOOKUP", True)

    def graph_db_required(self) -> bool:
        """Graph DB が必要な種別かを返す。

        Returns
        -------
        bool
            必要なら True。
        """
        required: bool = self.value[1]
        return required


class RetrievalStrategy(Enum):
    """検索戦略。"""

    IDENTIFIER_EXACT = "IDENTIFIER_EXACT"
    PGROONGA_VECTOR = "PGROONGA_VECTOR"
    VECTOR_ONLY = "VECTOR_ONLY"
    SQL_AGE_EVIDENCE = "SQL_AGE_EVIDENCE"
    SQL_AGE = "SQL_AGE"


_EXPECTED_STRATEGIES: dict[QueryType, tuple[RetrievalStrategy, ...]] = {
    QueryType.POLICY_QA: (RetrievalStrategy.PGROONGA_VECTOR,),
    QueryType.PROCEDURE_QA: (RetrievalStrategy.PGROONGA_VECTOR,),
    QueryType.FAQ_QA: (RetrievalStrategy.PGROONGA_VECTOR,),
    QueryType.MANUAL_QA: (RetrievalStrategy.PGROONGA_VECTOR,),
    QueryType.IDENTIFIER_LOOKUP: (RetrievalStrategy.IDENTIFIER_EXACT,),
    QueryType.TICKET_LOOKUP: (
        RetrievalStrategy.IDENTIFIER_EXACT,
        RetrievalStrategy.PGROONGA_VECTOR,
    ),
    QueryType.DOCUMENT_LOOKUP: (
        RetrievalStrategy.IDENTIFIER_EXACT,
        RetrievalStrategy.PGROONGA_VECTOR,
    ),
    QueryType.CASE_SIMILARITY: (RetrievalStrategy.VECTOR_ONLY,),
    QueryType.BUSINESS_IMPACT: (RetrievalStrategy.SQL_AGE_EVIDENCE,),
    QueryType.CONTROL_GAP: (RetrievalStrategy.SQL_AGE,),
    QueryType.DEPENDENCY_LOOKUP: (RetrievalStrategy.SQL_AGE,),
}


def expected_strategies(query_type: QueryType) -> list[RetrievalStrategy]:
    """クエリ種別ごとに決まっている検索戦略を返す（移植元 RouterEvaluator.expectedStrategies）。

    Parameters
    ----------
    query_type : QueryType
        クエリ種別。

    Returns
    -------
    list[RetrievalStrategy]
        検索戦略の並び。
    """
    return list(_EXPECTED_STRATEGIES[query_type])
