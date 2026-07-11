from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import get_current_user, get_verified_tenant_id
from app.models.user import User
from app.schemas.message import (
    GetMessagesResponse,
    MessageContentCreateRequest,
    MessageContentListRequest,
    MessageContentResponse,
    MessageCreateRequest,
    MessageCreateResponse,
    MessageFeedbackCreateRequest,
    MessageFeedbackResponse,
)
from app.services.message_service import MessageService

router = APIRouter(prefix="/api/messages", tags=["messages"])


@router.post("", response_model=MessageCreateResponse)
async def create_message(
    req: MessageCreateRequest,
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> MessageCreateResponse:
    """メッセージ（質問スレッド）作成"""
    return await MessageService.create_message(x_tenant_id, current_user, req, session)


@router.get("", response_model=GetMessagesResponse)
async def get_messages(
    roomId: str = Query(...),
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> GetMessagesResponse:
    """メッセージ一覧取得"""
    return await MessageService.get_messages_and_assistants(
        x_tenant_id, current_user, roomId, session
    )


@router.post("/contents", response_model=list[MessageContentResponse])
async def get_message_contents(
    req: MessageContentListRequest,
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[MessageContentResponse]:
    """メッセージ内容一覧取得"""
    return await MessageService.get_message_contents(
        x_tenant_id, current_user, req.messageIds, session
    )


@router.post("/content")
async def create_message_content(
    req: MessageContentCreateRequest,
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> StreamingResponse:
    """メッセージ送信（アシスタント応答生成・SSEストリーミング）"""
    return await MessageService.stream_message_content(
        x_tenant_id, current_user, req, session
    )


@router.delete("/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_message(
    message_id: str,
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    """メッセージ削除"""
    await MessageService.delete_message(x_tenant_id, current_user, message_id, session)


@router.delete("/content/{message_content_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_message_by_content_id(
    message_content_id: str,
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    """メッセージ内容ID指定でのメッセージ削除"""
    await MessageService.delete_message_by_content_id(
        x_tenant_id, current_user, message_content_id, session
    )


@router.post("/{message_id}/feedback", response_model=MessageFeedbackResponse)
async def feedback_message(
    message_id: str,
    req: MessageFeedbackCreateRequest,
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> MessageFeedbackResponse:
    """メッセージフィードバック登録・更新"""
    return await MessageService.feedback_message(
        x_tenant_id, current_user, message_id, req, session
    )
