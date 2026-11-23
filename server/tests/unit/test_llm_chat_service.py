import json
from decimal import Decimal
from typing import Any
from unittest.mock import ANY, AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.core.llm_client import ChatMessage
from app.models.ai_model import AIModel, AIModelEndpointType
from app.models.tenant_endpoint import EndpointType, TenantEndpoint
from app.schemas.attachment import AttachmentFile
from app.schemas.llm import LlmChatRequest, LlmChatTurn
from app.schemas.message import ToolConfig
from app.services.llm_chat_service import LlmChatService
from app.models.user import User
from collections.abc import AsyncIterator
from collections.abc import Iterator


def _ai_model(
    name: str = "gpt-4o",
    token_weight: str = "1.0",
    endpoint_type: AIModelEndpointType = AIModelEndpointType.AZURE_OPENAI_CHAT,
) -> AIModel:
    """テスト用のAIモデルを作る。"""
    return AIModel(
        id=1,
        endpoint_type=endpoint_type,
        name=name,
        max_tokens=4096,
        token_weight=Decimal(token_weight),
    )


def _tenant_endpoint(
    endpoint_id: str = "endpoint-1",
    type: EndpointType = EndpointType.AZURE_OPENAI_CHAT,
) -> TenantEndpoint:
    """テスト用のテナントエンドポイントを作る。"""
    return TenantEndpoint(
        id=endpoint_id,
        tenant_id="tenant-1",
        type=type,
        endpoint_name="azure" if type == EndpointType.AZURE_OPENAI_CHAT else "bedrock",
        endpoint=(
            "https://example.openai.azure.com"
            if type == EndpointType.AZURE_OPENAI_CHAT
            else "https://bedrock-mantle.ap-northeast-1.api.aws/anthropic"
        ),
        api_key="api-key",
    )


def _request(**overrides: Any) -> LlmChatRequest:
    """テスト用のリクエストを作る（`overrides` で既定値を上書きする）。"""
    defaults = {
        "deployName": "gpt-4o",
        "messages": [LlmChatTurn(role="user", content="こんにちは")],
    }
    defaults.update(overrides)
    return LlmChatRequest(**defaults)


class _AsyncChunkIterator:
    """チャンク列を非同期イテレータとして返すテスト用のスタブ。"""

    def __init__(self, chunks: list) -> None:
        """返すチャンク列を受け取る。"""
        self._chunks = chunks

    def __aiter__(self) -> AsyncIterator[Any]:
        """非同期イテレータを返す。"""
        return self._gen()

    async def _gen(self) -> AsyncIterator[Any]:
        """チャンクを順に返す。"""
        for chunk in self._chunks:
            yield chunk


async def _consume(streaming_response: Any) -> list[bytes]:
    """ストリーミングレスポンスの本文チャンクをすべて読む。"""
    return [chunk async for chunk in streaming_response.body_iterator]


def _sse_events(body: str) -> list[dict[str, Any]]:
    """SSE本文の`data:`行をJSONとして読み、イベントの一覧へ変換する。

    移植元と同じく、イベント名の行(`event:`)は送られないことも併せて検証する。
    """
    assert "event:" not in body
    return [
        json.loads(line[len("data:") :].strip())
        for line in body.splitlines()
        if line.startswith("data:")
    ]


