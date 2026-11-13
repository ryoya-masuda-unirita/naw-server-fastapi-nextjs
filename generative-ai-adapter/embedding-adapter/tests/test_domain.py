"""domain の単体テスト。

移植元 embedding-adapter/src/test の domain/ 配下のテスト（AzureEmbeddingTest・
EmbeddingTest・GraphCandidateLlmConfigTest・GraphWriteResultTest・RequestSchemaTest・
VectorDBConfigTest・VectorDBConfigRuntimeValidationRepairTest）と
util/Util を移したもの。
"""

import re

import pytest
from embedding_adapter.domain import (
    AzureEmbedding,
    Embedding,
    EmbeddingNetworkProperties,
    GraphCandidateLlmConfig,
    GraphWriteResult,
    GraphWriteStatus,
    RequestSchema,
    VectorDBConfig,
    normalize_vendor_name,
)
from embedding_adapter.util import create_unique_id
from generative_ai_core.network import ProxyMode

UUID_PATTERN = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
)


def test_azure_embedding_defaults_to_upload_action() -> None:
    """AzureEmbedding は検索アクションの既定が upload であること"""
    embedding = AzureEmbedding("testId", [0.1, 0.2, 0.3])
    assert embedding.id == "testId"
    assert embedding.content_vector == [0.1, 0.2, 0.3]
    assert embedding.search_action == "upload"


def test_azure_embedding_to_json_matches_java_gson() -> None:
    """to_json が移植元（Gson）と同じ JSON を返すこと"""
    embedding = AzureEmbedding("testId", [0.1, 0.2, 0.3])
    assert embedding.to_json() == (
        '{"value":[{"id":"testId","contentVector":[0.1,0.2,0.3],'
        '"@search.action":"upload"}]}'
    )


def test_azure_embedding_to_json_with_search_action() -> None:
    """検索アクションを指定した JSON になること"""
    embedding = AzureEmbedding("testId", [0.1, 0.2, 0.3], "delete")
    assert embedding.to_json() == (
        '{"value":[{"id":"testId","contentVector":[0.1,0.2,0.3],'
        '"@search.action":"delete"}]}'
    )


def test_embedding_setters_and_defaults() -> None:
    """Embedding の属性を設定でき、既定はすべて None であること"""
    embedding = Embedding()
    assert embedding.id is None and embedding.vector is None
    embedding.content = "new content"
    embedding.vector = [0.4, 0.5, 0.6]
    assert embedding.content == "new content"
    assert embedding.vector == [0.4, 0.5, 0.6]


def test_request_schema_holds_values() -> None:
    """RequestSchema がモデル・入力・次元数を持つこと"""
    schema = RequestSchema("testModel", "testInput")
    assert (schema.model, schema.input, schema.dimensions) == (
        "testModel",
        "testInput",
        None,
    )


def test_create_unique_id_is_uuid() -> None:
    """create_unique_id が UUID 形式の文字列を返し、毎回異なること"""
    first = create_unique_id()
    assert UUID_PATTERN.match(first)
    assert first != create_unique_id()


def _complete_config(
    vendor: str,
    url: str = "https://llm.example.invalid",
    api_key: str = "candidate-key",
    model_name: str = "candidate-model",
) -> GraphCandidateLlmConfig:
    """テスト用の Graph Candidate LLM 設定を作る。

    Parameters
    ----------
    vendor : str
        ベンダー名または ID。
    url : str
        URL。
    api_key : str
        API キー。
    model_name : str
        モデル名。

    Returns
    -------
    GraphCandidateLlmConfig
        設定。
    """
    config = GraphCandidateLlmConfig()
    config.vendor_name = vendor
    config.url = url
    config.api_key = api_key
    config.model_name = model_name
    return config


def test_normalize_vendor_name_maps_ids_and_names() -> None:
    """ベンダー ID と名前が正規化されること"""
    assert normalize_vendor_name("0") == "OpenAI"
    assert normalize_vendor_name("1") == "AzureOpenAI"
    assert normalize_vendor_name("5") == "SecuAiGent"
    assert normalize_vendor_name("OpenAI") == "OpenAI"
    assert normalize_vendor_name(" Anthropic ") == "Anthropic"
    assert normalize_vendor_name(" ") == " "
    assert normalize_vendor_name(None) is None


def test_complete_open_ai_config_builds_provider_properties() -> None:
    """OpenAI の設定がプロバイダのプロパティになること"""
    config = _complete_config("0")
    config.timeout_seconds = 120
    credential = config.to_embedding_provider_properties_required()
    assert credential.vendor_name == "OpenAI"
    assert credential.url == "https://llm.example.invalid"
    assert credential.api_key == "candidate-key"
    assert credential.model_name == "candidate-model"
    assert credential.timeout_seconds == 120


