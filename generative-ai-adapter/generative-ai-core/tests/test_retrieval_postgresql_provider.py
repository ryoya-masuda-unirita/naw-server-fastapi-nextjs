"""PostgreSQL の検索プロバイダ（ベクトル検索・Graph/ハイブリッドへの分岐・SQL）のテスト。

移植元 `CorePostgreSqlRetrievalProviderTest`・`CorePostgreSqlRetrievalCurrentnessTest`・
`CorePostgreSqlS04GraphRagSqlContractTest` の一部を移した。DB には接続せず、検索の問い合わせ
（`CorePostgreSqlSearchClient`）と接続は偽物に差し替える。
"""

from collections.abc import Sequence
from typing import Any, Self

import pytest
from generative_ai_core.provider.model import (
    CoreCredential,
    CoreProviderId,
    RuntimeProviderConfiguration,
)
from generative_ai_core.retrieval.graph_readiness import (
    GraphRagRuntimeBootstrapRequest,
    GraphRagRuntimeReadinessResult,
    ready_noop,
)
from generative_ai_core.retrieval.models import (
    CoreGraphRagSearchSetting,
    CoreRetrievalRequest,
    CoreRetrievalResult,
    CoreVectorSearchResult,
)
from generative_ai_core.retrieval.postgresql_provider import (
    CorePostgreSqlRetrievalProvider,
)
from generative_ai_core.retrieval.postgresql_search import (
    DEFAULT_TENANT_ID,
    TENANT_ID_ATTRIBUTE,
    PsycopgPostgreSqlSearchClient,
    tenant_id_of,
    vector_literal,
)
from generative_ai_core.retrieval.query_embedding import (
    CoreDefaultQueryEmbeddingGenerator,
)
from generative_ai_core.vector.target import CoreVectorDbTarget

TARGET = CoreVectorDbTarget.pg_vector(
    "db.invalid:5432", "user", "pw", "appdb", "vectors", False
)
VECTOR = [0.5, -0.25]


class FakeSearchClient:
    """検索結果を返し、呼び出しを記録する偽の問い合わせ。"""

    def __init__(
        self, results: list[CoreVectorSearchResult], error: Exception | None = None
    ) -> None:
        """返す結果と、投げる例外を決める。

        Parameters
        ----------
        results : list[CoreVectorSearchResult]
            返す結果。
        error : Exception | None
            設定すると、この例外を投げる。
        """
        self.results = results
        self.error = error
        self.calls: list[tuple[Any, ...]] = []

    def search(
        self,
        target: CoreVectorDbTarget,
        query_vector: Sequence[float],
        max_results: int,
        current_only: bool = False,
        tenant_id: str = DEFAULT_TENANT_ID,
    ) -> list[CoreVectorSearchResult]:
        """記録して結果を返す。

        Parameters
        ----------
        target : CoreVectorDbTarget
            接続先。
        query_vector : Sequence[float]
            クエリのベクトル。
        max_results : int
            最大件数。
        current_only : bool
            Graph 検索用か。
        tenant_id : str
            テナント。

        Returns
        -------
        list[CoreVectorSearchResult]
            結果。
        """
        self.calls.append(
            (target, tuple(query_vector), max_results, current_only, tenant_id)
        )
        if self.error is not None:
            raise self.error
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


class FakeHybrid:
    """ハイブリッド検索の偽の橋渡し。"""

    def __init__(self, enabled: bool) -> None:
        """動かすかを決める。

        Parameters
        ----------
        enabled : bool
            `should_run` の答え。
        """
        self.enabled = enabled
        self.called = False

    def should_run(self, request: CoreRetrievalRequest | None) -> bool:
        """動かすかを返す。

        Parameters
        ----------
        request : CoreRetrievalRequest | None
            使わない。

        Returns
        -------
        bool
            設定どおり。
        """
        return self.enabled

    def retrieve(
        self, request: Any, search_client: Any, embedding_generator: Any
    ) -> CoreRetrievalResult:
        """呼ばれたことを記録して固定の結果を返す。

        Parameters
        ----------
        request : Any
            使わない。
        search_client : Any
            使わない。
        embedding_generator : Any
            使わない。

        Returns
        -------
        CoreRetrievalResult
            固定の結果。
        """
        self.called = True
        return CoreRetrievalResult.success(["hybrid"], False)


