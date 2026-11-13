"""検索の入口（移植元 CoreRetrievalRuntime・CoreRetrievalProviderRegistry）。

クエリを分類して検索戦略を決め、プロバイダ × 能力（検索 / Graph RAG）の実行器へ渡す。
プロバイダの登録は `default_provider_runtime`（PostgreSQL・PGvector・AzureOpenAI・
AzureAISearch）。
"""

import logging
from dataclasses import replace

from generative_ai_core.failure import CoreFailure
from generative_ai_core.provider.model import Capability
from generative_ai_core.provider.runtime import (
    CoreProviderRuntime,
    CoreProviderRuntimeBuilder,
    ExecutionContext,
)
from generative_ai_core.retrieval.age_graph import CoreApacheAgeGraphExpansionProvider
from generative_ai_core.retrieval.azure_search_provider import (
    CoreAzureAiSearchRetrievalProvider,
)
from generative_ai_core.retrieval.failure_sanitizer import CoreRetrievalFailureSanitizer
from generative_ai_core.retrieval.graph_support import (
    CoreGraphSearchResultMerger,
    CoreRetrievalResultValidator,
)
from generative_ai_core.retrieval.models import (
    CoreRetrievalRequest,
    CoreRetrievalResult,
)
from generative_ai_core.retrieval.postgresql_provider import (
    CorePostgreSqlRetrievalProvider,
)
from generative_ai_core.retrieval.releasegate import RetrievalStrategy
from generative_ai_core.retrieval.routing import (
    RuntimeQueryClassification,
    RuntimeQueryClassifier,
    RuntimeRetrievalStrategySelector,
)

logger = logging.getLogger(__name__)

ROUTER_QUERY_TYPE_ATTRIBUTE = "router.queryType"
ROUTER_SELECTED_STRATEGIES_ATTRIBUTE = "router.selectedStrategies"
ROUTER_CLASSIFICATION_SOURCE_ATTRIBUTE = "router.classificationSource"
ROUTER_REASON_CODE_ATTRIBUTE = "router.reasonCode"
ROUTER_GRAPH_DB_REQUIRED_ATTRIBUTE = "router.graphDbRequired"
GRAPH_RAG_REQUIRED_SUMMARY = (
    "relationship query requires PostgreSQL Graph RAG capability"
)
POSTGRESQL_PROVIDER_IDS = ("PostgreSQL", "PGvector")
AZURE_PROVIDER_IDS = ("AzureOpenAI", "AzureAISearch")


def _retrieve_with_graph(
    request: CoreRetrievalRequest,
    postgresql_provider: CorePostgreSqlRetrievalProvider,
    graph_provider: CoreApacheAgeGraphExpansionProvider,
    merger: CoreGraphSearchResultMerger,
) -> CoreRetrievalResult:
    """ベクトル検索の結果を種に Graph で広げた結果を返す（Graph RAG の能力）。

    Parameters
    ----------
    request : CoreRetrievalRequest
        検索リクエスト。
    postgresql_provider : CorePostgreSqlRetrievalProvider
        PostgreSQL の検索プロバイダ。
    graph_provider : CoreApacheAgeGraphExpansionProvider
        Graph で広げる部品。
    merger : CoreGraphSearchResultMerger
        種と候補を 1 つの並びにする部品。

    Returns
    -------
    CoreRetrievalResult
        検索結果。
    """
    sanitizer = CoreRetrievalFailureSanitizer()
    try:
        readiness_failure = postgresql_provider.verify_graph_rag_runtime_readiness(
            request
        )
        if readiness_failure is not None:
            return CoreRetrievalResult.of_failure(readiness_failure)
        seed_results = postgresql_provider.search(request)
        if not seed_results:
            return CoreRetrievalResult.success([], False)
        graph_result = graph_provider.expand(request, seed_results)
        if graph_result.failure is not None:
            return CoreRetrievalResult.of_failure(graph_result.failure)
        return CoreRetrievalResult.success(
            merger.merge(seed_results, graph_result.candidates), True
        )
    except ValueError:
        return CoreRetrievalResult.of_failure(
            sanitizer.malformed_result("retrieval provider configuration is invalid")
        )
    except Exception as e:  # noqa: BLE001 — 移植元と同じく失敗の結果にして返す
        return CoreRetrievalResult.of_failure(sanitizer.graph_query_failure(e))


