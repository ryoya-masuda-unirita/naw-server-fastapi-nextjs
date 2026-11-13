"""検索の入口（ルーティング・プロバイダの選択・失敗の変換）のテスト。

移植元 `CoreRetrievalRuntimeTest`・`RuntimeQueryClassifierTest`・`CoreRetrievalProviderTest`・
`CoreRetrievalBranchCoverageTest` の一部を移した。
"""

from typing import Any

import pytest
from generative_ai_core.failure import CoreFailure
from generative_ai_core.network.setting import CoreNetworkSetting
from generative_ai_core.provider.model import Capability
from generative_ai_core.provider.runtime import CoreProviderRuntime, ExecutionContext
from generative_ai_core.retrieval.failure_sanitizer import CoreRetrievalFailureSanitizer
from generative_ai_core.retrieval.models import (
    CoreGraphRagSearchSetting,
    CoreRetrievalRequest,
    CoreRetrievalResult,
)
from generative_ai_core.retrieval.releasegate import (
    QueryType,
    RetrievalStrategy,
    expected_strategies,
)
from generative_ai_core.retrieval.routing import (
    RuntimeQueryClassifier,
    RuntimeRetrievalStrategySelector,
)
from generative_ai_core.retrieval.runtime import (
    ROUTER_GRAPH_DB_REQUIRED_ATTRIBUTE,
    ROUTER_QUERY_TYPE_ATTRIBUTE,
    ROUTER_SELECTED_STRATEGIES_ATTRIBUTE,
    CoreRetrievalRuntime,
)


def _runtime(
    executor: Any,
    *,
    capability: Capability = Capability.RETRIEVAL,
    provider: str = "PostgreSQL",
) -> CoreRetrievalRuntime:
    """1 つの実行器だけを登録したランタイムを作る。

    Parameters
    ----------
    executor : Any
        実行器（リクエストと文脈を受け取る）。
    capability : Capability
        登録する能力。
    provider : str
        プロバイダ ID。

    Returns
    -------
    CoreRetrievalRuntime
        ランタイム。
    """
    builder = CoreProviderRuntime.builder()
    builder.register(provider, capability, CoreRetrievalRequest, executor)
    return CoreRetrievalRuntime(builder.build())


def _request(
    query: str, *, graph: bool = False, provider: str = "PostgreSQL"
) -> CoreRetrievalRequest:
    """テスト用の検索リクエストを作る。

    Parameters
    ----------
    query : str
        検索文字列。
    graph : bool
        Graph RAG を有効にするか。
    provider : str
        プロバイダ ID。

    Returns
    -------
    CoreRetrievalRequest
        リクエスト。
    """
    setting = (
        CoreGraphRagSearchSetting.enabled_for("g", "PostgreSQL")
        if graph
        else CoreGraphRagSearchSetting.disabled(provider)
    )
    return (
        CoreRetrievalRequest.builder(provider)
        .query(query)
        .max_results(3)
        .graph_rag_search_setting(setting)
        .build()
    )


def test_retrieve_passes_routing_attributes_and_returns_validated_ids() -> None:
    """分類の結果を属性に足したリクエストを実行器へ渡し、ID を検証して返すこと"""
    seen: list[CoreRetrievalRequest] = []

    def execute(request: Any, _context: ExecutionContext) -> CoreRetrievalResult:
        seen.append(request)
        return CoreRetrievalResult.success([" a ", "a", "b"], False, {"content.a": "x"})

    result = _runtime(execute).retrieve(_request("経費の申請方法"))

    assert result.ordered_ids == ("a", "b")
    assert result.evidence == {"content.a": "x"}
    attributes = seen[0].attributes
    assert attributes[ROUTER_QUERY_TYPE_ATTRIBUTE] == "FAQ_QA"
    assert attributes[ROUTER_SELECTED_STRATEGIES_ATTRIBUTE] == "PGROONGA_VECTOR"
    assert attributes[ROUTER_GRAPH_DB_REQUIRED_ATTRIBUTE] == "false"


def test_retrieve_returns_provider_failure_as_is() -> None:
    """実行器が失敗を返したら、そのまま返すこと"""
    failure = CoreFailure.of("PGROONGA_UNAVAILABLE", "x")

    result = _runtime(lambda _r, _c: CoreRetrievalResult.of_failure(failure)).retrieve(
        _request("faq")
    )

    assert result.failure == failure


