import json
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.assistant import AssistantType
from app.models.message import Message, MessageFeedback
from app.models.room import Room
from app.models.tenant_endpoint import EndpointType
from app.models.user import User
from app.repositories.assistant_endpoint_repository import AssistantEndpointRepository
from app.repositories.assistant_repository import AssistantRepository
from app.repositories.message_content_repository import MessageContentRepository
from app.repositories.message_feedback_repository import MessageFeedbackRepository
from app.repositories.message_repository import MessageRepository
from app.repositories.room_repository import RoomRepository
from app.schemas.message import (
    AssistantResponse,
    EndpointResponse,
    GetMessagesResponse,
    MessageContentAttachmentFileResponse,
    MessageContentResponse,
    MessageCreateRequest,
    MessageCreateResponse,
    MessageFeedbackCreateRequest,
    MessageFeedbackResponse,
    MessageItemResponse,
    ToolConfig,
)


def _serialize_tools(tools: list[ToolConfig] | None) -> str | None:
    """toolsをJSON文字列に変換する。authorization/headersは含めない（ToolConfig側でexclude済み）。"""
    if not tools:
        return None
    return json.dumps([tool.model_dump(exclude_none=True) for tool in tools])


def _deserialize_tools(tools_json: str | None) -> list[ToolConfig] | None:
    """toolsのJSON文字列をToolConfigのリストへ変換する。"""
    if not tools_json:
        return None
    return [ToolConfig(**item) for item in json.loads(tools_json)]


def _split_reference_paths(file_paths: str | None) -> list[str]:
    """参照ファイルパスのカンマ区切り文字列をリストへ変換する。"""
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
        """roomId未指定なら新規ルームを作成し、指定時は所有ルームを解決する。"""
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

        found_room = await RoomRepository.find_by_id_and_login_id(
            req.roomId, tenant_id, current_user.login_id, session
        )
        if found_room is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Room not found"
            )
        return found_room

    @staticmethod
    async def _require_can_write_room(
        tenant_id: str, current_user: User, room_id: str, session: AsyncSession
    ) -> None:
        """指定ルームの所有者本人であることを検証する。"""
        room = await RoomRepository.find_by_id_and_tenant_id(
            room_id, tenant_id, session
        )
        if room is None or room.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Access Denied"
            )

    @staticmethod
    async def create_message(
        tenant_id: str,
        current_user: User,
        req: MessageCreateRequest,
        session: AsyncSession,
    ) -> MessageCreateResponse:
        """メッセージ（質問スレッド）を作成する。roomId未指定なら新規ルームも作成する。"""
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
        """指定ルームのメッセージ一覧と、参照アシスタント一覧を取得する。"""
        room = await RoomRepository.find_by_id_and_tenant_id(
            room_id, tenant_id, session
        )
        if room is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Room not found"
            )
        if room.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Access Denied"
            )

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
        """メッセージID群に対応するメッセージ内容一覧を取得する。"""
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
    async def delete_message(
        tenant_id: str, current_user: User, message_id: str, session: AsyncSession
    ) -> None:
        """メッセージを削除する。存在しない場合は何もせず成功する（移植元と同様の冪等な仕様）。"""
        message = await MessageRepository.find_by_tenant_id_and_id(
            tenant_id, message_id, session
        )
        if message is None:
            return
        await MessageService._require_can_write_room(
            tenant_id, current_user, message.room_id, session
        )
        await MessageRepository.delete(message, session)

    @staticmethod
    async def delete_message_by_content_id(
        tenant_id: str,
        current_user: User,
        message_content_id: str,
        session: AsyncSession,
    ) -> None:
        """メッセージ内容IDを指定してメッセージを削除する。"""
        message = await MessageRepository.find_by_tenant_id_and_content_id(
            tenant_id, message_content_id, session
        )
        if message is None:
            return
        await MessageService._require_can_write_room(
            tenant_id, current_user, message.room_id, session
        )
        await MessageRepository.delete(message, session)

    @staticmethod
    async def feedback_message(
        tenant_id: str,
        current_user: User,
        message_id: str,
        req: MessageFeedbackCreateRequest,
        session: AsyncSession,
    ) -> MessageFeedbackResponse:
        """メッセージへの評価を登録・更新する。既存があれば上書きする。"""
        message = await MessageRepository.find_by_tenant_id_and_id(
            tenant_id, message_id, session
        )
        if message is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Message not found"
            )
        await MessageService._require_can_write_room(
            tenant_id, current_user, message.room_id, session
        )

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