def default_provider_runtime(
    postgresql_provider: CorePostgreSqlRetrievalProvider | None = None,
    azure_provider: CoreAzureAiSearchRetrievalProvider | None = None,
    graph_provider: CoreApacheAgeGraphExpansionProvider | None = None,
) -> CoreProviderRuntime:
    """検索プロバイダを登録したランタイムを作る（移植元 defaultProviderRuntime）。

    Parameters
    ----------
    postgresql_provider : CorePostgreSqlRetrievalProvider | None
        PostgreSQL の検索プロバイダ。省略すると既定。
    azure_provider : CoreAzureAiSearchRetrievalProvider | None
        Azure AI Search の検索プロバイダ。省略すると既定。
    graph_provider : CoreApacheAgeGraphExpansionProvider | None
        Graph で広げる部品。省略すると既定。

    Returns
    -------
    CoreProviderRuntime
        ランタイム。
    """
    postgres = postgresql_provider or CorePostgreSqlRetrievalProvider()
    azure = azure_provider or CoreAzureAiSearchRetrievalProvider()
    graph = graph_provider or CoreApacheAgeGraphExpansionProvider()
    merger = CoreGraphSearchResultMerger()
    builder: CoreProviderRuntimeBuilder = CoreProviderRuntime.builder()

    def retrieve_postgres(
        request: object, _context: ExecutionContext
    ) -> CoreRetrievalResult:
        """PostgreSQL のベクトル検索を実行する。

        Parameters
        ----------
        request : object
            検索リクエスト。
        _context : ExecutionContext
            使わない。

        Returns
        -------
        CoreRetrievalResult
            検索結果。
        """
        assert isinstance(request, CoreRetrievalRequest)
        return postgres.retrieve(request)

    def retrieve_graph(
        request: object, _context: ExecutionContext
    ) -> CoreRetrievalResult:
        """PostgreSQL の Graph RAG を実行する。

        Parameters
        ----------
        request : object
            検索リクエスト。
        _context : ExecutionContext
            使わない。

        Returns
        -------
        CoreRetrievalResult
            検索結果。
        """
        assert isinstance(request, CoreRetrievalRequest)
        return _retrieve_with_graph(request, postgres, graph, merger)

    def retrieve_azure(
        request: object, _context: ExecutionContext
    ) -> CoreRetrievalResult:
        """Azure AI Search の検索を実行する。

        Parameters
        ----------
        request : object
            検索リクエスト。
        _context : ExecutionContext
            使わない。

        Returns
        -------
        CoreRetrievalResult
            検索結果。
        """
        assert isinstance(request, CoreRetrievalRequest)
        return azure.retrieve(request)

    for provider_id in POSTGRESQL_PROVIDER_IDS:
        builder.register(
            provider_id, Capability.RETRIEVAL, CoreRetrievalRequest, retrieve_postgres
        )
        builder.register(
            provider_id, Capability.GRAPH_RAG, CoreRetrievalRequest, retrieve_graph
        )
    for provider_id in AZURE_PROVIDER_IDS:
        builder.register(
            provider_id, Capability.RETRIEVAL, CoreRetrievalRequest, retrieve_azure
        )
    return builder.build()


def _with_routing_decision(
    request: CoreRetrievalRequest,
    classification: RuntimeQueryClassification,
    selected_strategies: list[RetrievalStrategy],
    graph_db_required: bool,
) -> CoreRetrievalRequest:
    """分類の結果を属性に足したリクエストを返す。

    Parameters
    ----------
    request : CoreRetrievalRequest
        検索リクエスト。
    classification : RuntimeQueryClassification
        クエリの分類。
    selected_strategies : list[RetrievalStrategy]
        選ばれた検索戦略。
    graph_db_required : bool
        Graph DB が要るか。

    Returns
    -------
    CoreRetrievalRequest
        属性を足したリクエスト。
    """
    attributes = dict(request.attributes)
    attributes[ROUTER_QUERY_TYPE_ATTRIBUTE] = classification.query_type.name
    attributes[ROUTER_SELECTED_STRATEGIES_ATTRIBUTE] = ",".join(
        s.name for s in selected_strategies
    )
    attributes[ROUTER_CLASSIFICATION_SOURCE_ATTRIBUTE] = classification.source
    attributes[ROUTER_REASON_CODE_ATTRIBUTE] = classification.sanitized_reason_code
    attributes[ROUTER_GRAPH_DB_REQUIRED_ATTRIBUTE] = (
        "true" if graph_db_required else "false"
    )
    return replace(request, attributes=attributes)


