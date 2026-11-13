"""service.core のマッパーの単体テスト。

移植元 embedding-adapter/src/test の service/core/AdapterCoreGraphMapperTest・
AdapterCoreVectorDbMapperTest・IngestionCoreMapperTest・
JdbcBackedIngestionPersistenceAdapterTest を移したもの。
"""

from typing import Any

import pytest
from embedding_adapter.domain import (
    Embedding,
    EmbeddingNetworkProperties,
    GraphChunkWriteRequest,
    GraphWriteStatus,
    VectorDBConfig,
)
from embedding_adapter.service.core.graph_mapper import AdapterCoreGraphMapper
from embedding_adapter.service.core.ingestion_core_mapper import IngestionCoreMapper
from embedding_adapter.service.core.jdbc_persistence import (
    JdbcBackedIngestionPersistenceAdapter,
    split_endpoint,
)
from embedding_adapter.service.core.vectordb_mapper import AdapterCoreVectorDbMapper
from generative_ai_core.graphrag.ingestion import (
    IngestionOperation,
    JdbcIngestionPersistenceAdapter,
)
from generative_ai_core.network import ProxyMode
from generative_ai_core.vector import CoreGraphWriteResult, CoreGraphWriteStatus


def postgresql_config(graph_enabled: bool, graph_name: str) -> VectorDBConfig:
    """PostgreSQL の設定を作る。

    Parameters
    ----------
    graph_enabled : bool
        Graph 書き込みを有効にするか。
    graph_name : str
        graph 名。

    Returns
    -------
    VectorDBConfig
        設定。
    """
    return VectorDBConfig(
        vendor_name="PostgreSQL",
        url="localhost",
        user_name="user",
        password="pass",
        database_name="db",
        table_name="vector_store",
        graph_write_enabled=graph_enabled,
        graph_name=graph_name,
    )


def test_graph_write_setting_disabled_and_default_graph_name() -> None:
    """Graph 書き込みが無効なら disabled になること"""
    mapper = AdapterCoreGraphMapper()

    assert not mapper.graph_write_setting(postgresql_config(False, "")).enabled
    assert not mapper.graph_write_setting(None).enabled


def test_graph_write_setting_enabled_uses_graph_name_and_chunk_payload() -> None:
    """Graph 書き込みが有効なら graph 名とチャンクの内容を渡すこと"""
    mapper = AdapterCoreGraphMapper()
    request = GraphChunkWriteRequest(
        "file", "/tmp/file.txt", "chunk", 2, "content", "prev"
    )

    setting = mapper.graph_write_setting(postgresql_config(True, "custom_graph"))

    assert setting.enabled
    assert setting.graph_name == "custom_graph"
    assert mapper.graph_chunk_payload(request).vector_row_id == "chunk"
    assert mapper.graph_chunk_payload(request).previous_vector_row_id == "prev"
    assert not mapper.graph_chunk_payload(None).has_chunk()


def test_graph_write_result_failure_does_not_reintroduce_secrets() -> None:
    """core の失敗を変換しても秘密情報が戻らないこと"""
    core_result = CoreGraphWriteResult.failure(
        CoreGraphWriteStatus.FAILED_WRITE,
        "file",
        ["chunk"],
        "Bearer secret-token at jdbc:postgresql://internal.example/db",
        "GRAPH_WRITE_FAILURE",
    )

    result = AdapterCoreGraphMapper().graph_write_result(core_result)

    assert result.status == GraphWriteStatus.FAILED_WRITE
    assert "secret-token" not in (result.message or "")
    assert "internal.example" not in (result.message or "")


def test_graph_write_result_maps_disabled_configuration_and_extension() -> None:
    """無効・設定不正・拡張なしの状態を対応づけること"""
    mapper = AdapterCoreGraphMapper()
    assert mapper.graph_write_result(None).status == GraphWriteStatus.DISABLED
    assert (
        mapper.graph_write_result(CoreGraphWriteResult.disabled()).status
        == GraphWriteStatus.DISABLED
    )

    configuration = mapper.graph_write_result(
        CoreGraphWriteResult.failure(
            CoreGraphWriteStatus.FAILED_CONFIGURATION,
            "file",
            ["chunk"],
            "bad graph setting",
            "GRAPH_CONFIGURATION_FAILURE",
        )
    )
    extension = mapper.graph_write_result(
        CoreGraphWriteResult.failure(
            CoreGraphWriteStatus.FAILED_EXTENSION_UNAVAILABLE,
            "file",
            ["chunk"],
            "AGE unavailable",
            "GRAPH_AGE_UNAVAILABLE",
        )
    )

    assert configuration.status == GraphWriteStatus.FAILED_CONFIGURATION
    assert extension.status == GraphWriteStatus.FAILED_EXTENSION_UNAVAILABLE