class TestStreamChat:
    """LlmChatService.stream_chat のテスト"""

    @patch("app.services.llm_chat_service.enforce_within_quota", new_callable=AsyncMock)
    @patch(
        "app.services.llm_chat_service.AIModelRepository.find_by_name_and_endpoint_types",
        new_callable=AsyncMock,
    )
    async def test_raises_400_when_ai_model_not_found(
        self, mock_find_model: MagicMock, mock_enforce: MagicMock, test_user: User
    ) -> None:
        """指定deployNameのAIモデルが存在しない場合400になること"""
        mock_find_model.return_value = None

        with pytest.raises(HTTPException) as exc_info:
            await LlmChatService.stream_chat(
                "tenant-1",
                test_user,
                _request(),
                session=None,  # type: ignore[arg-type]
            )

        assert exc_info.value.status_code == 400

    @patch("app.services.llm_chat_service.enforce_within_quota", new_callable=AsyncMock)
    @patch(
        "app.services.llm_chat_service.TenantEndpointRepository.find_by_tenant_id_and_type",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.llm_chat_service.AIModelRepository.find_by_name_and_endpoint_types",
        new_callable=AsyncMock,
    )
    async def test_raises_400_when_no_tenant_endpoint(
        self,
        mock_find_model: MagicMock,
        mock_find_endpoints: MagicMock,
        mock_enforce: MagicMock,
        test_user: User,
    ) -> None:
        """テナントにAzure OpenAI Chatエンドポイントが存在しない場合400になること"""
        mock_find_model.return_value = _ai_model()
        mock_find_endpoints.return_value = []

        with pytest.raises(HTTPException) as exc_info:
            await LlmChatService.stream_chat(
                "tenant-1",
                test_user,
                _request(),
                session=None,  # type: ignore[arg-type]
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
        "app.services.llm_chat_service.AIModelRepository.find_by_name_and_endpoint_types",
        new_callable=AsyncMock,
    )
    async def test_raises_404_when_message_not_found(
        self,
        mock_find_model: MagicMock,
        mock_find_endpoints: MagicMock,
        mock_find_message: MagicMock,
        mock_enforce: MagicMock,
        test_user: User,
    ) -> None:
        """指定messageIdのメッセージが存在しない場合404になること"""
        mock_find_model.return_value = _ai_model()
        mock_find_endpoints.return_value = [_tenant_endpoint()]
        mock_find_message.return_value = None

        with pytest.raises(HTTPException) as exc_info:
            await LlmChatService.stream_chat(
                "tenant-1",
                test_user,
                _request(messageId="msg-1"),
                session=None,  # type: ignore[arg-type]
            )

        assert exc_info.value.status_code == 404

    @patch("app.services.llm_chat_service.require_owned_room", new_callable=AsyncMock)
    @patch(
        "app.services.llm_chat_service.MessageRepository.find_by_tenant_id_and_id",
        new_callable=AsyncMock,
    )
    @patch("app.services.llm_chat_service.enforce_within_quota", new_callable=AsyncMock)
    @patch(
        "app.services.llm_chat_service.TenantEndpointRepository.find_by_tenant_id_and_type",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.llm_chat_service.AIModelRepository.find_by_name_and_endpoint_types",
        new_callable=AsyncMock,
    )
    async def test_raises_403_when_message_room_not_owned(
        self,
        mock_find_model: MagicMock,
        mock_find_endpoints: MagicMock,
        mock_enforce: MagicMock,
        mock_find_message: MagicMock,
        mock_require_owned_room: MagicMock,
        test_user: User,
    ) -> None:
        """指定messageIdが他ユーザーのルームに属する場合403になること"""
        mock_find_model.return_value = _ai_model()
        mock_find_endpoints.return_value = [_tenant_endpoint()]
        mock_find_message.return_value = MagicMock(id="msg-1", room_id="room-1")
        mock_require_owned_room.side_effect = HTTPException(
            status_code=403, detail="Access Denied"
        )

        with pytest.raises(HTTPException) as exc_info:
            await LlmChatService.stream_chat(
                "tenant-1",
                test_user,
                _request(messageId="msg-1"),
                session=None,  # type: ignore[arg-type]
            )

        assert exc_info.value.status_code == 403
        mock_require_owned_room.assert_awaited_once_with(
            "tenant-1", test_user, "room-1", None
        )

    @patch("app.services.llm_chat_service.get_session_maker")
    @patch("app.services.llm_chat_service.AzureLlmChatClient.stream_chat")
    @patch("app.services.llm_chat_service.enforce_within_quota", new_callable=AsyncMock)
    @patch(
        "app.services.llm_chat_service.TenantEndpointRepository.find_by_tenant_id_and_type",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.llm_chat_service.AIModelRepository.find_by_name_and_endpoint_types",
        new_callable=AsyncMock,
    )
    async def test_streams_text_delta_then_message_stop_and_persists_usage(
        self,
        mock_find_model: MagicMock,
        mock_find_endpoints: MagicMock,
        mock_enforce: MagicMock,
        mock_stream_chat: MagicMock,
        mock_get_session_maker: MagicMock,
        test_user: User,
    ) -> None:
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
            "tenant-1",
            test_user,
            _request(),
            session=None,  # type: ignore[arg-type]
        )
        chunks = await _consume(response)
        body = b"".join(chunks).decode()

        assert _sse_events(body) == [
            {"type": "text_delta", "text": "こんに"},
            {"type": "text_delta", "text": "ちは"},
            {"type": "message_stop", "inputTokens": 10, "outputTokens": 5},
        ]
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
        "app.services.llm_chat_service.AIModelRepository.find_by_name_and_endpoint_types",
        new_callable=AsyncMock,
    )
    async def test_emits_error_event_when_azure_call_fails(
        self,
        mock_find_model: MagicMock,
        mock_find_endpoints: MagicMock,
        mock_enforce: MagicMock,
        mock_stream_chat: MagicMock,
        mock_get_session_maker: MagicMock,
        test_user: User,
    ) -> None:
        """Azure呼び出し中に例外が発生した場合、errorイベントを送出し例外を伝播しないこと"""

        async def _raise(*args: Any, **kwargs: Any) -> AsyncIterator[Any]:
            """最初に例外を送出する非同期ジェネレータ。"""
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
            "tenant-1",
            test_user,
            _request(),
            session=None,  # type: ignore[arg-type]
        )
        chunks = await _consume(response)
        body = b"".join(chunks).decode()

        assert _sse_events(body) == [{"type": "error", "message": "azure error"}]

    async def test_raises_400_when_create_library_without_message_id(
        self, test_user: User
    ) -> None:
        """createLibrary=trueかつmessageId未指定の場合400になること"""
        with pytest.raises(HTTPException) as exc_info:
            await LlmChatService.stream_chat(
                "tenant-1",
                test_user,
                _request(createLibrary=True),
                session=None,  # type: ignore[arg-type]
            )

        assert exc_info.value.status_code == 400

    @patch("app.services.llm_chat_service.get_session_maker")
    @patch("app.services.llm_chat_service.AzureLlmChatClient.stream_chat")
    @patch("app.services.llm_chat_service.enforce_within_quota", new_callable=AsyncMock)
    @patch(
        "app.services.llm_chat_service.TenantEndpointRepository.find_by_tenant_id_and_type",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.llm_chat_service.AIModelRepository.find_by_name_and_endpoint_types",
        new_callable=AsyncMock,
    )
    async def test_passes_tools_to_llm_client(
        self,
        mock_find_model: MagicMock,
        mock_find_endpoints: MagicMock,
        mock_enforce: MagicMock,
        mock_stream_chat: MagicMock,
        mock_get_session_maker: MagicMock,
        test_user: User,
    ) -> None:
        """toolsを指定した場合、AzureLlmChatClient.stream_chatへ変換済みtoolsが渡ること"""
        from app.schemas.message import ToolConfig

        mock_find_model.return_value = _ai_model()
        mock_find_endpoints.return_value = [_tenant_endpoint()]
        mock_stream_chat.return_value = _AsyncChunkIterator([])

        mock_new_session = AsyncMock()
        mock_new_session.__aenter__.return_value = mock_new_session
        mock_new_session.add = MagicMock()
        mock_session_maker = MagicMock(return_value=mock_new_session)
        mock_get_session_maker.return_value = mock_session_maker

        response = await LlmChatService.stream_chat(
            "tenant-1",
            test_user,
            _request(tools=[ToolConfig(name="web_search")]),
            session=None,  # type: ignore[arg-type]
        )
        await _consume(response)

        args, _ = mock_stream_chat.call_args
        passed_tools = args[6]
        assert passed_tools is not None
        assert len(passed_tools) == 1
        assert passed_tools[0].name == "web_search"

    @patch("app.services.llm_chat_service.get_session_maker")
    @patch("app.services.llm_chat_service.AzureLlmChatClient.stream_chat")
    @patch("app.services.llm_chat_service.enforce_within_quota", new_callable=AsyncMock)
    @patch(
        "app.services.llm_chat_service.TenantEndpointRepository.find_by_tenant_id_and_type",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.llm_chat_service.AIModelRepository.find_by_name_and_endpoint_types",
        new_callable=AsyncMock,
    )
    async def test_tools_none_by_default(
        self,
        mock_find_model: MagicMock,
        mock_find_endpoints: MagicMock,
        mock_enforce: MagicMock,
        mock_stream_chat: MagicMock,
        mock_get_session_maker: MagicMock,
        test_user: User,
    ) -> None:
        """tools未指定時はAzureLlmChatClient.stream_chatへtools=Noneが渡ること"""
        mock_find_model.return_value = _ai_model()
        mock_find_endpoints.return_value = [_tenant_endpoint()]
        mock_stream_chat.return_value = _AsyncChunkIterator([])

        mock_new_session = AsyncMock()
        mock_new_session.__aenter__.return_value = mock_new_session
        mock_new_session.add = MagicMock()
        mock_session_maker = MagicMock(return_value=mock_new_session)
        mock_get_session_maker.return_value = mock_session_maker

        response = await LlmChatService.stream_chat(
            "tenant-1",
            test_user,
            _request(),
            session=None,  # type: ignore[arg-type]
        )
        await _consume(response)

        args, _ = mock_stream_chat.call_args
        assert args[6] is None

    @patch("app.services.llm_chat_service.get_session_maker")
    @patch("app.services.llm_chat_service.AzureLlmChatClient.stream_chat")
    @patch("app.services.llm_chat_service.enforce_within_quota", new_callable=AsyncMock)
    @patch(
        "app.services.llm_chat_service.TenantEndpointRepository.find_by_tenant_id_and_type",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.llm_chat_service.AIModelRepository.find_by_name_and_endpoint_types",
        new_callable=AsyncMock,
    )
    async def test_passes_response_format_and_prepends_instruction_when_specified(
        self,
        mock_find_model: MagicMock,
        mock_find_endpoints: MagicMock,
        mock_enforce: MagicMock,
        mock_stream_chat: MagicMock,
        mock_get_session_maker: MagicMock,
        test_user: User,
    ) -> None:
        """responseFormat指定時、JSON指示のsystemメッセージを前置しresponse_formatを渡すこと"""
        mock_find_model.return_value = _ai_model()
        mock_find_endpoints.return_value = [_tenant_endpoint()]
        mock_stream_chat.return_value = _AsyncChunkIterator([])

        mock_new_session = AsyncMock()
        mock_new_session.__aenter__.return_value = mock_new_session
        mock_new_session.add = MagicMock()
        mock_session_maker = MagicMock(return_value=mock_new_session)
        mock_get_session_maker.return_value = mock_session_maker

        response = await LlmChatService.stream_chat(
            "tenant-1",
            test_user,
            _request(responseFormat={"type": "json_object"}),
            session=None,  # type: ignore[arg-type]
        )
        await _consume(response)

        call_args = mock_stream_chat.call_args.args
        messages = call_args[3]
        response_format_arg = call_args[7]
        assert messages[0] == ChatMessage(
            role="system", content="回答は JSON 形式で出力してください。"
        )
        assert response_format_arg == {"type": "json_object"}

    @patch("app.services.llm_chat_service.get_session_maker")
    @patch("app.services.llm_chat_service.AzureLlmChatClient.stream_chat")
    @patch("app.services.llm_chat_service.enforce_within_quota", new_callable=AsyncMock)
    @patch(
        "app.services.llm_chat_service.TenantEndpointRepository.find_by_tenant_id_and_type",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.llm_chat_service.AIModelRepository.find_by_name_and_endpoint_types",
        new_callable=AsyncMock,
    )
    async def test_does_not_pass_response_format_when_not_specified(
        self,
        mock_find_model: MagicMock,
        mock_find_endpoints: MagicMock,
        mock_enforce: MagicMock,
        mock_stream_chat: MagicMock,
        mock_get_session_maker: MagicMock,
        test_user: User,
    ) -> None:
        """responseFormat未指定時、response_formatを渡さずJSON指示文も前置しないこと"""
        mock_find_model.return_value = _ai_model()
        mock_find_endpoints.return_value = [_tenant_endpoint()]
        mock_stream_chat.return_value = _AsyncChunkIterator([])

        mock_new_session = AsyncMock()
        mock_new_session.__aenter__.return_value = mock_new_session
        mock_new_session.add = MagicMock()
        mock_session_maker = MagicMock(return_value=mock_new_session)
        mock_get_session_maker.return_value = mock_session_maker

        response = await LlmChatService.stream_chat(
            "tenant-1",
            test_user,
            _request(),
            session=None,  # type: ignore[arg-type]
        )
        await _consume(response)

        call_args = mock_stream_chat.call_args.args
        messages = call_args[3]
        response_format_arg = call_args[7]
        assert messages[0] == ChatMessage(role="user", content="こんにちは")
        assert response_format_arg is None