class CoreRetrievalRuntime:
    """検索を実行する入口。"""

    def __init__(
        self,
        provider_runtime: CoreProviderRuntime | None = None,
        result_validator: CoreRetrievalResultValidator | None = None,
        query_classifier: RuntimeQueryClassifier | None = None,
        strategy_selector: RuntimeRetrievalStrategySelector | None = None,
    ) -> None:
        """部品を受け取る（省略すると既定）。

        Parameters
        ----------
        provider_runtime : CoreProviderRuntime | None
            検索プロバイダを登録したランタイム。
        result_validator : CoreRetrievalResultValidator | None
            結果の検証。
        query_classifier : RuntimeQueryClassifier | None
            クエリの分類。
        strategy_selector : RuntimeRetrievalStrategySelector | None
            検索戦略の選択。
        """
        self._provider_runtime = provider_runtime or default_provider_runtime()
        self._result_validator = result_validator or CoreRetrievalResultValidator()
        self._query_classifier = query_classifier or RuntimeQueryClassifier()
        self._strategy_selector = (
            strategy_selector or RuntimeRetrievalStrategySelector()
        )
        self._failure_sanitizer = CoreRetrievalFailureSanitizer()

    def retrieve(self, request: CoreRetrievalRequest) -> CoreRetrievalResult:
        """検索を実行する。

        Parameters
        ----------
        request : CoreRetrievalRequest
            検索リクエスト。

        Returns
        -------
        CoreRetrievalResult
            検索結果。関係をたどる質問で Graph RAG が無効なら `GRAPH_RAG_REQUIRED`、
            プロバイダ未登録なら `UNSUPPORTED_PROVIDER` の失敗。
        """
        classification = self._query_classifier.classify(request)
        strategies = self._strategy_selector.select(classification.query_type)
        graph_db_required = self._strategy_selector.requires_graph_db(strategies)
        routed = _with_routing_decision(
            request, classification, strategies, graph_db_required
        )
        logger.info(
            "core retrieval: provider=%s, queryType=%s, strategies=%s, graphDbRequired=%s, "
            "maxResults=%d",
            request.provider_id,
            classification.query_type.name,
            [s.name for s in strategies],
            graph_db_required,
            request.max_results,
        )
        if graph_db_required and not request.graph_setting().should_run_graph_search():
            return CoreRetrievalResult.of_failure(
                CoreFailure.of("GRAPH_RAG_REQUIRED", GRAPH_RAG_REQUIRED_SUMMARY)
            )
        capability = Capability.GRAPH_RAG if graph_db_required else Capability.RETRIEVAL
        if not self._provider_runtime.supports(request.provider_id, capability):
            if graph_db_required:
                return CoreRetrievalResult.of_failure(
                    CoreFailure.of("GRAPH_RAG_REQUIRED", GRAPH_RAG_REQUIRED_SUMMARY)
                )
            return CoreRetrievalResult.of_failure(
                CoreFailure.of(
                    "UNSUPPORTED_PROVIDER",
                    "retrieval provider does not support requested capability",
                )
            )
        try:
            result = self._provider_runtime.execute(
                request.provider_id,
                capability,
                routed,
                request.network_setting,
                CoreRetrievalResult,
            )
            if result.failure is not None:
                logger.info("core retrieval failed: code=%s", result.failure.code)
                return result
            validated = self._result_validator.validate_success(
                list(result.ordered_ids), result.graph_expanded, result.evidence
            )
            logger.info(
                "core retrieval finished: ids=%d, graphExpanded=%s",
                len(validated.ordered_ids),
                validated.graph_expanded,
            )
            return validated
        except Exception as e:  # noqa: BLE001 — 移植元と同じく失敗の結果にして返す
            if capability == Capability.GRAPH_RAG:
                return CoreRetrievalResult.of_failure(
                    self._failure_sanitizer.graph_query_failure(e)
                )
            return CoreRetrievalResult.of_failure(
                self._failure_sanitizer.provider_failure(e)
            )
