"""クラウドの RAG の検索で、pgvector と Azure AI Search を使い分けるテスト（`pgvector-ext`）。"""

from unittest.mock import AsyncMock, MagicMock, patch

from app.core.llm_client import EmbeddingResult
from app.core.vector_store import VectorSearchResult
from app.models.tenant_endpoint import EndpointType, TenantEndpoint
from app.services.message_service import MessageService
from tests.unit.test_embedding_selection_bedrock import (
    MS,
    _clients,
    _rag_patches,
)
from tests.unit.test_message_service import _embedding_endpoint, _rag_assistant


def _vdb(endpoint: str) -> TenantEndpoint:
    """テスト用のベクトル DB の接続先を作る。

    Parameters
    ----------
    endpoint : str
        接続先の URL。

    Returns
    -------
    TenantEndpoint
        種別が VDB の接続先。
    """
    return TenantEndpoint(
        id="vdb-1",
        tenant_id="tenant-1",
        type=EndpointType.VDB,
        endpoint_name="vdb",
        endpoint=endpoint,
        api_key="vdb-password",
    )


async def _run(vdb: TenantEndpoint) -> tuple[AsyncMock, AsyncMock, str]:
    """RAG のコンテキストを作り、pgvector と Azure Search のどちらが呼ばれたかを返す。

    Parameters
    ----------
    vdb : TenantEndpoint
        テナントのベクトル DB の接続先。

    Returns
    -------
    tuple[AsyncMock, AsyncMock, str]
        pgvector の検索、Azure の検索の代わり、と、作られたコンテキスト。
    """
    azure, bedrock, find_model = _clients()
    azure.return_value = EmbeddingResult(embedding=[0.1], tokens=1)
    pg_search = AsyncMock(
        return_value=[VectorSearchResult(content="資料", file_unique_id="f1")]
    )
    with (
        _rag_patches([_embedding_endpoint()], azure, bedrock, find_model),
        patch(
            f"{MS}.TenantEndpointRepository.find_by_tenant_id_and_type",
            new_callable=AsyncMock,
            return_value=[vdb],
        ),
        patch(f"{MS}.PgVectorStoreClient.similarity_search", pg_search),
    ):
        azure_search = MagicMock()
        context, *_ = await MessageService._build_rag_context(
            "tenant-1", _rag_assistant(), "質問", MagicMock()
        )
    return pg_search, azure_search, context


class TestVectorStoreSelection:
    """MessageService._build_rag_context の検索の使い分けのテスト"""

    async def test_rag_uses_pgvector_for_postgresql_vdb(self) -> None:
        """VDB の接続先が PostgreSQL なら、pgvector で検索されること"""
        pg_search, _, _ = await _run(_vdb("postgresql://vector@vector-db:5432/vector"))

        pg_search.assert_awaited_once()
        assert pg_search.await_args is not None
        args = pg_search.await_args.args
        assert args[:3] == (
            "postgresql://vector@vector-db:5432/vector",
            "vdb-password",
            "tenant-1",
        )

    async def test_rag_uses_azure_search_for_https_vdb(self) -> None:
        """VDB の接続先が https なら、従来どおり Azure AI Search で検索されること"""
        pg_search, _, _ = await _run(_vdb("https://example-search.search.windows.net"))

        pg_search.assert_not_awaited()