class TestStreamChatBedrockDispatch:
    """LlmChatService.stream_chat のBedrock分岐テスト"""

    @patch("app.services.llm_chat_service.get_session_maker")
    @patch("app.services.llm_chat_service.BedrockLlmChatClient.stream_chat")
    @patch("app.services.llm_chat_service.enforce_within_quota", new_callable=AsyncMock)
    @patch(
        "app.services.llm_chat_service.TenantEndpointRepository.find_by_tenant_id_and_type",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.llm_chat_service.AIModelRepository.find_by_name_and_endpoint_types",
        new_callable=AsyncMock,
    )
    async def test_dispatches_to_bedrock_client_for_bedrock_model(
        self,
        mock_find_model: MagicMock,
        mock_find_endpoints: MagicMock,
        mock_enforce: MagicMock,
        mock_bedrock_stream: MagicMock,
        mock_get_session_maker: MagicMock,
        test_user: User,
    ) -> None:
        """BedrockのAIモデルが解決された場合、BedrockLlmChatClientが呼ばれること"""
        from app.core.llm_client import ChatStreamChunk

        mock_find_model.return_value = _ai_model(
            name="anthropic.claude-sonnet-5",
            endpoint_type=AIModelEndpointType.BEDROCK_CHAT,
        )
        mock_find_endpoints.return_value = [
            _tenant_endpoint(type=EndpointType.BEDROCK_CHAT)
        ]
        mock_bedrock_stream.return_value = _AsyncChunkIterator(
            [ChatStreamChunk(text_delta="こんにちは")]
        )

        mock_new_session = AsyncMock()
        mock_new_session.__aenter__.return_value = mock_new_session
        mock_new_session.add = MagicMock()
        mock_session_maker = MagicMock(return_value=mock_new_session)
        mock_get_session_maker.return_value = mock_session_maker

        response = await LlmChatService.stream_chat(
            "tenant-1",
            test_user,
            _request(deployName="anthropic.claude-sonnet-5"),
            session=None,  # type: ignore[arg-type]
        )
        await _consume(response)

        mock_find_endpoints.assert_awaited_once_with(
            "tenant-1", EndpointType.BEDROCK_CHAT, ANY
        )
        mock_bedrock_stream.assert_called_once()
        # maxTokens未指定時は、Bedrockで必須の上限としてAIモデルの上限が渡されること
        assert mock_bedrock_stream.call_args.args[5] == 4096

    @patch("app.services.llm_chat_service.BedrockLlmChatClient.stream_chat")
    @patch("app.services.llm_chat_service.enforce_within_quota", new_callable=AsyncMock)
    @patch(
        "app.services.llm_chat_service.TenantEndpointRepository.find_by_tenant_id_and_type",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.llm_chat_service.AIModelRepository.find_by_name_and_endpoint_types",
        new_callable=AsyncMock,
    )
    async def test_raises_400_when_tools_specified_for_bedrock(
        self,
        mock_find_model: MagicMock,
        mock_find_endpoints: MagicMock,
        mock_enforce: MagicMock,
        mock_bedrock_stream: MagicMock,
        test_user: User,
    ) -> None:
        """Bedrockのモデルでtoolsを指定すると、ストリーミング開始前に400になりクライアントを呼ばないこと"""
        mock_find_model.return_value = _ai_model(
            name="anthropic.claude-sonnet-5",
            endpoint_type=AIModelEndpointType.BEDROCK_CHAT,
        )
        mock_find_endpoints.return_value = [
            _tenant_endpoint(type=EndpointType.BEDROCK_CHAT)
        ]

        with pytest.raises(HTTPException) as exc_info:
            await LlmChatService.stream_chat(
                "tenant-1",
                test_user,
                _request(
                    deployName="anthropic.claude-sonnet-5",
                    tools=[ToolConfig(name="web_search")],
                ),
                session=None,  # type: ignore[arg-type]
            )

        assert exc_info.value.status_code == 400
        assert "web_search/mcp" in exc_info.value.detail
        mock_bedrock_stream.assert_not_called()

    @patch(
        "app.services.llm_chat_service.MessageRepository.find_by_tenant_id_and_id",
        new_callable=AsyncMock,
    )
    @patch("app.services.llm_chat_service.enforce_within_quota", new_callable=AsyncMock)
    @patch(
        "app.services.llm_chat_service.TenantEndpointRepository.find_by_tenant_id_and_type",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.llm_chat_service.AIModelRepository.find_by_name_and_endpoint_types",
        new_callable=AsyncMock,
    )
    async def test_message_not_found_takes_precedence_over_bedrock_tools_error(
        self,
        mock_find_model: MagicMock,
        mock_find_endpoints: MagicMock,
        mock_enforce: MagicMock,
        mock_find_message: MagicMock,
        test_user: User,
    ) -> None:
        """Bedrockでtoolsを指定しても、messageIdが存在しない場合はtoolsの400より404を優先すること"""
        mock_find_model.return_value = _ai_model(
            name="anthropic.claude-sonnet-5",
            endpoint_type=AIModelEndpointType.BEDROCK_CHAT,
        )
        mock_find_endpoints.return_value = [
            _tenant_endpoint(type=EndpointType.BEDROCK_CHAT)
        ]
        mock_find_message.return_value = None

        with pytest.raises(HTTPException) as exc_info:
            await LlmChatService.stream_chat(
                "tenant-1",
                test_user,
                _request(
                    deployName="anthropic.claude-sonnet-5",
                    tools=[ToolConfig(name="web_search")],
                    messageId="missing",
                ),
                session=None,  # type: ignore[arg-type]
            )

        assert exc_info.value.status_code == 404

    @patch("app.services.llm_chat_service.get_session_maker")
    @patch("app.services.llm_chat_service.BedrockLlmChatClient.stream_chat")
    @patch("app.services.llm_chat_service.enforce_within_quota", new_callable=AsyncMock)
    @patch(
        "app.services.llm_chat_service.TenantEndpointRepository.find_by_tenant_id_and_type",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.llm_chat_service.AIModelRepository.find_by_name_and_endpoint_types",
        new_callable=AsyncMock,
    )
    async def test_caps_max_tokens_for_bedrock(
        self,
        mock_find_model: MagicMock,
        mock_find_endpoints: MagicMock,
        mock_enforce: MagicMock,
        mock_bedrock_stream: MagicMock,
        mock_get_session_maker: MagicMock,
        test_user: User,
    ) -> None:
        """BedrockでmaxTokensがAIモデルの上限を超える場合、上限に切り詰めて呼び出すこと"""
        mock_find_model.return_value = _ai_model(
            name="anthropic.claude-sonnet-5",
            endpoint_type=AIModelEndpointType.BEDROCK_CHAT,
        )
        mock_find_endpoints.return_value = [
            _tenant_endpoint(type=EndpointType.BEDROCK_CHAT)
        ]
        mock_bedrock_stream.return_value = _AsyncChunkIterator([])
        mock_get_session_maker.return_value = MagicMock()

        response = await LlmChatService.stream_chat(
            "tenant-1",
            test_user,
            _request(deployName="anthropic.claude-sonnet-5", maxTokens=10000),
            session=None,  # type: ignore[arg-type]
        )
        await _consume(response)

        assert mock_bedrock_stream.call_args.args[5] == 4096

    @pytest.mark.parametrize(
        ("requested", "expected"),
        [(10000, 4096), (100, 100), (None, None)],
        ids=["over_limit", "within_limit", "not_specified"],
    )
    @patch("app.services.llm_chat_service.get_session_maker")
    @patch("app.services.llm_chat_service.AzureLlmChatClient.stream_chat")
    @patch("app.services.llm_chat_service.enforce_within_quota", new_callable=AsyncMock)
    @patch(
        "app.services.llm_chat_service.TenantEndpointRepository.find_by_tenant_id_and_type",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.llm_chat_service.AIModelRepository.find_by_name_and_endpoint_types",
        new_callable=AsyncMock,
    )
    async def test_caps_max_tokens_for_azure(
        self,
        mock_find_model: MagicMock,
        mock_find_endpoints: MagicMock,
        mock_enforce: MagicMock,
        mock_azure_stream: MagicMock,
        mock_get_session_maker: MagicMock,
        requested: int | None,
        expected: int | None,
        test_user: User,
    ) -> None:
        """Azure OpenAIでmaxTokensをAIモデルの上限で切り詰め、未指定ならNoneのまま呼び出すこと"""
        mock_find_model.return_value = _ai_model()
        mock_find_endpoints.return_value = [_tenant_endpoint()]
        mock_azure_stream.return_value = _AsyncChunkIterator([])
        mock_get_session_maker.return_value = MagicMock()

        response = await LlmChatService.stream_chat(
            "tenant-1",
            test_user,
            _request(maxTokens=requested),
            session=None,  # type: ignore[arg-type]
        )
        await _consume(response)

        assert mock_azure_stream.call_args.args[5] == expected

    @patch("app.services.llm_chat_service.get_session_maker")
    @patch("app.services.llm_chat_service.AzureLlmChatClient.stream_chat")
    @patch("app.services.llm_chat_service.enforce_within_quota", new_callable=AsyncMock)
    @patch(
        "app.services.llm_chat_service.TenantEndpointRepository.find_by_tenant_id_and_type",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.llm_chat_service.AIModelRepository.find_by_name_and_endpoint_types",
        new_callable=AsyncMock,
    )
    async def test_still_dispatches_to_azure_client_for_azure_model(
        self,
        mock_find_model: MagicMock,
        mock_find_endpoints: MagicMock,
        mock_enforce: MagicMock,
        mock_azure_stream: MagicMock,
        mock_get_session_maker: MagicMock,
        test_user: User,
    ) -> None:
        """Azure OpenAIのAIモデルが解決された場合、従来通りAzureLlmChatClientが呼ばれること（回帰確認）"""
        mock_find_model.return_value = _ai_model()
        mock_find_endpoints.return_value = [_tenant_endpoint()]
        mock_azure_stream.return_value = _AsyncChunkIterator([])

        mock_new_session = AsyncMock()
        mock_new_session.__aenter__.return_value = mock_new_session
        mock_new_session.add = MagicMock()
        mock_session_maker = MagicMock(return_value=mock_new_session)
        mock_get_session_maker.return_value = mock_session_maker

        response = await LlmChatService.stream_chat(
            "tenant-1",
            test_user,
            _request(),
            session=None,  # type: ignore[arg-type]
        )
        await _consume(response)

        mock_find_endpoints.assert_awaited_once_with(
            "tenant-1", EndpointType.AZURE_OPENAI_CHAT, ANY
        )
        mock_azure_stream.assert_called_once()

    @patch(
        "app.services.llm_chat_service.AIModelRepository.find_by_name_and_endpoint_types",
        new_callable=AsyncMock,
    )
    @patch("app.services.llm_chat_service.enforce_within_quota", new_callable=AsyncMock)
    async def test_raises_400_for_unsupported_endpoint_type(
        self, mock_enforce: MagicMock, mock_find_model: MagicMock, test_user: User
    ) -> None:
        """チャット用の種別（Azure OpenAI/Bedrock）に絞ってモデルを検索し、該当しなければ400になること"""
        # 未対応種別（例: GEMINI_CHAT）のみで登録されたモデル名は、リポジトリの絞り込みで
        # 見つからない扱いになる。
        mock_find_model.return_value = None

        with pytest.raises(HTTPException) as exc_info:
            await LlmChatService.stream_chat(
                "tenant-1",
                test_user,
                _request(deployName="gemini-pro"),
                session=None,  # type: ignore[arg-type]
            )

        assert exc_info.value.status_code == 400
        searched_types = set(mock_find_model.call_args.args[1])
        assert searched_types == {
            AIModelEndpointType.AZURE_OPENAI_CHAT,
            AIModelEndpointType.BEDROCK_CHAT,
        }


