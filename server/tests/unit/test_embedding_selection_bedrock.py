"""クラウドの RAG と埋め込み API で、Azure と Bedrock の埋め込みを使い分けるテスト（`bedrock-ext`）。"""

from collections.abc import Iterator
from contextlib import ExitStack, contextmanager
from decimal import Decimal
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.core.bedrock_embedding import (
    BEDROCK_EMBEDDING_MODEL_ID,
    BedrockEmbeddingError,
)
from app.core.llm_client import EmbeddingResult
from app.core.vector_store import VectorSearchResult
from app.models.ai_model import AIModel, AIModelEndpointType
from app.models.tenant_endpoint import EndpointType, TenantEndpoint
from app.models.token_usage import TokenUsage
from app.models.user import User
from app.schemas.llm import LlmEmbeddingRequest
from app.services.llm_embedding_service import LlmEmbeddingService
from app.services.message_service import (
    EMBEDDING_MODEL_NAME,
    MessageService,
)
from tests.unit.test_message_service import (
    _embedding_endpoint,
    _file,
    _index,
    _rag_assistant,
    _vdb_endpoint,
)

MS = "app.services.message_service"
BEDROCK_ENDPOINT = "https://bedrock-runtime.ap-northeast-1.amazonaws.com"


def _bedrock_endpoint(endpoint_id: str = "bedrock-embed-1") -> TenantEndpoint:
    """テスト用の Bedrock の埋め込みの接続先を作る。

    Parameters
    ----------
    endpoint_id : str
        エンドポイントの ID。

    Returns
    -------
    TenantEndpoint
        種別が BEDROCK_EMBEDDING の接続先。
    """
    return TenantEndpoint(
        id=endpoint_id,
        tenant_id="tenant-1",
        type=EndpointType.BEDROCK_EMBEDDING,
        endpoint_name="bedrock-embedding",
        endpoint=BEDROCK_ENDPOINT,
        api_key="bedrock-api-key",
    )


def _ai_model(endpoint_type: AIModelEndpointType, name: str, weight: str) -> AIModel:
    """テスト用の埋め込みの AI モデルを作る。

    Parameters
    ----------
    endpoint_type : AIModelEndpointType
        モデルの接続先の種別。
    name : str
        モデル名。
    weight : str
        トークンの重み。

    Returns
    -------
    AIModel
        テスト用のモデル。
    """
    return AIModel(
        id=1,
        endpoint_type=endpoint_type,
        name=name,
        max_tokens=8191,
        token_weight=Decimal(weight),
    )


@contextmanager
def _rag_patches(
    endpoints: list[TenantEndpoint],
    azure: AsyncMock,
    bedrock: AsyncMock,
    find_model: AsyncMock,
) -> Iterator[None]:
    """RAG のコンテキストを作る処理の、DB・外部通信をすべて差し替える。

    Parameters
    ----------
    endpoints : list[TenantEndpoint]
        学習先フォルダに結びついた埋め込みの接続先。
    azure : AsyncMock
        Azure の埋め込みクライアントの代わり。
    bedrock : AsyncMock
        Bedrock の埋め込みクライアントの代わり。
    find_model : AsyncMock
        AI モデルの取得の代わり。

    Yields
    ------
    Iterator[None]
        差し替えが有効な間の制御を呼び出し元へ渡す。
    """
    with ExitStack() as stack:
        stack.enter_context(
            patch(
                f"{MS}.IndexRepository.find_by_id_and_tenant_id",
                new_callable=AsyncMock,
                return_value=_index(),
            )
        )
        stack.enter_context(
            patch(
                f"{MS}.IndexRepository.find_tenant_endpoints_grouped_by_index_ids",
                new_callable=AsyncMock,
                return_value={"index-1": endpoints},
            )
        )
        stack.enter_context(
            patch(
                f"{MS}.TenantEndpointRepository.find_by_tenant_id_and_type",
                new_callable=AsyncMock,
                return_value=[_vdb_endpoint()],
            )
        )
        stack.enter_context(
            patch(
                f"{MS}.AzureAiSearchVectorStoreClient.similarity_search",
                new_callable=AsyncMock,
                return_value=[VectorSearchResult(content="資料1", file_unique_id="f1")],
            )
        )
        stack.enter_context(
            patch(
                f"{MS}.FileRepository.find_not_deleted_by_ids_and_tenant_id",
                new_callable=AsyncMock,
                return_value=[_file("f1", reference="ref1.pdf")],
            )
        )
        stack.enter_context(
            patch(f"{MS}.AIModelRepository.find_by_endpoint_type_and_name", find_model)
        )
        stack.enter_context(
            patch(f"{MS}.AzureLlmEmbeddingClient.create_embedding", azure)
        )
        stack.enter_context(
            patch(f"{MS}.BedrockLlmEmbeddingClient.create_embedding", bedrock)
        )
        yield


