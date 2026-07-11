import json
import logging
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.attachment_media import build_user_content
from app.core.config import LlmCreditSettings, get_llm_credit_settings
from app.core.credit_quota import enforce_within_quota
from app.core.database import get_session_maker
from app.core.library_stream_router import (
    DEFAULT_LIBRARY_TITLE,
    LIBRARY_USER_INSTRUCTION_PREFIX,
    LibraryStreamRouter,
)
from app.core.llm_client import AzureLlmChatClient, AzureLlmEmbeddingClient, ChatMessage
from app.core.llm_client import ToolConfig as CoreToolConfig
from app.core.room_access import require_owned_room
from app.core.token_usage_credit import (
    embedding_credits as calc_embedding_credits,
    input_credits,
    output_credits,
    positive_token_weight,
)
from app.core.vector_store import AzureAiSearchVectorStoreClient, DEFAULT_TOP_K
from app.models.ai_model import AIModelEndpointType
from app.models.assistant import Assistant, AssistantType
from app.models.library import Library
from app.models.message import (
    Message,
    MessageContent,
    MessageContentStatus,
    MessageFeedback,
    MessageFile,
)
from app.models.room import Room
from app.models.tenant_endpoint import EndpointType
from app.models.token_usage import TokenUsage
from app.models.user import User
from app.repositories.ai_model_repository import AIModelRepository
from app.repositories.assistant_endpoint_repository import AssistantEndpointRepository
from app.repositories.assistant_repository import AssistantRepository
from app.repositories.file_repository import FileRepository
from app.repositories.index_repository import IndexRepository
from app.repositories.library_repository import LibraryRepository
from app.repositories.message_content_repository import MessageContentRepository
from app.repositories.message_feedback_repository import MessageFeedbackRepository
from app.repositories.message_repository import MessageRepository
from app.repositories.room_repository import RoomRepository
from app.repositories.system_prompt_template_repository import (
    SystemPromptTemplateRepository,
)
from app.repositories.tenant_endpoint_repository import TenantEndpointRepository
from app.schemas.attachment import AttachmentFile
from app.schemas.message import (
    AssistantResponse,
    EndpointResponse,
    GetMessagesResponse,
    MessageContentAttachmentFileResponse,
    MessageContentCreateRequest,
    MessageContentResponse,
    MessageCreateRequest,
    MessageCreateResponse,
    MessageFeedbackCreateRequest,
    MessageFeedbackResponse,
    MessageItemResponse,
    ToolConfig,
)
from app.schemas.response_format import ResponseFormatRequest

logger = logging.getLogger(__name__)

# 移植元Java版`MessageService.EMBEDDING_MODEL_NAME`に対応する。RAG検索用の埋め込みは
# テナントエンドポイントのモデル設定を参照せず、この固定デプロイ名を使う。
EMBEDDING_MODEL_NAME = "text-embedding-ada-002"

# SAAS_RAGのチャット応答クレジット計算に使うtoken_weight。移植元`buildRagContext`が
# 返す`StreamMessageContentContext.tokenWeight`は、SAAS_CHATと異なりAIモデルの
# token_weightを使わず固定値1.0のため、その挙動をそのまま踏襲する。
RAG_CHAT_TOKEN_WEIGHT = 1.0

# responseFormat指定時にメッセージ列の先頭へ前置する固定指示文。`llm_chat_service.py`の
# 同名定数と同一値だが、「serviceが別serviceを呼ばない」規約により複製している。
_JSON_RESPONSE_INSTRUCTION = "回答は JSON 形式で出力してください。"

# ライブラリ生成用固定システムプロンプトの種別キー(system_prompt_templates.type)。
_LIBRARY_PROMPT_TYPE = "LIBRARY"

# タイトルの最大長。移植元`LibraryEntity`のカラム定義(255文字)に合わせて切り詰める。
_LIBRARY_TITLE_MAX_LENGTH = 255


def _sse(event: str, data: dict) -> bytes:
    """SSE(Server-Sent Events)形式の1イベントを組み立てる。

    `llm_chat_service.py`の同名関数と実装が重複するが、「serviceが別serviceを呼ばない」
    規約により`LlmChatService`側の実装をインポートできないため、小さな純粋関数として
    このファイル内に複製する。

    Args:
        event: イベント名。
        data: イベントデータ(JSONへ変換される)。

    Returns:
        SSE形式にエンコードされたバイト列。
    """
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n".encode()


