from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.core.llm_client import EmbeddingResult
from app.models.ai_model import AIModel, AIModelEndpointType
from app.models.tenant_endpoint import EndpointType, TenantEndpoint
from app.schemas.llm import LlmEmbeddingRequest
from app.services.llm_embedding_service import LlmEmbeddingService


def _ai_model(token_weight: str = "1.0") -> AIModel:
    return AIModel(
        id=1,
        endpoint_type=AIModelEndpointType.AZURE_OPENAI_EMBEDDING,
        name="text-embedding-3-small",
        max_tokens=8191,
        token_weight=Decimal(token_weight),
    )


def _tenant_endpoint() -> TenantEndpoint:
    return TenantEndpoint(
        id="endpoint-1",
        tenant_id="tenant-1",
        type=EndpointType.AZURE_OPENAI_EMBEDDING,
        endpoint_name="azure",
        endpoint="https://example.openai.azure.com",
        api_key="api-key",
    )


class TestCreateEmbedding:
    """LlmEmbeddingService.create_embedding のテスト"""

    @patch(
        "app.services.llm_embedding_service.enforce_within_quota",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.llm_embedding_service.AIModelRepository.find_by_endpoint_type_and_name",
        new_callable=AsyncMock,
    )
    async def test_raises_400_when_ai_model_not_found(
        self, mock_find_model, mock_enforce, test_user
    ):
        """指定deployNameのAIモデルが存在しない場合400になること"""
        mock_find_model.return_value = None

        with pytest.raises(HTTPException) as exc_info:
            await LlmEmbeddingService.create_embedding(
                "tenant-1",
                test_user,
                LlmEmbeddingRequest(deployName="unknown", input="hello"),
                session=AsyncMock(),
            )

        assert exc_info.value.status_code == 400

    @patch(
        "app.services.llm_embedding_service.enforce_within_quota",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.llm_embedding_service.TenantEndpointRepository.find_by_tenant_id_and_type",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.llm_embedding_service.AIModelRepository.find_by_endpoint_type_and_name",
        new_callable=AsyncMock,
    )
    async def test_raises_400_when_no_tenant_endpoint(
        self, mock_find_model, mock_find_endpoints, mock_enforce, test_user
    ):
        """テナントにAzure OpenAI Embeddingエンドポイントが存在しない場合400になること"""
        mock_find_model.return_value = _ai_model()
        mock_find_endpoints.return_value = []

        with pytest.raises(HTTPException) as exc_info:
            await LlmEmbeddingService.create_embedding(
                "tenant-1",
                test_user,
                LlmEmbeddingRequest(deployName="text-embedding-3-small", input="hello"),
                session=AsyncMock(),
            )

        assert exc_info.value.status_code == 400

    @patch(
        "app.services.llm_embedding_service.AzureLlmEmbeddingClient.create_embedding"
    )
    @patch(
        "app.services.llm_embedding_service.enforce_within_quota",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.llm_embedding_service.TenantEndpointRepository.find_by_tenant_id_and_type",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.llm_embedding_service.AIModelRepository.find_by_endpoint_type_and_name",
        new_callable=AsyncMock,
    )
    async def test_returns_embedding_and_persists_usage(
        self,
        mock_find_model,
        mock_find_endpoints,
        mock_enforce,
        mock_create_embedding,
        test_user,
    ):
        """埋め込みベクトルを返却し、トークン使用量を永続化すること"""
        mock_find_model.return_value = _ai_model()
        mock_find_endpoints.return_value = [_tenant_endpoint()]
        mock_create_embedding.return_value = EmbeddingResult(
            embedding=[0.1, 0.2], tokens=100
        )
        session = AsyncMock()
        session.add = MagicMock()

        result = await LlmEmbeddingService.create_embedding(
            "tenant-1",
            test_user,
            LlmEmbeddingRequest(deployName="text-embedding-3-small", input="hello"),
            session=session,
        )

        assert result.embedding == [0.1, 0.2]
        session.add.assert_called_once()
        persisted = session.add.call_args[0][0]
        assert persisted.embedding_tokens == 100
        assert persisted.embedding_credits == 1  # ceil(100*1.0/1000)
        session.commit.assert_awaited_once()