def _clients() -> tuple[AsyncMock, AsyncMock, AsyncMock]:
    """Azure・Bedrock のクライアントと、AI モデルの取得の代わりを作る。

    Returns
    -------
    tuple[AsyncMock, AsyncMock, AsyncMock]
        Azure のクライアント、Bedrock のクライアント、AI モデルの取得。
    """
    azure = AsyncMock(return_value=EmbeddingResult(embedding=[0.1], tokens=5))
    bedrock = AsyncMock(return_value=EmbeddingResult(embedding=[0.2], tokens=9))

    async def find_model(
        endpoint_type: AIModelEndpointType, name: str, session: Any
    ) -> AIModel | None:
        """種別ごとに、重みの違うモデルを返す。"""
        if endpoint_type == AIModelEndpointType.BEDROCK_EMBEDDING:
            return _ai_model(endpoint_type, name, "3.0")
        return _ai_model(endpoint_type, name, "2.0")

    return azure, bedrock, AsyncMock(side_effect=find_model)


class TestBuildRagContextEmbeddingSelection:
    """MessageService._build_rag_context の埋め込みの使い分けのテスト"""

    async def test_rag_uses_bedrock_embedding_for_bedrock_endpoint(self) -> None:
        """フォルダの埋め込みの接続先が Bedrock なら、Bedrock のクライアントが呼ばれること"""
        azure, bedrock, find_model = _clients()

        with _rag_patches([_bedrock_endpoint()], azure, bedrock, find_model):
            (
                context,
                references,
                tokens,
                weight,
            ) = await MessageService._build_rag_context(
                "tenant-1", _rag_assistant(), "質問", MagicMock()
            )

        azure.assert_not_awaited()
        bedrock.assert_awaited_once_with(
            BEDROCK_ENDPOINT, "bedrock-api-key", BEDROCK_EMBEDDING_MODEL_ID, "質問"
        )
        assert (context, references, tokens, weight) == (
            "資料1",
            ["ref1.pdf"],
            9,
            3.0,
        )

    async def test_rag_uses_azure_embedding_for_azure_endpoint(self) -> None:
        """フォルダの埋め込みの接続先が Azure なら、従来どおり Azure のクライアントが呼ばれること"""
        azure, bedrock, find_model = _clients()

        with _rag_patches([_embedding_endpoint()], azure, bedrock, find_model):
            _, _, tokens, weight = await MessageService._build_rag_context(
                "tenant-1", _rag_assistant(), "質問", MagicMock()
            )

        bedrock.assert_not_awaited()
        assert azure.await_args is not None
        assert azure.await_args.args[2] == EMBEDDING_MODEL_NAME
        assert (tokens, weight) == (5, 2.0)

    async def test_rag_picks_smallest_id_among_both_types(self) -> None:
        """両方の種別が結びついているとき、id が最小のものが使われること"""
        azure, bedrock, find_model = _clients()
        endpoints = [_embedding_endpoint("z-azure"), _bedrock_endpoint("a-bedrock")]

        with _rag_patches(endpoints, azure, bedrock, find_model):
            await MessageService._build_rag_context(
                "tenant-1", _rag_assistant(), "質問", MagicMock()
            )

        bedrock.assert_awaited_once()
        azure.assert_not_awaited()

    async def test_rag_returns_400_when_bedrock_embedding_fails(self) -> None:
        """Bedrock の埋め込みが失敗したとき、400 になること"""
        azure, bedrock, find_model = _clients()
        bedrock.side_effect = BedrockEmbeddingError("失敗")

        with _rag_patches([_bedrock_endpoint()], azure, bedrock, find_model):
            with pytest.raises(HTTPException) as raised:
                await MessageService._build_rag_context(
                    "tenant-1", _rag_assistant(), "質問", MagicMock()
                )

        assert raised.value.status_code == 400
        assert raised.value.detail == "Failed to create embedding for RAG search"