def test_graph_write_result_maps_success() -> None:
    """成功の状態と ID を引き継ぐこと"""
    result = AdapterCoreGraphMapper().graph_write_result(
        CoreGraphWriteResult.success("file", ["chunk"])
    )

    assert result.status == GraphWriteStatus.SUCCESS
    assert result.chunk_ids == ["chunk"]


def test_vectordb_mapper_azure_target_and_provider() -> None:
    """Azure AI Search の接続先とプロバイダ ID を作ること"""
    config = VectorDBConfig(
        "Azure AI Search", "https://search.example", "key", "index", "", "", "",
        "vector_store", False,
    )  # fmt: skip
    mapper = AdapterCoreVectorDbMapper()

    assert mapper.provider_id(config) == "AzureAISearch"
    assert mapper.target(config).required_index_name() == "index"


def test_vectordb_mapper_postgresql_target_and_provider() -> None:
    """PostgreSQL の接続先とプロバイダ ID を作ること"""
    config = VectorDBConfig(
        "PostgreSQL(PGVector)", "localhost", "", "", "user", "pass", "db",
        "vector_store", False,
    )  # fmt: skip
    mapper = AdapterCoreVectorDbMapper()

    assert mapper.provider_id(config) == "PostgreSQL"
    assert mapper.target(config).required_table_name() == "vector_store"
    assert mapper.target(config).initialize_schema is False


def test_vectordb_mapper_new_creation_flag_initializes_schema() -> None:
    """新規作成のフラグがスキーマ初期化になること"""
    config = VectorDBConfig(
        "PostgreSQL", "localhost", "", "", "user", "pass", "db", "vector_store", True
    )

    assert AdapterCoreVectorDbMapper().target(config).initialize_schema is True


def test_vectordb_mapper_aliases_and_unknown_provider() -> None:
    """旧名のエイリアスと未知のベンダーを対応づけること"""
    mapper = AdapterCoreVectorDbMapper()

    assert (
        mapper.provider_id(VectorDBConfig(vendor_name="AzureOpenAI")) == "AzureAISearch"
    )
    assert mapper.provider_id(VectorDBConfig(vendor_name="PGvector")) == "PostgreSQL"
    assert mapper.provider_id(VectorDBConfig(vendor_name="PostgreSQL")) == "PostgreSQL"
    assert mapper.provider_id(VectorDBConfig(vendor_name="Pinecone")) == "Pinecone"


def test_vectordb_mapper_manual_proxy_and_payload() -> None:
    """認証つき手動プロキシと保存内容を変換すること"""
    proxy = EmbeddingNetworkProperties(
        use_proxy=1,
        proxy_host="proxy.example",
        proxy_port=8080,
        use_proxy_cred=True,
        proxy_id="user",
        proxy_pass="pass",
    )
    embedding = Embedding("id", "content", [0.1], "file", "C:\\data\\manual.json")
    mapper = AdapterCoreVectorDbMapper()

    assert mapper.network_setting(proxy).proxy_setting.credentials_configured
    assert mapper.payload(embedding).file_unique_id == "file"
    assert mapper.payload(embedding).source_file_path == "C:\\data\\manual.json"


def test_vectordb_mapper_system_none_and_manual_without_credentials() -> None:
    """プロキシなし・システム・認証なし手動を変換すること"""
    mapper = AdapterCoreVectorDbMapper()
    manual = EmbeddingNetworkProperties(
        use_proxy=1, proxy_host="proxy.example", proxy_port=8080, use_proxy_cred=False
    )

    assert (
        mapper.network_setting(
            EmbeddingNetworkProperties(use_proxy=0)
        ).proxy_setting.mode
        == ProxyMode.NONE
    )
    assert (
        mapper.network_setting(
            EmbeddingNetworkProperties(use_proxy=2)
        ).proxy_setting.mode
        == ProxyMode.SYSTEM
    )
    assert not mapper.network_setting(manual).proxy_setting.credentials_configured
    assert mapper.network_setting(None).proxy_setting.mode == ProxyMode.NONE


def test_ingestion_mapper_save_request_is_tenant_wide() -> None:
    """保存の取り込み要求がテナント全体公開の ACL になること"""
    embedding = Embedding(
        "row-1",
        "DOC-2026-0001 POLICY-S03-001 TICKET-1001",
        [0.1, 0.2],
        "file/path/policy.txt",
    )

    request = IngestionCoreMapper().save_request(embedding)

    assert request.operation == IngestionOperation.SAVE
    assert request.tenant_id == "tenant-default"
    assert request.source_ref == "file/path/policy.txt"
    assert request.acl_mode == "tenant_wide"
    assert list(request.acl_principals or []) == []
    assert request.classification_rank == 1


