"""LLMチャットAPI(SSEストリーミング応答)のビジネスロジック。

移植元(Spring Boot)の`LlmChatService`に対応する。本Issueのスコープでは、tools
（Function Calling）・ライブラリ生成（createLibrary）・response_formatは対象外のため
扱わない（`docs/issue-88/01_要件定義.md`参照）。添付ファイル(`attachmentFiles`)は
issue-97で対応済み（`docs/issue-97/01_要件定義.md`参照）。
"""

import json
import logging
from collections.abc import AsyncIterator
from uuid import UUID

from fastapi import HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.attachment_media import build_user_content
from app.core.config import LlmCreditSettings, get_llm_credit_settings
from app.core.credit_quota import enforce_within_quota
from app.core.database import get_session_maker
from app.core.llm_client import AzureLlmChatClient, ChatMessage
from app.core.room_access import require_owned_room
from app.core.token_usage_credit import (
    input_credits,
    output_credits,
    positive_token_weight,
)
from app.models.ai_model import AIModelEndpointType
from app.models.tenant_endpoint import EndpointType
from app.models.token_usage import TokenUsage
from app.models.user import User
from app.repositories.ai_model_repository import AIModelRepository
from app.repositories.message_repository import MessageRepository
from app.repositories.tenant_endpoint_repository import TenantEndpointRepository
from app.schemas.attachment import AttachmentFile
from app.schemas.llm import LlmChatRequest

logger = logging.getLogger(__name__)


def _sse(event: str, data: dict) -> bytes:
    """SSE(Server-Sent Events)形式の1イベントを組み立てる。

    Args:
        event: イベント名。
        data: イベントデータ(JSONへ変換される)。

    Returns:
        SSE形式にエンコードされたバイト列。
    """
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n".encode()


