from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.core.llm_client import ChatMessage
from app.models.ai_model import AIModel, AIModelEndpointType
from app.models.assistant import Assistant, AssistantEndpoint, AssistantType
from app.models.tenant_endpoint import EndpointType, TenantEndpoint
from app.schemas.message import MessageContentCreateRequest, MessageContentHistoryTurn
from app.services.message_service import MessageService, _apply_additional_prompt


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
    async def test_raises_400_when_assistant_type_is_not_saas_chat(
        self,
        mock_find_message,
        mock_require_owned_room,
        mock_find_assistant,
        test_user,
    ):
        """アシスタント種別がSAAS_CHAT以外の場合400になること"""
        mock_find_message.return_value = _message()
        mock_find_assistant.return_value = _assistant(AssistantType.SAAS_RAG)

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
            answer="azure error",
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
        assert saved_content.answer == "azure error"


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