class TestStreamChatCreateLibrary:
    """LlmChatService.stream_chat のライブラリ生成(createLibrary)モードのテスト"""

    def _library_prompt(self) -> MagicMock:
        """ライブラリ生成用のシステムプロンプトを模したモックを作る。"""
        return MagicMock(content="ライブラリ生成用システムプロンプト")

    @patch("app.services.llm_chat_service.get_session_maker")
    @patch(
        "app.services.llm_chat_service.LibraryRepository.create_with_content",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.llm_chat_service.SystemPromptTemplateRepository.find_by_type",
        new_callable=AsyncMock,
    )
    @patch("app.services.llm_chat_service.AzureLlmChatClient.stream_chat")
    @patch("app.services.llm_chat_service.require_owned_room", new_callable=AsyncMock)
    @patch(
        "app.services.llm_chat_service.MessageRepository.find_by_tenant_id_and_id",
        new_callable=AsyncMock,
    )
    @patch("app.services.llm_chat_service.enforce_within_quota", new_callable=AsyncMock)
    @patch(
        "app.services.llm_chat_service.TenantEndpointRepository.find_by_tenant_id_and_type",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.llm_chat_service.AIModelRepository.find_by_name_and_endpoint_types",
        new_callable=AsyncMock,
    )
    async def test_streams_library_title_and_content_delta_then_persists_library(
        self,
        mock_find_model: MagicMock,
        mock_find_endpoints: MagicMock,
        mock_enforce: MagicMock,
        mock_find_message: MagicMock,
        mock_require_owned_room: MagicMock,
        mock_stream_chat: MagicMock,
        mock_find_prompt: MagicMock,
        mock_save_library: MagicMock,
        mock_get_session_maker: MagicMock,
        test_user: User,
    ) -> None:
        """createLibrary=trueの場合、library_title_delta/library_content_deltaを配信しライブラリを永続化すること"""
        from app.core.llm_client import ChatStreamChunk

        mock_find_model.return_value = _ai_model()
        mock_find_endpoints.return_value = [_tenant_endpoint()]
        mock_find_message.return_value = MagicMock(id="msg-1", room_id="room-1")
        mock_find_prompt.return_value = self._library_prompt()
        mock_stream_chat.return_value = _AsyncChunkIterator(
            [
                ChatStreamChunk(text_delta="<<<TITLE>>>\nタイトルA\n"),
                ChatStreamChunk(text_delta="<<<CONTENT>>>\n本文B\n"),
                ChatStreamChunk(input_tokens=10, output_tokens=5),
            ]
        )

        mock_new_session = AsyncMock()
        mock_new_session.__aenter__.return_value = mock_new_session
        mock_new_session.add = MagicMock()
        mock_session_maker = MagicMock(return_value=mock_new_session)
        mock_get_session_maker.return_value = mock_session_maker

        response = await LlmChatService.stream_chat(
            "tenant-1",
            test_user,
            _request(messageId="msg-1", createLibrary=True),
            session=None,  # type: ignore[arg-type]
        )
        chunks = await _consume(response)
        body = b"".join(chunks).decode()

        events = _sse_events(body)
        title = "".join(e["text"] for e in events if e["type"] == "library_title_delta")
        content = "".join(
            e["text"] for e in events if e["type"] == "library_content_delta"
        )
        assert "タイトルA" in title
        assert "本文B" in content
        # コメント区間が省略された場合、デフォルトの案内文がtext_deltaで配信されること
        assert {"type": "text_delta", "text": "「タイトルA」を作成しました"} in events
        assert events[-1] == {
            "type": "message_stop",
            "inputTokens": 10,
            "outputTokens": 5,
        }

        mock_save_library.assert_awaited_once()
        saved_library = mock_save_library.await_args.args[0]
        assert saved_library.title == "タイトルA"
        assert mock_save_library.await_args.args[1] == "本文B"
        assert saved_library.message_id == "msg-1"


