from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.models.ai_model import AIModel, AIModelEndpointType
from app.models.tenant_endpoint import EndpointType, TenantEndpoint
from app.schemas.llm import LlmChatRequest, LlmChatTurn
from app.services.llm_chat_service import LlmChatService


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


def _request(**overrides) -> LlmChatRequest:
    defaults = {
        "deployName": "gpt-4o",
        "messages": [LlmChatTurn(role="user", content="こんにちは")],
    }
    defaults.update(overrides)
    return LlmChatRequest(**defaults)


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


class TestStreamChat:
    """LlmChatService.stream_chat のテスト"""

    @patch("app.services.llm_chat_service.enforce_within_quota", new_callable=AsyncMock)
    @patch(
        "app.services.llm_chat_service.AIModelRepository.find_by_endpoint_type_and_name",
        new_callable=AsyncMock,
    )
    async def test_raises_400_when_ai_model_not_found(
        self, mock_find_model, mock_enforce, test_user
    ):
        """指定deployNameのAIモデルが存在しない場合400になること"""
        mock_find_model.return_value = None

        with pytest.raises(HTTPException) as exc_info:
            await LlmChatService.stream_chat(
                "tenant-1", test_user, _request(), session=None
            )

        assert exc_info.value.status_code == 400

    @patch("app.services.llm_chat_service.enforce_within_quota", new_callable=AsyncMock)
    @patch(
        "app.services.llm_chat_service.TenantEndpointRepository.find_by_tenant_id_and_type",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.llm_chat_service.AIModelRepository.find_by_endpoint_type_and_name",
        new_callable=AsyncMock,
    )
    async def test_raises_400_when_no_tenant_endpoint(
        self, mock_find_model, mock_find_endpoints, mock_enforce, test_user
    ):
        """テナントにAzure OpenAI Chatエンドポイントが存在しない場合400になること"""
        mock_find_model.return_value = _ai_model()
        mock_find_endpoints.return_value = []

        with pytest.raises(HTTPException) as exc_info:
            await LlmChatService.stream_chat(
                "tenant-1", test_user, _request(), session=None
            )

        assert exc_info.value.status_code == 400

    @patch("app.services.llm_chat_service.enforce_within_quota", new_callable=AsyncMock)
    @patch(
        "app.services.llm_chat_service.MessageRepository.find_by_tenant_id_and_id",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.llm_chat_service.TenantEndpointRepository.find_by_tenant_id_and_type",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.llm_chat_service.AIModelRepository.find_by_endpoint_type_and_name",
        new_callable=AsyncMock,
    )
    async def test_raises_404_when_message_not_found(
        self,
        mock_find_model,
        mock_find_endpoints,
        mock_find_message,
        mock_enforce,
        test_user,
    ):
        """指定messageIdのメッセージが存在しない場合404になること"""
        mock_find_model.return_value = _ai_model()
        mock_find_endpoints.return_value = [_tenant_endpoint()]
        mock_find_message.return_value = None

        with pytest.raises(HTTPException) as exc_info:
            await LlmChatService.stream_chat(
                "tenant-1", test_user, _request(messageId="msg-1"), session=None
            )

        assert exc_info.value.status_code == 404

    @patch("app.services.llm_chat_service.get_session_maker")
    @patch("app.services.llm_chat_service.AzureLlmChatClient.stream_chat")
    @patch("app.services.llm_chat_service.enforce_within_quota", new_callable=AsyncMock)
    @patch(
        "app.services.llm_chat_service.TenantEndpointRepository.find_by_tenant_id_and_type",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.llm_chat_service.AIModelRepository.find_by_endpoint_type_and_name",
        new_callable=AsyncMock,
    )
    async def test_streams_text_delta_then_message_stop_and_persists_usage(
        self,
        mock_find_model,
        mock_find_endpoints,
        mock_enforce,
        mock_stream_chat,
        mock_get_session_maker,
        test_user,
    ):
        """text_deltaを順に送出し、完了後message_stopイベントを送出しトークン使用量を永続化すること"""
        from app.core.llm_client import ChatStreamChunk

        mock_find_model.return_value = _ai_model()
        mock_find_endpoints.return_value = [_tenant_endpoint()]
        mock_stream_chat.return_value = _AsyncChunkIterator(
            [
                ChatStreamChunk(text_delta="こんに"),
                ChatStreamChunk(text_delta="ちは"),
                ChatStreamChunk(input_tokens=10, output_tokens=5),
            ]
        )

        mock_new_session = AsyncMock()
        mock_new_session.__aenter__.return_value = mock_new_session
        mock_new_session.add = MagicMock()
        mock_session_maker = MagicMock(return_value=mock_new_session)
        mock_get_session_maker.return_value = mock_session_maker

        response = await LlmChatService.stream_chat(
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
        mock_new_session.add.assert_called_once()
        mock_new_session.commit.assert_awaited_once()

    @patch("app.services.llm_chat_service.get_session_maker")
    @patch("app.services.llm_chat_service.AzureLlmChatClient.stream_chat")
    @patch("app.services.llm_chat_service.enforce_within_quota", new_callable=AsyncMock)
    @patch(
        "app.services.llm_chat_service.TenantEndpointRepository.find_by_tenant_id_and_type",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.llm_chat_service.AIModelRepository.find_by_endpoint_type_and_name",
        new_callable=AsyncMock,
    )
    async def test_emits_error_event_when_azure_call_fails(
        self,
        mock_find_model,
        mock_find_endpoints,
        mock_enforce,
        mock_stream_chat,
        mock_get_session_maker,
        test_user,
    ):
        """Azure呼び出し中に例外が発生した場合、errorイベントを送出し例外を伝播しないこと"""

        async def _raise(*args, **kwargs):
            raise RuntimeError("azure error")
            yield  # pragma: no cover - ジェネレータにするためのダミー

        mock_find_model.return_value = _ai_model()
        mock_find_endpoints.return_value = [_tenant_endpoint()]
        mock_stream_chat.return_value = _raise()

        mock_new_session = AsyncMock()
        mock_new_session.__aenter__.return_value = mock_new_session
        mock_new_session.add = MagicMock()
        mock_session_maker = MagicMock(return_value=mock_new_session)
        mock_get_session_maker.return_value = mock_session_maker

        response = await LlmChatService.stream_chat(
            "tenant-1", test_user, _request(), session=None
        )
        chunks = await _consume(response)
        body = b"".join(chunks).decode()

        assert "event: error" in body
        assert "azure error" in body