def _provider(
    client: FakeSearchClient,
    *,
    hybrid: FakeHybrid | None = None,
    bootstrapper: Any = ready_noop,
) -> CorePostgreSqlRetrievalProvider:
    """偽の部品で提供者を作る。

    Parameters
    ----------
    client : FakeSearchClient
        偽の問い合わせ。
    hybrid : FakeHybrid | None
        偽のハイブリッド検索。
    bootstrapper : Any
        Graph RAG の実行環境の確認。

    Returns
    -------
    CorePostgreSqlRetrievalProvider
        提供者。
    """
    return CorePostgreSqlRetrievalProvider(
        client, FixedEmbedding(), hybrid or FakeHybrid(False), bootstrapper
    )


def _request(
    *, target: CoreVectorDbTarget | None = TARGET, graph: bool = False, query: str = "q"
) -> CoreRetrievalRequest:
    """検索リクエストを作る。

    Parameters
    ----------
    target : CoreVectorDbTarget | None
        接続先。
    graph : bool
        Graph RAG を有効にするか。
    query : str
        検索文字列。

    Returns
    -------
    CoreRetrievalRequest
        リクエスト。
    """
    builder = CoreRetrievalRequest.builder("PostgreSQL").query(query).max_results(2)
    if target is not None:
        builder.vector_db_target(target)
    if graph:
        builder.graph_rag_search_setting(
            CoreGraphRagSearchSetting.enabled_for("g1", "PostgreSQL")
        )
    return builder.build()


def test_vector_search_returns_ids_and_lifecycle_evidence() -> None:
    """ベクトル検索の ID・本文・出典を返し、現行の出典であることを証拠に入れること"""
    client = FakeSearchClient(
        [
            CoreVectorSearchResult(
                "a", "本文A", 1, {"sourceRef.a": "fileA", "sourceFilePath.a": "/p/a"}
            ),
            CoreVectorSearchResult("b", "本文B", 2),
        ]
    )

    result = _provider(client).retrieve(_request())

    assert result.ordered_ids == ("a", "b")
    assert not result.graph_expanded
    assert result.evidence["sourceLifecycle.current.a"] == "true"
    assert result.evidence["content.a"] == "本文A"
    assert result.evidence["sourceRef.a"] == "fileA"
    assert result.evidence["sourceFilePath.a"] == "/p/a"
    assert client.calls == [(TARGET, tuple(VECTOR), 2, False, DEFAULT_TENANT_ID)]


def test_missing_target_is_configuration_invalid() -> None:
    """接続先がなければ MALFORMED_RESULT（設定が不正）になること"""
    result = _provider(FakeSearchClient([])).retrieve(_request(target=None))

    assert result.failure is not None
    assert result.failure.code == "MALFORMED_RESULT"
    assert "configuration is invalid" in result.failure.summary


def test_search_error_becomes_provider_failure_without_secrets() -> None:
    """DB のエラーは RETRIEVAL_PROVIDER_FAILURE になり、接続情報を含めないこと"""
    client = FakeSearchClient(
        [], RuntimeError("could not connect password=hunter2 jdbc:postgresql://h/db")
    )

    result = _provider(client).retrieve(_request())

    assert result.failure is not None
    assert result.failure.code == "RETRIEVAL_PROVIDER_FAILURE"
    assert "hunter2" not in result.failure.summary
    assert "jdbc:postgresql" not in result.failure.summary


def test_hybrid_bridge_is_used_when_enabled() -> None:
    """ハイブリッド検索が有効なら、ベクトル検索ではなく橋渡しの結果を返すこと"""
    hybrid = FakeHybrid(True)
    client = FakeSearchClient([])

    result = _provider(client, hybrid=hybrid).retrieve(_request())

    assert hybrid.called
    assert result.ordered_ids == ("hybrid",)
    assert client.calls == []


def test_graph_readiness_failure_is_returned_before_searching() -> None:
    """Graph RAG の実行環境が揃っていなければ、検索せずその分類の失敗を返すこと"""

    def not_ready(
        request: GraphRagRuntimeBootstrapRequest,
    ) -> GraphRagRuntimeReadinessResult:
        return GraphRagRuntimeReadinessResult.failed(
            request.target,
            "missing_extension",
            [],
            "required extension unavailable: age",
        )

    client = FakeSearchClient([CoreVectorSearchResult("a", "x", 1)])

    result = _provider(client, bootstrapper=not_ready).retrieve(_request(graph=True))

    assert result.failure is not None
    assert result.failure.code == "missing_extension"
    assert "required extension unavailable" in result.failure.summary
    assert client.calls == []