class TestApplyAdditionalPrompt:
    """LlmChatService._apply_additional_prompt のテスト"""

    def test_returns_as_is_when_no_additional_prompt(self) -> None:
        """additionalPrompt未指定ならそのまま返すこと"""
        messages = [ChatMessage(role="user", content="こんにちは")]
        assert LlmChatService._apply_additional_prompt(messages, None) == messages

    def test_prepends_to_last_user_turn(self) -> None:
        """末尾がuserロールの場合、その発話に前置すること"""
        messages = [
            ChatMessage(role="system", content="system prompt"),
            ChatMessage(role="user", content="質問1"),
        ]
        result = LlmChatService._apply_additional_prompt(messages, "追加指示")

        assert result[0] == messages[0]
        assert result[1] == ChatMessage(role="user", content="追加指示\n\n質問1")

    def test_skips_trailing_non_user_turns_to_find_last_user_turn(self) -> None:
        """末尾がuser以外のロールでも、遡って最後のuser発話に前置すること"""
        messages = [
            ChatMessage(role="user", content="質問1"),
            ChatMessage(role="assistant", content="回答1"),
        ]
        result = LlmChatService._apply_additional_prompt(messages, "追加指示")

        assert result[0] == ChatMessage(role="user", content="追加指示\n\n質問1")
        assert result[1] == messages[1]

    def test_returns_as_is_when_no_user_turn_exists(self) -> None:
        """user発話が存在しない場合は何もしないこと"""
        messages = [ChatMessage(role="assistant", content="回答のみ")]
        assert LlmChatService._apply_additional_prompt(messages, "追加指示") == messages


