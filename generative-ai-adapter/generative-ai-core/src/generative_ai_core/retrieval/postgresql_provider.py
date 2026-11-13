"""PostgreSQL（pgvector）の検索プロバイダ（移植元 CorePostgreSqlRetrievalProvider）。

通常はベクトル検索だけ。Graph RAG・ハイブリッド検索が有効なときは、先に実行環境
（`graphrag_s01`・`graphrag_s02`・AGE の graph など）を読み取りで確かめ、足りなければ失敗に
する（ベクトルだけの成功に黙って切り替えない）。
"""

import logging

import psycopg

from generative_ai_core.failure import CoreFailure
from generative_ai_core.retrieval.failure_sanitizer import CoreRetrievalFailureSanitizer
from generative_ai_core.retrieval.graph_readiness import (
    GraphRagRuntimeBootstrapper,
    GraphRagRuntimeBootstrapRequest,
    GraphRagRuntimeReadinessResult,
    GraphRagRuntimeTargetDescriptor,
    verify_with_connection,
)
from generative_ai_core.retrieval.graph_support import (
    requires_business_relationship_traversal,
)
from generative_ai_core.retrieval.hybrid_bridge import (
    CoreHybridRetrievalBridge,
    CoreHybridRetrievalRuntimeBridge,
)
from generative_ai_core.retrieval.models import (
    CoreRetrievalRequest,
    CoreRetrievalResult,
    CoreVectorSearchResult,
)
from generative_ai_core.retrieval.postgresql_search import (
    CorePostgreSqlSearchClient,
    PsycopgPostgreSqlSearchClient,
    tenant_id_of,
)
from generative_ai_core.retrieval.query_embedding import (
    CoreDefaultQueryEmbeddingGenerator,
    QueryEmbeddingGenerator,
)
from generative_ai_core.vector.target import CoreVectorDbTarget, connect

logger = logging.getLogger(__name__)


def _require_target(request: CoreRetrievalRequest) -> CoreVectorDbTarget:
    """ベクトルDB の接続先を取り出す。

    Parameters
    ----------
    request : CoreRetrievalRequest
        検索リクエスト。

    Returns
    -------
    CoreVectorDbTarget
        接続先。

    Raises
    ------
    ValueError
        接続先がないとき。
    """
    if request.vector_db_target is None:
        raise ValueError("vectorDbTarget is required")
    return request.vector_db_target


def _source_lifecycle_evidence(results: list[CoreVectorSearchResult]) -> dict[str, str]:
    """ベクトル検索の結果から、現行の出典であることと本文の証拠を作る。

    Parameters
    ----------
    results : list[CoreVectorSearchResult]
        ベクトル検索の結果。

    Returns
    -------
    dict[str, str]
        証拠。
    """
    evidence: dict[str, str] = {}
    for result in results:
        evidence[f"sourceLifecycle.current.{result.id}"] = "true"
        evidence.update(result.evidence)
        evidence.setdefault(f"content.{result.id}", result.content)
    return evidence


