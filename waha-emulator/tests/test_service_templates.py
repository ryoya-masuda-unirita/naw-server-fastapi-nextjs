"""サービス ID の接尾辞で保存先を切り替える「ひな形」の、設定 → レジストリ → API の通しのテスト。"""

from typing import Any

from embedding_adapter.constants import PropertyIds as EmbeddingPropertyIds
from retrieval_adapter.constants import RetrievalPropertyIds

from tests.conftest import API, running_emulator, start_session
from waha_emulator.main import build_registry
from waha_emulator.workflow_config import (
    ECHO_PROPERTIES,
    RAG_OUTPUT_TYPE,
    parse_workflow_config,
)
from waha_emulator.workflows.embedding import EmbeddingWorkflow
from waha_emulator.workflows.generative_ai import GenerativeAiWorkflow

PROVIDER = {
    "VENDOR": "Bedrock",
    "URL": "https://bedrock-runtime.example.invalid",
    "API_KEY": "bedrock-key",
    "MODEL_NAME": "amazon.titan-embed-text-v1",
}
VDB = {
    "VDB_VENDOR": "PostgreSQL(PGVector)",
    "VDB_URL": "db.invalid:5432",
    "VDB_USER_NAME": "user",
    "VDB_PASSWORD": "password",
    "VDB_DATABASE_NAME": "appdb",
    "VDB_TABLE_NAME": "docs_{name}",
}


def _config() -> dict[str, Any]:
    """学習・取得・削除・質問の 4 つのひな形を書いた設定を作る。

    Returns
    -------
    dict[str, Any]
        ワークフローの設定。
    """
    services: dict[str, Any] = {
        f"kb-{operation}-*": {
            "adapter": "embedding",
            "operation": operation,
            "properties": {**PROVIDER, **VDB, "TENANT_ID": "tenant"},
        }
        for operation in ("learn", "sync", "delete")
    }
    services["bedrock-rag-*"] = {
        "outputType": RAG_OUTPUT_TYPE,
        "properties": ECHO_PROPERTIES,
        "retrieval": {"properties": {**PROVIDER, **VDB}},
    }
    return {"default": {"properties": ECHO_PROPERTIES}, "services": services}


def test_four_services_with_same_suffix_point_to_same_table() -> None:
    """学習・取得・削除・質問に同じ接尾辞を付けると、同じ保存先を指すこと"""
    registry = build_registry(parse_workflow_config(_config(), {}))

    tables = []
    for service_id in ("kb-learn-hr", "kb-sync-hr", "kb-delete-hr"):
        workflow = registry.resolve(service_id, {})
        assert isinstance(workflow, EmbeddingWorkflow)
        tables.append(
            workflow.definition.properties[EmbeddingPropertyIds.VDB_TABLE_NAME]
        )
    rag = registry.resolve("bedrock-rag-hr", {})
    assert isinstance(rag, GenerativeAiWorkflow)
    assert rag.definition.retrieval is not None
    tables.append(
        rag.definition.retrieval.properties[RetrievalPropertyIds.VDB_TABLE_NAME]
    )

    assert tables == ["docs_hr"] * 4


def test_folders_with_different_suffixes_use_different_tables() -> None:
    """接尾辞が違うフォルダは、学習も質問も別の保存先を使い、混ざらないこと"""
    registry = build_registry(parse_workflow_config(_config(), {}))

    learn_hr = registry.resolve("kb-learn-hr", {})
    learn_expense = registry.resolve("kb-learn-expense", {})
    rag_hr = registry.resolve("bedrock-rag-hr", {})
    rag_expense = registry.resolve("bedrock-rag-expense", {})

    assert isinstance(learn_hr, EmbeddingWorkflow)
    assert isinstance(learn_expense, EmbeddingWorkflow)
    assert isinstance(rag_hr, GenerativeAiWorkflow)
    assert isinstance(rag_expense, GenerativeAiWorkflow)
    table = EmbeddingPropertyIds.VDB_TABLE_NAME
    assert learn_hr.definition.properties[table] == "docs_hr"
    assert learn_expense.definition.properties[table] == "docs_expense"
    assert rag_hr.definition.retrieval is not None
    assert rag_expense.definition.retrieval is not None
    rag_table = RetrievalPropertyIds.VDB_TABLE_NAME
    assert rag_hr.definition.retrieval.properties[rag_table] == "docs_hr"
    assert rag_expense.definition.retrieval.properties[rag_table] == "docs_expense"


async def test_execute_with_invalid_suffix_returns_400() -> None:
    """接尾辞が不正なサービス ID の execute は、400 で拒否されること"""
    registry = build_registry(parse_workflow_config(_config(), {}))
    async with running_emulator(registry=registry) as (_, client):
        session_id = await start_session(client)

        response = await client.get(
            f"{API}/execute/kb-learn-HR;drop", params={"sessionid": session_id}
        )

    assert response.status_code == 400
    assert "接尾辞" in response.text