def test_secu_ai_gent_config_requires_tenant_id() -> None:
    """SecuAiGent は Tenant ID が必須で、あればプロパティに入ること"""
    config = _complete_config("5")
    with pytest.raises(RuntimeError, match="Tenant ID"):
        config.to_embedding_provider_properties_required()
    config.tenant_id = "tenant-fixture"
    credential = config.to_embedding_provider_properties_required()
    assert credential.vendor_name == "SecuAiGent"
    assert credential.tenant_id == "tenant-fixture"


def test_validate_provider_accepts_vendor_five_and_rejects_unsupported() -> None:
    """validate_provider が 5 を受け入れ、未対応のプロバイダを拒否すること"""
    GraphCandidateLlmConfig.validate_provider("5")
    GraphCandidateLlmConfig.validate_provider("")
    with pytest.raises(RuntimeError, match="Graph candidate LLM"):
        GraphCandidateLlmConfig.validate_provider("Anthropic")


def test_blank_required_values_fail_with_specific_message() -> None:
    """必須項目が空のとき、項目ごとのメッセージで失敗すること"""
    with pytest.raises(RuntimeError, match="Graph candidate LLM"):
        _complete_config("Anthropic").to_embedding_provider_properties_required()
    with pytest.raises(RuntimeError, match="URL"):
        _complete_config(
            "0", "", "candidate-key", "candidate-model"
        ).to_embedding_provider_properties_required()
    with pytest.raises(RuntimeError, match="API key"):
        _complete_config(
            "0", "https://llm.example.invalid", "", "candidate-model"
        ).to_embedding_provider_properties_required()
    with pytest.raises(RuntimeError, match="model name"):
        _complete_config(
            "0", "https://llm.example.invalid", "candidate-key", ""
        ).to_embedding_provider_properties_required()


def test_azure_open_ai_accepts_endpoint_only() -> None:
    """AzureOpenAI はエンドポイントだけの URL を受け入れること"""
    config = _complete_config(
        "1", "https://resource.openai.azure.com", "api-key", "candidate-deployment"
    )
    credential = config.to_embedding_provider_properties_required()
    assert credential.url == "https://resource.openai.azure.com"
    assert credential.vendor_name == "AzureOpenAI"


@pytest.mark.parametrize(
    "url",
    [
        "https://resource.openai.azure.com?api-version=2024-02-01",
        "https://resource.openai.azure.com/openai/deployments/candidate-deployment",
    ],
)
def test_azure_open_ai_rejects_deployment_path_or_api_version(url: str) -> None:
    """AzureOpenAI の URL にデプロイ名や api-version があると、秘密を出さずに失敗すること"""
    config = _complete_config("1", url, "api-key", "candidate-deployment")
    with pytest.raises(RuntimeError, match="endpoint/base URL") as error:
        config.to_embedding_provider_properties_required()
    assert "https://resource.openai.azure.com" not in str(error.value)
    assert "api-key" not in str(error.value)


def test_graph_write_result_disabled_and_success_are_not_failures() -> None:
    """DISABLED と SUCCESS は失敗扱いにならないこと"""
    assert GraphWriteResult.disabled().status == GraphWriteStatus.DISABLED
    assert not GraphWriteResult.disabled().is_failed()
    success = GraphWriteResult.success("file-1", ["chunk-1"])
    assert success.chunk_ids == ["chunk-1"]
    assert not success.is_failed()


@pytest.mark.parametrize(
    "status",
    [
        GraphWriteStatus.FAILED_CONFIGURATION,
        GraphWriteStatus.FAILED_EXTENSION_UNAVAILABLE,
        GraphWriteStatus.FAILED_WRITE,
    ],
)
def test_graph_write_result_failed_statuses_are_failures(
    status: GraphWriteStatus,
) -> None:
    """設定・拡張・書き込みの失敗が失敗扱いになること"""
    result = GraphWriteResult.failure(status, "file", ["chunk"], "msg", "CAUSE")
    assert result.is_failed()


def test_graph_write_result_failure_sanitizes_message() -> None:
    """失敗メッセージの URL・資格情報が伏せられること"""
    result = GraphWriteResult.failure(
        GraphWriteStatus.FAILED_WRITE,
        "file",
        ["chunk"],
        "connect jdbc:postgresql://db.example.test:5432/app password=secret "
        "token=abc apiKey=key",
        "WRITE_FAILED",
    )
    assert result.message == (
        "connect <redacted-jdbc-url> password=<redacted> token=<redacted> "
        "apiKey=<redacted>"
    )