def test_retrieve_unsupported_provider() -> None:
    """登録のないプロバイダは UNSUPPORTED_PROVIDER になること"""
    result = _runtime(lambda _r, _c: CoreRetrievalResult.success([], False)).retrieve(
        _request("faq", provider="Azure AI Search")
    )

    assert result.failure is not None
    assert result.failure.code == "UNSUPPORTED_PROVIDER"


def test_retrieve_relationship_query_requires_graph_rag() -> None:
    """グラフが要る質問で Graph RAG が無効なら GRAPH_RAG_REQUIRED になること"""
    result = _runtime(
        lambda _r, _c: CoreRetrievalResult.success(["a"], False)
    ).retrieve(_request("dependency of system X"))

    assert result.failure is not None
    assert result.failure.code == "GRAPH_RAG_REQUIRED"


def test_retrieve_relationship_query_uses_graph_capability_when_enabled() -> None:
    """グラフが要る質問で Graph RAG が有効なら GRAPH_RAG の実行器を呼ぶこと"""
    result = _runtime(
        lambda _r, _c: CoreRetrievalResult.success(["g1"], True),
        capability=Capability.GRAPH_RAG,
    ).retrieve(_request("dependency of system X", graph=True))

    assert result.ordered_ids == ("g1",)
    assert result.graph_expanded


def test_retrieve_relationship_query_without_graph_executor_is_graph_rag_required() -> (
    None
):
    """Graph RAG の実行器がないプロバイダでは GRAPH_RAG_REQUIRED になること"""
    result = _runtime(
        lambda _r, _c: CoreRetrievalResult.success([], False), provider="AzureOpenAI"
    ).retrieve(
        CoreRetrievalRequest.builder("AzureOpenAI")
        .query("dependency")
        .graph_rag_search_setting(
            CoreGraphRagSearchSetting.enabled_for("g", "PostgreSQL")
        )
        .build()
    )

    assert result.failure is not None
    assert result.failure.code == "GRAPH_RAG_REQUIRED"


def test_retrieve_executor_exception_becomes_sanitized_failure() -> None:
    """実行器の例外は、秘密を伏せた RETRIEVAL_PROVIDER_FAILURE になること"""

    def boom(_request: Any, _context: ExecutionContext) -> CoreRetrievalResult:
        raise RuntimeError("connect failed password=hunter2 query=secret-question")

    result = _runtime(boom).retrieve(_request("faq"))

    assert result.failure is not None
    assert result.failure.code == "RETRIEVAL_PROVIDER_FAILURE"
    # 移植元と同じく、包んだ例外ではなく原因のメッセージを使う
    assert "connect failed" in result.failure.summary
    assert "hunter2" not in result.failure.summary
    assert "secret-question" not in result.failure.summary


def test_retrieve_malformed_ids_are_rejected() -> None:
    """実行器が空の ID を返したら MALFORMED_RESULT になること"""
    result = _runtime(
        lambda _r, _c: CoreRetrievalResult.success(["a", " "], False)
    ).retrieve(_request("faq"))

    assert result.failure is not None
    assert result.failure.code == "MALFORMED_RESULT"


@pytest.mark.parametrize(
    ("query", "query_type", "reason"),
    [
        (
            "business impact of outage",
            QueryType.BUSINESS_IMPACT,
            "KEYWORD_BUSINESS_IMPACT",
        ),
        ("control gap in review", QueryType.CONTROL_GAP, "KEYWORD_CONTROL_GAP"),
        (
            "what depends on billing",
            QueryType.DEPENDENCY_LOOKUP,
            "KEYWORD_DEPENDENCY_LOOKUP",
        ),
        ("similar cases", QueryType.CASE_SIMILARITY, "KEYWORD_CASE_SIMILARITY"),
        ("incident report", QueryType.TICKET_LOOKUP, "KEYWORD_TICKET_LOOKUP"),
        ("the document list", QueryType.DOCUMENT_LOOKUP, "KEYWORD_DOCUMENT_LOOKUP"),
        ("ABC-1234 status", QueryType.IDENTIFIER_LOOKUP, "PATTERN_IDENTIFIER_LOOKUP"),
        ("expense policy", QueryType.POLICY_QA, "KEYWORD_POLICY_QA"),
        ("how to apply", QueryType.PROCEDURE_QA, "KEYWORD_PROCEDURE_QA"),
        ("user guide", QueryType.MANUAL_QA, "KEYWORD_MANUAL_QA"),
        ("hello", QueryType.FAQ_QA, "DEFAULT_NON_AGE_QA"),
        ("経費の申請方法", QueryType.FAQ_QA, "DEFAULT_NON_AGE_QA"),
    ],
)
def test_classifier_keywords(query: str, query_type: QueryType, reason: str) -> None:
    """決まった語・パターンでクエリ種別を分類すること"""
    classification = RuntimeQueryClassifier().classify(_request(query))

    assert classification.query_type is query_type
    assert classification.sanitized_reason_code == reason


