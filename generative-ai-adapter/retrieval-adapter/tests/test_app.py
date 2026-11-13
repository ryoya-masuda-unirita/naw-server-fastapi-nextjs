"""検索アダプタ（App・コントローラー・出力・マッパー・設定）のテスト。

移植元 `AppTest`・`RetrievalControllerTest`・`RagContextJsonOutputTest`・
`AdapterOutputCompatibilityTest`・`AdapterCoreRetrievalMapperTest`・
`AdapterGraphRagCompatibilityTest`・`AdapterHybridRetrievalEnablementTest`・
`RetrievalSearchCountValidationTest`・`ValidatePropertyNullInputTest` の主な振る舞いを移した。
DB・プロバイダには接続せず、core の検索は偽物に差し替える。
"""

import json
from pathlib import Path
from typing import Any

import pytest
from generative_ai_core.failure import CoreFailure
from generative_ai_core.media import CoreMediaPreprocessingMode
from generative_ai_core.retrieval.models import (
    CoreRetrievalRequest,
    CoreRetrievalResult,
)
from retrieval_adapter.adapterconfig import (
    RetrievalNetworkProperties,
    RetrievalProviderProperties,
    RetrievalVectorDbProperties,
)
from retrieval_adapter.app import App
from retrieval_adapter.constants import RetrievalPropertyIds as P
from retrieval_adapter.controller import RetrievalController
from retrieval_adapter.failure import RetrievalFailureException
from retrieval_adapter.mapper import AdapterCoreRetrievalMapper
from retrieval_adapter.output_format import RetrievalOutputFormat
from retrieval_adapter.settings import (
    GraphRagSearchSetting,
    HybridRetrievalEnablementSetting,
)
from retrieval_adapter.waha import ColumnData, ColumnInformation, ColumnType


class FakeRuntime:
    """検索リクエストを記録し、決めた結果を返す偽の core 検索。"""

    def __init__(self, result: CoreRetrievalResult) -> None:
        """返す結果を決める。

        Parameters
        ----------
        result : CoreRetrievalResult
            返す結果。
        """
        self.result = result
        self.requests: list[CoreRetrievalRequest] = []

    def retrieve(self, request: CoreRetrievalRequest) -> CoreRetrievalResult:
        """記録して結果を返す。

        Parameters
        ----------
        request : CoreRetrievalRequest
            検索リクエスト。

        Returns
        -------
        CoreRetrievalResult
            結果。
        """
        self.requests.append(request)
        return self.result


PG_PROPS = {
    P.VENDOR: "1",
    P.URL: "https://embed.example.invalid",
    P.API_KEY: "embed-key",
    P.MODEL_NAME: "embed-model",
    P.VDB_VENDOR: "1",
    P.VDB_URL: "db.invalid:5432",
    P.VDB_USER_NAME: "user",
    P.VDB_PASSWORD: "password",
    P.VDB_DATABASE_NAME: "appdb",
    P.VDB_TABLE_NAME: "vectors",
    P.SEARCH_COUNT: "2",
}


def _app(
    tmp_path: Path,
    runtime: FakeRuntime,
    props: dict[int, str] | None = None,
    out_mode: int = 0,
) -> App:
    """Waha! と同じ順序で準備した App を作る（write の前まで）。

    Parameters
    ----------
    tmp_path : Path
        出力先のディレクトリ。
    runtime : FakeRuntime
        偽の core 検索。
    props : dict[int, str] | None
        プロパティ。省略すると PostgreSQL の既定。
    out_mode : int
        出力モード。

    Returns
    -------
    App
        準備した App。
    """
    app = App(lambda: runtime)  # type: ignore[arg-type,return-value]
    for prop_id, value in (props or PG_PROPS).items():
        app.set_property(prop_id, value)
    app.set_property(P.OUTPUT_DIR, str(tmp_path))
    app.connect(out_mode)
    app.set_column_information([ColumnInformation("検索文字列", ColumnType.CHAR, 0)])
    app.set_view_name("out.txt")
    app.before_execute()
    return app


def _ok(evidence: dict[str, str] | None = None) -> FakeRuntime:
    """a・b の 2 件を返す偽の core 検索を作る。

    Parameters
    ----------
    evidence : dict[str, str] | None
        証拠。

    Returns
    -------
    FakeRuntime
        偽の core 検索。
    """
    return FakeRuntime(CoreRetrievalResult.success(["a", "b"], False, evidence or {}))


