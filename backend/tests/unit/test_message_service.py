from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.core.llm_client import ChatMessage, EmbeddingResult
from app.core.vector_store import VectorSearchResult
from app.models.ai_model import AIModel, AIModelEndpointType
from app.models.assistant import Assistant, AssistantEndpoint, AssistantType
from app.models.file import File, FileStatus
from app.models.index import Index, IndexType
from app.models.tenant_endpoint import EndpointType, TenantEndpoint
from app.models.token_usage import TokenUsage
from app.schemas.attachment import AttachmentFile
from app.schemas.message import MessageContentCreateRequest, MessageContentHistoryTurn
from app.services.message_service import (
    MessageService,
    _apply_additional_prompt,
    _apply_attachment_files,
)


def _ai_model(name: str = "gpt-4o", token_weight: str = "1.0") -> AIModel:
    return AIModel(
        id=1,
        endpoint_type=AIModelEndpointType.AZURE_OPENAI_CHAT,
        name=name,
        max_tokens=4096,
        token_weight=Decimal(token_weight),
    )


def _tenant_endpoint(endpoint_id: str = "endpoint-1") -> TenantEndpoint:
    return TenantEndpoint(
        id=endpoint_id,
        tenant_id="tenant-1",
        type=EndpointType.AZURE_OPENAI_CHAT,
        endpoint_name="azure",
        endpoint="https://example.openai.azure.com",
        api_key="api-key",
    )


def _assistant_endpoint(model: str = "gpt-4o") -> AssistantEndpoint:
    return AssistantEndpoint(
        assistant_id="assistant-1",
        endpoint_id="endpoint-1",
        tenant_id="tenant-1",
        model=model,
    )


def _assistant(assistant_type: AssistantType = AssistantType.SAAS_CHAT) -> Assistant:
    return Assistant(
        id="assistant-1",
        tenant_id="tenant-1",
        type=assistant_type,
        name="Assistant",
        include_history=False,
    )


def _message(assistant_id: str | None = "assistant-1") -> MagicMock:
    return MagicMock(id="msg-1", room_id="room-1", assistant_id=assistant_id)


def _rag_assistant(index_id: str | None = "index-1") -> Assistant:
    return Assistant(
        id="assistant-1",
        tenant_id="tenant-1",
        type=AssistantType.SAAS_RAG,
        name="RAG Assistant",
        include_history=False,
        index_id=index_id,
    )


def _index(index_id: str = "index-1") -> Index:
    return Index(id=index_id, tenant_id="tenant-1", type=IndexType.LOCAL, name="Index")


def _embedding_endpoint(endpoint_id: str = "embed-endpoint-1") -> TenantEndpoint:
    return TenantEndpoint(
        id=endpoint_id,
        tenant_id="tenant-1",
        type=EndpointType.AZURE_OPENAI_EMBEDDING,
        endpoint_name="azure-embedding",
        endpoint="https://example-embedding.openai.azure.com",
        api_key="embedding-api-key",
    )


def _vdb_endpoint(tenant_id: str = "tenant-1") -> TenantEndpoint:
    return TenantEndpoint(
        id="vdb-endpoint-1",
        tenant_id=tenant_id,
        type=EndpointType.VDB,
        endpoint_name="azure-search",
        endpoint="https://example-search.search.windows.net",
        api_key="vdb-api-key",
    )


def _file(file_id: str, reference: str | None) -> File:
    return File(
        id=file_id,
        tenant_id="tenant-1",
        name=f"{file_id}.txt",
        reference=reference,
        status=FileStatus.ENABLE,
        user_id="11111111-1111-1111-1111-111111111111",
        index_id="index-1",
    )


def _request(**overrides) -> MessageContentCreateRequest:
    defaults = {
        "messageId": "msg-1",
        "userInput": "こんにちは",
        "historyMessages": [],
    }
    defaults.update(overrides)
    return MessageContentCreateRequest(**defaults)


class _AsyncChunkIterator:
    def __init__(self, chunks: list) -> None:
        self._chunks = chunks

    def __aiter__(self):
        return self._gen()

    async def _gen(self):
        for chunk in self._chunks:
            yield chunk


async def _consume(streaming_response) -> list[bytes]:
    return [chunk async for chunk in streaming_response.body_iterator]


def _mock_new_session() -> MagicMock:
    mock_new_session = AsyncMock()
    mock_new_session.__aenter__.return_value = mock_new_session
    mock_new_session.add = MagicMock()
    return mock_new_session