class TestApplyAttachmentFiles:
    """LlmChatService._apply_attachment_files のテスト"""

    def _file(self, name: str = "photo.png", data: bytes = b"data") -> AttachmentFile:
        """テスト用の添付ファイルを作る。"""
        return AttachmentFile(name=name, type="image/png", data=data)

    def _apply(
        self, turns: list[LlmChatTurn], files: list[AttachmentFile]
    ) -> list[ChatMessage]:
        """ターンを `ChatMessage` に変換して添付ファイルを反映する。"""
        messages = [ChatMessage(role=t.role, content=t.content) for t in turns]
        return LlmChatService._apply_attachment_files(messages, turns, files)

    def test_returns_as_is_when_no_attachments(self) -> None:
        """発話にattachmentsがない場合、ファイルがあってもそのまま返すこと"""
        turns = [LlmChatTurn(role="user", content="こんにちは")]
        result = self._apply(turns, [self._file()])

        assert result == [ChatMessage(role="user", content="こんにちは")]

    def test_attaches_files_to_each_user_turn_by_name(self) -> None:
        """各user発話に、attachmentsのファイル名と一致するファイルだけを付与すること"""
        turns = [
            LlmChatTurn(role="system", content="system prompt"),
            LlmChatTurn(role="user", content="質問1", attachments=["a.png"]),
            LlmChatTurn(role="assistant", content="回答1"),
            LlmChatTurn(role="User", content="質問2", attachments=["b.png", "c.png"]),
        ]
        result = self._apply(
            turns, [self._file("a.png"), self._file("b.png"), self._file("c.png")]
        )

        assert result[0] == ChatMessage(role="system", content="system prompt")
        assert isinstance(result[1].content, list)
        assert result[1].content[0] == {"type": "text", "text": "質問1"}
        assert len(result[1].content) == 2
        assert result[2] == ChatMessage(role="assistant", content="回答1")
        assert isinstance(result[3].content, list)
        assert result[3].content[0] == {"type": "text", "text": "質問2"}
        assert [part["type"] for part in result[3].content[1:]] == [
            "image_url",
            "image_url",
        ]

    def test_trims_role_when_judging_user_turn(self) -> None:
        """前後に空白があるroleでもuser発話として添付すること"""
        turns = [LlmChatTurn(role=" user ", content="質問", attachments=["a.png"])]
        result = self._apply(turns, [self._file("a.png")])

        assert isinstance(result[0].content, list)
        assert result[0].content[1]["type"] == "image_url"

    def test_ignores_attachments_on_non_user_turns(self) -> None:
        """system/assistant発話のattachmentsは無視し、エラーにもしないこと"""
        turns = [
            LlmChatTurn(role="system", content="指示", attachments=["missing.png"]),
            LlmChatTurn(role="assistant", content="回答", attachments=["a.png"]),
        ]
        result = self._apply(turns, [self._file("a.png")])

        assert result == [
            ChatMessage(role="system", content="指示"),
            ChatMessage(role="assistant", content="回答"),
        ]

    def test_raises_400_when_attachment_name_not_found(self) -> None:
        """attachmentsにアップロードされていないファイル名がある場合400になること"""
        turns = [LlmChatTurn(role="user", content="質問", attachments=["x.png"])]

        with pytest.raises(HTTPException) as exc_info:
            self._apply(turns, [self._file("a.png")])

        assert exc_info.value.status_code == 400
        assert exc_info.value.detail == (
            "messages 内の添付ファイル名に一致するファイルがありません: x.png"
        )

    def test_skips_empty_files_when_indexing(self) -> None:
        """空のファイルは突き合わせの対象にせず、指定されると400になること"""
        turns = [LlmChatTurn(role="user", content="質問", attachments=["empty.png"])]

        with pytest.raises(HTTPException) as exc_info:
            self._apply(turns, [self._file("empty.png", data=b"")])

        assert exc_info.value.status_code == 400

    def test_does_not_attach_to_system_turn_downgraded_to_user(self) -> None:
        """ライブラリ生成でuserへ降格したsystem発話には添付しないこと"""
        turns = [
            LlmChatTurn(role="system", content="指示", attachments=["a.png"]),
            LlmChatTurn(role="user", content="質問"),
        ]
        downgraded = LlmChatService._downgrade_system_turns_to_user(
            [ChatMessage(role=t.role, content=t.content) for t in turns]
        )
        result = LlmChatService._apply_attachment_files(
            downgraded, turns, [self._file("a.png")]
        )

        assert result == [
            ChatMessage(role="user", content="指示"),
            ChatMessage(role="user", content="質問"),
        ]