def test_legacy_tsv_output_and_request_mapping(tmp_path: Path) -> None:
    """出力モード 0 は ID を TSV で書き、プロパティが core のリクエストに写ること"""
    runtime = _ok()
    app = _app(tmp_path, runtime)

    app.write([ColumnData.char("質問です")])

    assert (tmp_path / "out.txt").read_text(encoding="utf-8") == '"a"\t"b"\n'
    request = runtime.requests[0]
    assert request.provider_id == "PostgreSQL"
    assert request.query == "質問です"
    assert request.max_results == 2
    target = request.vector_db_target
    assert target is not None
    assert (
        target.endpoint,
        target.user_name,
        target.database_name,
        target.table_name,
    ) == (
        "db.invalid:5432",
        "user",
        "appdb",
        "vectors",
    )
    configuration = request.embedding_provider_configuration
    assert configuration is not None
    assert configuration.provider_id.canonical_name == "AzureOpenAI"
    assert configuration.model_name == "embed-model"
    assert request.query_vector == ()
    assert "s04.hybridRetrievalRuntime" not in request.attributes


def test_rag_context_json_output(tmp_path: Path) -> None:
    """出力モード 1 は RAG Context JSON v1 を書き、本文・出典・スコア・信号を証拠から作ること"""
    evidence = {
        "content.a": "本文A",
        "sourceRef.a": "fileA",
        "sourceFilePath.a": "/docs/a.md",
        "score.a": "0.5",
        "signal.pgroonga.a": "true",
        "sourceLifecycle.deleted.b": "true",
    }
    app = _app(tmp_path, _ok(evidence), out_mode=1)

    app.write([ColumnData.char("q")])

    body = json.loads((tmp_path / "out.txt").read_text(encoding="utf-8"))
    assert body["schemaVersion"] == 1
    assert body["generatedAt"].endswith("Z")
    assert body["contexts"] == [
        {
            "sourceFilePath": "/docs/a.md",
            "sourceRef": "fileA",
            "chunkId": "a",
            "content": "本文A",
            "score": 0.5,
            "retrievalSignals": {"vector": True, "pgroonga": True, "graph": False},
        }
    ]


def test_rag_context_json_limits_and_safety() -> None:
    """コンテキストは 20 件まで、本文は 8000 文字まで、危険な出典パスは出さず本文なしは ID で補うこと"""
    ids = [f"id{i}" for i in range(25)]
    evidence = {
        "content.id0": "x" * 9000,
        "sourceFilePath.id1": "https://example.com/a",
        "sourceFilePath.id2": "/p/with-token.md",
        "sourceFilePath.id3": "/ok/path.md",
    }
    result = CoreRetrievalResult.success(ids, False, evidence)

    contexts = json.loads(RetrievalOutputFormat.RAG_CONTEXT_JSON_V1.render(result))[
        "contexts"
    ]

    assert len(contexts) == 20
    assert len(contexts[0]["content"]) == 8000
    assert "sourceFilePath" not in contexts[1]
    assert "sourceFilePath" not in contexts[2]
    assert contexts[3]["sourceFilePath"] == "/ok/path.md"
    assert contexts[4]["content"] == "id4"
    assert contexts[4]["sourceRef"] == "id4"
    assert contexts[4]["score"] == 1.0


def test_rag_context_json_graph_evidence() -> None:
    """Graph で広げた結果は、パスの文字列を検証してノードとエッジの交互のパスにすること"""
    evidence = {
        "graphEvidence.pathText.a": "doc1 --BUSINESS_RELATIONSHIP(ev-1)--> doc2",
        "graphEvidence.graphDepth.a": "1",
        "graphEvidence.pathText.b": "doc1 --EDGE(x)--> doc2",
        "graphEvidence.graphDepth.b": "2",
        "graphOnly.b": "true",
    }
    result = CoreRetrievalResult.success(["a", "b", "c"], True, evidence)

    contexts = json.loads(RetrievalOutputFormat.RAG_CONTEXT_JSON_V1.render(result))[
        "contexts"
    ]

    assert [c["chunkId"] for c in contexts] == ["a", "c"]
    graph = contexts[0]["graphEvidence"][0]
    assert graph["reasonType"] == "graph_path"
    assert graph["graphDepth"] == 1
    assert graph["path"] == [
        {"nodeType": "Document", "label": "doc1"},
        {"edgeType": "BUSINESS_RELATIONSHIP", "edgeLabel": "ev-1"},
        {"nodeType": "Document", "label": "doc2"},
    ]
    assert contexts[0]["retrievalSignals"]["graph"] is True
    assert "graphEvidence" not in contexts[1]


