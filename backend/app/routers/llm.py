from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import get_current_user, get_verified_tenant_id
from app.models.user import User
from app.schemas.llm import (
    LlmChatRequest,
    LlmEmbeddingRequest,
    LlmEmbeddingResponse,
    parse_llm_chat_form,
)
from app.services.llm_chat_service import LlmChatService
from app.services.llm_embedding_service import LlmEmbeddingService

router = APIRouter(prefix="/api/llm", tags=["llm"])


@router.post("/chat")
async def chat(
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(get_current_user),
    # FastAPIは依存を宣言順に評価するため、添付ファイルの読み込み・検証が
    # 未認証のリクエストで走らないよう、認証の依存より後に置く。
    req: LlmChatRequest = Depends(parse_llm_chat_form),
    session: AsyncSession = Depends(get_session),
) -> StreamingResponse:
    """LLMチャット(SSEストリーミング応答)"""
    return await LlmChatService.stream_chat(x_tenant_id, current_user, req, session)


@router.post("/embedding", response_model=LlmEmbeddingResponse)
async def embedding(
    req: LlmEmbeddingRequest,
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> LlmEmbeddingResponse:
    """LLM埋め込み"""
    return await LlmEmbeddingService.create_embedding(
        x_tenant_id, current_user, req, session
    )