class CorePostgreSqlRetrievalProvider:
    """PostgreSQL のベクトル検索（と、Graph・ハイブリッドへの分岐）。"""

    def __init__(
        self,
        search_client: CorePostgreSqlSearchClient | None = None,
        embedding_generator: QueryEmbeddingGenerator | None = None,
        hybrid_retrieval_bridge: CoreHybridRetrievalBridge | None = None,
        runtime_bootstrapper: GraphRagRuntimeBootstrapper | None = None,
    ) -> None:
        """差し替えられる部品を受け取る。

        Parameters
        ----------
        search_client : CorePostgreSqlSearchClient | None
            ベクトル検索の問い合わせ。省略すると psycopg。
        embedding_generator : QueryEmbeddingGenerator | None
            クエリのベクトル化。省略すると既定。
        hybrid_retrieval_bridge : CoreHybridRetrievalBridge | None
            ハイブリッド検索。省略すると実際の実装。
        runtime_bootstrapper : GraphRagRuntimeBootstrapper | None
            Graph RAG の実行環境の確認。省略すると、接続して読み取りで確かめる。
        """
        self._search_client = search_client or PsycopgPostgreSqlSearchClient()
        self._embedding_generator = (
            embedding_generator or CoreDefaultQueryEmbeddingGenerator()
        )
        self._hybrid = hybrid_retrieval_bridge or CoreHybridRetrievalRuntimeBridge()
        self._runtime_bootstrapper = runtime_bootstrapper
        self._failure_sanitizer = CoreRetrievalFailureSanitizer()

    def retrieve(self, request: CoreRetrievalRequest) -> CoreRetrievalResult:
        """検索する。例外は失敗の結果にする。

        Parameters
        ----------
        request : CoreRetrievalRequest
            検索リクエスト。

        Returns
        -------
        CoreRetrievalResult
            検索結果。
        """
        try:
            if self._requires_graph_rag_resources(request):
                readiness_failure = self.verify_graph_rag_runtime_readiness(request)
                if readiness_failure is not None:
                    return CoreRetrievalResult.of_failure(readiness_failure)
            if self._hybrid.should_run(request):
                logger.info("postgresql retrieval: route=hybrid")
                return self._hybrid.retrieve(
                    request, self._search_client, self._embedding_generator
                )
            logger.info("postgresql retrieval: route=vector")
            results = self.search(request)
            return CoreRetrievalResult.success(
                [r.id for r in results], False, _source_lifecycle_evidence(results)
            )
        except ValueError:
            return CoreRetrievalResult.of_failure(
                self._failure_sanitizer.malformed_result(
                    "retrieval provider configuration is invalid"
                )
            )
        except Exception as e:  # noqa: BLE001 — 移植元と同じく失敗の結果にして返す
            return CoreRetrievalResult.of_failure(
                self._failure_sanitizer.provider_failure(e)
            )

    def _requires_graph_rag_resources(self, request: CoreRetrievalRequest) -> bool:
        """Graph RAG のリソースの確認が要るかを返す。

        Parameters
        ----------
        request : CoreRetrievalRequest
            検索リクエスト。

        Returns
        -------
        bool
            Graph 検索が有効、またはハイブリッド検索で業務上の関係をたどるなら True。
        """
        return request is not None and (
            request.graph_setting().should_run_graph_search()
            or (
                self._hybrid.should_run(request)
                and requires_business_relationship_traversal(request)
            )
        )

    def verify_graph_rag_runtime_readiness(
        self, request: CoreRetrievalRequest
    ) -> CoreFailure | None:
        """Graph RAG の実行環境が揃っているかを確かめる。

        Parameters
        ----------
        request : CoreRetrievalRequest
            検索リクエスト。

        Returns
        -------
        CoreFailure | None
            揃っていなければ失敗（コードは確認結果の分類）。揃っていれば None。
        """
        readiness = self._verify_graph_rag_runtime(request)
        if readiness.ready:
            return None
        return CoreFailure.of(
            readiness.failure_code or "unknown_sanitized", readiness.sanitized_evidence
        )

    def _verify_graph_rag_runtime(
        self, request: CoreRetrievalRequest
    ) -> GraphRagRuntimeReadinessResult:
        """Graph RAG の実行環境を確認する。

        Parameters
        ----------
        request : CoreRetrievalRequest
            検索リクエスト。

        Returns
        -------
        GraphRagRuntimeReadinessResult
            確認結果。
        """
        target = _require_target(request)
        bootstrap_request = GraphRagRuntimeBootstrapRequest(
            GraphRagRuntimeTargetDescriptor(
                "PostgreSQL",
                f"provider=PostgreSQL;database={target.database_name}"
                f";table={target.table_name};schema=graphrag_s02",
            ),
            request.graph_setting().graph_name,
        )
        if self._runtime_bootstrapper is not None:
            return self._runtime_bootstrapper(bootstrap_request)
        try:
            with connect(target) as connection:
                return verify_with_connection(connection, bootstrap_request)
        except psycopg.Error as e:
            raise RuntimeError(f"graph rag runtime check failed: {e}") from e

    def search(self, request: CoreRetrievalRequest) -> list[CoreVectorSearchResult]:
        """ベクトル検索する。

        Parameters
        ----------
        request : CoreRetrievalRequest
            検索リクエスト。

        Returns
        -------
        list[CoreVectorSearchResult]
            検索結果。

        Raises
        ------
        ValueError
            接続先が足りない、またはクエリのベクトルが空のとき。
        """
        target = _require_target(request)
        target.required_endpoint()
        target.required_user_name()
        target.required_database_name()
        target.required_table_name()
        query_vector = self._embedding_generator.embed(request)
        if not query_vector:
            raise ValueError("query vector must not be empty")
        return self._search_client.search(
            target,
            query_vector,
            request.max_results,
            request.graph_setting().should_run_graph_search(),
            tenant_id_of(request),
        )
