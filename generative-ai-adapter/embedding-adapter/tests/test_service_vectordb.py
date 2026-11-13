"""service.vectordb の単体テスト。

移植元 embedding-adapter/src/test の service/vectordb/GraphNameValidatorTest・
GraphWriteErrorSanitizerTest・AzureAISearchServiceTest と、
service/VectorDBSelectorServiceTest を移したもの。
"""

from pathlib import Path
from unittest.mock import MagicMock

import pytest
from embedding_adapter.domain import (
    Embedding,
    EmbeddingNetworkProperties,
    VectorDBConfig,
)
from embedding_adapter.model import (
    AbstractEmbeddingModel,
    GraphWritableVectorStoreService,
)
from embedding_adapter.service.core.graph_vector_store import (
    CoreDelegatingGraphVectorStoreService,
)
from embedding_adapter.service.core.vector_store import CoreDelegatingVectorStoreService
from embedding_adapter.service.vector_db_selector import VectorDBSelectorService
from embedding_adapter.service.vectordb.azure_ai_search import AzureAISearchService
from embedding_adapter.service.vectordb.graph_name_validator import GraphNameValidator
from embedding_adapter.service.vectordb.graph_write_error_sanitizer import (
    GraphWriteErrorSanitizer,
)

VECTOR = [0.1, 0.2, 0.3]


class StaticEmbeddingModel(AbstractEmbeddingModel):
    """固定のベクトルを返す埋め込みモデル。"""

    def create_embedding(self, text: str | None) -> list[float]:
        """固定のベクトルを返す。

        Parameters
        ----------
        text : str | None
            使わない。

        Returns
        -------
        list[float]
            固定のベクトル。
        """
        return list(VECTOR)


def azure_config() -> VectorDBConfig:
    """Azure AI Search の設定を作る。

    Returns
    -------
    VectorDBConfig
        設定。
    """
    return VectorDBConfig(
        "Azure AI Search",
        "https://search.example",
        "key",
        "index",
        "",
        "",
        "",
        "vector_store",
        False,
    )


def test_graph_name_validator_accepts_safe_names() -> None:
    """安全な graph 名を受け付けること"""
    assert GraphNameValidator.is_valid("embedding_graph")
    assert GraphNameValidator.is_valid("_graph1")
    assert GraphNameValidator.validate("Graph_123") == "Graph_123"


def test_graph_name_validator_rejects_empty_and_null() -> None:
    """空と None の graph 名を拒否すること"""
    assert not GraphNameValidator.is_valid("")
    assert not GraphNameValidator.is_valid(None)
    with pytest.raises(ValueError):
        GraphNameValidator.validate("")


@pytest.mark.parametrize("name", ["graph-name", "1graph", "graph;drop", "graph name"])
def test_graph_name_validator_rejects_dangerous_characters(name: str) -> None:
    """危険な文字を含む graph 名を拒否すること"""
    assert not GraphNameValidator.is_valid(name)


def test_graph_name_validator_rejects_long_values() -> None:
    """64 文字以上の graph 名を拒否すること"""
    assert not GraphNameValidator.is_valid("a" * 64)


def test_sanitizer_removes_jdbc_urls_and_credentials() -> None:
    """JDBC URL と資格情報らしい値を伏せること"""
    sanitized = GraphWriteErrorSanitizer.sanitize(
        "failed jdbc:postgresql://db.example.test:5432/app user=admin "
        "password=secret token=abc"
    )

    assert sanitized == (
        "failed <redacted-jdbc-url> user=<redacted> password=<redacted> token=<redacted>"
    )


def test_sanitizer_removes_http_urls_and_api_keys() -> None:
    """HTTP URL と API キーを伏せること"""
    sanitized = GraphWriteErrorSanitizer.sanitize(
        "POST https://service.example.test/path apiKey=secret-key proxyPass=secret"
    )

    assert sanitized == "POST <redacted-url> apiKey=<redacted> proxyPass=<redacted>"


def test_sanitizer_handles_null_and_exceptions() -> None:
    """None は空文字、例外はメッセージを伏せること"""
    assert GraphWriteErrorSanitizer.sanitize(None) == ""
    assert (
        GraphWriteErrorSanitizer.sanitize(RuntimeError("token=abc"))
        == "token=<redacted>"
    )


def build_azure_service() -> tuple[AzureAISearchService, MagicMock]:
    """コントローラーを偽物にした AzureAISearchService を作る。

    Returns
    -------
    tuple[AzureAISearchService, MagicMock]
        サービスと偽のコントローラー。
    """
    controller = MagicMock()
    service = AzureAISearchService(
        azure_config(),
        EmbeddingNetworkProperties(),
        StaticEmbeddingModel(),
        controller,
    )
    return service, controller