class TestStreamChatWithAttachmentFiles:
    """LlmChatService.stream_chat の添付ファイル関連テスト"""

    @patch("app.services.llm_chat_service.get_session_maker")
    @patch("app.services.llm_chat_service.AzureLlmChatClient.stream_chat")
    @patch("app.services.llm_chat_service.enforce_within_quota", new_callable=AsyncMock)
    @patch(
        "app.services.llm_chat_service.TenantEndpointRepository.find_by_tenant_id_and_type",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.llm_chat_service.AIModelRepository.find_by_name_and_endpoint_types",
        new_callable=AsyncMock,
    )
    async def test_passes_multimodal_content_to_azure_when_attachment_files_present(
        self,
        mock_find_model: MagicMock,
        mock_find_endpoints: MagicMock,
        mock_enforce: MagicMock,
        mock_stream_chat: MagicMock,
        mock_get_session_maker: MagicMock,
        test_user: User,
    ) -> None:
        """発話のattachmentsで指定した添付ファイルが、そのuser発話にマルチモーダル形式で渡されること"""
        from app.core.llm_client import ChatStreamChunk

        mock_find_model.return_value = _ai_model()
        mock_find_endpoints.return_value = [_tenant_endpoint()]
        mock_stream_chat.return_value = _AsyncChunkIterator(
            [ChatStreamChunk(text_delta="回答")]
        )

        mock_new_session = AsyncMock()
        mock_new_session.__aenter__.return_value = mock_new_session
        mock_new_session.add = MagicMock()
        mock_session_maker = MagicMock(return_value=mock_new_session)
        mock_get_session_maker.return_value = mock_session_maker

        req = _request(
            messages=[
                LlmChatTurn(
                    role="user", content="この画像は？", attachments=["photo.png"]
                )
            ],
            attachmentFiles=[
                AttachmentFile(name="photo.png", type="image/png", data=b"data")
            ],
        )
        response = await LlmChatService.stream_chat(
            "tenant-1",
            test_user,
            req,
            session=None,  # type: ignore[arg-type]
        )
        await _consume(response)

        sent_messages = mock_stream_chat.call_args.args[3]
        assert isinstance(sent_messages[-1].content, list)
        assert sent_messages[-1].content[1]["type"] == "image_url"