def _apply_additional_prompt(
    messages: list[ChatMessage], additional_prompt: str | None
) -> list[ChatMessage]:
    """末尾から見て最後の"user"ロール発話の前に追加プロンプトを前置する。

    移植元Java版`applyAdditionalPromptToLastUserTurn`に対応する。`llm_chat_service.py`の
    `LlmChatService._apply_additional_prompt`と同一ロジックだが、「serviceが別serviceを
    呼ばない」規約により複製している。

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


def _build_llm_response_format(
    response_format: ResponseFormatRequest | None,
) -> dict | None:
    """responseFormat指定をAzure OpenAI呼び出し用のresponse_format辞書へ変換する。

    `llm_chat_service.py`の同名関数と同一ロジックだが、「serviceが別serviceを呼ばない」
    規約により複製している。移植元同様、typeの値(json_object/json_schema)によらず
    常にJSONモード(`{"type": "json_object"}`)として扱う（`docs/issue-100/01_要件定義.md`
    参照）。

    Args:
        response_format: リクエストのresponseFormat指定。

    Returns:
        Azure OpenAI呼び出し用のresponse_format辞書。未指定の場合はNone。
    """
    if response_format is None:
        return None
    return {"type": "json_object"}


def _prepend_json_response_instruction(
    messages: list[ChatMessage], response_format: ResponseFormatRequest | None
) -> list[ChatMessage]:
    """responseFormat指定時、JSON出力を促すsystemメッセージを先頭に追加する。

    `llm_chat_service.py`の同名関数と同一ロジックだが、「serviceが別serviceを呼ばない」
    規約により複製している。

    Args:
        messages: 会話履歴。
        response_format: リクエストのresponseFormat指定。未指定なら何もしない。

    Returns:
        指示文を前置した会話履歴。
    """
    if response_format is None:
        return messages
    return [ChatMessage(role="system", content=_JSON_RESPONSE_INSTRUCTION), *messages]


def _apply_library_instruction_to_last_user_turn(
    messages: list[ChatMessage],
) -> list[ChatMessage]:
    """ライブラリ生成時のみ、末尾から見て最後の"user"ロール発話の先頭に固定の指示を前置する。

    移植元Java版`applyLibraryInstructionToLastUserTurn`に対応する。`llm_chat_service.py`の
    `LlmChatService._apply_library_instruction_to_last_user_turn`と同一ロジックだが、
    「serviceが別serviceを呼ばない」規約により複製している。`_apply_additional_prompt`で
    結合済みの発話にさらに被せる想定のため、必ずその後に呼ぶこと。

    Args:
        messages: 会話履歴。

    Returns:
        指示前置後の会話履歴。該当する"user"ロール発話がない場合はそのまま返す。
    """
    for index in range(len(messages) - 1, -1, -1):
        if messages[index].role.lower() == "user":
            updated = list(messages)
            updated[index] = ChatMessage(
                role=messages[index].role,
                content=f"{LIBRARY_USER_INSTRUCTION_PREFIX}{messages[index].content}",
            )
            return updated
    return messages


def _apply_attachment_files(
    messages: list[ChatMessage], files: list[AttachmentFile]
) -> list[ChatMessage]:
    """末尾から見て最後の"user"ロール発話に添付ファイルを付与する。

    `llm_chat_service.LlmChatService._apply_attachment_files`と同等のロジックだが、
    「serviceが別serviceを呼ばない」規約により複製している。移植元Java版はターンごとに
    ファイル名で紐付けるが、本ポートでは複雑さ低減のため`attachmentFiles`は常に最後の
    ユーザー発話（今回のユーザー入力）に一括で適用する（`docs/issue-97/01_要件定義.md`参照）。

    Args:
        messages: 会話履歴（`_apply_additional_prompt`適用後を想定）。
        files: 添付ファイル一覧。

    Returns:
        添付ファイル適用後の会話履歴。`files`が空、またはuser発話が存在しない場合は
        そのまま返す。
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


def _downgrade_system_turns_to_user(messages: list[ChatMessage]) -> list[ChatMessage]:
    """ライブラリ生成時、クライアント由来の"system"ロール発話を"user"へ降格する。

    移植元Java版`CreateMessageContentViewModel.getChatHistoryMessages`のcreateLibrary分岐に
    対応する。`llm_chat_service.py`の`LlmChatService._downgrade_system_turns_to_user`と
    同一ロジックだが、「serviceが別serviceを呼ばない」規約により複製している。

    Args:
        messages: 会話履歴。

    Returns:
        system発話をuserへ降格した会話履歴。
    """
    return [
        ChatMessage(role="user", content=message.content)
        if message.role.lower() == "system"
        else message
        for message in messages
    ]


def _serialize_tools(tools: list[ToolConfig] | None) -> str | None:
    """toolsをJSON文字列に変換する。

    authorization/headersは秘密情報のため含めない（ToolConfig側でexclude指定済み）。

    Args:
        tools: チャット送信時に指定されたツール設定一覧。

    Returns:
        JSON文字列。toolsが空またはNoneの場合はNone。
    """
    if not tools:
        return None
    return json.dumps([tool.model_dump(exclude_none=True) for tool in tools])


def _deserialize_tools(tools_json: str | None) -> list[ToolConfig] | None:
    """toolsのJSON文字列をToolConfigのリストへ変換する。

    Args:
        tools_json: `_serialize_tools`で保存したJSON文字列。

    Returns:
        ToolConfigのリスト。tools_jsonが空またはNoneの場合はNone。
    """
    if not tools_json:
        return None
    return [ToolConfig(**item) for item in json.loads(tools_json)]


def _to_core_tool_configs(
    tools: list[ToolConfig] | None,
) -> list[CoreToolConfig] | None:
    """リクエストスキーマの`ToolConfig`をLLM呼び出しクライアント用の`ToolConfig`へ変換する。

    `llm_chat_service.py`の同名関数と実装が重複するが、「serviceが別serviceを呼ばない」
    規約により`LlmChatService`側の実装をインポートできないため、小さな純粋関数として
    このファイル内に複製する。

    Args:
        tools: リクエストで指定されたツール設定一覧。

    Returns:
        LLM呼び出しクライアント用のツール設定一覧。`tools`が空またはNoneの場合はNone。
    """
    if not tools:
        return None
    return [
        CoreToolConfig(
            name=tool.name,
            server_label=tool.server_label,
            server_url=tool.server_url,
            require_approval=tool.require_approval,
            authorization=tool.authorization,
            headers=tool.headers,
            allowed_tools=tool.allowed_tools,
        )
        for tool in tools
    ]


def _split_reference_paths(file_paths: str | None) -> list[str]:
    """参照ファイルパスのカンマ区切り文字列をリストへ変換する。

    Args:
        file_paths: カンマ区切りの参照ファイルパス文字列。

    Returns:
        参照ファイルパスのリスト。file_pathsが空またはNoneの場合は空リスト。
    """
    if not file_paths:
        return []
    return [path.strip() for path in file_paths.split(",")]