def test_unsupported_out_mode() -> None:
    """出力モードは 0 と 1 だけで、それ以外は失敗すること"""
    with pytest.raises(ValueError, match="Unsupported retrieval output mode"):
        App().connect(2)


def test_core_failure_becomes_exception_with_category(tmp_path: Path) -> None:
    """core の失敗は `コード [分類]: 要約` の例外になり、PGROONGA_* は専用の分類になること"""
    failure = CoreFailure.of("PGROONGA_UNAVAILABLE", "extension missing")
    app = _app(tmp_path, FakeRuntime(CoreRetrievalResult.of_failure(failure)))

    with pytest.raises(
        RuntimeError, match=r"PGROONGA_UNAVAILABLE \[RETRIEVAL_READINESS_PGROONGA\]"
    ):
        app.write([ColumnData.char("q")])

    other = RetrievalFailureException(CoreFailure.of("GRAPH_QUERY_FAILURE", "x"))
    assert other.category_token == "RETRIEVAL_CORE_FAILURE"
    assert not (tmp_path / "out.txt").exists()


def test_query_from_file_and_multiple_columns(tmp_path: Path) -> None:
    """FILE の列はファイルの本文、文字の列はそのまま、改行でつなぎ、null の FILE は無視すること"""
    query_file = tmp_path / "q.txt"
    query_file.write_text("ファイルの質問", encoding="utf-8")
    runtime = _ok()
    controller = RetrievalController(
        RetrievalNetworkProperties(),
        RetrievalProviderProperties(),
        RetrievalVectorDbProperties(vendor_name="PostgreSQL(PGVector)"),
        core_retrieval_runtime=runtime,  # type: ignore[arg-type]
    )
    columns = [
        ColumnInformation("a", ColumnType.FILE, 0),
        ColumnInformation("b", ColumnType.CHAR, 0),
        ColumnInformation("c", ColumnType.FILE, 0),
    ]
    record = [
        ColumnData.file(json.dumps({"filePath": str(query_file)})),
        ColumnData.char("追加"),
        ColumnData.file("C:\\x\\null"),
    ]

    controller.find_related_embeddings(record, columns, str(tmp_path / "o"), 3)

    assert runtime.requests[0].query == "ファイルの質問\n追加"


def test_default_properties_and_search_count(tmp_path: Path) -> None:
    """検索クエリ数の既定は 3、空は 3、数字でなければエラーになること"""
    app = App()
    assert app.max_result == 3
    app.set_property(P.SEARCH_COUNT, " ")
    assert app.max_result == 3
    app.set_property(P.SEARCH_COUNT, "7")
    assert app.max_result == 7
    with pytest.raises(RuntimeError, match="検索クエリ数"):
        app.set_property(P.SEARCH_COUNT, "x")
    assert tmp_path.exists()


@pytest.mark.parametrize(
    ("prop", "value", "message"),
    [
        (P.URL, "ftp://x", "エンベディング URL"),
        (P.API_KEY, "a b", "エンベディング API Key"),
        (P.API_KEY, "", "エンベディング API Key"),
        (P.TENANT_ID, "-bad", "Tenant ID"),
        (P.OUTPUT_DIR, "/not/windows", "出力先ディレクトリ"),
        (P.PROXY_PORT, "70000", "0~65535"),
        (P.PROXY_PORT, "abc", "数値を整数"),
        (P.PROXY_ID, "bad id", "Proxy認証ユーザID"),
        (P.PROXY_PASS, "日本語", "Proxy認証パスワード"),
        (P.SEARCH_COUNT, "1a", "検索クエリ数"),
        (P.AGE_GRAPH_NAME, "bad-name", "AGE graph 名"),
        (P.EMBEDDING_DIMENSIONS, "0", "Embedding dimensions"),
        (P.PROVIDER_LLM_RERANK_TIMEOUT_SECONDS, "30", "between 60 and 86400"),
        (P.PROVIDER_LLM_RERANK_TIMEOUT_SECONDS, "x", "must be numeric"),
    ],
)
def test_validate_property_rejects(prop: int, value: str, message: str) -> None:
    """保存用の検証で、不正な値を理由付きで拒否すること"""
    with pytest.raises((RuntimeError, ValueError), match=message):
        App().validate_property(prop, value)
    assert not App().validate_property(P.PROVIDER_LLM_RERANK_ENABLED, "2")
    assert not App().validate_property(P.PROVIDER_LLM_RERANK_PROVIDER, "9")