class TestStreamMessageContent:
    """MessageService.stream_message_content のテスト"""

    @patch(
        "app.services.message_service.MessageRepository.find_by_tenant_id_and_id",
        new_callable=AsyncMock,
    )
    async def test_raises_404_when_message_not_found(
        self, mock_find_message, test_user
    ):
        """指定messageIdのメッセージが存在しない場合404になること"""
        mock_find_message.return_value = None

        with pytest.raises(HTTPException) as exc_info:
            await MessageService.stream_message_content(
                "tenant-1", test_user, _request(), session=None
            )

        assert exc_info.value.status_code == 404

    @patch("app.services.message_service.require_owned_room", new_callable=AsyncMock)
    @patch(
        "app.services.message_service.MessageRepository.find_by_tenant_id_and_id",
        new_callable=AsyncMock,
    )
    async def test_raises_403_when_room_not_owned(
        self, mock_find_message, mock_require_owned_room, test_user
    ):
        """対象メッセージが所属するルームの所有者でない場合403になること"""
        mock_find_message.return_value = _message()
        mock_require_owned_room.side_effect = HTTPException(
            status_code=403, detail="Access Denied"
        )

        with pytest.raises(HTTPException) as exc_info:
            await MessageService.stream_message_content(
                "tenant-1", test_user, _request(), session=None
            )

        assert exc_info.value.status_code == 403

    @patch("app.services.message_service.require_owned_room", new_callable=AsyncMock)
    @patch(
        "app.services.message_service.MessageRepository.find_by_tenant_id_and_id",
        new_callable=AsyncMock,
    )
    async def test_raises_400_when_message_has_no_assistant_id(
        self, mock_find_message, mock_require_owned_room, test_user
    ):
        """対象メッセージにassistant_idが紐づいていない場合400になること"""
        mock_find_message.return_value = _message(assistant_id=None)

        with pytest.raises(HTTPException) as exc_info:
            await MessageService.stream_message_content(
                "tenant-1", test_user, _request(), session=None
            )

        assert exc_info.value.status_code == 400

    @patch(
        "app.services.message_service.AssistantRepository.find_by_id_and_tenant_id",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.require_owned_room", new_callable=AsyncMock)
    @patch(
        "app.services.message_service.MessageRepository.find_by_tenant_id_and_id",
        new_callable=AsyncMock,
    )
    async def test_raises_400_when_assistant_not_found(
        self,
        mock_find_message,
        mock_require_owned_room,
        mock_find_assistant,
        test_user,
    ):
        """メッセージのassistant_idに対応するアシスタントが存在しない場合400になること"""
        mock_find_message.return_value = _message()
        mock_find_assistant.return_value = None

        with pytest.raises(HTTPException) as exc_info:
            await MessageService.stream_message_content(
                "tenant-1", test_user, _request(), session=None
            )

        assert exc_info.value.status_code == 400

    @patch(
        "app.services.message_service.AssistantRepository.find_by_id_and_tenant_id",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.require_owned_room", new_callable=AsyncMock)
    @patch(
        "app.services.message_service.MessageRepository.find_by_tenant_id_and_id",
        new_callable=AsyncMock,
    )
    async def test_raises_400_when_secure_assistant_type(
        self,
        mock_find_message,
        mock_require_owned_room,
        mock_find_assistant,
        test_user,
    ):
        """アシスタント種別がSECUREの場合400になること"""
        mock_find_message.return_value = _message()
        mock_find_assistant.return_value = _assistant(AssistantType.SECURE)

        with pytest.raises(HTTPException) as exc_info:
            await MessageService.stream_message_content(
                "tenant-1", test_user, _request(), session=None
            )

        assert exc_info.value.status_code == 400

    @patch("app.services.message_service.enforce_within_quota", new_callable=AsyncMock)
    @patch(
        "app.services.message_service.AssistantRepository.find_by_id_and_tenant_id",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.require_owned_room", new_callable=AsyncMock)
    @patch(
        "app.services.message_service.MessageRepository.find_by_tenant_id_and_id",
        new_callable=AsyncMock,
    )
    async def test_raises_429_when_quota_exceeded(
        self,
        mock_find_message,
        mock_require_owned_room,
        mock_find_assistant,
        mock_enforce,
        test_user,
    ):
        """テナントのクレジット上限を超過している場合429になること"""
        mock_find_message.return_value = _message()
        mock_find_assistant.return_value = _assistant()
        mock_enforce.side_effect = HTTPException(status_code=429, detail="quota")

        with pytest.raises(HTTPException) as exc_info:
            await MessageService.stream_message_content(
                "tenant-1", test_user, _request(), session=None
            )

        assert exc_info.value.status_code == 429

    @patch(
        "app.services.message_service.AssistantEndpointRepository.find_chat_endpoint",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.enforce_within_quota", new_callable=AsyncMock)
    @patch(
        "app.services.message_service.AssistantRepository.find_by_id_and_tenant_id",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.require_owned_room", new_callable=AsyncMock)
    @patch(
        "app.services.message_service.MessageRepository.find_by_tenant_id_and_id",
        new_callable=AsyncMock,
    )
    async def test_raises_400_when_chat_endpoint_not_found(
        self,
        mock_find_message,
        mock_require_owned_room,
        mock_find_assistant,
        mock_enforce,
        mock_find_endpoint,
        test_user,
    ):
        """アシスタントに紐づくチャットエンドポイントが存在しない場合400になること"""
        mock_find_message.return_value = _message()
        mock_find_assistant.return_value = _assistant()
        mock_find_endpoint.return_value = None

        with pytest.raises(HTTPException) as exc_info:
            await MessageService.stream_message_content(
                "tenant-1", test_user, _request(), session=None
            )

        assert exc_info.value.status_code == 400

    @patch(
        "app.services.message_service.AIModelRepository.find_by_endpoint_type_and_name",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.message_service.AssistantEndpointRepository.find_chat_endpoint",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.enforce_within_quota", new_callable=AsyncMock)
    @patch(
        "app.services.message_service.AssistantRepository.find_by_id_and_tenant_id",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.require_owned_room", new_callable=AsyncMock)
    @patch(
        "app.services.message_service.MessageRepository.find_by_tenant_id_and_id",
        new_callable=AsyncMock,
    )
    async def test_raises_400_when_ai_model_not_found(
        self,
        mock_find_message,
        mock_require_owned_room,
        mock_find_assistant,
        mock_enforce,
        mock_find_endpoint,
        mock_find_model,
        test_user,
    ):
        """アシスタントのエンドポイントに対応するAIモデルが存在しない場合400になること"""
        mock_find_message.return_value = _message()
        mock_find_assistant.return_value = _assistant()
        mock_find_endpoint.return_value = (_assistant_endpoint(), _tenant_endpoint())
        mock_find_model.return_value = None

        with pytest.raises(HTTPException) as exc_info:
            await MessageService.stream_message_content(
                "tenant-1", test_user, _request(), session=None
            )

        assert exc_info.value.status_code == 400

    @patch("app.services.message_service.get_session_maker")
    @patch("app.services.message_service.MessageContentRepository.save")
    @patch(
        "app.services.message_service.RoomRepository.find_by_id_and_tenant_id",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.AzureLlmChatClient.stream_chat")
    @patch(
        "app.services.message_service.AIModelRepository.find_by_endpoint_type_and_name",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.message_service.AssistantEndpointRepository.find_chat_endpoint",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.enforce_within_quota", new_callable=AsyncMock)
    @patch(
        "app.services.message_service.AssistantRepository.find_by_id_and_tenant_id",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.require_owned_room", new_callable=AsyncMock)
    @patch(
        "app.services.message_service.MessageRepository.find_by_tenant_id_and_id",
        new_callable=AsyncMock,
    )
    async def test_streams_text_delta_then_message_stop_and_persists_content(
        self,
        mock_find_message,
        mock_require_owned_room,
        mock_find_assistant,
        mock_enforce,
        mock_find_endpoint,
        mock_find_model,
        mock_stream_chat,
        mock_find_room,
        mock_save_content,
        mock_get_session_maker,
        test_user,
    ):
        """text_delta・message_stop・completeイベントを順に送出し、内容を永続化すること"""
        from app.core.llm_client import ChatStreamChunk
        from app.models.message import MessageContent, MessageContentStatus

        mock_find_message.return_value = _message()
        mock_find_assistant.return_value = _assistant()
        mock_find_endpoint.return_value = (_assistant_endpoint(), _tenant_endpoint())
        mock_find_model.return_value = _ai_model()
        mock_stream_chat.return_value = _AsyncChunkIterator(
            [
                ChatStreamChunk(text_delta="こんに"),
                ChatStreamChunk(text_delta="ちは"),
                ChatStreamChunk(input_tokens=10, output_tokens=5),
            ]
        )
        mock_save_content.return_value = MessageContent(
            id="content-1",
            tenant_id="tenant-1",
            message_id="msg-1",
            status=MessageContentStatus.OK,
            question="こんにちは",
            answer="こんにちは",
        )
        mock_find_room.return_value = MagicMock(updated_at=None)

        mock_new_session = _mock_new_session()
        mock_session_maker = MagicMock(return_value=mock_new_session)
        mock_get_session_maker.return_value = mock_session_maker

        response = await MessageService.stream_message_content(
            "tenant-1", test_user, _request(), session=None
        )
        chunks = await _consume(response)
        body = b"".join(chunks).decode()

        assert "event: text_delta" in body
        assert '"text": "こんに"' in body
        assert '"text": "ちは"' in body
        assert "event: message_stop" in body
        assert '"inputTokens": 10' in body
        assert '"outputTokens": 5' in body
        assert "event: complete" in body
        assert '"id": "content-1"' in body
        mock_save_content.assert_awaited_once()
        # get_session_maker()は永続化(MessageContent保存後のRoom更新)とトークン使用量
        # 永続化の2箇所で呼ばれるため、addは2回(Room, TokenUsage)呼ばれる。
        assert mock_new_session.add.call_count == 2
        assert mock_new_session.commit.await_count == 2

    @patch("app.services.message_service.get_session_maker")
    @patch("app.services.message_service.MessageContentRepository.save")
    @patch(
        "app.services.message_service.RoomRepository.find_by_id_and_tenant_id",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.AzureLlmChatClient.stream_chat")
    @patch(
        "app.services.message_service.AIModelRepository.find_by_endpoint_type_and_name",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.message_service.AssistantEndpointRepository.find_chat_endpoint",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.enforce_within_quota", new_callable=AsyncMock)
    @patch(
        "app.services.message_service.AssistantRepository.find_by_id_and_tenant_id",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.require_owned_room", new_callable=AsyncMock)
    @patch(
        "app.services.message_service.MessageRepository.find_by_tenant_id_and_id",
        new_callable=AsyncMock,
    )
    async def test_passes_tools_to_llm_client_for_saas_chat(
        self,
        mock_find_message,
        mock_require_owned_room,
        mock_find_assistant,
        mock_enforce,
        mock_find_endpoint,
        mock_find_model,
        mock_stream_chat,
        mock_find_room,
        mock_save_content,
        mock_get_session_maker,
        test_user,
    ):
        """SAAS_CHATでtoolsを指定した場合、AzureLlmChatClient.stream_chatへ変換済みtoolsが渡ること"""
        from app.models.message import MessageContent, MessageContentStatus
        from app.schemas.message import ToolConfig

        mock_find_message.return_value = _message()
        mock_find_assistant.return_value = _assistant()
        mock_find_endpoint.return_value = (_assistant_endpoint(), _tenant_endpoint())
        mock_find_model.return_value = _ai_model()
        mock_stream_chat.return_value = _AsyncChunkIterator([])
        mock_save_content.return_value = MessageContent(
            id="content-1",
            tenant_id="tenant-1",
            message_id="msg-1",
            status=MessageContentStatus.OK,
            question="こんにちは",
            answer="",
        )
        mock_find_room.return_value = MagicMock(updated_at=None)

        mock_new_session = _mock_new_session()
        mock_session_maker = MagicMock(return_value=mock_new_session)
        mock_get_session_maker.return_value = mock_session_maker

        response = await MessageService.stream_message_content(
            "tenant-1",
            test_user,
            _request(tools=[ToolConfig(name="web_search")]),
            session=None,
        )
        await _consume(response)

        args, _ = mock_stream_chat.call_args
        passed_tools = args[6]
        assert passed_tools is not None
        assert len(passed_tools) == 1
        assert passed_tools[0].name == "web_search"

    @patch("app.services.message_service.get_session_maker")
    @patch("app.services.message_service.MessageContentRepository.save")
    @patch(
        "app.services.message_service.RoomRepository.find_by_id_and_tenant_id",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.AzureLlmChatClient.stream_chat")
    @patch(
        "app.services.message_service.AIModelRepository.find_by_endpoint_type_and_name",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.message_service.AssistantEndpointRepository.find_chat_endpoint",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.enforce_within_quota", new_callable=AsyncMock)
    @patch(
        "app.services.message_service.AssistantRepository.find_by_id_and_tenant_id",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.require_owned_room", new_callable=AsyncMock)
    @patch(
        "app.services.message_service.MessageRepository.find_by_tenant_id_and_id",
        new_callable=AsyncMock,
    )
    async def test_tools_none_by_default(
        self,
        mock_find_message,
        mock_require_owned_room,
        mock_find_assistant,
        mock_enforce,
        mock_find_endpoint,
        mock_find_model,
        mock_stream_chat,
        mock_find_room,
        mock_save_content,
        mock_get_session_maker,
        test_user,
    ):
        """tools未指定時はAzureLlmChatClient.stream_chatへtools=Noneが渡ること（回帰確認）"""
        from app.models.message import MessageContent, MessageContentStatus

        mock_find_message.return_value = _message()
        mock_find_assistant.return_value = _assistant()
        mock_find_endpoint.return_value = (_assistant_endpoint(), _tenant_endpoint())
        mock_find_model.return_value = _ai_model()
        mock_stream_chat.return_value = _AsyncChunkIterator([])
        mock_save_content.return_value = MessageContent(
            id="content-1",
            tenant_id="tenant-1",
            message_id="msg-1",
            status=MessageContentStatus.OK,
            question="こんにちは",
            answer="",
        )
        mock_find_room.return_value = MagicMock(updated_at=None)

        mock_new_session = _mock_new_session()
        mock_session_maker = MagicMock(return_value=mock_new_session)
        mock_get_session_maker.return_value = mock_session_maker

        response = await MessageService.stream_message_content(
            "tenant-1", test_user, _request(), session=None
        )
        await _consume(response)

        args, _ = mock_stream_chat.call_args
        assert args[6] is None

    @patch("app.services.message_service.get_session_maker")
    @patch("app.services.message_service.MessageContentRepository.save")
    @patch(
        "app.services.message_service.RoomRepository.find_by_id_and_tenant_id",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.AzureLlmChatClient.stream_chat")
    @patch(
        "app.services.message_service.AIModelRepository.find_by_endpoint_type_and_name",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.message_service.AssistantEndpointRepository.find_chat_endpoint",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.enforce_within_quota", new_callable=AsyncMock)
    @patch(
        "app.services.message_service.AssistantRepository.find_by_id_and_tenant_id",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.require_owned_room", new_callable=AsyncMock)
    @patch(
        "app.services.message_service.MessageRepository.find_by_tenant_id_and_id",
        new_callable=AsyncMock,
    )
    async def test_passes_response_format_and_prepends_instruction_when_specified(
        self,
        mock_find_message,
        mock_require_owned_room,
        mock_find_assistant,
        mock_enforce,
        mock_find_endpoint,
        mock_find_model,
        mock_stream_chat,
        mock_find_room,
        mock_save_content,
        mock_get_session_maker,
        test_user,
    ):
        """responseFormat指定時、JSON指示のsystemメッセージを前置しresponse_formatを渡すこと"""
        from app.models.message import MessageContent, MessageContentStatus

        mock_find_message.return_value = _message()
        mock_find_assistant.return_value = _assistant()
        mock_find_endpoint.return_value = (_assistant_endpoint(), _tenant_endpoint())
        mock_find_model.return_value = _ai_model()
        mock_stream_chat.return_value = _AsyncChunkIterator([])
        mock_save_content.return_value = MessageContent(
            id="content-1",
            tenant_id="tenant-1",
            message_id="msg-1",
            status=MessageContentStatus.OK,
            question="こんにちは",
            answer="",
        )
        mock_find_room.return_value = MagicMock(updated_at=None)

        mock_new_session = _mock_new_session()
        mock_session_maker = MagicMock(return_value=mock_new_session)
        mock_get_session_maker.return_value = mock_session_maker

        response = await MessageService.stream_message_content(
            "tenant-1",
            test_user,
            _request(responseFormat={"type": "json_object"}),
            session=None,
        )
        await _consume(response)

        call_args = mock_stream_chat.call_args.args
        messages = call_args[3]
        response_format_arg = call_args[7]
        assert messages[0] == ChatMessage(
            role="system", content="回答は JSON 形式で出力してください。"
        )
        assert response_format_arg == {"type": "json_object"}

    @patch("app.services.message_service.get_session_maker")
    @patch("app.services.message_service.MessageContentRepository.save")
    @patch(
        "app.services.message_service.RoomRepository.find_by_id_and_tenant_id",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.AzureLlmChatClient.stream_chat")
    @patch(
        "app.services.message_service.AIModelRepository.find_by_endpoint_type_and_name",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.message_service.AssistantEndpointRepository.find_chat_endpoint",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.enforce_within_quota", new_callable=AsyncMock)
    @patch(
        "app.services.message_service.AssistantRepository.find_by_id_and_tenant_id",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.require_owned_room", new_callable=AsyncMock)
    @patch(
        "app.services.message_service.MessageRepository.find_by_tenant_id_and_id",
        new_callable=AsyncMock,
    )
    async def test_does_not_pass_response_format_when_not_specified(
        self,
        mock_find_message,
        mock_require_owned_room,
        mock_find_assistant,
        mock_enforce,
        mock_find_endpoint,
        mock_find_model,
        mock_stream_chat,
        mock_find_room,
        mock_save_content,
        mock_get_session_maker,
        test_user,
    ):
        """responseFormat未指定時、response_formatを渡さずJSON指示文も前置しないこと"""
        from app.models.message import MessageContent, MessageContentStatus

        mock_find_message.return_value = _message()
        mock_find_assistant.return_value = _assistant()
        mock_find_endpoint.return_value = (_assistant_endpoint(), _tenant_endpoint())
        mock_find_model.return_value = _ai_model()
        mock_stream_chat.return_value = _AsyncChunkIterator([])
        mock_save_content.return_value = MessageContent(
            id="content-1",
            tenant_id="tenant-1",
            message_id="msg-1",
            status=MessageContentStatus.OK,
            question="こんにちは",
            answer="",
        )
        mock_find_room.return_value = MagicMock(updated_at=None)

        mock_new_session = _mock_new_session()
        mock_session_maker = MagicMock(return_value=mock_new_session)
        mock_get_session_maker.return_value = mock_session_maker

        response = await MessageService.stream_message_content(
            "tenant-1", test_user, _request(), session=None
        )
        await _consume(response)

        call_args = mock_stream_chat.call_args.args
        messages = call_args[3]
        response_format_arg = call_args[7]
        assert messages[0] == ChatMessage(role="user", content="こんにちは")
        assert response_format_arg is None

    @patch("app.services.message_service.get_session_maker")
    @patch("app.services.message_service.MessageContentRepository.save")
    @patch(
        "app.services.message_service.RoomRepository.find_by_id_and_tenant_id",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.AzureLlmChatClient.stream_chat")
    @patch(
        "app.services.message_service.AIModelRepository.find_by_endpoint_type_and_name",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.message_service.AssistantEndpointRepository.find_chat_endpoint",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.enforce_within_quota", new_callable=AsyncMock)
    @patch(
        "app.services.message_service.AssistantRepository.find_by_id_and_tenant_id",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.require_owned_room", new_callable=AsyncMock)
    @patch(
        "app.services.message_service.MessageRepository.find_by_tenant_id_and_id",
        new_callable=AsyncMock,
    )
    async def test_emits_error_event_and_persists_error_status_when_azure_call_fails(
        self,
        mock_find_message,
        mock_require_owned_room,
        mock_find_assistant,
        mock_enforce,
        mock_find_endpoint,
        mock_find_model,
        mock_stream_chat,
        mock_find_room,
        mock_save_content,
        mock_get_session_maker,
        test_user,
    ):
        """Azure呼び出し中に例外が発生した場合、errorイベント送出後ERRORステータスで永続化すること"""
        from app.models.message import MessageContent, MessageContentStatus

        async def _raise(*args, **kwargs):
            raise RuntimeError("azure error")
            yield  # pragma: no cover - ジェネレータにするためのダミー

        mock_find_message.return_value = _message()
        mock_find_assistant.return_value = _assistant()
        mock_find_endpoint.return_value = (_assistant_endpoint(), _tenant_endpoint())
        mock_find_model.return_value = _ai_model()
        mock_stream_chat.return_value = _raise()
        mock_save_content.return_value = MessageContent(
            id="content-1",
            tenant_id="tenant-1",
            message_id="msg-1",
            status=MessageContentStatus.ERROR,
            question="こんにちは",
            answer="",
        )
        mock_find_room.return_value = None

        mock_new_session = _mock_new_session()
        mock_session_maker = MagicMock(return_value=mock_new_session)
        mock_get_session_maker.return_value = mock_session_maker

        response = await MessageService.stream_message_content(
            "tenant-1", test_user, _request(), session=None
        )
        chunks = await _consume(response)
        body = b"".join(chunks).decode()

        assert "event: error" in body
        assert "azure error" in body
        assert "event: complete" in body

        saved_content = mock_save_content.await_args.args[0]
        assert saved_content.status == MessageContentStatus.ERROR
        # 例外メッセージで回答本文を上書きせず、ストリーム済みの内容(この場合は空)を保持すること
        assert saved_content.answer == ""

    @patch("app.services.message_service.get_session_maker")
    @patch("app.services.message_service.MessageContentRepository.save")
    @patch(
        "app.services.message_service.RoomRepository.find_by_id_and_tenant_id",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.AzureLlmChatClient.stream_chat")
    @patch(
        "app.services.message_service.AIModelRepository.find_by_endpoint_type_and_name",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.message_service.AssistantEndpointRepository.find_chat_endpoint",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.enforce_within_quota", new_callable=AsyncMock)
    @patch(
        "app.services.message_service.AssistantRepository.find_by_id_and_tenant_id",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.require_owned_room", new_callable=AsyncMock)
    @patch(
        "app.services.message_service.MessageRepository.find_by_tenant_id_and_id",
        new_callable=AsyncMock,
    )
    async def test_preserves_partial_answer_when_azure_call_fails_mid_stream(
        self,
        mock_find_message,
        mock_require_owned_room,
        mock_find_assistant,
        mock_enforce,
        mock_find_endpoint,
        mock_find_model,
        mock_stream_chat,
        mock_find_room,
        mock_save_content,
        mock_get_session_maker,
        test_user,
    ):
        """途中までtext_deltaを配信後に例外が発生した場合、例外メッセージで回答を上書きしないこと"""
        from app.core.llm_client import ChatStreamChunk
        from app.models.message import MessageContent, MessageContentStatus

        async def _raise_after_first_chunk(*args, **kwargs):
            yield ChatStreamChunk(text_delta="途中まで回答")
            raise RuntimeError("azure error")

        mock_find_message.return_value = _message()
        mock_find_assistant.return_value = _assistant()
        mock_find_endpoint.return_value = (_assistant_endpoint(), _tenant_endpoint())
        mock_find_model.return_value = _ai_model()
        mock_stream_chat.return_value = _raise_after_first_chunk()
        mock_save_content.return_value = MessageContent(
            id="content-1",
            tenant_id="tenant-1",
            message_id="msg-1",
            status=MessageContentStatus.ERROR,
            question="こんにちは",
            answer="途中まで回答",
        )
        mock_find_room.return_value = None

        mock_new_session = _mock_new_session()
        mock_session_maker = MagicMock(return_value=mock_new_session)
        mock_get_session_maker.return_value = mock_session_maker

        response = await MessageService.stream_message_content(
            "tenant-1", test_user, _request(), session=None
        )
        await _consume(response)

        saved_content = mock_save_content.await_args.args[0]
        assert saved_content.status == MessageContentStatus.ERROR
        assert saved_content.answer == "途中まで回答"

    @patch("app.services.message_service.get_session_maker")
    @patch("app.services.message_service.MessageContentRepository.save")
    @patch(
        "app.services.message_service.RoomRepository.find_by_id_and_tenant_id",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.AzureLlmChatClient.stream_chat")
    @patch(
        "app.services.message_service.AIModelRepository.find_by_endpoint_type_and_name",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.message_service.AssistantEndpointRepository.find_chat_endpoint",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.enforce_within_quota", new_callable=AsyncMock)
    @patch(
        "app.services.message_service.AssistantRepository.find_by_id_and_tenant_id",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.require_owned_room", new_callable=AsyncMock)
    @patch(
        "app.services.message_service.MessageRepository.find_by_tenant_id_and_id",
        new_callable=AsyncMock,
    )
    async def test_persists_content_and_usage_even_when_client_disconnects_mid_stream(
        self,
        mock_find_message,
        mock_require_owned_room,
        mock_find_assistant,
        mock_enforce,
        mock_find_endpoint,
        mock_find_model,
        mock_stream_chat,
        mock_find_room,
        mock_save_content,
        mock_get_session_maker,
        test_user,
    ):
        """クライアント切断でジェネレータがaclose()された場合でも、内容とトークン使用量を永続化すること"""
        from app.core.llm_client import ChatStreamChunk
        from app.models.message import MessageContent, MessageContentStatus

        async def _hang_after_first_chunk(*args, **kwargs):
            yield ChatStreamChunk(text_delta="途中まで")
            yield ChatStreamChunk(input_tokens=3, output_tokens=2)
            # クライアント切断を模すため、ここで無期限に待つ(aclose()でGeneratorExitが
            # 送出される想定の待機ポイント)。
            import asyncio

            await asyncio.Event().wait()

        mock_find_message.return_value = _message()
        mock_find_assistant.return_value = _assistant()
        mock_find_endpoint.return_value = (_assistant_endpoint(), _tenant_endpoint())
        mock_find_model.return_value = _ai_model()
        mock_stream_chat.return_value = _hang_after_first_chunk()
        mock_save_content.return_value = MessageContent(
            id="content-1",
            tenant_id="tenant-1",
            message_id="msg-1",
            status=MessageContentStatus.OK,
            question="こんにちは",
            answer="途中まで",
        )
        mock_find_room.return_value = None

        mock_new_session = _mock_new_session()
        mock_session_maker = MagicMock(return_value=mock_new_session)
        mock_get_session_maker.return_value = mock_session_maker

        response = await MessageService.stream_message_content(
            "tenant-1", test_user, _request(), session=None
        )
        agen = response.body_iterator
        # message_stopまで届く前に切断された状況を模すため、text_deltaイベントを
        # 1件読み進めた直後にaclose()し、GeneratorExitを送出させる。
        await agen.__anext__()
        await agen.aclose()

        # GeneratorExitはfinallyでの永続化を妨げないこと（try/exceptでは捕捉されない
        # BaseException派生のため、finallyへ確実に到達している必要がある）。
        mock_save_content.assert_awaited_once()
        saved_content = mock_save_content.await_args.args[0]
        assert saved_content.answer == "途中まで"


class TestStreamMessageContentCreateLibrary:
    """MessageService.stream_message_content のライブラリ生成(isCreateLibrary)モードのテスト"""

    def _library_prompt(self) -> MagicMock:
        return MagicMock(content="ライブラリ生成用システムプロンプト")

    @patch("app.services.message_service.get_session_maker")
    @patch(
        "app.services.message_service.LibraryRepository.save", new_callable=AsyncMock
    )
    @patch(
        "app.services.message_service.SystemPromptTemplateRepository.find_by_type",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.MessageContentRepository.save")
    @patch(
        "app.services.message_service.RoomRepository.find_by_id_and_tenant_id",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.AzureLlmChatClient.stream_chat")
    @patch(
        "app.services.message_service.AIModelRepository.find_by_endpoint_type_and_name",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.message_service.AssistantEndpointRepository.find_chat_endpoint",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.enforce_within_quota", new_callable=AsyncMock)
    @patch(
        "app.services.message_service.AssistantRepository.find_by_id_and_tenant_id",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.require_owned_room", new_callable=AsyncMock)
    @patch(
        "app.services.message_service.MessageRepository.find_by_tenant_id_and_id",
        new_callable=AsyncMock,
    )
    async def test_streams_library_title_and_content_delta_then_persists_library(
        self,
        mock_find_message,
        mock_require_owned_room,
        mock_find_assistant,
        mock_enforce,
        mock_find_endpoint,
        mock_find_model,
        mock_stream_chat,
        mock_find_room,
        mock_save_content,
        mock_find_prompt,
        mock_save_library,
        mock_get_session_maker,
        test_user,
    ):
        """isCreateLibrary=trueの場合、library_title_delta/library_content_deltaを配信しライブラリを永続化すること"""
        from app.core.llm_client import ChatStreamChunk
        from app.models.message import MessageContent, MessageContentStatus

        mock_find_message.return_value = _message()
        mock_find_assistant.return_value = _assistant()
        mock_find_endpoint.return_value = (_assistant_endpoint(), _tenant_endpoint())
        mock_find_model.return_value = _ai_model()
        mock_find_prompt.return_value = self._library_prompt()
        mock_stream_chat.return_value = _AsyncChunkIterator(
            [
                ChatStreamChunk(text_delta="<<<TITLE>>>\nタイトルA\n"),
                ChatStreamChunk(text_delta="<<<CONTENT>>>\n本文B\n"),
                ChatStreamChunk(text_delta="<<<COMMENT>>>\nコメントC"),
                ChatStreamChunk(input_tokens=10, output_tokens=5),
            ]
        )
        mock_save_content.return_value = MessageContent(
            id="content-1",
            tenant_id="tenant-1",
            message_id="msg-1",
            status=MessageContentStatus.OK,
            question="こんにちは",
            answer="コメントC",
        )
        mock_find_room.return_value = MagicMock(updated_at=None)

        mock_new_session = _mock_new_session()
        mock_session_maker = MagicMock(return_value=mock_new_session)
        mock_get_session_maker.return_value = mock_session_maker

        response = await MessageService.stream_message_content(
            "tenant-1", test_user, _request(isCreateLibrary=True), session=None
        )
        chunks = await _consume(response)
        body = b"".join(chunks).decode()

        assert "event: library_title_delta" in body
        assert '"text": "タイトルA' in body
        assert "event: library_content_delta" in body
        assert '"text": "本文B' in body
        assert "event: text_delta" in body
        assert '"text": "コメントC"' in body
        assert "event: message_stop" in body

        mock_save_library.assert_awaited_once()
        saved_library = mock_save_library.await_args.args[0]
        assert saved_library.title == "タイトルA"
        assert saved_library.content == "本文B"
        assert saved_library.tenant_id == "tenant-1"
        assert saved_library.message_id == "msg-1"

    @patch("app.services.message_service.get_session_maker")
    @patch(
        "app.services.message_service.LibraryRepository.save", new_callable=AsyncMock
    )
    @patch(
        "app.services.message_service.SystemPromptTemplateRepository.find_by_type",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.MessageContentRepository.save")
    @patch(
        "app.services.message_service.RoomRepository.find_by_id_and_tenant_id",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.AzureLlmChatClient.stream_chat")
    @patch(
        "app.services.message_service.AIModelRepository.find_by_endpoint_type_and_name",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.message_service.AssistantEndpointRepository.find_chat_endpoint",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.enforce_within_quota", new_callable=AsyncMock)
    @patch(
        "app.services.message_service.AssistantRepository.find_by_id_and_tenant_id",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.require_owned_room", new_callable=AsyncMock)
    @patch(
        "app.services.message_service.MessageRepository.find_by_tenant_id_and_id",
        new_callable=AsyncMock,
    )
    async def test_falls_back_to_default_title_when_title_empty(
        self,
        mock_find_message,
        mock_require_owned_room,
        mock_find_assistant,
        mock_enforce,
        mock_find_endpoint,
        mock_find_model,
        mock_stream_chat,
        mock_find_room,
        mock_save_content,
        mock_find_prompt,
        mock_save_library,
        mock_get_session_maker,
        test_user,
    ):
        """タイトルが空の場合、デフォルト値「ライブラリ」で永続化され案内文がtext_deltaで配信されること"""
        from app.core.llm_client import ChatStreamChunk
        from app.models.message import MessageContent, MessageContentStatus

        mock_find_message.return_value = _message()
        mock_find_assistant.return_value = _assistant()
        mock_find_endpoint.return_value = (_assistant_endpoint(), _tenant_endpoint())
        mock_find_model.return_value = _ai_model()
        mock_find_prompt.return_value = self._library_prompt()
        mock_stream_chat.return_value = _AsyncChunkIterator(
            [
                ChatStreamChunk(text_delta="<<<TITLE>>>\n<<<CONTENT>>>\n本文のみ"),
                ChatStreamChunk(input_tokens=10, output_tokens=5),
            ]
        )
        mock_save_content.return_value = MessageContent(
            id="content-1",
            tenant_id="tenant-1",
            message_id="msg-1",
            status=MessageContentStatus.OK,
            question="こんにちは",
            answer="「ライブラリ」を作成しました",
        )
        mock_find_room.return_value = MagicMock(updated_at=None)

        mock_new_session = _mock_new_session()
        mock_session_maker = MagicMock(return_value=mock_new_session)
        mock_get_session_maker.return_value = mock_session_maker

        response = await MessageService.stream_message_content(
            "tenant-1", test_user, _request(isCreateLibrary=True), session=None
        )
        chunks = await _consume(response)
        body = b"".join(chunks).decode()

        assert '"text": "「ライブラリ」を作成しました"' in body
        saved_library = mock_save_library.await_args.args[0]
        assert saved_library.title == "ライブラリ"

    @patch("app.services.message_service.get_session_maker")
    @patch(
        "app.services.message_service.LibraryRepository.save", new_callable=AsyncMock
    )
    @patch(
        "app.services.message_service.SystemPromptTemplateRepository.find_by_type",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.MessageContentRepository.save")
    @patch(
        "app.services.message_service.RoomRepository.find_by_id_and_tenant_id",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.AzureLlmChatClient.stream_chat")
    @patch(
        "app.services.message_service.AIModelRepository.find_by_endpoint_type_and_name",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.message_service.AssistantEndpointRepository.find_chat_endpoint",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.enforce_within_quota", new_callable=AsyncMock)
    @patch(
        "app.services.message_service.AssistantRepository.find_by_id_and_tenant_id",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.require_owned_room", new_callable=AsyncMock)
    @patch(
        "app.services.message_service.MessageRepository.find_by_tenant_id_and_id",
        new_callable=AsyncMock,
    )
    async def test_truncates_title_to_255_characters(
        self,
        mock_find_message,
        mock_require_owned_room,
        mock_find_assistant,
        mock_enforce,
        mock_find_endpoint,
        mock_find_model,
        mock_stream_chat,
        mock_find_room,
        mock_save_content,
        mock_find_prompt,
        mock_save_library,
        mock_get_session_maker,
        test_user,
    ):
        """タイトルが255文字を超える場合、255文字に切り詰められて永続化されること"""
        from app.core.llm_client import ChatStreamChunk
        from app.models.message import MessageContent, MessageContentStatus

        long_title = "あ" * 300
        mock_find_message.return_value = _message()
        mock_find_assistant.return_value = _assistant()
        mock_find_endpoint.return_value = (_assistant_endpoint(), _tenant_endpoint())
        mock_find_model.return_value = _ai_model()
        mock_find_prompt.return_value = self._library_prompt()
        mock_stream_chat.return_value = _AsyncChunkIterator(
            [
                ChatStreamChunk(
                    text_delta=f"<<<TITLE>>>\n{long_title}\n<<<CONTENT>>>\n本文"
                ),
                ChatStreamChunk(input_tokens=10, output_tokens=5),
            ]
        )
        mock_save_content.return_value = MessageContent(
            id="content-1",
            tenant_id="tenant-1",
            message_id="msg-1",
            status=MessageContentStatus.OK,
            question="こんにちは",
            answer="",
        )
        mock_find_room.return_value = MagicMock(updated_at=None)

        mock_new_session = _mock_new_session()
        mock_session_maker = MagicMock(return_value=mock_new_session)
        mock_get_session_maker.return_value = mock_session_maker

        response = await MessageService.stream_message_content(
            "tenant-1", test_user, _request(isCreateLibrary=True), session=None
        )
        await _consume(response)

        saved_library = mock_save_library.await_args.args[0]
        assert len(saved_library.title) == 255


class TestStreamMessageContentRag:
    """MessageService.stream_message_content のSAAS_RAG分岐のテスト"""

    @patch("app.services.message_service.require_owned_room", new_callable=AsyncMock)
    @patch(
        "app.services.message_service.MessageRepository.find_by_tenant_id_and_id",
        new_callable=AsyncMock,
    )
    async def test_raises_400_when_rag_assistant_has_no_index_id(
        self, mock_find_message, mock_require_owned_room, test_user
    ):
        """SAAS_RAGアシスタントにindex_idが紐付いていない場合400になること"""
        mock_find_message.return_value = _message()

        with (
            patch(
                "app.services.message_service.AssistantRepository.find_by_id_and_tenant_id",
                new_callable=AsyncMock,
            ) as mock_find_assistant,
            patch(
                "app.services.message_service.enforce_within_quota",
                new_callable=AsyncMock,
            ),
            patch(
                "app.services.message_service.AssistantEndpointRepository.find_chat_endpoint",
                new_callable=AsyncMock,
            ) as mock_find_endpoint,
            patch(
                "app.services.message_service.AIModelRepository.find_by_endpoint_type_and_name",
                new_callable=AsyncMock,
            ) as mock_find_model,
        ):
            mock_find_assistant.return_value = _rag_assistant(index_id=None)
            mock_find_endpoint.return_value = (
                _assistant_endpoint(),
                _tenant_endpoint(),
            )
            mock_find_model.return_value = _ai_model()

            with pytest.raises(HTTPException) as exc_info:
                await MessageService.stream_message_content(
                    "tenant-1", test_user, _request(), session=None
                )

        assert exc_info.value.status_code == 400

    @patch("app.services.message_service.require_owned_room", new_callable=AsyncMock)
    @patch(
        "app.services.message_service.MessageRepository.find_by_tenant_id_and_id",
        new_callable=AsyncMock,
    )
    async def test_raises_400_when_rag_index_not_found(
        self, mock_find_message, mock_require_owned_room, test_user
    ):
        """index_idはあるがインデックスが存在しない場合400になること"""
        mock_find_message.return_value = _message()

        with (
            patch(
                "app.services.message_service.AssistantRepository.find_by_id_and_tenant_id",
                new_callable=AsyncMock,
            ) as mock_find_assistant,
            patch(
                "app.services.message_service.enforce_within_quota",
                new_callable=AsyncMock,
            ),
            patch(
                "app.services.message_service.AssistantEndpointRepository.find_chat_endpoint",
                new_callable=AsyncMock,
            ) as mock_find_endpoint,
            patch(
                "app.services.message_service.AIModelRepository.find_by_endpoint_type_and_name",
                new_callable=AsyncMock,
            ) as mock_find_model,
            patch(
                "app.services.message_service.IndexRepository.find_by_id_and_tenant_id",
                new_callable=AsyncMock,
            ) as mock_find_index,
        ):
            mock_find_assistant.return_value = _rag_assistant()
            mock_find_endpoint.return_value = (
                _assistant_endpoint(),
                _tenant_endpoint(),
            )
            mock_find_model.return_value = _ai_model()
            mock_find_index.return_value = None

            with pytest.raises(HTTPException) as exc_info:
                await MessageService.stream_message_content(
                    "tenant-1", test_user, _request(), session=None
                )

        assert exc_info.value.status_code == 400

    @patch("app.services.message_service.require_owned_room", new_callable=AsyncMock)
    @patch(
        "app.services.message_service.MessageRepository.find_by_tenant_id_and_id",
        new_callable=AsyncMock,
    )
    async def test_raises_400_when_rag_embedding_endpoint_not_found(
        self, mock_find_message, mock_require_owned_room, test_user
    ):
        """インデックスに埋め込みタイプのエンドポイントが紐付いていない場合400になること"""
        mock_find_message.return_value = _message()

        with (
            patch(
                "app.services.message_service.AssistantRepository.find_by_id_and_tenant_id",
                new_callable=AsyncMock,
            ) as mock_find_assistant,
            patch(
                "app.services.message_service.enforce_within_quota",
                new_callable=AsyncMock,
            ),
            patch(
                "app.services.message_service.AssistantEndpointRepository.find_chat_endpoint",
                new_callable=AsyncMock,
            ) as mock_find_endpoint,
            patch(
                "app.services.message_service.AIModelRepository.find_by_endpoint_type_and_name",
                new_callable=AsyncMock,
            ) as mock_find_model,
            patch(
                "app.services.message_service.IndexRepository.find_by_id_and_tenant_id",
                new_callable=AsyncMock,
            ) as mock_find_index,
            patch(
                "app.services.message_service.IndexRepository"
                ".find_tenant_endpoints_grouped_by_index_ids",
                new_callable=AsyncMock,
            ) as mock_find_index_endpoints,
        ):
            mock_find_assistant.return_value = _rag_assistant()
            mock_find_endpoint.return_value = (
                _assistant_endpoint(),
                _tenant_endpoint(),
            )
            mock_find_model.return_value = _ai_model()
            mock_find_index.return_value = _index()
            mock_find_index_endpoints.return_value = {"index-1": []}

            with pytest.raises(HTTPException) as exc_info:
                await MessageService.stream_message_content(
                    "tenant-1", test_user, _request(), session=None
                )

        assert exc_info.value.status_code == 400

    @patch("app.services.message_service.require_owned_room", new_callable=AsyncMock)
    @patch(
        "app.services.message_service.MessageRepository.find_by_tenant_id_and_id",
        new_callable=AsyncMock,
    )
    async def test_raises_400_when_rag_vector_db_endpoint_not_found(
        self, mock_find_message, mock_require_owned_room, test_user
    ):
        """テナントにVDBタイプのエンドポイントが存在しない場合400になること"""
        mock_find_message.return_value = _message()

        with (
            patch(
                "app.services.message_service.AssistantRepository.find_by_id_and_tenant_id",
                new_callable=AsyncMock,
            ) as mock_find_assistant,
            patch(
                "app.services.message_service.enforce_within_quota",
                new_callable=AsyncMock,
            ),
            patch(
                "app.services.message_service.AssistantEndpointRepository.find_chat_endpoint",
                new_callable=AsyncMock,
            ) as mock_find_endpoint,
            patch(
                "app.services.message_service.AIModelRepository.find_by_endpoint_type_and_name",
                new_callable=AsyncMock,
            ) as mock_find_model,
            patch(
                "app.services.message_service.IndexRepository.find_by_id_and_tenant_id",
                new_callable=AsyncMock,
            ) as mock_find_index,
            patch(
                "app.services.message_service.IndexRepository"
                ".find_tenant_endpoints_grouped_by_index_ids",
                new_callable=AsyncMock,
            ) as mock_find_index_endpoints,
            patch(
                "app.services.message_service.TenantEndpointRepository"
                ".find_by_tenant_id_and_type",
                new_callable=AsyncMock,
            ) as mock_find_vdb_endpoints,
        ):
            mock_find_assistant.return_value = _rag_assistant()
            mock_find_endpoint.return_value = (
                _assistant_endpoint(),
                _tenant_endpoint(),
            )
            mock_find_model.return_value = _ai_model()
            mock_find_index.return_value = _index()
            mock_find_index_endpoints.return_value = {
                "index-1": [_embedding_endpoint()]
            }
            mock_find_vdb_endpoints.return_value = []

            with pytest.raises(HTTPException) as exc_info:
                await MessageService.stream_message_content(
                    "tenant-1", test_user, _request(), session=None
                )

        assert exc_info.value.status_code == 400

    @patch("app.services.message_service.require_owned_room", new_callable=AsyncMock)
    @patch(
        "app.services.message_service.MessageRepository.find_by_tenant_id_and_id",
        new_callable=AsyncMock,
    )
    async def test_raises_400_when_rag_embedding_creation_fails(
        self, mock_find_message, mock_require_owned_room, test_user
    ):
        """埋め込みAPI呼び出しが例外を送出した場合、500ではなく400になること"""
        mock_find_message.return_value = _message()

        with (
            patch(
                "app.services.message_service.AssistantRepository.find_by_id_and_tenant_id",
                new_callable=AsyncMock,
            ) as mock_find_assistant,
            patch(
                "app.services.message_service.enforce_within_quota",
                new_callable=AsyncMock,
            ),
            patch(
                "app.services.message_service.AssistantEndpointRepository.find_chat_endpoint",
                new_callable=AsyncMock,
            ) as mock_find_endpoint,
            patch(
                "app.services.message_service.AIModelRepository.find_by_endpoint_type_and_name",
                new_callable=AsyncMock,
            ) as mock_find_model,
            patch(
                "app.services.message_service.IndexRepository.find_by_id_and_tenant_id",
                new_callable=AsyncMock,
            ) as mock_find_index,
            patch(
                "app.services.message_service.IndexRepository"
                ".find_tenant_endpoints_grouped_by_index_ids",
                new_callable=AsyncMock,
            ) as mock_find_index_endpoints,
            patch(
                "app.services.message_service.TenantEndpointRepository"
                ".find_by_tenant_id_and_type",
                new_callable=AsyncMock,
            ) as mock_find_vdb_endpoints,
            patch(
                "app.services.message_service.AzureLlmEmbeddingClient.create_embedding",
                new_callable=AsyncMock,
            ) as mock_create_embedding,
        ):
            mock_find_assistant.return_value = _rag_assistant()
            mock_find_endpoint.return_value = (
                _assistant_endpoint(),
                _tenant_endpoint(),
            )
            mock_find_model.return_value = _ai_model()
            mock_find_index.return_value = _index()
            mock_find_index_endpoints.return_value = {
                "index-1": [_embedding_endpoint()]
            }
            mock_find_vdb_endpoints.return_value = [_vdb_endpoint()]
            mock_create_embedding.side_effect = RuntimeError("azure auth error")

            with pytest.raises(HTTPException) as exc_info:
                await MessageService.stream_message_content(
                    "tenant-1", test_user, _request(), session=None
                )

        assert exc_info.value.status_code == 400

    @patch("app.services.message_service.get_session_maker")
    @patch("app.services.message_service.MessageContentRepository.save")
    @patch(
        "app.services.message_service.RoomRepository.find_by_id_and_tenant_id",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.AzureLlmChatClient.stream_chat")
    @patch(
        "app.services.message_service.FileRepository.find_by_ids_and_tenant_id",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.message_service.AzureAiSearchVectorStoreClient.similarity_search",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.message_service.AzureLlmEmbeddingClient.create_embedding",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.message_service.TenantEndpointRepository"
        ".find_by_tenant_id_and_type",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.message_service.IndexRepository"
        ".find_tenant_endpoints_grouped_by_index_ids",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.message_service.IndexRepository.find_by_id_and_tenant_id",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.message_service.AIModelRepository.find_by_endpoint_type_and_name",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.message_service.AssistantEndpointRepository.find_chat_endpoint",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.enforce_within_quota", new_callable=AsyncMock)
    @patch(
        "app.services.message_service.AssistantRepository.find_by_id_and_tenant_id",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.require_owned_room", new_callable=AsyncMock)
    @patch(
        "app.services.message_service.MessageRepository.find_by_tenant_id_and_id",
        new_callable=AsyncMock,
    )
    async def test_rag_streams_with_context_from_vector_search(
        self,
        mock_find_message,
        mock_require_owned_room,
        mock_find_assistant,
        mock_enforce,
        mock_find_endpoint,
        mock_find_model,
        mock_find_index,
        mock_find_index_endpoints,
        mock_find_vdb_endpoints,
        mock_create_embedding,
        mock_similarity_search,
        mock_find_files,
        mock_stream_chat,
        mock_find_room,
        mock_save_content,
        mock_get_session_maker,
        test_user,
    ):
        """ベクトル検索結果からRAGコンテキストを構築し、システムメッセージ追加・永続化すること"""
        from app.core.llm_client import ChatStreamChunk
        from app.models.message import MessageContent, MessageContentStatus

        mock_find_message.return_value = _message()
        mock_find_assistant.return_value = _rag_assistant()
        mock_find_endpoint.return_value = (_assistant_endpoint(), _tenant_endpoint())

        def _find_model_side_effect(endpoint_type, name, session):
            if endpoint_type == AIModelEndpointType.AZURE_OPENAI_CHAT:
                return _ai_model()
            return _ai_model(name="text-embedding-ada-002", token_weight="2.0")

        mock_find_model.side_effect = _find_model_side_effect
        mock_find_index.return_value = _index()
        mock_find_index_endpoints.return_value = {"index-1": [_embedding_endpoint()]}
        mock_find_vdb_endpoints.return_value = [_vdb_endpoint()]
        mock_create_embedding.return_value = EmbeddingResult(
            embedding=[0.1, 0.2], tokens=7
        )
        mock_similarity_search.return_value = [
            VectorSearchResult(content="資料1", file_unique_id="f001"),
            VectorSearchResult(content="資料2", file_unique_id="f002"),
        ]
        mock_find_files.return_value = [
            _file("f001", reference="ref1.pdf"),
            _file("f002", reference="ref2.pdf"),
        ]
        mock_stream_chat.return_value = _AsyncChunkIterator(
            [
                ChatStreamChunk(text_delta="回答"),
                ChatStreamChunk(input_tokens=10, output_tokens=5),
            ]
        )
        mock_save_content.return_value = MessageContent(
            id="content-1",
            tenant_id="tenant-1",
            message_id="msg-1",
            status=MessageContentStatus.OK,
            question="こんにちは",
            answer="回答",
            context="資料1資料2",
            file_paths="ref1.pdf,ref2.pdf",
        )
        mock_find_room.return_value = MagicMock(updated_at=None)

        mock_new_session = _mock_new_session()
        mock_session_maker = MagicMock(return_value=mock_new_session)
        mock_get_session_maker.return_value = mock_session_maker

        response = await MessageService.stream_message_content(
            "tenant-1", test_user, _request(), session=None
        )
        await _consume(response)

        # ベクトル検索(Azure AI Search)にはVDB接続情報が属するテナントID
        # (`vdb.tenant_id`)がインデックス名として渡されること。
        mock_similarity_search.assert_awaited_once()
        assert mock_similarity_search.await_args.args[2] == "tenant-1"

        # チャットへの会話履歴の先頭に、区切り文字なしで連結したRAGコンテキストを
        # 含むシステムメッセージが追加されていること。
        chat_messages_arg = mock_stream_chat.call_args.args[3]
        assert chat_messages_arg[0].role == "system"
        assert "資料1資料2" in chat_messages_arg[0].content

        saved_content = mock_save_content.await_args.args[0]
        assert saved_content.context == "資料1資料2"
        assert saved_content.file_paths == "ref1.pdf,ref2.pdf"

        # 埋め込みトークン数・埋め込みcredit(token_weight=2.0のため ceil(7*2.0/1000)=1)
        # が TokenUsage として永続化されること。
        added_objects = [call.args[0] for call in mock_new_session.add.call_args_list]
        token_usages = [obj for obj in added_objects if isinstance(obj, TokenUsage)]
        assert len(token_usages) == 1
        assert token_usages[0].embedding_tokens == 7
        assert token_usages[0].embedding_credits == 1

    @patch("app.services.message_service.get_session_maker")
    @patch("app.services.message_service.MessageContentRepository.save")
    @patch(
        "app.services.message_service.RoomRepository.find_by_id_and_tenant_id",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.AzureLlmChatClient.stream_chat")
    @patch(
        "app.services.message_service.FileRepository.find_by_ids_and_tenant_id",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.message_service.AzureAiSearchVectorStoreClient.similarity_search",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.message_service.AzureLlmEmbeddingClient.create_embedding",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.message_service.TenantEndpointRepository"
        ".find_by_tenant_id_and_type",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.message_service.IndexRepository"
        ".find_tenant_endpoints_grouped_by_index_ids",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.message_service.IndexRepository.find_by_id_and_tenant_id",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.message_service.AIModelRepository.find_by_endpoint_type_and_name",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.message_service.AssistantEndpointRepository.find_chat_endpoint",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.enforce_within_quota", new_callable=AsyncMock)
    @patch(
        "app.services.message_service.AssistantRepository.find_by_id_and_tenant_id",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.require_owned_room", new_callable=AsyncMock)
    @patch(
        "app.services.message_service.MessageRepository.find_by_tenant_id_and_id",
        new_callable=AsyncMock,
    )
    async def test_passes_tools_to_llm_client_for_saas_rag(
        self,
        mock_find_message,
        mock_require_owned_room,
        mock_find_assistant,
        mock_enforce,
        mock_find_endpoint,
        mock_find_model,
        mock_find_index,
        mock_find_index_endpoints,
        mock_find_vdb_endpoints,
        mock_create_embedding,
        mock_similarity_search,
        mock_find_files,
        mock_stream_chat,
        mock_find_room,
        mock_save_content,
        mock_get_session_maker,
        test_user,
    ):
        """SAAS_RAGでtoolsを指定した場合、AzureLlmChatClient.stream_chatへ変換済みtoolsが渡ること"""
        from app.models.message import MessageContent, MessageContentStatus
        from app.schemas.message import ToolConfig

        def _find_model_side_effect(endpoint_type, name, session):
            if endpoint_type == AIModelEndpointType.AZURE_OPENAI_CHAT:
                return _ai_model()
            return _ai_model(name="text-embedding-ada-002", token_weight="2.0")

        mock_find_message.return_value = _message()
        mock_find_assistant.return_value = _rag_assistant()
        mock_find_endpoint.return_value = (_assistant_endpoint(), _tenant_endpoint())
        mock_find_model.side_effect = _find_model_side_effect
        mock_find_index.return_value = _index()
        mock_find_index_endpoints.return_value = {"index-1": [_embedding_endpoint()]}
        mock_find_vdb_endpoints.return_value = [_vdb_endpoint()]
        mock_create_embedding.return_value = EmbeddingResult(
            embedding=[0.1, 0.2], tokens=7
        )
        mock_similarity_search.return_value = []
        mock_find_files.return_value = []
        mock_stream_chat.return_value = _AsyncChunkIterator([])
        mock_save_content.return_value = MessageContent(
            id="content-1",
            tenant_id="tenant-1",
            message_id="msg-1",
            status=MessageContentStatus.OK,
            question="こんにちは",
            answer="",
        )
        mock_find_room.return_value = MagicMock(updated_at=None)

        mock_new_session = _mock_new_session()
        mock_session_maker = MagicMock(return_value=mock_new_session)
        mock_get_session_maker.return_value = mock_session_maker

        response = await MessageService.stream_message_content(
            "tenant-1",
            test_user,
            _request(tools=[ToolConfig(name="web_search")]),
            session=None,
        )
        await _consume(response)

        args, _ = mock_stream_chat.call_args
        passed_tools = args[6]
        assert passed_tools is not None
        assert len(passed_tools) == 1
        assert passed_tools[0].name == "web_search"

    @patch("app.services.message_service.get_session_maker")
    @patch("app.services.message_service.MessageContentRepository.save")
    @patch(
        "app.services.message_service.RoomRepository.find_by_id_and_tenant_id",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.AzureLlmChatClient.stream_chat")
    @patch(
        "app.services.message_service.FileRepository.find_by_ids_and_tenant_id",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.message_service.AzureAiSearchVectorStoreClient.similarity_search",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.message_service.AzureLlmEmbeddingClient.create_embedding",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.message_service.TenantEndpointRepository"
        ".find_by_tenant_id_and_type",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.message_service.IndexRepository"
        ".find_tenant_endpoints_grouped_by_index_ids",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.message_service.IndexRepository.find_by_id_and_tenant_id",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.message_service.AIModelRepository.find_by_endpoint_type_and_name",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.message_service.AssistantEndpointRepository.find_chat_endpoint",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.enforce_within_quota", new_callable=AsyncMock)
    @patch(
        "app.services.message_service.AssistantRepository.find_by_id_and_tenant_id",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.require_owned_room", new_callable=AsyncMock)
    @patch(
        "app.services.message_service.MessageRepository.find_by_tenant_id_and_id",
        new_callable=AsyncMock,
    )
    async def test_json_response_instruction_precedes_rag_context_message(
        self,
        mock_find_message,
        mock_require_owned_room,
        mock_find_assistant,
        mock_enforce,
        mock_find_endpoint,
        mock_find_model,
        mock_find_index,
        mock_find_index_endpoints,
        mock_find_vdb_endpoints,
        mock_create_embedding,
        mock_similarity_search,
        mock_find_files,
        mock_stream_chat,
        mock_find_room,
        mock_save_content,
        mock_get_session_maker,
        test_user,
    ):
        """SAAS_RAGでresponseFormat指定時、JSON指示のsystemメッセージがRAGコンテキストの
        systemメッセージより先頭に来ること"""
        from app.core.llm_client import ChatStreamChunk
        from app.models.message import MessageContent, MessageContentStatus

        def _find_model_side_effect(endpoint_type, name, session):
            if endpoint_type == AIModelEndpointType.AZURE_OPENAI_CHAT:
                return _ai_model()
            return _ai_model(name="text-embedding-ada-002", token_weight="2.0")

        mock_find_message.return_value = _message()
        mock_find_assistant.return_value = _rag_assistant()
        mock_find_endpoint.return_value = (_assistant_endpoint(), _tenant_endpoint())
        mock_find_model.side_effect = _find_model_side_effect
        mock_find_index.return_value = _index()
        mock_find_index_endpoints.return_value = {"index-1": [_embedding_endpoint()]}
        mock_find_vdb_endpoints.return_value = [_vdb_endpoint()]
        mock_create_embedding.return_value = EmbeddingResult(
            embedding=[0.1, 0.2], tokens=7
        )
        mock_similarity_search.return_value = [
            VectorSearchResult(content="資料1", file_unique_id="f001"),
        ]
        mock_find_files.return_value = [_file("f001", reference="ref1.pdf")]
        mock_stream_chat.return_value = _AsyncChunkIterator(
            [ChatStreamChunk(text_delta="回答")]
        )
        mock_save_content.return_value = MessageContent(
            id="content-1",
            tenant_id="tenant-1",
            message_id="msg-1",
            status=MessageContentStatus.OK,
            question="こんにちは",
            answer="回答",
            context="資料1",
            file_paths="ref1.pdf",
        )
        mock_find_room.return_value = MagicMock(updated_at=None)

        mock_new_session = _mock_new_session()
        mock_session_maker = MagicMock(return_value=mock_new_session)
        mock_get_session_maker.return_value = mock_session_maker

        response = await MessageService.stream_message_content(
            "tenant-1",
            test_user,
            _request(responseFormat={"type": "json_object"}),
            session=None,
        )
        await _consume(response)

        chat_messages_arg = mock_stream_chat.call_args.args[3]
        assert chat_messages_arg[0] == ChatMessage(
            role="system", content="回答は JSON 形式で出力してください。"
        )
        assert chat_messages_arg[1].role == "system"
        assert "資料1" in chat_messages_arg[1].content
        assert mock_stream_chat.call_args.args[7] == {"type": "json_object"}

    @patch("app.services.message_service.get_session_maker")
    @patch("app.services.message_service.MessageContentRepository.save")
    @patch(
        "app.services.message_service.RoomRepository.find_by_id_and_tenant_id",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.AzureLlmChatClient.stream_chat")
    @patch(
        "app.services.message_service.FileRepository.find_by_ids_and_tenant_id",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.message_service.AzureAiSearchVectorStoreClient.similarity_search",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.message_service.AzureLlmEmbeddingClient.create_embedding",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.message_service.TenantEndpointRepository"
        ".find_by_tenant_id_and_type",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.message_service.IndexRepository"
        ".find_tenant_endpoints_grouped_by_index_ids",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.message_service.IndexRepository.find_by_id_and_tenant_id",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.message_service.AIModelRepository.find_by_endpoint_type_and_name",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.message_service.AssistantEndpointRepository.find_chat_endpoint",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.enforce_within_quota", new_callable=AsyncMock)
    @patch(
        "app.services.message_service.AssistantRepository.find_by_id_and_tenant_id",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.require_owned_room", new_callable=AsyncMock)
    @patch(
        "app.services.message_service.MessageRepository.find_by_tenant_id_and_id",
        new_callable=AsyncMock,
    )
    async def test_rag_skips_files_not_found_in_tenant(
        self,
        mock_find_message,
        mock_require_owned_room,
        mock_find_assistant,
        mock_enforce,
        mock_find_endpoint,
        mock_find_model,
        mock_find_index,
        mock_find_index_endpoints,
        mock_find_vdb_endpoints,
        mock_create_embedding,
        mock_similarity_search,
        mock_find_files,
        mock_stream_chat,
        mock_find_room,
        mock_save_content,
        mock_get_session_maker,
        test_user,
    ):
        """検索結果の一部がテナント内に存在しないファイルの場合、コンテキストに反映されないこと"""
        from app.core.llm_client import ChatStreamChunk
        from app.models.message import MessageContent, MessageContentStatus

        mock_find_message.return_value = _message()
        mock_find_assistant.return_value = _rag_assistant()
        mock_find_endpoint.return_value = (_assistant_endpoint(), _tenant_endpoint())
        mock_find_model.return_value = _ai_model()
        mock_find_index.return_value = _index()
        mock_find_index_endpoints.return_value = {"index-1": [_embedding_endpoint()]}
        mock_find_vdb_endpoints.return_value = [_vdb_endpoint()]
        mock_create_embedding.return_value = EmbeddingResult(
            embedding=[0.1, 0.2], tokens=3
        )
        mock_similarity_search.return_value = [
            VectorSearchResult(content="資料1", file_unique_id="f001"),
            VectorSearchResult(content="資料2(未解決)", file_unique_id="f999"),
        ]
        # f999はテナント内に存在しないため、find_by_ids_and_tenant_idの戻り値に含めない。
        mock_find_files.return_value = [_file("f001", reference="ref1.pdf")]
        mock_stream_chat.return_value = _AsyncChunkIterator(
            [ChatStreamChunk(input_tokens=1, output_tokens=1)]
        )
        mock_save_content.return_value = MessageContent(
            id="content-1",
            tenant_id="tenant-1",
            message_id="msg-1",
            status=MessageContentStatus.OK,
            question="こんにちは",
            answer="",
            context="資料1",
            file_paths="ref1.pdf",
        )
        mock_find_room.return_value = None

        mock_new_session = _mock_new_session()
        mock_session_maker = MagicMock(return_value=mock_new_session)
        mock_get_session_maker.return_value = mock_session_maker

        response = await MessageService.stream_message_content(
            "tenant-1", test_user, _request(), session=None
        )
        await _consume(response)

        saved_content = mock_save_content.await_args.args[0]
        assert saved_content.context == "資料1"
        assert saved_content.file_paths == "ref1.pdf"

    @patch("app.services.message_service.get_session_maker")
    @patch("app.services.message_service.MessageContentRepository.save")
    @patch(
        "app.services.message_service.RoomRepository.find_by_id_and_tenant_id",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.AzureLlmChatClient.stream_chat")
    @patch(
        "app.services.message_service.FileRepository.find_by_ids_and_tenant_id",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.message_service.AzureAiSearchVectorStoreClient.similarity_search",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.message_service.AzureLlmEmbeddingClient.create_embedding",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.message_service.TenantEndpointRepository"
        ".find_by_tenant_id_and_type",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.message_service.IndexRepository"
        ".find_tenant_endpoints_grouped_by_index_ids",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.message_service.IndexRepository.find_by_id_and_tenant_id",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.message_service.AIModelRepository.find_by_endpoint_type_and_name",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.message_service.AssistantEndpointRepository.find_chat_endpoint",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.enforce_within_quota", new_callable=AsyncMock)
    @patch(
        "app.services.message_service.AssistantRepository.find_by_id_and_tenant_id",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.require_owned_room", new_callable=AsyncMock)
    @patch(
        "app.services.message_service.MessageRepository.find_by_tenant_id_and_id",
        new_callable=AsyncMock,
    )
    async def test_rag_no_system_message_when_search_returns_empty(
        self,
        mock_find_message,
        mock_require_owned_room,
        mock_find_assistant,
        mock_enforce,
        mock_find_endpoint,
        mock_find_model,
        mock_find_index,
        mock_find_index_endpoints,
        mock_find_vdb_endpoints,
        mock_create_embedding,
        mock_similarity_search,
        mock_find_files,
        mock_stream_chat,
        mock_find_room,
        mock_save_content,
        mock_get_session_maker,
        test_user,
    ):
        """ベクトル検索結果が空の場合、RAGシステムメッセージを追加しないこと"""
        from app.core.llm_client import ChatStreamChunk
        from app.models.message import MessageContent, MessageContentStatus

        mock_find_message.return_value = _message()
        mock_find_assistant.return_value = _rag_assistant()
        mock_find_endpoint.return_value = (_assistant_endpoint(), _tenant_endpoint())
        mock_find_model.return_value = _ai_model()
        mock_find_index.return_value = _index()
        mock_find_index_endpoints.return_value = {"index-1": [_embedding_endpoint()]}
        mock_find_vdb_endpoints.return_value = [_vdb_endpoint()]
        mock_create_embedding.return_value = EmbeddingResult(
            embedding=[0.1, 0.2], tokens=2
        )
        mock_similarity_search.return_value = []
        mock_find_files.return_value = []
        mock_stream_chat.return_value = _AsyncChunkIterator(
            [
                ChatStreamChunk(text_delta="回答"),
                ChatStreamChunk(input_tokens=1, output_tokens=1),
            ]
        )
        mock_save_content.return_value = MessageContent(
            id="content-1",
            tenant_id="tenant-1",
            message_id="msg-1",
            status=MessageContentStatus.OK,
            question="こんにちは",
            answer="回答",
        )
        mock_find_room.return_value = None

        mock_new_session = _mock_new_session()
        mock_session_maker = MagicMock(return_value=mock_new_session)
        mock_get_session_maker.return_value = mock_session_maker

        response = await MessageService.stream_message_content(
            "tenant-1", test_user, _request(), session=None
        )
        await _consume(response)

        chat_messages_arg = mock_stream_chat.call_args.args[3]
        assert chat_messages_arg[0].role == "user"

        saved_content = mock_save_content.await_args.args[0]
        assert saved_content.context is None
        assert saved_content.file_paths is None


class TestApplyAdditionalPrompt:
    """message_service._apply_additional_prompt のテスト"""

    def test_returns_as_is_when_no_additional_prompt(self):
        """additionalPrompt未指定ならそのまま返すこと"""
        messages = [ChatMessage(role="user", content="こんにちは")]
        assert _apply_additional_prompt(messages, None) == messages

    def test_prepends_to_last_user_turn(self):
        """末尾がuserロールの場合、その発話に前置すること"""
        messages = [
            ChatMessage(role="system", content="system prompt"),
            ChatMessage(role="user", content="質問1"),
        ]
        result = _apply_additional_prompt(messages, "追加指示")

        assert result[0] == messages[0]
        assert result[1] == ChatMessage(role="user", content="追加指示\n\n質問1")

    def test_skips_trailing_non_user_turns_to_find_last_user_turn(self):
        """末尾がuser以外のロールでも、遡って最後のuser発話に前置すること"""
        messages = [
            ChatMessage(role="user", content="質問1"),
            ChatMessage(role="assistant", content="回答1"),
        ]
        result = _apply_additional_prompt(messages, "追加指示")

        assert result[0] == ChatMessage(role="user", content="追加指示\n\n質問1")
        assert result[1] == messages[1]

    def test_returns_as_is_when_no_user_turn_exists(self):
        """user発話が存在しない場合は何もしないこと"""
        messages = [ChatMessage(role="assistant", content="回答のみ")]
        assert _apply_additional_prompt(messages, "追加指示") == messages


class TestMessageContentCreateRequestHistory:
    """MessageContentHistoryTurn を含むリクエストの組み立て確認"""

    def test_history_messages_default_to_empty_list(self):
        """historyMessages省略時は空リストになること"""
        req = MessageContentCreateRequest(messageId="msg-1", userInput="質問")
        assert req.historyMessages == []

    def test_history_messages_are_parsed(self):
        """historyMessagesが指定通りパースされること"""
        req = MessageContentCreateRequest(
            messageId="msg-1",
            userInput="質問",
            historyMessages=[
                MessageContentHistoryTurn(role="user", content="過去の質問")
            ],
        )
        assert req.historyMessages[0].role == "user"
        assert req.historyMessages[0].content == "過去の質問"


class TestMessageContentCreateRequestAttachmentFiles:
    """MessageContentCreateRequest の attachmentFiles/historyAttachmentFiles 検証"""

    def _file(self, name: str = "a.png") -> AttachmentFile:
        return AttachmentFile(name=name, type="image/png", data=b"data")

    def test_attachment_files_default_to_empty_list(self):
        """attachmentFiles/historyAttachmentFiles省略時は空リストになること"""
        req = MessageContentCreateRequest(messageId="msg-1", userInput="質問")
        assert req.attachmentFiles == []
        assert req.historyAttachmentFiles == []

    def test_accepts_when_history_attachment_count_matches(self):
        """historyAttachmentFilesの件数がattachmentsCount合計と一致する場合、正常にパースされること"""
        req = MessageContentCreateRequest(
            messageId="msg-1",
            userInput="質問",
            historyMessages=[
                MessageContentHistoryTurn(
                    role="user", content="過去の質問", attachmentsCount=2
                )
            ],
            historyAttachmentFiles=[self._file("a.png"), self._file("b.png")],
        )
        assert len(req.historyAttachmentFiles) == 2

    def test_raises_when_history_attachment_count_mismatches(self):
        """historyAttachmentFilesの件数がattachmentsCount合計と一致しない場合エラーになること"""
        with pytest.raises(ValidationError):
            MessageContentCreateRequest(
                messageId="msg-1",
                userInput="質問",
                historyMessages=[
                    MessageContentHistoryTurn(
                        role="user", content="過去の質問", attachmentsCount=2
                    )
                ],
                historyAttachmentFiles=[self._file("a.png")],
            )


class TestApplyAttachmentFiles:
    """message_service._apply_attachment_files のテスト"""

    def _file(
        self, name: str = "photo.png", content_type: str = "image/png"
    ) -> AttachmentFile:
        return AttachmentFile(name=name, type=content_type, data=b"data")

    def test_returns_as_is_when_no_files(self):
        """添付ファイルがない場合そのまま返すこと"""
        messages = [ChatMessage(role="user", content="こんにちは")]
        assert _apply_attachment_files(messages, []) == messages

    def test_converts_last_user_turn_content_to_multimodal_list(self):
        """末尾のuser発話のcontentがマルチモーダル形式に変換されること"""
        messages = [
            ChatMessage(role="assistant", content="回答1"),
            ChatMessage(role="user", content="質問2"),
        ]
        result = _apply_attachment_files(messages, [self._file()])

        assert result[0] == messages[0]
        assert isinstance(result[1].content, list)
        assert result[1].content[0] == {"type": "text", "text": "質問2"}

    def test_returns_as_is_when_no_user_turn_exists(self):
        """user発話が存在しない場合は何もしないこと"""
        messages = [ChatMessage(role="assistant", content="回答のみ")]
        assert _apply_attachment_files(messages, [self._file()]) == messages


class TestStreamMessageContentWithAttachmentFiles:
    """MessageService.stream_message_content の添付ファイル関連テスト"""

    @patch("app.services.message_service.get_session_maker")
    @patch(
        "app.services.message_service.MessageContentRepository.save_attachment_files"
    )
    @patch("app.services.message_service.MessageContentRepository.save")
    @patch(
        "app.services.message_service.RoomRepository.find_by_id_and_tenant_id",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.AzureLlmChatClient.stream_chat")
    @patch(
        "app.services.message_service.AIModelRepository.find_by_endpoint_type_and_name",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.message_service.AssistantEndpointRepository.find_chat_endpoint",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.enforce_within_quota", new_callable=AsyncMock)
    @patch(
        "app.services.message_service.AssistantRepository.find_by_id_and_tenant_id",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.require_owned_room", new_callable=AsyncMock)
    @patch(
        "app.services.message_service.MessageRepository.find_by_tenant_id_and_id",
        new_callable=AsyncMock,
    )
    async def test_persists_attachment_files_and_reflects_them_in_complete_event(
        self,
        mock_find_message,
        mock_require_owned_room,
        mock_find_assistant,
        mock_enforce,
        mock_find_endpoint,
        mock_find_model,
        mock_stream_chat,
        mock_find_room,
        mock_save_content,
        mock_save_attachment_files,
        mock_get_session_maker,
        test_user,
    ):
        """attachmentFilesを含むリクエストの場合、MessageFileを保存しcompleteイベントに反映すること"""
        from app.core.llm_client import ChatStreamChunk
        from app.models.message import MessageContent, MessageContentStatus, MessageFile

        mock_find_message.return_value = _message()
        mock_find_assistant.return_value = _assistant()
        mock_find_endpoint.return_value = (_assistant_endpoint(), _tenant_endpoint())
        mock_find_model.return_value = _ai_model()
        mock_stream_chat.return_value = _AsyncChunkIterator(
            [
                ChatStreamChunk(text_delta="回答"),
                ChatStreamChunk(input_tokens=1, output_tokens=1),
            ]
        )
        mock_save_content.return_value = MessageContent(
            id="content-1",
            tenant_id="tenant-1",
            message_id="msg-1",
            status=MessageContentStatus.OK,
            question="こんにちは",
            answer="回答",
        )
        mock_save_attachment_files.return_value = [
            MessageFile(
                id="file-1",
                tenant_id="tenant-1",
                name="a.png",
                type="image/png",
                data=b"data",
                message_id="content-1",
            )
        ]
        mock_find_room.return_value = MagicMock(updated_at=None)

        mock_new_session = _mock_new_session()
        mock_session_maker = MagicMock(return_value=mock_new_session)
        mock_get_session_maker.return_value = mock_session_maker

        req = _request(
            attachmentFiles=[
                AttachmentFile(name="a.png", type="image/png", data=b"data")
            ]
        )
        response = await MessageService.stream_message_content(
            "tenant-1", test_user, req, session=None
        )
        body = b"".join(await _consume(response)).decode()

        mock_save_attachment_files.assert_awaited_once()
        saved_files_arg = mock_save_attachment_files.await_args.args[0]
        assert len(saved_files_arg) == 1
        assert saved_files_arg[0].name == "a.png"
        assert saved_files_arg[0].message_id == "content-1"
        assert '"name": "a.png"' in body

    @patch("app.services.message_service.get_session_maker")
    @patch(
        "app.services.message_service.MessageContentRepository.save_attachment_files"
    )
    @patch("app.services.message_service.MessageContentRepository.save")
    @patch(
        "app.services.message_service.RoomRepository.find_by_id_and_tenant_id",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.AzureLlmChatClient.stream_chat")
    @patch(
        "app.services.message_service.AIModelRepository.find_by_endpoint_type_and_name",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.message_service.AssistantEndpointRepository.find_chat_endpoint",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.enforce_within_quota", new_callable=AsyncMock)
    @patch(
        "app.services.message_service.AssistantRepository.find_by_id_and_tenant_id",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.require_owned_room", new_callable=AsyncMock)
    @patch(
        "app.services.message_service.MessageRepository.find_by_tenant_id_and_id",
        new_callable=AsyncMock,
    )
    async def test_does_not_save_attachment_files_when_none_provided(
        self,
        mock_find_message,
        mock_require_owned_room,
        mock_find_assistant,
        mock_enforce,
        mock_find_endpoint,
        mock_find_model,
        mock_stream_chat,
        mock_find_room,
        mock_save_content,
        mock_save_attachment_files,
        mock_get_session_maker,
        test_user,
    ):
        """attachmentFilesが空の場合、save_attachment_filesを呼ばずattachmentFiles=[]で永続化すること"""
        from app.core.llm_client import ChatStreamChunk
        from app.models.message import MessageContent, MessageContentStatus

        mock_find_message.return_value = _message()
        mock_find_assistant.return_value = _assistant()
        mock_find_endpoint.return_value = (_assistant_endpoint(), _tenant_endpoint())
        mock_find_model.return_value = _ai_model()
        mock_stream_chat.return_value = _AsyncChunkIterator(
            [
                ChatStreamChunk(text_delta="回答"),
                ChatStreamChunk(input_tokens=1, output_tokens=1),
            ]
        )
        mock_save_content.return_value = MessageContent(
            id="content-1",
            tenant_id="tenant-1",
            message_id="msg-1",
            status=MessageContentStatus.OK,
            question="こんにちは",
            answer="回答",
        )
        mock_find_room.return_value = MagicMock(updated_at=None)

        mock_new_session = _mock_new_session()
        mock_session_maker = MagicMock(return_value=mock_new_session)
        mock_get_session_maker.return_value = mock_session_maker

        response = await MessageService.stream_message_content(
            "tenant-1", test_user, _request(), session=None
        )
        body = b"".join(await _consume(response)).decode()

        mock_save_attachment_files.assert_not_awaited()
        assert '"attachmentFiles": []' in body

    @patch("app.services.message_service.get_session_maker")
    @patch(
        "app.services.message_service.MessageContentRepository.save_attachment_files"
    )
    @patch("app.services.message_service.MessageContentRepository.save")
    @patch(
        "app.services.message_service.RoomRepository.find_by_id_and_tenant_id",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.AzureLlmChatClient.stream_chat")
    @patch(
        "app.services.message_service.AIModelRepository.find_by_endpoint_type_and_name",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.message_service.AssistantEndpointRepository.find_chat_endpoint",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.enforce_within_quota", new_callable=AsyncMock)
    @patch(
        "app.services.message_service.AssistantRepository.find_by_id_and_tenant_id",
        new_callable=AsyncMock,
    )
    @patch("app.services.message_service.require_owned_room", new_callable=AsyncMock)
    @patch(
        "app.services.message_service.MessageRepository.find_by_tenant_id_and_id",
        new_callable=AsyncMock,
    )
    async def test_persists_token_usage_and_emits_complete_even_when_attachment_save_fails(
        self,
        mock_find_message,
        mock_require_owned_room,
        mock_find_assistant,
        mock_enforce,
        mock_find_endpoint,
        mock_find_model,
        mock_stream_chat,
        mock_find_room,
        mock_save_content,
        mock_save_attachment_files,
        mock_get_session_maker,
        test_user,
    ):
        """添付ファイルの永続化が失敗しても、トークン使用量の永続化とcompleteイベント送出は行われること"""
        from app.core.llm_client import ChatStreamChunk
        from app.models.message import MessageContent, MessageContentStatus

        mock_find_message.return_value = _message()
        mock_find_assistant.return_value = _assistant()
        mock_find_endpoint.return_value = (_assistant_endpoint(), _tenant_endpoint())
        mock_find_model.return_value = _ai_model()
        mock_stream_chat.return_value = _AsyncChunkIterator(
            [
                ChatStreamChunk(text_delta="回答"),
                ChatStreamChunk(input_tokens=10, output_tokens=5),
            ]
        )
        mock_save_content.return_value = MessageContent(
            id="content-1",
            tenant_id="tenant-1",
            message_id="msg-1",
            status=MessageContentStatus.OK,
            question="こんにちは",
            answer="回答",
        )
        mock_save_attachment_files.side_effect = RuntimeError("db error")
        mock_find_room.return_value = MagicMock(updated_at=None)

        mock_new_session = _mock_new_session()
        mock_session_maker = MagicMock(return_value=mock_new_session)
        mock_get_session_maker.return_value = mock_session_maker

        req = _request(
            attachmentFiles=[
                AttachmentFile(name="a.png", type="image/png", data=b"data")
            ]
        )
        response = await MessageService.stream_message_content(
            "tenant-1", test_user, req, session=None
        )
        body = b"".join(await _consume(response)).decode()

        mock_save_attachment_files.assert_awaited_once()
        mock_new_session.rollback.assert_awaited_once()
        # 添付ファイル保存失敗後もRoom更新・completeイベント送出まで到達すること
        assert "event: complete" in body
        assert '"attachmentFiles": []' in body