def _session() -> MagicMock:
    """`add` と `commit` を持つ、DB セッションの代わりを作る。

    Returns
    -------
    MagicMock
        セッションの代わり。
    """
    session = MagicMock()
    session.commit = AsyncMock()
    return session


@contextmanager
def _embedding_api_patches(
    azure: AsyncMock,
    bedrock: AsyncMock,
    bedrock_endpoints: list[TenantEndpoint],
    has_bedrock_model: bool = True,
) -> Iterator[None]:
    """埋め込み API の、DB・外部通信を差し替える。

    Parameters
    ----------
    azure : AsyncMock
        Azure の埋め込みクライアントの代わり。
    bedrock : AsyncMock
        Bedrock の埋め込みクライアントの代わり。
    bedrock_endpoints : list[TenantEndpoint]
        テナントの Bedrock の埋め込みの接続先。
    has_bedrock_model : bool
        Bedrock の埋め込みモデルが ai_models に登録されているか。

    Yields
    ------
    Iterator[None]
        差し替えが有効な間の制御を呼び出し元へ渡す。
    """

    async def find_endpoints(
        tenant_id: str, endpoint_type: EndpointType, session: Any
    ) -> list[TenantEndpoint]:
        """種別ごとの接続先を返す。"""
        if endpoint_type == EndpointType.BEDROCK_EMBEDDING:
            return bedrock_endpoints
        return [_embedding_endpoint()]

    async def find_model(
        endpoint_type: AIModelEndpointType, name: str, session: Any
    ) -> AIModel | None:
        """種別ごとに、登録されたモデルを返す（Bedrock のモデルがないテナントも作れる）。"""
        if endpoint_type == AIModelEndpointType.BEDROCK_EMBEDDING:
            return _ai_model(endpoint_type, name, "3.0") if has_bedrock_model else None
        return _ai_model(endpoint_type, name, "1.0")

    with ExitStack() as stack:
        stack.enter_context(
            patch(
                "app.services.llm_embedding_service.enforce_within_quota",
                new_callable=AsyncMock,
            )
        )
        stack.enter_context(
            patch(
                "app.services.llm_embedding_service.TenantEndpointRepository.find_by_tenant_id_and_type",
                side_effect=find_endpoints,
            )
        )
        stack.enter_context(
            patch(
                "app.services.llm_embedding_service.AIModelRepository.find_by_endpoint_type_and_name",
                side_effect=find_model,
            )
        )
        stack.enter_context(
            patch(
                "app.services.llm_embedding_service.AzureLlmEmbeddingClient.create_embedding",
                azure,
            )
        )
        stack.enter_context(
            patch(
                "app.services.llm_embedding_service.BedrockLlmEmbeddingClient.create_embedding",
                bedrock,
            )
        )
        yield