def test_ingestion_mapper_update_request_falls_back_to_row_id() -> None:
    """更新の取り込み要求はファイル ID がなければ行 ID を参照元にすること"""
    request = IngestionCoreMapper().update_request(
        Embedding("row-1", "DOC-2026-0001", [0.1], None)
    )

    assert request.operation == IngestionOperation.UPDATE
    assert request.source_ref == "row-1"


def test_ingestion_mapper_blank_file_reference_uses_trimmed_row_id() -> None:
    """ファイル ID が空白なら trim した行 ID を参照元にすること"""
    request = IngestionCoreMapper().save_request(
        Embedding(" row-2 ", "DOC-2026-0002", [0.1], " ")
    )

    assert request.source_ref == "row-2"


def test_ingestion_mapper_fails_closed_without_source_or_body() -> None:
    """参照元や本文がなければ要求を作らず失敗すること"""
    mapper = IngestionCoreMapper()

    with pytest.raises(ValueError, match="embedding"):
        mapper.save_request(None)
    with pytest.raises(ValueError, match="source reference"):
        mapper.save_request(Embedding(None, "body", [0.1], None))
    with pytest.raises(ValueError, match="body"):
        mapper.save_request(Embedding("row-1", "", [0.1], None))


def jdbc_config(url: str, database_name: str | None) -> VectorDBConfig:
    """JDBC 保存先のテスト用設定を作る。

    Parameters
    ----------
    url : str
        URL。
    database_name : str | None
        データベース名。

    Returns
    -------
    VectorDBConfig
        設定。
    """
    return VectorDBConfig(url=url, database_name=database_name)


def test_jdbc_url_accepts_existing_jdbc_url() -> None:
    """JDBC 形式の URL はそのまま使うこと"""
    adapter = JdbcBackedIngestionPersistenceAdapter(
        jdbc_config("jdbc:postgresql://localhost:15432/waha", "")
    )

    assert adapter.jdbc_url() == "jdbc:postgresql://localhost:15432/waha"


def test_jdbc_url_is_built_from_host_and_database() -> None:
    """ホスト形式の URL にデータベース名をつなげること"""
    adapter = JdbcBackedIngestionPersistenceAdapter(
        jdbc_config("localhost:15432", "waha")
    )

    assert adapter.jdbc_url() == "jdbc:postgresql://localhost:15432/waha"


@pytest.mark.parametrize("database", [" ", None])
def test_jdbc_url_rejects_missing_database(database: str | None) -> None:
    """ホスト形式でデータベース名がなければ失敗すること"""
    adapter = JdbcBackedIngestionPersistenceAdapter(
        jdbc_config("localhost:15432", database)
    )

    with pytest.raises(RuntimeError, match="databaseName is required"):
        adapter.jdbc_url()


def test_split_endpoint_parses_host_port_and_database() -> None:
    """JDBC URL とホスト形式を host・port・database に分けること"""
    assert split_endpoint("jdbc:postgresql://db.local:15432/waha?ssl=true") == (
        "db.local", 15432, "waha",
    )  # fmt: skip
    assert split_endpoint("db.local/waha") == ("db.local", None, "waha")
    assert split_endpoint("db.local") == ("db.local", None, None)


def core_adapter_graph_name(adapter: Any) -> str:
    """core の保存先に渡された graph 名を取り出す。

    Parameters
    ----------
    adapter : Any
        core の JDBC 保存先。

    Returns
    -------
    str
        graph 名。
    """
    assert isinstance(adapter, JdbcIngestionPersistenceAdapter)
    return str(adapter._graph_name)


def test_core_adapter_receives_configured_graph_name() -> None:
    """設定した graph 名を core の保存先に渡すこと"""
    config = jdbc_config("jdbc:postgresql://localhost:15432/waha", "")
    config.table_name = "business_docs"
    config.graph_name = "business_graph_s08"

    adapter = JdbcBackedIngestionPersistenceAdapter(config).core_adapter(None)

    assert core_adapter_graph_name(adapter) == "business_graph_s08"


def test_core_adapter_defaults_graph_name_from_table_name() -> None:
    """graph 名が空白ならテーブル名から導いた名前を渡すこと"""
    config = jdbc_config("jdbc:postgresql://localhost:15432/waha", "")
    config.graph_name = " "
    config.table_name = "business docs"

    adapter = JdbcBackedIngestionPersistenceAdapter(config).core_adapter(None)

    assert core_adapter_graph_name(adapter) == "business_docs"


def test_core_adapter_rejects_unsafe_graph_name() -> None:
    """不正な graph 名は core との境界で失敗すること"""
    config = jdbc_config("jdbc:postgresql://localhost:15432/waha", "")
    config.table_name = "business_docs"
    config.graph_name = "bad;graph"

    with pytest.raises(ValueError, match="unsafe-derived-name"):
        JdbcBackedIngestionPersistenceAdapter(config).core_adapter(None)