def _postgres_config(**overrides: object) -> VectorDBConfig:
    """PostgreSQL(PGVector) の VectorDBConfig を作る。

    Parameters
    ----------
    **overrides : object
        上書きする属性。

    Returns
    -------
    VectorDBConfig
        設定。
    """
    config = VectorDBConfig(
        vendor_name="PostgreSQL(PGVector)",
        url="localhost",
        user_name="user",
        database_name="database",
        table_name="Manual Docs",
        is_new_creation=True,
        graph_write_enabled=True,
        graph_name="",
    )
    for name, value in overrides.items():
        setattr(config, name, value)
    return config


def test_blank_graph_name_is_derived_from_table_name() -> None:
    """グラフ名が空ならテーブル名から導出されること"""
    assert _postgres_config().get_effective_graph_name() == "manual_docs"


def test_explicit_graph_name_wins_when_valid() -> None:
    """明示されたグラフ名が優先されること"""
    config = _postgres_config(graph_name="manual_graph")
    assert config.get_effective_graph_name() == "manual_graph"


def test_blank_index_name_is_derived_for_azure_search() -> None:
    """Azure AI Search ではインデックス名がテーブル名から導出されること"""
    config = VectorDBConfig(vendor_name="Azure AI Search", table_name="Manual Docs")
    assert config.get_effective_index_name() == "manual-docs"


def test_unsafe_table_name_fails_before_runtime_operation() -> None:
    """安全でないテーブル名は unsafe-derived-name で失敗すること"""
    with pytest.raises(ValueError, match="unsafe-derived-name"):
        _postgres_config(table_name="設定資料").get_effective_graph_name()


def test_blank_table_name_fails_before_default_graph_fallback() -> None:
    """テーブル名が空なら tableName のエラーになること"""
    with pytest.raises(ValueError, match="tableName"):
        _postgres_config(table_name="").get_effective_graph_name()


def test_invalid_explicit_names_fail() -> None:
    """不正な明示名（グラフ・Azure インデックス）が失敗すること"""
    with pytest.raises(ValueError, match="unsafe-derived-name"):
        _postgres_config(
            table_name="manual_docs", graph_name="bad;graph"
        ).get_effective_graph_name()
    azure = VectorDBConfig(
        vendor_name="Azure AI Search", table_name="manual_docs", index_name="bad index"
    )
    with pytest.raises(ValueError, match="unsafe-derived-name"):
        azure.get_effective_index_name()


def test_azure_open_ai_legacy_provider_uses_azure_index_rules() -> None:
    """旧名 AzureOpenAI が Azure AI Search のインデックス規則で解決されること"""
    config = VectorDBConfig(
        vendor_name="AzureOpenAI",
        index_name="search-index-01",
        table_name="source_table",
    )
    assert config.get_effective_index_name() == "search-index-01"


def test_provider_names_and_legacy_aliases_are_accepted() -> None:
    """プロバイダ名（旧名を含む）が判定されること"""
    assert VectorDBConfig(vendor_name="Azure AI Search").is_azure_search_provider()
    assert VectorDBConfig(vendor_name="PostgreSQL(PGVector)").is_postgre_sql_provider()
    assert VectorDBConfig(vendor_name="AzureOpenAI").is_azure_search_provider()
    assert VectorDBConfig(vendor_name="PostgreSQL").is_postgre_sql_provider()
    assert VectorDBConfig(vendor_name="PGvector").is_postgre_sql_provider()
    assert not VectorDBConfig(vendor_name=None).is_postgre_sql_provider()


def test_network_properties_maps_proxy_modes_and_timeout() -> None:
    """プロキシのモードとタイムアウトが core の設定に変換されること"""
    assert EmbeddingNetworkProperties().to_setting(None).timeout_seconds == 180
    system = EmbeddingNetworkProperties(use_proxy=2).to_setting(90000)
    assert system.proxy_setting.mode == ProxyMode.SYSTEM
    assert system.timeout_seconds == 180
    manual = EmbeddingNetworkProperties(
        use_proxy=1,
        proxy_host="proxy",
        proxy_port=8080,
        use_proxy_cred=True,
        proxy_id="u",
        proxy_pass="p",
        insecure_ssl_enabled=True,
    ).to_setting(60)
    assert manual.proxy_setting.mode == ProxyMode.MANUAL
    assert manual.insecure_ssl_enabled
    assert manual.timeout_seconds == 60