def test_azure_service_add_generates_id_and_imports_embedding() -> None:
    """add が ID を採番して埋め込みを保存すること"""
    service, controller = build_azure_service()
    embedding = Embedding(None, "testContent", None, None)

    row_id = service.add(embedding)

    assert row_id
    controller.import_embedding.assert_called_once_with(embedding, row_id)
    assert embedding.vector == VECTOR


def test_azure_service_delete_delegates_to_controller() -> None:
    """delete がコントローラーの削除を呼ぶこと"""
    service, controller = build_azure_service()

    service.delete("testId")

    controller.delete_embedding.assert_called_once_with("testId")


def test_azure_service_update_reimports_with_same_id() -> None:
    """update が同じ ID で保存し直すこと"""
    service, controller = build_azure_service()

    service.update(Embedding("testId", "testContent", VECTOR, None))

    assert controller.import_embedding.call_args.args[1] == "testId"


def test_azure_service_search_embeds_query_and_delegates() -> None:
    """search がクエリを埋め込んでコントローラーに検索させること"""
    service, controller = build_azure_service()
    controller.find_related.return_value = [Embedding("hit", None, VECTOR, None)]

    results = service.search("testQuery", 5)

    assert [e.vector for e in results] == [VECTOR]
    sent, top_k = controller.find_related.call_args.args
    assert sent.vector == VECTOR
    assert top_k == 5


def test_azure_service_does_not_expose_graph_capability() -> None:
    """Azure のサービスは Graph 書き込みの能力を持たないこと"""
    service, _ = build_azure_service()

    assert not isinstance(service, GraphWritableVectorStoreService)


def test_selector_azure_returns_delegating_store_without_graph() -> None:
    """Azure AI Search には Graph 書き込みなしの委譲ストアを返すこと"""
    result = VectorDBSelectorService().create_model(
        EmbeddingNetworkProperties(), StaticEmbeddingModel(), azure_config()
    )

    assert isinstance(result, CoreDelegatingVectorStoreService)
    assert not isinstance(result, GraphWritableVectorStoreService)


def test_selector_default_returns_graph_store() -> None:
    """Azure 以外には Graph 対応の委譲ストアを返すこと"""
    config = VectorDBConfig(vendor_name="OtherVendor")

    result = VectorDBSelectorService().create_model(
        EmbeddingNetworkProperties(), StaticEmbeddingModel(), config
    )

    assert isinstance(result, CoreDelegatingGraphVectorStoreService)
    assert isinstance(result, CoreDelegatingVectorStoreService)
    assert isinstance(result, GraphWritableVectorStoreService)


def test_selector_accepts_reject_audit_output_dir(tmp_path: Path) -> None:
    """拒否の監査の出力先を渡せること"""
    config = VectorDBConfig(vendor_name="OtherVendor")

    result = VectorDBSelectorService.create_vector_db_model(
        EmbeddingNetworkProperties(),
        StaticEmbeddingModel(),
        config,
        None,
        str(tmp_path),
    )

    assert isinstance(result, CoreDelegatingGraphVectorStoreService)


def test_selector_static_overloads_create_graph_store(tmp_path: Path) -> None:
    """PostgreSQL の設定で static な作成メソッドが Graph 対応ストアを返すこと"""
    config = VectorDBConfig(
        "PostgreSQL(PGVector)",
        "localhost",
        "",
        "",
        "user",
        "password",
        "database",
        "vector_store",
        False,
        True,
        "embedding_graph",
    )

    default_service = VectorDBSelectorService.create_vector_db_model(
        EmbeddingNetworkProperties(), StaticEmbeddingModel(), config
    )
    audit_service = VectorDBSelectorService.create_vector_db_model(
        EmbeddingNetworkProperties(),
        StaticEmbeddingModel(),
        config,
        None,
        str(tmp_path),
    )

    assert isinstance(default_service, CoreDelegatingGraphVectorStoreService)
    assert isinstance(audit_service, CoreDelegatingGraphVectorStoreService)


def test_selector_blank_reject_audit_dir_uses_disabled_config() -> None:
    """空白の監査出力先は無効の設定として扱うこと"""
    result = VectorDBSelectorService().create_model(
        EmbeddingNetworkProperties(),
        StaticEmbeddingModel(),
        azure_config(),
        None,
        "   ",
    )

    assert isinstance(result, CoreDelegatingVectorStoreService)