def test_validate_property_accepts_and_handles_null() -> None:
    """正しい値と、null（空文字扱い）を受け付けること"""
    app = App()
    assert app.validate_property(P.URL, "https://x")
    assert app.validate_property(P.OUTPUT_DIR, "C:\\out")
    assert app.validate_property(P.HYBRID_RETRIEVAL_ENABLED, None)
    assert app.validate_property(P.AGE_GRAPH_NAME, None)
    assert app.validate_property(P.TENANT_ID, None)
    assert app.validate_property(P.SEARCH_COUNT, None)
    assert app.validate_property(P.PROVIDER_LLM_RERANK_ENABLED, None)
    with pytest.raises(RuntimeError, match="エンベディング API Key"):
        app.validate_property(P.API_KEY, None)


def test_vendor_maps_and_unknown_vendor() -> None:
    """ベンダー ID が名前に写り、未知の ID はエラーになること"""
    app = App()
    for value, name in {
        "0": "OpenAI",
        "1": "AzureOpenAI",
        "5": "SecuAiGent",
        "99": "Echo",
    }.items():
        app.set_property(P.VENDOR, value)
        assert app.access_credential.vendor_name == name
    app.set_property(P.VDB_VENDOR, "0")
    assert app.vector_db_config.vendor_name == "Azure AI Search"
    with pytest.raises(ValueError, match="Unsupported vendor ID: 7"):
        app.set_property(P.VENDOR, "7")
    with pytest.raises(ValueError, match="Unsupported rerank provider ID: 2"):
        app.set_property(P.PROVIDER_LLM_RERANK_PROVIDER, "2")


def test_before_execute_requires_postgresql_properties(tmp_path: Path) -> None:
    """PostgreSQL では接続の必須プロパティが足りなければ、足りない名前を並べて失敗すること"""
    props = {
        k: v
        for k, v in PG_PROPS.items()
        if k not in (P.VDB_PASSWORD, P.VDB_DATABASE_NAME)
    }

    with pytest.raises(
        RuntimeError, match="property 42 PostgreSQL password, property 43"
    ):
        _app(tmp_path, _ok(), props)


def test_graph_and_hybrid_require_postgresql(tmp_path: Path) -> None:
    """GraphRAG・ハイブリッドは PostgreSQL 以外では失敗すること"""
    props = {**PG_PROPS, P.VDB_VENDOR: "0", P.GRAPH_RAG_ENABLED: "1"}
    props[P.VDB_URL] = "https://search.invalid"
    props[P.VDB_INDEX_NAME] = "idx"

    with pytest.raises(RuntimeError, match="available only for PostgreSQL"):
        _app(tmp_path, _ok(), props)


def test_graph_rag_and_hybrid_flow_into_core_request(tmp_path: Path) -> None:
    """プロパティ 45・46・47・53〜59 が core のリクエストの Graph 設定・属性に写ること"""
    props = {
        **PG_PROPS,
        P.GRAPH_RAG_ENABLED: "1",
        P.AGE_GRAPH_NAME: "my_graph",
        P.HYBRID_RETRIEVAL_ENABLED: "1",
        P.PROVIDER_LLM_RERANK_PROVIDER: "0",
        P.PROVIDER_LLM_RERANK_URL: "https://rerank.invalid",
        P.PROVIDER_LLM_RERANK_API_KEY: "rk",
        P.PROVIDER_LLM_RERANK_MODEL: "rm",
        P.PROVIDER_LLM_RERANK_TIMEOUT_SECONDS: "90",
    }
    runtime = _ok()
    app = _app(tmp_path, runtime, props)

    app.write([ColumnData.char("q")])

    request = runtime.requests[0]
    assert request.graph_setting().should_run_graph_search()
    assert request.graph_setting().graph_name == "my_graph"
    assert request.attributes["s04.hybridRetrievalRuntime"] == "enabled"
    assert request.attributes["s04.providerLlmRerank"] == "enabled"
    assert request.attributes["s04.providerLlmRerankProvider"] == "OpenAI"
    assert request.attributes["s04.providerLlmRerankTimeoutSeconds"] == "90"
    assert request.attributes["s04.providerLlmRerankCredentialKind"] == "api_key"