def test_graph_readiness_request_describes_target_without_credentials() -> None:
    """Graph RAG の確認の依頼は、DB・テーブル・graph 名だけを持ち、接続情報を持たないこと"""
    seen: list[GraphRagRuntimeBootstrapRequest] = []

    def capture(
        request: GraphRagRuntimeBootstrapRequest,
    ) -> GraphRagRuntimeReadinessResult:
        seen.append(request)
        return ready_noop(request)

    _provider(FakeSearchClient([]), bootstrapper=capture).retrieve(_request(graph=True))

    assert seen[0].graph_name == "g1"
    descriptor = seen[0].target.sanitized_descriptor
    assert "database=appdb" in descriptor
    assert "table=vectors" in descriptor
    assert "pw" not in descriptor


def test_empty_query_vector_is_rejected() -> None:
    """クエリのベクトルが空なら設定不正として失敗すること"""

    class EmptyEmbedding:
        def embed(self, request: CoreRetrievalRequest) -> list[float]:
            return []

    provider = CorePostgreSqlRetrievalProvider(
        FakeSearchClient([]), EmptyEmbedding(), FakeHybrid(False), ready_noop
    )

    result = provider.retrieve(_request())

    assert result.failure is not None
    assert result.failure.code == "MALFORMED_RESULT"


def test_default_embedding_requires_configuration() -> None:
    """ベクトルも埋め込みプロバイダの設定もなければ、設定不正の ValueError になること"""
    with pytest.raises(
        ValueError, match="embedding provider configuration is required"
    ):
        CoreDefaultQueryEmbeddingGenerator().embed(_request())


def test_default_embedding_prefers_request_vector_then_embed_function() -> None:
    """リクエストにベクトルがあればそれを使い、なければ埋め込みプロバイダの設定と質問で関数を呼ぶこと"""
    with_vector = (
        CoreRetrievalRequest.builder("PostgreSQL").query_vector([1.0, 2.0]).build()
    )
    assert CoreDefaultQueryEmbeddingGenerator().embed(with_vector) == [1.0, 2.0]

    configuration = RuntimeProviderConfiguration(
        CoreProviderId.Echo, "model", "http://echo.invalid", CoreCredential.api_key("k")
    )
    request = (
        CoreRetrievalRequest.builder("PostgreSQL")
        .query("質問")
        .embedding_provider_configuration(configuration)
        .build()
    )
    seen: list[tuple[CoreProviderId, str]] = []

    def embed(config: RuntimeProviderConfiguration, text: str) -> list[float]:
        seen.append((config.provider_id, text))
        return [3.0]

    assert CoreDefaultQueryEmbeddingGenerator(embed).embed(request) == [3.0]
    assert seen == [(CoreProviderId.Echo, "質問")]


def test_tenant_id_from_attribute_or_default() -> None:
    """テナント ID は属性 `s04.tenantId`、なければ既定値になること"""
    with_tenant = (
        CoreRetrievalRequest.builder("PostgreSQL")
        .attribute(TENANT_ID_ATTRIBUTE, " t1 ")
        .build()
    )

    assert tenant_id_of(with_tenant) == "t1"
    assert tenant_id_of(_request()) == DEFAULT_TENANT_ID
    assert tenant_id_of(None) == DEFAULT_TENANT_ID


def test_vector_literal_format_and_non_finite() -> None:
    """ベクトルを pgvector のリテラルにし、NaN・無限大は拒否すること"""
    assert vector_literal([1.0, -0.5]) == "[1.0,-0.5]"
    for bad in (float("nan"), float("inf")):
        with pytest.raises(ValueError, match="non-finite"):
            vector_literal([bad])