class TestStreamChatPersistFailure:
    """LlmChatService.stream_chat の保存処理が失敗した場合のテスト（Issue #254）"""

    @pytest.fixture
    def stream_mocks(self) -> Iterator[dict[str, MagicMock]]:
        """ストリーミング開始前のDB検証・LLM呼び出し・保存処理をモックする。"""
        prefix = "app.services.llm_chat_service"
        with (
            patch(
                f"{prefix}.AIModelRepository.find_by_name_and_endpoint_types",
                new_callable=AsyncMock,
                return_value=_ai_model(),
            ),
            patch(
                f"{prefix}.TenantEndpointRepository.find_by_tenant_id_and_type",
                new_callable=AsyncMock,
                return_value=[_tenant_endpoint()],
            ),
            patch(f"{prefix}.enforce_within_quota", new_callable=AsyncMock),
            patch(
                f"{prefix}.MessageRepository.find_by_tenant_id_and_id",
                new_callable=AsyncMock,
                return_value=MagicMock(id="msg-1", room_id="room-1"),
            ),
            patch(f"{prefix}.require_owned_room", new_callable=AsyncMock),
            patch(
                f"{prefix}.SystemPromptTemplateRepository.find_by_type",
                new_callable=AsyncMock,
                return_value=MagicMock(content="ライブラリ生成用システムプロンプト"),
            ),
            patch(f"{prefix}.AzureLlmChatClient.stream_chat") as mock_stream_chat,
            patch.object(
                LlmChatService, "_persist_library", new_callable=AsyncMock
            ) as mock_persist_library,
            patch.object(
                LlmChatService, "_persist_token_usage", new_callable=AsyncMock
            ) as mock_persist_usage,
        ):
            yield {
                "stream_chat": mock_stream_chat,
                "persist_library": mock_persist_library,
                "persist_usage": mock_persist_usage,
            }

    async def test_closes_stream_normally_when_persist_token_usage_fails(
        self, stream_mocks: dict[str, MagicMock], test_user: User
    ) -> None:
        """トークン使用量の保存で例外が起きても、送信済みのイベントのあとストリームを正常に閉じること"""
        from app.core.llm_client import ChatStreamChunk

        stream_mocks["stream_chat"].return_value = _AsyncChunkIterator(
            [
                ChatStreamChunk(text_delta="こんにちは"),
                ChatStreamChunk(input_tokens=10, output_tokens=5),
            ]
        )
        stream_mocks["persist_usage"].side_effect = RuntimeError("db error")

        response = await LlmChatService.stream_chat(
            "tenant-1",
            test_user,
            _request(),
            session=None,  # type: ignore[arg-type]
        )
        body = b"".join(await _consume(response)).decode()

        # 移植元はmessage_stopを送ってストリームを閉じた後に保存するため、
        # 保存の失敗をerrorイベントとして通知しないこと
        assert _sse_events(body) == [
            {"type": "text_delta", "text": "こんにちは"},
            {"type": "message_stop", "inputTokens": 10, "outputTokens": 5},
        ]
        stream_mocks["persist_usage"].assert_awaited_once()

    async def test_persists_token_usage_even_when_persist_library_fails(
        self, stream_mocks: dict[str, MagicMock], test_user: User
    ) -> None:
        """ライブラリの保存で例外が起きても、トークン使用量を保存しストリームを正常に閉じること"""
        from app.core.llm_client import ChatStreamChunk

        stream_mocks["stream_chat"].return_value = _AsyncChunkIterator(
            [
                ChatStreamChunk(text_delta="<<<TITLE>>>\nタイトルA\n"),
                ChatStreamChunk(text_delta="<<<CONTENT>>>\n本文B\n"),
                ChatStreamChunk(input_tokens=10, output_tokens=5),
            ]
        )
        stream_mocks["persist_library"].side_effect = RuntimeError("db error")

        response = await LlmChatService.stream_chat(
            "tenant-1",
            test_user,
            _request(messageId="msg-1", createLibrary=True),
            session=None,  # type: ignore[arg-type]
        )
        events = _sse_events(b"".join(await _consume(response)).decode())

        assert events[-1] == {
            "type": "message_stop",
            "inputTokens": 10,
            "outputTokens": 5,
        }
        stream_mocks["persist_library"].assert_awaited_once()
        stream_mocks["persist_usage"].assert_awaited_once()
