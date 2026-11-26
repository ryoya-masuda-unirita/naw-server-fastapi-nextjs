"""LLM埋め込みAPIのビジネスロジック。

移植元(Spring Boot)の`LlmEmbeddingService`に対応する。
"""

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.bedrock_embedding import (  # bedrock-ext
    BEDROCK_EMBEDDING_MODEL_ID,
    BedrockEmbeddingError,
    BedrockLlmEmbeddingClient,
)
from app.core.config import get_llm_credit_settings
from app.core.credit_quota import enforce_within_quota
from app.core.llm_client import AzureLlmEmbeddingClient
from app.core.vector_store import EMBEDDING_DIMENSIONS
from app.core.token_usage_credit import embedding_credits, positive_token_weight
from app.models.ai_model import AIModelEndpointType
from app.models.tenant_endpoint import EndpointType
from app.models.token_usage import TokenUsage
from app.models.user import User
from app.repositories.ai_model_repository import AIModelRepository
from app.repositories.tenant_endpoint_repository import TenantEndpointRepository
from app.schemas.llm import LlmEmbeddingRequest, LlmEmbeddingResponse


class LlmEmbeddingService:
    """埋め込みベクトル生成に関するビジネスロジック。"""

    @staticmethod
    async def create_embedding(
        tenant_id: str,
        current_user: User,
        req: LlmEmbeddingRequest,
        session: AsyncSession,
    ) -> LlmEmbeddingResponse:
        """入力テキストをAzure OpenAI Embeddingsモデルでベクトル化する。

        Parameters
        ----------
        tenant_id : str
            テナントID。
        current_user : User
            認証済みユーザー。
        req : LlmEmbeddingRequest
            埋め込みリクエスト。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        LlmEmbeddingResponse
            埋め込みベクトルを含むレスポンス。

        Raises
        ------
        HTTPException
            クレジット上限超過時は429、指定deployNameのAIモデルが
            存在しない・テナントに対応する埋め込みエンドポイント（Azure OpenAI
            Embedding、deployNameが`amazon.titan-embed-text-v1`のときはBedrock
            Embedding）が存在しない場合は400を返す。
        """
        await enforce_within_quota(tenant_id, session)

        if req.deployName == BEDROCK_EMBEDDING_MODEL_ID:  # bedrock-ext
            return await LlmEmbeddingService._create_bedrock_embedding(
                tenant_id, current_user, req, session
            )

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
                positive_token_weight(float(ai_model.token_weight)),
            ),
        )
        session.add(token_usage)
        await session.commit()

        return LlmEmbeddingResponse(embedding=result.embedding)

    @staticmethod
    async def _create_bedrock_embedding(
        tenant_id: str,
        current_user: User,
        req: LlmEmbeddingRequest,
        session: AsyncSession,
    ) -> LlmEmbeddingResponse:
        """入力テキストを Bedrock（Titan）でベクトル化する（`bedrock-ext`）。

        Parameters
        ----------
        tenant_id : str
            テナントID。
        current_user : User
            認証済みユーザー。
        req : LlmEmbeddingRequest
            埋め込みリクエスト（`deployName` は Titan のモデル ID）。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        LlmEmbeddingResponse
            埋め込みベクトルを含むレスポンス。

        Raises
        ------
        HTTPException
            AIモデルが未登録・テナントに Bedrock の埋め込みエンドポイントが存在しない・
            `dimensions`が1536以外・呼び出しに失敗した場合は400を返す。
        """
        if req.dimensions is not None and req.dimensions != EMBEDDING_DIMENSIONS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Bedrock の埋め込みは {EMBEDDING_DIMENSIONS} 次元だけに対応しています。",
            )
        ai_model = await AIModelRepository.find_by_endpoint_type_and_name(
            AIModelEndpointType.BEDROCK_EMBEDDING, req.deployName, session
        )
        if ai_model is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"指定された deployName の AI モデルが見つかりません: {req.deployName}",
            )
        endpoints = await TenantEndpointRepository.find_by_tenant_id_and_type(
            tenant_id, EndpointType.BEDROCK_EMBEDDING, session
        )
        if not endpoints:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="埋め込み用のテナントエンドポイントが見つかりません。",
            )
        tenant_endpoint = min(endpoints, key=lambda endpoint: endpoint.id)
        try:
            result = await BedrockLlmEmbeddingClient.create_embedding(
                tenant_endpoint.endpoint,
                tenant_endpoint.api_key,
                req.deployName,
                req.input,
            )
        except BedrockEmbeddingError as error:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)
            ) from None

        weight = positive_token_weight(float(ai_model.token_weight))
        credit_settings = get_llm_credit_settings()
        session.add(
            TokenUsage(
                tenant_id=tenant_id,
                user_id=current_user.id,
                endpoint_type=AIModelEndpointType.BEDROCK_EMBEDDING.value,
                model=req.deployName,
                embedding_tokens=result.tokens,
                embedding_credits=embedding_credits(
                    result.tokens, credit_settings.tokens_per_credit, weight
                ),
            )
        )
        await session.commit()
        return LlmEmbeddingResponse(embedding=result.embedding)