class TestLlmEmbeddingServiceBedrock:
    """LlmEmbeddingService.create_embedding の Bedrock の使い分けのテスト"""

    async def test_titan_deploy_name_uses_bedrock_client(self, test_user: User) -> None:
        """deployName が Titan のモデル ID なら、Bedrock のクライアントが呼ばれ、使用量が記録されること"""
        azure, bedrock, _ = _clients()
        session = _session()

        with _embedding_api_patches(azure, bedrock, [_bedrock_endpoint()]):
            response = await LlmEmbeddingService.create_embedding(
                "tenant-1",
                test_user,
                LlmEmbeddingRequest(
                    input="こんにちは", deployName=BEDROCK_EMBEDDING_MODEL_ID
                ),
                session,
            )

        azure.assert_not_awaited()
        bedrock.assert_awaited_once_with(
            BEDROCK_ENDPOINT,
            "bedrock-api-key",
            BEDROCK_EMBEDDING_MODEL_ID,
            "こんにちは",
        )
        assert response.embedding == [0.2]
        [usage] = [call.args[0] for call in session.add.call_args_list]
        assert isinstance(usage, TokenUsage)
        assert usage.endpoint_type == AIModelEndpointType.BEDROCK_EMBEDDING.value
        assert usage.model == BEDROCK_EMBEDDING_MODEL_ID
        assert usage.embedding_tokens == 9
        session.commit.assert_awaited_once()

    async def test_other_deploy_name_uses_azure_client(self, test_user: User) -> None:
        """それ以外の deployName は、従来どおり Azure のクライアントが呼ばれること"""
        azure, bedrock, _ = _clients()

        with _embedding_api_patches(azure, bedrock, [_bedrock_endpoint()]):
            response = await LlmEmbeddingService.create_embedding(
                "tenant-1",
                test_user,
                LlmEmbeddingRequest(input="こんにちは", deployName="text-embedding-3"),
                _session(),
            )

        bedrock.assert_not_awaited()
        azure.assert_awaited_once()
        assert response.embedding == [0.1]

    async def test_titan_without_endpoint_returns_400(self, test_user: User) -> None:
        """Bedrock の埋め込みの接続先がないテナントは、400 になること"""
        azure, bedrock, _ = _clients()

        with _embedding_api_patches(azure, bedrock, []):
            with pytest.raises(HTTPException) as raised:
                await LlmEmbeddingService.create_embedding(
                    "tenant-1",
                    test_user,
                    LlmEmbeddingRequest(
                        input="x", deployName=BEDROCK_EMBEDDING_MODEL_ID
                    ),
                    _session(),
                )

        assert raised.value.status_code == 400
        bedrock.assert_not_awaited()

    async def test_titan_failure_returns_400_without_usage(
        self, test_user: User
    ) -> None:
        """Bedrock の呼び出しが失敗したとき、400 になり、使用量は記録されないこと"""
        azure, bedrock, _ = _clients()
        bedrock.side_effect = BedrockEmbeddingError("失敗")
        session = _session()

        with _embedding_api_patches(azure, bedrock, [_bedrock_endpoint()]):
            with pytest.raises(HTTPException) as raised:
                await LlmEmbeddingService.create_embedding(
                    "tenant-1",
                    test_user,
                    LlmEmbeddingRequest(
                        input="x", deployName=BEDROCK_EMBEDDING_MODEL_ID
                    ),
                    session,
                )

        assert raised.value.status_code == 400
        session.add.assert_not_called()

    async def test_titan_without_registered_model_returns_400(
        self, test_user: User
    ) -> None:
        """Titan のモデルが ai_models に未登録なら、Azure と同じく 400 になり、呼び出さないこと"""
        azure, bedrock, _ = _clients()

        with _embedding_api_patches(
            azure, bedrock, [_bedrock_endpoint()], has_bedrock_model=False
        ):
            with pytest.raises(HTTPException) as raised:
                await LlmEmbeddingService.create_embedding(
                    "tenant-1",
                    test_user,
                    LlmEmbeddingRequest(
                        input="x", deployName=BEDROCK_EMBEDDING_MODEL_ID
                    ),
                    _session(),
                )

        assert raised.value.status_code == 400
        bedrock.assert_not_awaited()

    async def test_titan_rejects_other_dimensions(self, test_user: User) -> None:
        """dimensions に 1536 以外を指定すると、400 になり、呼び出さないこと"""
        azure, bedrock, _ = _clients()

        with _embedding_api_patches(azure, bedrock, [_bedrock_endpoint()]):
            with pytest.raises(HTTPException) as raised:
                await LlmEmbeddingService.create_embedding(
                    "tenant-1",
                    test_user,
                    LlmEmbeddingRequest(
                        input="x",
                        deployName=BEDROCK_EMBEDDING_MODEL_ID,
                        dimensions=256,
                    ),
                    _session(),
                )

        assert raised.value.status_code == 400
        bedrock.assert_not_awaited()

    async def test_titan_accepts_1536_dimensions(self, test_user: User) -> None:
        """dimensions に 1536 を指定した場合は、受け付けられること"""
        azure, bedrock, _ = _clients()

        with _embedding_api_patches(azure, bedrock, [_bedrock_endpoint()]):
            response = await LlmEmbeddingService.create_embedding(
                "tenant-1",
                test_user,
                LlmEmbeddingRequest(
                    input="x", deployName=BEDROCK_EMBEDDING_MODEL_ID, dimensions=1536
                ),
                _session(),
            )

        assert response.embedding == [0.2]