class FakeCursor:
    """SQL の結果を返す偽のカーソル。"""

    def __init__(self, rows: list[tuple[Any, ...]]) -> None:
        """返す行を決める。

        Parameters
        ----------
        rows : list[tuple[Any, ...]]
            行。
        """
        self.rows = rows

    def fetchone(self) -> tuple[Any, ...] | None:
        """先頭の行を返す。

        Returns
        -------
        tuple[Any, ...] | None
            行。なければ None。
        """
        return self.rows[0] if self.rows else None

    def fetchall(self) -> list[tuple[Any, ...]]:
        """すべての行を返す。

        Returns
        -------
        list[tuple[Any, ...]]
            行。
        """
        return self.rows


class FakeConnection:
    """実行した SQL とパラメータを記録する偽の接続。"""

    def __init__(self, has_filepath: bool, rows: list[tuple[Any, ...]]) -> None:
        """`filepath` 列の有無と、検索結果の行を決める。

        Parameters
        ----------
        has_filepath : bool
            テーブルに `filepath` 列があるか。
        rows : list[tuple[Any, ...]]
            検索結果の行。
        """
        self.has_filepath = has_filepath
        self.rows = rows
        self.executed: list[tuple[str, Any]] = []

    def __enter__(self) -> Self:
        """with 文に入る。

        Returns
        -------
        FakeConnection
            自分自身。
        """
        return self

    def __exit__(self, *_args: object) -> None:
        """with 文を抜ける。

        Parameters
        ----------
        *_args : object
            使わない。
        """

    def execute(self, sql: str, params: Any = None) -> FakeCursor:
        """SQL を記録して結果を返す。

        Parameters
        ----------
        sql : str
            SQL。
        params : Any
            パラメータ。

        Returns
        -------
        FakeCursor
            結果のカーソル。
        """
        self.executed.append((sql, params))
        if "information_schema.columns" in sql:
            return FakeCursor([(self.has_filepath,)])
        return FakeCursor(self.rows)


def test_search_client_sql_vector_only_without_filepath_column() -> None:
    """通常のベクトル検索は `<=>` の近い順・LIMIT で、`filepath` 列がなければ NULL を返すこと"""
    connection = FakeConnection(False, [("id-1", "本文", "file-1", None, None)])
    client = PsycopgPostgreSqlSearchClient(lambda _target: connection)

    results = client.search(TARGET, [1.0, 2.0], 5)

    sql, params = connection.executed[1]
    assert "FROM public.vectors v" in sql
    assert "NULL::text AS filepath" in sql
    assert "NULL::text AS graph_path_text" in sql
    assert "JOIN LATERAL" not in sql
    assert sql.endswith("ORDER BY v.embedding <=> %s::vector LIMIT %s")
    assert params == ["[1.0,2.0]", 5]
    assert connection.executed[0][1] == ("vectors",)
    assert results[0].id == "id-1"
    assert results[0].rank == 1
    assert results[0].evidence == {"sourceRef.id-1": "file-1"}


def test_search_client_sql_with_filepath_and_graph_join() -> None:
    """Graph 検索では現行の文書・チャンクと結び付け、テナントを先頭のパラメータにすること"""
    connection = FakeConnection(
        True, [("id-1", "本文", "file-1", "/p/a.md", "h1 --EDGE(ev1)--> h2")]
    )
    client = PsycopgPostgreSqlSearchClient(lambda _target: connection)

    results = client.search(TARGET, [1.0], 3, current_only=True, tenant_id=" t9 ")

    sql, params = connection.executed[1]
    assert "v.filepath" in sql
    assert "graphrag_s02.documents d" in sql
    assert "WHERE d.tenant_id = %s" in sql
    assert params == ["t9", "[1.0]", 3]
    assert results[0].evidence["sourceFilePath.id-1"] == "/p/a.md"
    assert results[0].evidence["graphEvidence.pathText.id-1"] == "h1 --EDGE(ev1)--> h2"
    assert results[0].evidence["graphEvidence.graphDepth.id-1"] == "1"


def test_search_client_rejects_unsafe_table_name() -> None:
    """テーブル名が安全な識別子でなければ、SQL を組み立てる前に失敗すること"""
    target = CoreVectorDbTarget.pg_vector(
        "db", "u", "p", "d", "vectors; drop table x", False
    )
    client = PsycopgPostgreSqlSearchClient(lambda _target: FakeConnection(False, []))

    with pytest.raises(ValueError, match="tableName must match"):
        client.search(target, [1.0], 1)
