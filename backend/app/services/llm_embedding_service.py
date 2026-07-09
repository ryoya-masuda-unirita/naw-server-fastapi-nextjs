"""LLM埋め込みAPIのビジネスロジック。

移植元(Spring Boot)の`LlmEmbeddingService`に対応する。
"""

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_llm_credit_settings
from app.core.credit_quota import enforce_within_quota
from app.core.llm_client import AzureLlmEmbeddingClient
from app.core.token_usage_credit import embedding_credits
from app.models.ai_model import AIModelEndpointType
from app.models.tenant_endpoint import EndpointType
from app.models.token_usage import TokenUsage
from app.models.user import User
from app.repositories.ai_model_repository import AIModelRepository
from app.repositories.tenant_endpoint_repository import TenantEndpointRepository
from app.schemas.llm import LlmEmbeddingRequest, LlmEmbeddingResponse


class LlmEmbeddingService:
    @staticmethod
    async def create_embedding(
        tenant_id: str,
        current_user: User,
        req: LlmEmbeddingRequest,
        session: AsyncSession,
    ) -> LlmEmbeddingResponse:
        """入力テキストをAzure OpenAI Embeddingsモデルでベクトル化する。

        Args:
            tenant_id: テナントID。
            current_user: 認証済みユーザー。
            req: 埋め込みリクエスト。
            session: 非同期DBセッション。

        Returns:
            埋め込みベクトルを含むレスポンス。

        Raises:
            HTTPException: クレジット上限超過時は429、指定deployNameのAIモデルが
                存在しない・テナントにAzure OpenAI Embeddingエンドポイントが
                存在しない場合は400を返す。
        """
        await enforce_within_quota(tenant_id, session)

        ai_model = await AIModelRepository.find_by_endpoint_type_and_name(
            AIModelEndpointType.AZURE_OPENAI_EMBEDDING, req.deployName, session
        )
        if ai_model is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"指定された deployName の AI モデルが見つかりません: {req.deployName}",
            )

        endpoints = await TenantEndpointRepository.find_by_tenant_id_and_type(
            tenant_id, EndpointType.AZURE_OPENAI_EMBEDDING, session
        )
        if not endpoints:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="埋め込み用のテナントエンドポイントが見つかりません。",
            )
        # 複数存在する場合は移植元同様にidが最小のものを採用する。
        tenant_endpoint = min(endpoints, key=lambda endpoint: endpoint.id)

        result = await AzureLlmEmbeddingClient.create_embedding(
            tenant_endpoint.endpoint,
            tenant_endpoint.api_key,
            req.deployName,
            req.input,
            req.dimensions,
        )

        credit_settings = get_llm_credit_settings()
        token_usage = TokenUsage(
            tenant_id=tenant_id,
            user_id=current_user.id,
            endpoint_type=AIModelEndpointType.AZURE_OPENAI_EMBEDDING.value,
            model=ai_model.name,
            embedding_tokens=result.tokens,
            embedding_credits=embedding_credits(
                result.tokens,
                credit_settings.tokens_per_credit,
                float(ai_model.token_weight),
            ),
        )
        session.add(token_usage)
        await session.commit()

        return LlmEmbeddingResponse(embedding=result.embedding)