class MessageService:
    @staticmethod
    async def _resolve_room(
        tenant_id: str,
        current_user: User,
        req: MessageCreateRequest,
        session: AsyncSession,
    ) -> Room:
        """roomId未指定なら新規ルームを作成し、指定時は所有ルームを解決する。

        Args:
            tenant_id: テナントID。
            current_user: 認証済みユーザー。
            req: メッセージ作成リクエスト。
            session: 非同期DBセッション。

        Returns:
            紐づくルーム。

        Raises:
            HTTPException: roomId指定時、ルームが存在しない場合は404、所有者でない場合は403。
        """
        if req.roomId is None:
            room = Room(
                tenant_id=tenant_id,
                name=(req.messageText or "")[:255] or None,
                default_assistant_id=req.assistantId,
                user_id=current_user.id,
            )
            session.add(room)
            # 後続のMessage挿入がroom_idの複合外部キーを参照できるよう、ここで確定させる。
            await session.flush()
            return room

        return await require_owned_room(tenant_id, current_user, req.roomId, session)

    @staticmethod
    async def create_message(
        tenant_id: str,
        current_user: User,
        req: MessageCreateRequest,
        session: AsyncSession,
    ) -> MessageCreateResponse:
        """メッセージ（質問スレッド）を作成する。roomId未指定なら新規ルームも作成する。

        Args:
            tenant_id: テナントID。
            current_user: 認証済みユーザー。
            req: メッセージ作成リクエスト。
            session: 非同期DBセッション。

        Returns:
            作成したメッセージのID。

        Raises:
            HTTPException: アシスタントIDが不正な場合は400、roomId指定時にルームが
                存在しない場合は404、所有者でない場合は403。
        """
        assistant = await AssistantRepository.find_by_id_and_tenant_id(
            req.assistantId, tenant_id, session
        )
        if assistant is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid assistant id"
            )

        room = await MessageService._resolve_room(tenant_id, current_user, req, session)

        parent_id = None
        if req.parentMessageId:
            parent_exists = await MessageRepository.exists_by_tenant_id_and_id(
                tenant_id, req.parentMessageId, session
            )
            parent_id = req.parentMessageId if parent_exists else None

        message = Message(
            tenant_id=tenant_id,
            room_id=room.id,
            assistant_id=req.assistantId,
            parent_id=parent_id,
            tools=_serialize_tools(req.tools),
            prompt_template_content=req.promptTemplateContent,
            is_create_library=bool(req.isCreateLibrary),
        )
        session.add(message)

        room.updated_at = datetime.now(timezone.utc)
        session.add(room)

        await session.commit()
        await session.refresh(message)
        return MessageCreateResponse(id=message.id)

    @staticmethod
    async def get_messages_and_assistants(
        tenant_id: str, current_user: User, room_id: str, session: AsyncSession
    ) -> GetMessagesResponse:
        """指定ルームのメッセージ一覧と、参照アシスタント一覧を取得する。

        Args:
            tenant_id: テナントID。
            current_user: 認証済みユーザー。
            room_id: 対象ルームID。
            session: 非同期DBセッション。

        Returns:
            メッセージ一覧と参照アシスタント一覧。

        Raises:
            HTTPException: ルームが存在しない場合は404、所有者でない場合は403。
        """
        await require_owned_room(tenant_id, current_user, room_id, session)

        rows = await MessageRepository.find_by_tenant_id_and_room_id_with_feedback(
            tenant_id, room_id, session
        )

        assistant_ids = sorted({m.assistant_id for m, _ in rows if m.assistant_id})
        assistants = await AssistantRepository.find_by_ids_and_tenant_id(
            assistant_ids, tenant_id, session
        )
        endpoints_map = await AssistantEndpointRepository.find_tenant_endpoints_grouped_by_assistant_id(
            assistant_ids, tenant_id, session
        )

        assistant_responses = [
            AssistantResponse(
                id=assistant.id,
                type=assistant.type.value,
                endpoints=[
                    EndpointResponse(
                        type=tenant_endpoint.type.value,
                        destination=tenant_endpoint.endpoint,
                        apiKey=(
                            tenant_endpoint.api_key
                            if assistant.type == AssistantType.SECURE
                            and tenant_endpoint.type == EndpointType.LOCAL_SERVER
                            else ""
                        ),
                    )
                    for tenant_endpoint in endpoints_map.get(assistant.id, [])
                ],
            )
            for assistant in assistants
        ]

        message_responses = [
            MessageItemResponse(
                id=message.id,
                roomId=message.room_id,
                assistantId=message.assistant_id,
                parentId=message.parent_id,
                isRated=feedback is not None,
                tools=_deserialize_tools(message.tools),
                promptTemplateContent=message.prompt_template_content,
                isCreateLibrary=message.is_create_library,
                rating=feedback.rating if feedback else None,
            )
            for message, feedback in rows
        ]

        return GetMessagesResponse(
            assistants=assistant_responses, messages=message_responses
        )

    @staticmethod
    async def get_message_contents(
        tenant_id: str,
        current_user: User,
        message_ids: list[str],
        session: AsyncSession,
    ) -> list[MessageContentResponse]:
        """メッセージID群に対応するメッセージ内容一覧を取得する。

        Args:
            tenant_id: テナントID。
            current_user: 認証済みユーザー。
            message_ids: 取得対象のメッセージID一覧。
            session: 非同期DBセッション。

        Returns:
            メッセージ内容一覧。該当するメッセージ内容が存在しない場合は空リスト。

        Raises:
            HTTPException: 対象メッセージが属するルームが存在しない場合は404、
                所有者でない場合は403。
        """
        contents = await MessageContentRepository.find_by_message_id_in(
            message_ids, tenant_id, session
        )
        if not contents:
            return []

        referenced_message_ids = sorted({content.message_id for content in contents})
        messages = await MessageRepository.find_by_tenant_id_and_ids(
            tenant_id, referenced_message_ids, session
        )
        room_ids = sorted({message.room_id for message in messages})
        rooms = await RoomRepository.find_by_ids_and_tenant_id(
            room_ids, tenant_id, session
        )
        rooms_by_id = {room.id: room for room in rooms}
        for room_id in room_ids:
            room = rooms_by_id.get(room_id)
            if room is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND, detail="Room not found"
                )
            if room.user_id != current_user.id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN, detail="Access Denied"
                )

        rated_message_ids = (
            await MessageFeedbackRepository.find_message_ids_with_feedback(
                referenced_message_ids, tenant_id, session
            )
        )
        content_ids = [content.id for content in contents]
        files_map = (
            await MessageContentRepository.find_attachment_files_grouped_by_content_ids(
                content_ids, tenant_id, session
            )
        )

        return [
            MessageContentResponse(
                id=content.id,
                messageId=content.message_id,
                status=content.status,
                question=content.question,
                answer=content.answer,
                context=content.context,
                attachmentFiles=[
                    MessageContentAttachmentFileResponse(
                        name=file.name, type=file.type, data=file.data
                    )
                    for file in files_map.get(content.id, [])
                ],
                referencePaths=_split_reference_paths(content.file_paths),
                isRated=content.message_id in rated_message_ids,
            )
            for content in contents
        ]

    @staticmethod
    async def _delete_message_if_found(
        tenant_id: str,
        current_user: User,
        message: Message | None,
        session: AsyncSession,
    ) -> None:
        """解決済みのメッセージを、所有権チェックのうえ削除する。

        メッセージが見つからない場合は移植元と同様に何もせず成功する（冪等な仕様）。

        Args:
            tenant_id: テナントID。
            current_user: 認証済みユーザー。
            message: 削除対象のメッセージ（未解決ならNone）。
            session: 非同期DBセッション。

        Raises:
            HTTPException: メッセージが所属するルームの所有者でない場合は403。
        """
        if message is None:
            return
        await require_owned_room(tenant_id, current_user, message.room_id, session)
        await MessageRepository.delete(message, session)

    @staticmethod
    async def delete_message(
        tenant_id: str, current_user: User, message_id: str, session: AsyncSession
    ) -> None:
        """メッセージを削除する。

        Args:
            tenant_id: テナントID。
            current_user: 認証済みユーザー。
            message_id: 削除対象のメッセージID。
            session: 非同期DBセッション。

        Raises:
            HTTPException: メッセージが所属するルームの所有者でない場合は403。
        """
        message = await MessageRepository.find_by_tenant_id_and_id(
            tenant_id, message_id, session
        )
        await MessageService._delete_message_if_found(
            tenant_id, current_user, message, session
        )

    @staticmethod
    async def delete_message_by_content_id(
        tenant_id: str,
        current_user: User,
        message_content_id: str,
        session: AsyncSession,
    ) -> None:
        """メッセージ内容IDを指定してメッセージを削除する。

        Args:
            tenant_id: テナントID。
            current_user: 認証済みユーザー。
            message_content_id: 削除対象のメッセージ内容ID。
            session: 非同期DBセッション。

        Raises:
            HTTPException: メッセージが所属するルームの所有者でない場合は403。
        """
        message = await MessageRepository.find_by_tenant_id_and_content_id(
            tenant_id, message_content_id, session
        )
        await MessageService._delete_message_if_found(
            tenant_id, current_user, message, session
        )

    @staticmethod
    async def feedback_message(
        tenant_id: str,
        current_user: User,
        message_id: str,
        req: MessageFeedbackCreateRequest,
        session: AsyncSession,
    ) -> MessageFeedbackResponse:
        """メッセージへの評価を登録・更新する。既存があれば上書きする。

        Args:
            tenant_id: テナントID。
            current_user: 認証済みユーザー。
            message_id: 評価対象のメッセージID。
            req: 評価内容（rating）。
            session: 非同期DBセッション。

        Returns:
            登録・更新したフィードバック。

        Raises:
            HTTPException: メッセージが存在しない場合は404、ルームの所有者でない場合は403。
        """
        message = await MessageRepository.find_by_tenant_id_and_id(
            tenant_id, message_id, session
        )
        if message is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Message not found"
            )
        await require_owned_room(tenant_id, current_user, message.room_id, session)

        existing = await MessageFeedbackRepository.find_by_tenant_id_and_message_id(
            tenant_id, message_id, session
        )
        if existing is not None:
            existing.rating = req.rating
            feedback = await MessageFeedbackRepository.save(existing, session)
        else:
            feedback = await MessageFeedbackRepository.save(
                MessageFeedback(
                    tenant_id=tenant_id,
                    user_id=current_user.id,
                    message_id=message_id,
                    rating=req.rating,
                ),
                session,
            )

        return MessageFeedbackResponse(
            id=feedback.id,
            tenantId=feedback.tenant_id,
            userId=str(feedback.user_id),
            messageId=feedback.message_id,
            rating=feedback.rating,
            indexId=feedback.index_id,
            createdAt=feedback.created_at,
            updatedAt=feedback.updated_at,
        )

    @staticmethod
    async def stream_message_content(
        tenant_id: str,
        current_user: User,
        req: MessageContentCreateRequest,
        session: AsyncSession,
    ) -> StreamingResponse:
        """メッセージ送信によるアシスタント応答生成をSSEでストリーミング返却する。

        `SAAS_CHAT`（基本チャット）・`SAAS_RAG`（ベクトル検索付きアシスタント）に
        対応する。`SECURE`は非対応（400）。クレジット上限チェック・アシスタント/
        エンドポイント/AIモデル解決・（SAAS_RAGの場合の）RAGコンテキスト構築は、
        ここで注入された`session`を使いストリーミング開始前に行う。ストリーミング
        完了後の`MessageContent`永続化・ルーム更新日時の更新・トークン使用量永続化は、
        `session`のライフサイクル（StreamingResponse返却後にリクエストのDIスコープが
        終了しうる）とは独立させる必要があるため、新規セッションで行う。

        Args:
            tenant_id: テナントID。
            current_user: 認証済みユーザー。
            req: メッセージ送信リクエスト。
            session: 非同期DBセッション（呼び出し前のDB検証にのみ使用する）。

        Returns:
            `text/event-stream`のストリーミングレスポンス。

        Raises:
            HTTPException: 指定messageIdのメッセージが存在しない場合は404、所属
                ルームの所有者でない場合は403、アシスタントが未解決・`SECURE`・
                チャットエンドポイント/AIモデルが解決できない場合は400、SAAS_RAGで
                インデックス/埋め込みエンドポイント/ベクトルDB接続情報が解決できない・
                ベクトルDBへの接続に失敗した場合も400、クレジット上限超過時は429。
        """
        existing_content: MessageContent | None = None
        if req.messageContentId is not None:
            existing_content = await MessageContentRepository.find_by_id_and_tenant_id(
                req.messageContentId, tenant_id, session
            )
            if existing_content is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Message content not found",
                )
            message = await MessageRepository.find_by_tenant_id_and_id(
                tenant_id, existing_content.message_id, session
            )
        else:
            # スキーマの相関バリデーション(`_validate_target_specified`)により、
            # messageContentIdがNoneの場合はmessageIdが必ず指定されているはずだが、
            # `assert`は`-O`実行時に無効化され得るため、型narrowingを兼ねて明示的に
            # 例外を送出する（`docs/backend/.claude/CLAUDE.md`のエラー処理を握り
            # 潰さない方針に合わせる）。
            if req.messageId is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="messageId or messageContentId is required",
                )
            message = await MessageRepository.find_by_tenant_id_and_id(
                tenant_id, req.messageId, session
            )
        if message is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Message not found"
            )
        await require_owned_room(tenant_id, current_user, message.room_id, session)

        assistant = (
            await AssistantRepository.find_by_id_and_tenant_id(
                message.assistant_id, tenant_id, session
            )
            if message.assistant_id is not None
            else None
        )
        if assistant is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid assistant"
            )
        if assistant.type == AssistantType.SECURE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unsupported assistant type (SECURE is not supported yet)",
            )

        await enforce_within_quota(tenant_id, session)

        endpoint_pair = await AssistantEndpointRepository.find_chat_endpoint(
            assistant.id, tenant_id, session
        )
        if endpoint_pair is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No chat endpoint found for this assistant",
            )
        assistant_endpoint, tenant_endpoint = endpoint_pair

        ai_model = await AIModelRepository.find_by_endpoint_type_and_name(
            AIModelEndpointType.AZURE_OPENAI_CHAT, assistant_endpoint.model, session
        )
        if ai_model is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"AI model not found: {assistant_endpoint.model}",
            )

        history_messages = [
            ChatMessage(role=turn.role, content=turn.content)
            for turn in req.historyMessages
        ]
        if req.isCreateLibrary:
            # ライブラリ用システムプロンプトより後ろに別のsystem発話が並ぶと出力形式が
            # 不安定になるため、クライアント由来のsystem発話はuserへ降格する
            # （移植元`CreateMessageContentViewModel.getChatHistoryMessages`相当）。
            history_messages = _downgrade_system_turns_to_user(history_messages)

        chat_messages = _apply_additional_prompt(
            history_messages + [ChatMessage(role="user", content=req.userInput)],
            req.additionalPrompt,
        )
        if req.isCreateLibrary:
            # attachmentFiles適用より前に行う。build_user_content適用後はcontentが
            # マルチモーダルのリストになりうり、その後にf-string結合すると壊れるため。
            chat_messages = _apply_library_instruction_to_last_user_turn(chat_messages)
        chat_messages = _apply_attachment_files(chat_messages, req.attachmentFiles)

        rag_context = ""
        reference_paths: list[str] = []
        embedding_tokens = 0
        embedding_token_weight = 1.0
        if assistant.type == AssistantType.SAAS_RAG:
            (
                rag_context,
                reference_paths,
                embedding_tokens,
                embedding_token_weight,
            ) = await MessageService._build_rag_context(
                tenant_id, assistant, req.userInput, session
            )
            if rag_context.strip():
                chat_messages = [
                    ChatMessage(
                        role="system",
                        content=(
                            "以下のコンテキスト情報を参考にして回答してください:\n\n"
                            f"{rag_context}"
                        ),
                    ),
                    *chat_messages,
                ]

        if req.isCreateLibrary:
            library_prompt = await SystemPromptTemplateRepository.find_by_type(
                _LIBRARY_PROMPT_TYPE, session
            )
            if library_prompt is None:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="ライブラリ生成用のシステムプロンプトが見つかりません。",
                )
            chat_messages = [
                ChatMessage(role="system", content=library_prompt.content),
                *chat_messages,
            ]

        # JSON出力指示は最も外側の振る舞い指定として、RAGコンテキスト・ライブラリ用
        # システムプロンプトのsystemメッセージより先頭に置く
        # （`docs/issue-100/03_詳細設計.md`参照）。
        chat_messages = _prepend_json_response_instruction(
            chat_messages, req.responseFormat
        )
        response_format_param = _build_llm_response_format(req.responseFormat)

        credit_settings = get_llm_credit_settings()
        endpoint_url = tenant_endpoint.endpoint
        api_key = tenant_endpoint.api_key
        deploy_name = assistant_endpoint.model
        model_name = ai_model.name
        # SAAS_RAGの場合、移植元`buildRagContext`の挙動に合わせてAIモデルのtoken_weight
        # ではなく固定値を使う（`RAG_CHAT_TOKEN_WEIGHT`のコメント参照）。
        token_weight = (
            RAG_CHAT_TOKEN_WEIGHT
            if assistant.type == AssistantType.SAAS_RAG
            else positive_token_weight(float(ai_model.token_weight))
        )
        message_id = message.id
        room_id = message.room_id
        user_id = current_user.id
        # 再生成(messageContentId指定)時は元の質問文を保持し、新規生成時のみ
        # リクエストのuserInputを質問文として永続化する（移植元`persistMessageContent`
        # の挙動に合わせる）。LLMへの入力自体は再生成時もリクエストのuserInputを使う。
        question_text = (
            existing_content.question if existing_content is not None else req.userInput
        )
        existing_content_id = (
            existing_content.id if existing_content is not None else None
        )
        create_library = req.isCreateLibrary
        attachment_files = req.attachmentFiles
        tools = _to_core_tool_configs(req.tools)

        async def event_stream() -> AsyncIterator[bytes]:
            """Azure OpenAIの応答をSSEイベントへ変換しつつ配信し、完了後に永続化する。

            永続化（`_persist_message_content`・`_persist_token_usage`）は`finally`で
            実行し、クライアントが切断してStarletteがこのジェネレータを`aclose()`する
            （`GeneratorExit`は`BaseException`のサブクラスであり`except Exception`では
            捕捉できない）場合でも、Azureで既に消費したトークンの記録・応答の永続化が
            必ず行われるようにする。ただし`GeneratorExit`処理中は`yield`できないため、
            `complete`イベントの送出はストリームが正常に完了/エラー終了した場合のみ行う。

            `create_library=true`の場合は、`text_delta`の代わりに`LibraryStreamRouter`
            経由でタイトル/本文/補足コメントの3区分に振り分けて配信する。補足コメント
            区間のテキストのみ`answer_text`へ積算し、`MessageContent.answer`として
            永続化する（コメントが空ならデフォルトの案内文を使う）。ライブラリ自体の
            永続化は、移植元同様ストリーミングが正常に完了した場合のみ行う。
            """
            input_tokens = 0
            output_tokens = 0
            answer_text = ""
            content_status = MessageContentStatus.OK
            stream_finished = False
            router = LibraryStreamRouter() if create_library else None
            library_title: str | None = None
            library_content: str | None = None
            try:
                # temperature・max_tokensは`MessageContentCreateRequest`に含めていない
                # （`01_要件定義.md`のスコープ外）ため、Issue #88の`LlmChatRequest`の
                # デフォルト値(temperature=0.0)に合わせて固定値で呼び出す。将来モデル別に
                # 調整したい場合は`AIModel`側にデフォルト値を持たせる形での対応を検討する。
                async for chunk in AzureLlmChatClient.stream_chat(
                    endpoint_url,
                    api_key,
                    deploy_name,
                    chat_messages,
                    0.0,
                    None,
                    tools,
                    response_format_param,
                ):
                    if chunk.text_delta is not None:
                        if router is not None:
                            for kind, text in router.feed(chunk.text_delta):
                                if kind == "comment":
                                    answer_text += text
                                    yield _sse("text_delta", {"text": text})
                                else:
                                    yield _sse(f"library_{kind}_delta", {"text": text})
                        else:
                            answer_text += chunk.text_delta
                            yield _sse("text_delta", {"text": chunk.text_delta})
                    if chunk.input_tokens is not None:
                        input_tokens = chunk.input_tokens
                    if chunk.output_tokens is not None:
                        output_tokens = chunk.output_tokens

                if router is not None:
                    for kind, text in router.flush():
                        if kind == "comment":
                            answer_text += text
                            yield _sse("text_delta", {"text": text})
                        else:
                            yield _sse(f"library_{kind}_delta", {"text": text})
                    library_title = (router.final_title() or DEFAULT_LIBRARY_TITLE)[
                        :_LIBRARY_TITLE_MAX_LENGTH
                    ]
                    library_content = router.final_content()
                    if not answer_text.strip():
                        answer_text = f"「{library_title}」を作成しました"
                        yield _sse("text_delta", {"text": answer_text})

                yield _sse(
                    "message_stop",
                    {"inputTokens": input_tokens, "outputTokens": output_tokens},
                )
                stream_finished = True
            except Exception as e:
                # SSEは開始後にHTTPステータスでエラーを返せないため、専用イベントとして
                # クライアントへ通知したうえで、ERRORステータスのMessageContentとして
                # 永続化する（クライアントがエラー後も応答IDを認識できるようにするため）。
                # 既に配信済みのanswer_text（部分的な回答）は上書きせず保持し、内部の
                # 例外メッセージが回答内容としてクライアントへ露出・永続化されないようにする。
                logger.exception("メッセージ送信中にエラーが発生しました")
                content_status = MessageContentStatus.ERROR
                yield _sse("error", {"message": str(e)})
                stream_finished = True
            finally:
                try:
                    content_response = await MessageService._persist_message_content(
                        tenant_id=tenant_id,
                        message_id=message_id,
                        room_id=room_id,
                        question=question_text,
                        answer=answer_text,
                        content_status=content_status,
                        attachment_files=attachment_files,
                        context=rag_context or None,
                        reference_paths=reference_paths,
                        existing_content_id=existing_content_id,
                    )
                except ValueError:
                    # 再生成対象がストリーミング中に削除される等の稀な競合。
                    # ここで例外を伝播させるとfinally節の途中で処理が打ち切られ、
                    # トークン使用量の永続化やcompleteイベント送出が行われないまま
                    # ジェネレータが異常終了してしまうため、ログのみ残してcomplete
                    # イベントの送出をスキップする。
                    logger.exception("メッセージ内容の永続化に失敗しました")
                    content_response = None

                if (
                    content_response is not None
                    and library_title is not None
                    and library_content is not None
                    and content_status == MessageContentStatus.OK
                ):
                    await MessageService._persist_library(
                        tenant_id=tenant_id,
                        message_id=message_id,
                        user_id=user_id,
                        title=library_title,
                        content=library_content,
                    )
                await MessageService._persist_token_usage(
                    tenant_id=tenant_id,
                    user_id=user_id,
                    room_id=room_id,
                    message_id=message_id,
                    model_name=model_name,
                    token_weight=token_weight,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    credit_settings=credit_settings,
                    embedding_tokens=embedding_tokens,
                    embedding_token_weight=embedding_token_weight,
                )
                if stream_finished and content_response is not None:
                    # attachmentFilesの`data`がbytesの場合、素の.model_dump()では
                    # json.dumpsがシリアライズできないため、mode="json"でBase64
                    # 文字列へ変換してから渡す。
                    yield _sse("complete", content_response.model_dump(mode="json"))

        return StreamingResponse(event_stream(), media_type="text/event-stream")

    @staticmethod
    async def _build_rag_context(
        tenant_id: str,
        assistant: Assistant,
        user_input: str,
        session: AsyncSession,
    ) -> tuple[str, list[str], int, float]:
        """SAAS_RAGアシスタントのRAGコンテキストを構築する（移植元`buildRagContext`相当）。

        インデックス・埋め込みエンドポイント・ベクトルDB接続情報を解決したうえで、
        ユーザー入力を埋め込みベクトル化しAzure AI Searchへ類似検索を行い、検索結果の
        `fileUniqueId`メタデータから解決できたファイルのみをコンテキストへ採用する。

        Args:
            tenant_id: テナントID。
            assistant: SAAS_RAGアシスタント。
            user_input: ユーザーの発話（検索クエリとして使う）。
            session: 非同期DBセッション。

        Returns:
            (RAGコンテキスト文字列, 参照ファイルパス一覧, 消費した埋め込みトークン数,
            埋め込みクレジット換算用のtoken_weight) のタプル。

        Raises:
            HTTPException: インデックスが未紐付け・未検出、埋め込みエンドポイントが
                見つからない、ベクトルDB接続情報が見つからない、埋め込みAPI呼び出し・
                ベクトルDBへの接続・検索に失敗した場合は400。
        """
        if assistant.index_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No index found for this assistant",
            )
        index = await IndexRepository.find_by_id_and_tenant_id(
            assistant.index_id, tenant_id, session
        )
        if index is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No index found for this assistant",
            )

        index_endpoints_map = (
            await IndexRepository.find_tenant_endpoints_grouped_by_index_ids(
                [index.id], tenant_id, session
            )
        )
        embedding_endpoint = next(
            (
                endpoint
                for endpoint in sorted(
                    index_endpoints_map.get(index.id, []), key=lambda e: e.id
                )
                if endpoint.type == EndpointType.AZURE_OPENAI_EMBEDDING
            ),
            None,
        )
        if embedding_endpoint is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No embedding endpoint found for this index",
            )

        vdb_endpoints = await TenantEndpointRepository.find_by_tenant_id_and_type(
            tenant_id, EndpointType.VDB, session
        )
        if not vdb_endpoints:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No vector database connection found for this tenant",
            )
        # 複数存在する場合の選び方を決定的にする（埋め込みエンドポイント選択と同様）。
        vdb = min(vdb_endpoints, key=lambda e: e.id)

        try:
            embedding_result = await AzureLlmEmbeddingClient.create_embedding(
                embedding_endpoint.endpoint,
                embedding_endpoint.api_key,
                EMBEDDING_MODEL_NAME,
                user_input,
                None,
            )
        except Exception:
            # AzureAiSearchVectorStoreClient.similarity_searchと同様、ストリーミング
            # 開始前のエラーはHTTPステータスで返す必要があるため、Azure OpenAI
            # Embeddings API呼び出しの失敗（認証・ネットワーク等）もここで400へ変換する。
            logger.exception("埋め込みAPIの呼び出しに失敗しました")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to create embedding for RAG search",
            ) from None

        # 移植元同様、Azure Searchのインデックス名にはベクトルDB接続情報が属する
        # テナントIDを使う（`assistant.index_id`ではない）。
        search_results = await AzureAiSearchVectorStoreClient.similarity_search(
            vdb.endpoint,
            vdb.api_key,
            vdb.tenant_id,
            embedding_result.embedding,
            DEFAULT_TOP_K,
        )

        seen_file_ids: set[str] = set()
        file_ids: list[str] = []
        for result in search_results:
            if result.file_unique_id and result.file_unique_id not in seen_file_ids:
                seen_file_ids.add(result.file_unique_id)
                file_ids.append(result.file_unique_id)
        files = await FileRepository.find_by_ids_and_tenant_id(
            file_ids, tenant_id, session
        )
        files_by_id = {file.id: file for file in files}

        context_parts: list[str] = []
        reference_paths: list[str] = []
        for result in search_results:
            file = (
                files_by_id.get(result.file_unique_id)
                if result.file_unique_id
                else None
            )
            if file is None:
                continue
            context_parts.append(result.content)
            if file.reference:
                reference_paths.append(file.reference)
        # 移植元`contentBuilder.append(doc.getText())`同様、区切り文字なしで連結する。
        rag_context = "".join(context_parts)

        embedding_model = await AIModelRepository.find_by_endpoint_type_and_name(
            AIModelEndpointType.AZURE_OPENAI_EMBEDDING, EMBEDDING_MODEL_NAME, session
        )
        embedding_token_weight = (
            positive_token_weight(float(embedding_model.token_weight))
            if embedding_model is not None
            else 1.0
        )

        return (
            rag_context,
            reference_paths,
            embedding_result.tokens,
            embedding_token_weight,
        )

    @staticmethod
    async def _persist_message_content(
        *,
        tenant_id: str,
        message_id: str,
        room_id: str,
        question: str,
        answer: str,
        content_status: MessageContentStatus,
        attachment_files: list[AttachmentFile],
        context: str | None = None,
        reference_paths: list[str] | None = None,
        existing_content_id: str | None = None,
    ) -> MessageContentResponse:
        """ストリーミング完了後、回答内容を新規セッションで永続化し、ルームの更新日時を進める。

        `existing_content_id`が指定されている場合は、新規作成ではなく既存の
        `MessageContent`を再生成結果で上書きする（`question`は変更しない）。

        Args:
            tenant_id: テナントID。
            message_id: 紐づくメッセージID。
            room_id: 紐づくルームID(更新日時を進める対象)。
            question: 質問本文(再生成時は元の質問文をそのまま渡すこと)。
            answer: 回答本文(エラー時は例外メッセージ)。
            content_status: 永続化するステータス(`OK`/`ERROR`)。
            attachment_files: 今回のユーザー発話に添付されたファイル一覧。
            context: RAG検索で構築したコンテキスト文字列(SAAS_CHATの場合はNone)。
            reference_paths: 参照ファイルパス一覧(SAAS_CHATの場合は空)。
            existing_content_id: 再生成対象の既存メッセージ内容ID。新規作成の
                場合はNone。

        Returns:
            永続化した内容を表す`complete`イベント用のレスポンス。

        Raises:
            ValueError: `existing_content_id`指定時、対象がストリーミング中に
                削除される等の稀な競合で見つからない場合。
        """
        reference_paths = reference_paths or []
        file_paths = ",".join(reference_paths) or None
        session_maker = get_session_maker()
        async with session_maker() as new_session:
            if existing_content_id is not None:
                existing = await MessageContentRepository.find_by_id_and_tenant_id(
                    existing_content_id, tenant_id, new_session
                )
                if existing is None:
                    # ストリーミング開始時点では存在確認済みのため、通常は到達しない
                    # （ストリーミング中に対象が削除された等の競合時のみ）。移植元
                    # (`persistMessageContent`)も同様にここでは救済せず例外を送出する。
                    raise ValueError(
                        "Message content not found for regeneration: "
                        f"{existing_content_id}"
                    )
                content = await MessageContentRepository.update_answer(
                    existing,
                    status=content_status,
                    answer=answer,
                    context=context,
                    file_paths=file_paths,
                    session=new_session,
                )
            else:
                content = await MessageContentRepository.save(
                    MessageContent(
                        tenant_id=tenant_id,
                        message_id=message_id,
                        status=content_status,
                        question=question,
                        answer=answer,
                        context=context,
                        file_paths=file_paths,
                    ),
                    new_session,
                )

            saved_files: list[MessageFile] = []
            if attachment_files:
                # ここで例外を握り潰さず伝播させると、呼び出し元(event_streamの
                # finally節)でトークン使用量の永続化・completeイベント送出まで
                # 巻き込んで失敗してしまう(既にAzureへの課金が発生済みのトークンの
                # 記録が失われる)。添付ファイルの保存失敗は本体の回答永続化とは
                # 独立した問題として扱い、ログに残したうえで後続処理を継続する。
                try:
                    saved_files = await MessageContentRepository.save_attachment_files(
                        [
                            MessageFile(
                                tenant_id=tenant_id,
                                name=file.name,
                                type=file.type,
                                data=file.data,
                                message_id=content.id,
                            )
                            for file in attachment_files
                        ],
                        new_session,
                    )
                except Exception:
                    logger.exception("添付ファイルの永続化に失敗しました")
                    await new_session.rollback()

            room = await RoomRepository.find_by_id_and_tenant_id(
                room_id, tenant_id, new_session
            )
            if room is not None:
                room.updated_at = datetime.now(timezone.utc)
                new_session.add(room)
                await new_session.commit()

            return MessageContentResponse(
                id=content.id,
                messageId=content.message_id,
                status=content.status,
                question=content.question,
                answer=content.answer,
                context=content.context,
                attachmentFiles=[
                    MessageContentAttachmentFileResponse(
                        name=file.name, type=file.type, data=file.data
                    )
                    for file in saved_files
                ],
                referencePaths=reference_paths,
                isRated=False,
            )

    @staticmethod
    async def _persist_library(
        *,
        tenant_id: str,
        message_id: str,
        user_id: UUID,
        title: str,
        content: str,
    ) -> None:
        """生成したライブラリを新規セッションで永続化する（移植元`persistLibrary`相当）。

        `llm_chat_service.LlmChatService._persist_library`と同等のロジックだが、
        「serviceが別serviceを呼ばない」規約により複製している。

        Args:
            tenant_id: テナントID。
            message_id: 紐づくメッセージID。
            user_id: 生成したユーザーのID。
            title: 確定したタイトル(255文字以内に切り詰め済み)。
            content: 確定した本文(md)。
        """
        session_maker = get_session_maker()
        async with session_maker() as new_session:
            await LibraryRepository.save(
                Library(
                    tenant_id=tenant_id,
                    message_id=message_id,
                    user_id=user_id,
                    title=title,
                    content=content,
                ),
                new_session,
            )

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
        embedding_tokens: int = 0,
        embedding_token_weight: float = 1.0,
    ) -> None:
        """メッセージ送信のトークン使用量を新規セッションで永続化する。

        `llm_chat_service.LlmChatService._persist_token_usage`と同等のロジックだが、
        「serviceが別serviceを呼ばない」規約により複製している。

        Args:
            tenant_id: テナントID。
            user_id: 呼び出したユーザーのID。
            room_id: 紐づくルームID。
            message_id: 紐づくメッセージID。
            model_name: 呼び出したAIモデル名。
            token_weight: 呼び出したAIモデルの重み係数。
            input_tokens: 入力トークン数。
            output_tokens: 出力トークン数。
            credit_settings: クレジット換算設定。
            embedding_tokens: RAG検索用に消費した埋め込みトークン数(SAAS_CHATの場合は0)。
            embedding_token_weight: 埋め込みモデルの重み係数。
        """
        if input_tokens <= 0 and output_tokens <= 0 and embedding_tokens <= 0:
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
            embedding_tokens=embedding_tokens,
            embedding_credits=calc_embedding_credits(
                embedding_tokens,
                credit_settings.tokens_per_credit,
                embedding_token_weight,
            ),
        )
        session_maker = get_session_maker()
        async with session_maker() as new_session:
            new_session.add(token_usage)
            await new_session.commit()