def test_rerank_can_be_disabled(tmp_path: Path) -> None:
    """プロパティ 53 が 0 ならリランクの属性を付けないこと"""
    props = {
        **PG_PROPS,
        P.HYBRID_RETRIEVAL_ENABLED: "1",
        P.PROVIDER_LLM_RERANK_ENABLED: "0",
    }
    runtime = _ok()

    _app(tmp_path, runtime, props).write([ColumnData.char("q")])

    assert "s04.providerLlmRerank" not in runtime.requests[0].attributes


def test_graph_name_derivation_and_setting_rules() -> None:
    """graph 名は明示 → テーブル名から導出 → 既定の順で、PostgreSQL で両方なければ失敗すること"""
    assert GraphRagSearchSetting.from_properties(
        True, "", "PostgreSQL", "My Table"
    ).effective_graph_name() == ("my_table")
    assert GraphRagSearchSetting.from_properties(
        True, "x_g", "PostgreSQL", None
    ).effective_graph_name() == ("x_g")
    assert GraphRagSearchSetting.from_properties(
        False, None, "PostgreSQL"
    ).effective_graph_name() == ("secuaigent_core_graph")
    with pytest.raises(ValueError, match="tableName is required"):
        GraphRagSearchSetting.from_properties(True, "", "PostgreSQL(PGVector)", None)
    assert not GraphRagSearchSetting.from_properties(
        True, "g", "Azure AI Search", "t"
    ).is_graph_search_active()
    assert GraphRagSearchSetting.parse_enabled("Yes")
    assert not GraphRagSearchSetting.parse_enabled(" off ")
    with pytest.raises(ValueError, match="0/1 or true/false"):
        GraphRagSearchSetting.parse_enabled("maybe")


def test_hybrid_setting_only_for_postgresql_provider() -> None:
    """ハイブリッド検索は `1` のときだけ有効で、プロバイダが PostgreSQL のときだけ実行すること"""
    enabled = HybridRetrievalEnablementSetting.from_property("1")

    assert enabled.is_runtime_enabled_for_provider("PostgreSQL")
    assert not enabled.is_runtime_enabled_for_provider("AzureOpenAI")
    assert not HybridRetrievalEnablementSetting.from_property("true").enabled


def test_mapper_provider_and_target_rules() -> None:
    """プロバイダ ID・接続先・埋め込み設定の変換規則が移植元どおりであること"""
    mapper = AdapterCoreRetrievalMapper()
    azure_search = RetrievalVectorDbProperties(
        vendor_name="Azure AI Search", url="u", api_key="k", index_name="i"
    )
    azure_openai = RetrievalVectorDbProperties(
        vendor_name="AzureOpenAI", url="https://s", api_key="k", index_name="i"
    )
    pg_missing = RetrievalVectorDbProperties(vendor_name="PGvector", url="h")

    # 移植元と同じく、"Azure AI Search" はそのままのプロバイダ ID・接続先なし（未対応）になる
    assert mapper.provider_id(azure_search) == "Azure AI Search"
    assert mapper.target(azure_search) is None
    assert mapper.provider_id(azure_openai) == "AzureOpenAI"
    assert mapper.target(azure_openai) is not None
    assert mapper.provider_id(None) == "unsupported"
    assert mapper.target(pg_missing) is None
    secu = RetrievalProviderProperties(
        url="https://s",
        api_key="k",
        model_name="m",
        vendor_name="SecuAiGent",
        tenant_id=" ",
    )
    assert mapper.embedding_configuration(secu, None) is None
    secu.tenant_id = "t1"
    secu.embedding_dimensions = 8
    configuration = mapper.embedding_configuration(secu, None)
    assert configuration is not None
    assert configuration.attributes["secuaigent.dimensions"] == "8"
    assert (
        mapper.embedding_configuration(
            RetrievalProviderProperties(
                vendor_name="VertexAI Gemini", url="u", api_key="k", model_name="m"
            ),
            None,
        )
        is None
    )