def test_classifier_explicit_attribute_wins() -> None:
    """属性でクエリ種別が明示されていれば、それを使うこと（不正な値は無視）"""
    request = (
        CoreRetrievalRequest.builder("PostgreSQL")
        .query("hello")
        .attribute("queryType", "dependency_lookup")
        .build()
    )
    invalid = (
        CoreRetrievalRequest.builder("PostgreSQL")
        .attribute("queryType", "nope")
        .build()
    )

    explicit = RuntimeQueryClassifier().classify(request)
    assert explicit.query_type is QueryType.DEPENDENCY_LOOKUP
    assert explicit.source == "request_attribute"
    assert explicit.confidence == 1.0
    assert RuntimeQueryClassifier().classify(invalid).query_type is QueryType.FAQ_QA
    assert RuntimeQueryClassifier().classify(None).confidence == 0.0


def test_strategy_selector_marks_age_strategies_as_graph_required() -> None:
    """AGE を使う戦略だけが Graph DB を要求すること"""
    selector = RuntimeRetrievalStrategySelector()

    assert selector.select(QueryType.TICKET_LOOKUP) == [
        RetrievalStrategy.IDENTIFIER_EXACT,
        RetrievalStrategy.PGROONGA_VECTOR,
    ]
    assert not selector.requires_graph_db(selector.select(QueryType.FAQ_QA))
    assert selector.requires_graph_db(selector.select(QueryType.BUSINESS_IMPACT))
    assert selector.requires_graph_db(selector.select(QueryType.CONTROL_GAP))
    for query_type in QueryType:
        assert expected_strategies(query_type)
        assert query_type.graph_db_required() == selector.requires_graph_db(
            selector.select(query_type)
        )


def test_failure_sanitizer_redacts_query_and_secrets_and_prefers_cause() -> None:
    """失敗の要約からクエリと秘密を伏せ、原因（cause）があればそのメッセージを使うこと"""
    sanitizer = CoreRetrievalFailureSanitizer()
    try:
        try:
            raise ValueError("inner api_key=abc123 input=私の質問")
        except ValueError as inner:
            raise RuntimeError("outer") from inner
    except RuntimeError as error:
        failure = sanitizer.provider_failure(error)

    assert failure.code == "RETRIEVAL_PROVIDER_FAILURE"
    assert "abc123" not in failure.summary
    assert "私の質問" not in failure.summary
    assert "outer" not in failure.summary
    assert sanitizer.graph_unavailable(None).summary == "retrieval runtime failure"
    assert sanitizer.graph_query_failure(None).code == "GRAPH_QUERY_FAILURE"
    assert sanitizer.unsupported_provider("x").code == "UNSUPPORTED_PROVIDER"


def test_request_network_setting_is_passed_to_executor() -> None:
    """ネットワーク設定が実行器の文脈に渡ること"""
    contexts: list[ExecutionContext] = []

    def execute(_request: Any, context: ExecutionContext) -> CoreRetrievalResult:
        contexts.append(context)
        return CoreRetrievalResult.success(["a"], False)

    request = (
        CoreRetrievalRequest.builder("PostgreSQL")
        .network_setting(CoreNetworkSetting.from_seconds(None, True, 120))
        .query("faq")
        .build()
    )

    _runtime(execute).retrieve(request)

    assert contexts[0].network_setting.timeout_seconds == 120
    assert contexts[0].network_setting.insecure_ssl_enabled