class LlmChatService:
    @staticmethod
    async def stream_chat(
        tenant_id: str,
        current_user: User,
        req: LlmChatRequest,
        session: AsyncSession,
    ) -> StreamingResponse:
        """LLMチャットを呼び出し、応答をSSEでストリーミング返却する。

        クレジット上限チェック・AIModel/TenantEndpoint解決・messageId解決は、
        ここで注入された`session`を使い、ストリーミング開始前に行う。ストリーミング
        完了後のトークン使用量永続化は、`session`のライフサイクル
        （StreamingResponse返却後にリクエストのDIスコープが終了しうる）とは独立させる
        必要があるため、新規セッションで行う。

        Args:
            tenant_id: テナントID。
            current_user: 認証済みユーザー。
            req: チャットリクエスト。
            session: 非同期DBセッション（呼び出し前のDB検証にのみ使用する）。

        Returns:
            `text/event-stream`のストリーミングレスポンス。

        Raises:
            HTTPException: クレジット上限超過時は429、指定deployNameのAIモデルが
                存在しない・テナントにAzure OpenAI Chatエンドポイントが存在しない
                場合は400、指定messageIdがテナント内に存在しない場合は404、
                所属ルームの所有者でない場合は403を返す。
        """
        await enforce_within_quota(tenant_id, session)

        ai_model = await AIModelRepository.find_by_endpoint_type_and_name(
            AIModelEndpointType.AZURE_OPENAI_CHAT, req.deployName, session
        )
        if ai_model is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"指定された deployName の AI モデルが見つかりません: {req.deployName}",
            )

        endpoints = await TenantEndpointRepository.find_by_tenant_id_and_type(
            tenant_id, EndpointType.AZURE_OPENAI_CHAT, session
        )
        if not endpoints:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="チャット用のテナントエンドポイントが見つかりません。",
            )
        # 複数存在する場合は移植元同様にidが最小のものを採用する。
        tenant_endpoint = min(endpoints, key=lambda endpoint: endpoint.id)

        room_id: str | None = None
        message_id_for_usage: str | None = None
        if req.messageId:
            message = await MessageRepository.find_by_tenant_id_and_id(
                tenant_id, req.messageId, session
            )
            if message is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="指定された messageId のメッセージが見つかりません。",
                )
            # 移植元Java版はここでルーム所有権を検証していないが、他の
            # メッセージ関連エンドポイント（message_service.py等）と同様に
            # 所有権のないメッセージIDが指定された場合のなりすまし・情報漏えいを
            # 防ぐため、本ポートでは所有権チェックを追加する（`01_要件定義.md`参照）。
            await require_owned_room(tenant_id, current_user, message.room_id, session)
            room_id = message.room_id
            message_id_for_usage = message.id

        chat_messages = LlmChatService._apply_additional_prompt(
            [
                ChatMessage(role=turn.role, content=turn.content)
                for turn in req.messages
            ],
            req.additionalPrompt,
        )
        chat_messages = LlmChatService._apply_attachment_files(
            chat_messages, req.attachmentFiles
        )

        credit_settings = get_llm_credit_settings()
        endpoint_url = tenant_endpoint.endpoint
        api_key = tenant_endpoint.api_key
        deploy_name = req.deployName
        temperature = req.temperature
        max_tokens = req.maxTokens
        user_id = current_user.id
        model_name = ai_model.name
        token_weight = positive_token_weight(float(ai_model.token_weight))

        async def event_stream() -> AsyncIterator[bytes]:
            """Azure OpenAIの応答をSSEイベントへ変換しつつ配信する。"""
            input_tokens = 0
            output_tokens = 0
            try:
                async for chunk in AzureLlmChatClient.stream_chat(
                    endpoint_url,
                    api_key,
                    deploy_name,
                    chat_messages,
                    temperature,
                    max_tokens,
                ):
                    if chunk.text_delta is not None:
                        yield _sse("text_delta", {"text": chunk.text_delta})
                    if chunk.input_tokens is not None:
                        input_tokens = chunk.input_tokens
                    if chunk.output_tokens is not None:
                        output_tokens = chunk.output_tokens
                yield _sse(
                    "message_stop",
                    {"inputTokens": input_tokens, "outputTokens": output_tokens},
                )
            except Exception as e:
                # SSEは開始後にHTTPステータスでエラーを返せないため、専用イベントとして
                # クライアントへ通知する（例外を握り潰すのではなく、ログに残したうえで
                # クライアントへ伝わる形に変換する）。
                logger.exception("LLMチャット呼び出し中にエラーが発生しました")
                yield _sse("error", {"message": str(e)})
            finally:
                await LlmChatService._persist_token_usage(
                    tenant_id=tenant_id,
                    user_id=user_id,
                    room_id=room_id,
                    message_id=message_id_for_usage,
                    model_name=model_name,
                    token_weight=token_weight,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    credit_settings=credit_settings,
                )

        return StreamingResponse(event_stream(), media_type="text/event-stream")

    @staticmethod
    def _apply_additional_prompt(
        messages: list[ChatMessage], additional_prompt: str | None
    ) -> list[ChatMessage]:
        """末尾から見て最後の"user"ロール発話の前に追加プロンプトを前置する。

        移植元Java版`applyAdditionalPromptToLastUserTurn`に対応する。単純に配列末尾の
        発話を書き換えるのではなく、末尾から遡って最初に見つかった"user"ロールの発話
        （大文字小文字を区別しない）に適用する。該当する発話がない場合は何もしない。

        Args:
            messages: 会話履歴。
            additional_prompt: 前置きするプロンプト。未指定・空白のみなら何もしない。

        Returns:
            追加プロンプト適用後の会話履歴。
        """
        if not additional_prompt or not additional_prompt.strip():
            return messages
        for index in range(len(messages) - 1, -1, -1):
            if messages[index].role.lower() == "user":
                updated = list(messages)
                updated[index] = ChatMessage(
                    role=messages[index].role,
                    content=f"{additional_prompt}\n\n{messages[index].content}",
                )
                return updated
        return messages

    @staticmethod
    def _apply_attachment_files(
        messages: list[ChatMessage], files: list[AttachmentFile]
    ) -> list[ChatMessage]:
        """末尾から見て最後の"user"ロール発話に添付ファイルを付与する。

        移植元Java版はターンごとにファイル名で紐付けるが、本ポートでは複雑さ低減のため
        `attachmentFiles`は常に最後のユーザー発話に一括で適用する
        （`docs/issue-97/01_要件定義.md`参照）。

        Args:
            messages: 会話履歴（`_apply_additional_prompt`適用後を想定）。
            files: 添付ファイル一覧。

        Returns:
            添付ファイル適用後の会話履歴。`files`が空、またはuser発話が存在しない
            場合はそのまま返す。
        """
        if not files:
            return messages
        for index in range(len(messages) - 1, -1, -1):
            if messages[index].role.lower() == "user":
                updated = list(messages)
                content = messages[index].content
                # additionalPrompt適用直後はcontentが常にstrであることを前提とする
                # (このメソッドは_apply_additional_promptの直後にのみ呼ばれる)。
                assert isinstance(content, str)
                updated[index] = ChatMessage(
                    role=messages[index].role,
                    content=build_user_content(content, files),
                )
                return updated
        return messages

    @staticmethod
    async def _persist_token_usage(
        *,
        tenant_id: str,
        user_id: UUID,
        room_id: str | None,
        message_id: str | None,
        model_name: str,
        token_weight: float,
        input_tokens: int,
        output_tokens: int,
        credit_settings: LlmCreditSettings,
    ) -> None:
        """チャット呼び出しのトークン使用量を新規セッションで永続化する。

        ストリーミングを配信する非同期ジェネレータは、エンドポイント関数に注入された
        `AsyncSession`のライフサイクル外で実行されうるため、独立した新規セッションで
        コミットする。

        Args:
            tenant_id: テナントID。
            user_id: 呼び出したユーザーのID。
            room_id: 紐づくルームID(messageId未指定時はNone)。
            message_id: 紐づくメッセージID(messageId未指定時はNone)。
            model_name: 呼び出したAIモデル名。
            token_weight: 呼び出したAIモデルの重み係数。
            input_tokens: 入力トークン数。
            output_tokens: 出力トークン数。
            credit_settings: クレジット換算設定。
        """
        if input_tokens <= 0 and output_tokens <= 0:
            return

        token_usage = TokenUsage(
            tenant_id=tenant_id,
            user_id=user_id,
            room_id=room_id,
            message_id=message_id,
            endpoint_type=AIModelEndpointType.AZURE_OPENAI_CHAT.value,
            model=model_name,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            input_credits=input_credits(
                input_tokens,
                credit_settings.tokens_per_credit,
                credit_settings.input_credit_weight,
                token_weight,
            ),
            output_credits=output_credits(
                output_tokens, credit_settings.tokens_per_credit, token_weight
            ),
        )
        session_maker = get_session_maker()
        async with session_maker() as new_session:
            new_session.add(token_usage)
            await new_session.commit()