def test_secuaigent_requires_properties_and_text_data_overlay(tmp_path: Path) -> None:
    """SecuAiGent は必須プロパティを確かめ、textData の URL・トークン・テナントで上書きすること"""
    props = {
        **PG_PROPS,
        P.VENDOR: "5",
        P.URL: "https://base",
        P.API_KEY: "k",
        P.MODEL_NAME: "m",
    }
    with pytest.raises(RuntimeError, match="property 3 Tenant ID"):
        _app(tmp_path, _ok(), props)

    text_data = tmp_path / "textData.json"
    text_data.write_text(
        json.dumps(
            {
                "accessToken": "jwt",
                "credential": {"url": "https://overlay", "tenantId": "tenant-x"},
                "deployName": "embed-deploy",
            }
        ),
        encoding="utf-8",
    )
    runtime = _ok()
    app = _app(tmp_path, runtime, {**props, P.TEXT_DATA_JSON_FILE_PATH: str(text_data)})

    app.write([ColumnData.char("q")])

    configuration = runtime.requests[0].embedding_provider_configuration
    assert configuration is not None
    assert configuration.endpoint == "https://overlay"
    assert configuration.model_name == "embed-deploy"
    assert configuration.credential.kind.value == "BEARER_TOKEN"
    assert configuration.attributes["secuaigent.tenantId"] == "tenant-x"
    assert app.access_credential.url == "https://base"


def test_invalid_text_data_fails_before_execute(tmp_path: Path) -> None:
    """textData が不正なら before_execute で失敗すること"""
    bad = tmp_path / "bad.json"
    bad.write_text("{not json", encoding="utf-8")
    props = {
        **PG_PROPS,
        P.VENDOR: "5",
        P.TENANT_ID: "t",
        P.TEXT_DATA_JSON_FILE_PATH: str(bad),
    }

    with pytest.raises(ValueError, match=r".+"):
        _app(tmp_path, _ok(), props)


def test_image_mode_and_misc_defaults() -> None:
    """画像解析モードは数値で指定し、view 名・列定義・接続テストが移植元どおりであること"""
    app = App()
    app.set_property(P.IMAGE_EXPLANATION_MODE, "2")
    assert app.image_explanation_mode == CoreMediaPreprocessingMode.FULL_PAGE
    app.image_explanation_mode = CoreMediaPreprocessingMode.EMBED_ONLY
    app.set_property(P.IMAGE_EXPLANATION_MODE, "9")
    assert app.image_explanation_mode == CoreMediaPreprocessingMode.DISABLED
    assert app.get_view_names() == [
        "インポート後に出力するファイル名に置き換えてください。"
    ]
    [column] = app.get_column_information("x")
    assert (column.name, column.col_type, column.index) == (
        "検索文字列",
        ColumnType.FILE,
        0,
    )
    assert app.validate_column_information(column)
    app.set_property(P.USE_PROXY, "1")
    app.set_property(P.PROXY_HOST, "")
    with pytest.raises(RuntimeError, match="Proxyホスト名"):
        app.test_connect()
    app.set_property(P.PROXY_HOST, "proxy")
    app.set_property(P.PROXY_PORT, "")
    with pytest.raises(RuntimeError, match="Proxyポート番号"):
        app.test_connect()
    app.set_property(P.PROXY_PORT, "8080")
    assert app.test_connect()
    app.disconnect()
    app.after_execute()


def test_proxy_properties_reach_core_network_setting(tmp_path: Path) -> None:
    """プロキシ・SSL のプロパティが core のネットワーク設定に写ること"""
    props: dict[int, str] = {
        **PG_PROPS,
        P.USE_PROXY: "1",
        P.PROXY_HOST: "proxy.invalid",
        P.PROXY_PORT: "3128",
        P.USE_PROXY_CRED: "1",
        P.PROXY_ID: "pid",
        P.PROXY_PASS: "ppass",
        P.INSECURE_SSL: "1",
    }
    runtime = _ok()

    _app(tmp_path, runtime, props).write([ColumnData.char("q")])

    network: Any = runtime.requests[0].network_setting
    assert network.insecure_ssl_enabled
    assert (network.proxy_setting.host, network.proxy_setting.port) == (
        "proxy.invalid",
        3128,
    )
    assert network.proxy_setting.username == "pid"
