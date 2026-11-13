import json
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

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
from typing import Any
from app.models.user import User
from collections.abc import AsyncIterator
from collections.abc import Iterator
from sqlalchemy.ext.asyncio import AsyncSession


def _ai_model(name: str = "gpt-4o", token_weight: str = "1.0") -> AIModel:
    """テスト用のAIモデルを作る。"""
    return AIModel(
        id=1,
        endpoint_type=AIModelEndpointType.AZURE_OPENAI_CHAT,
        name=name,
        max_tokens=4096,
        token_weight=Decimal(token_weight),
    )


def _tenant_endpoint(endpoint_id: str = "endpoint-1") -> TenantEndpoint:
    """テスト用のテナントエンドポイントを作る。"""
    return TenantEndpoint(
        id=endpoint_id,
        tenant_id="tenant-1",
        type=EndpointType.AZURE_OPENAI_CHAT,
        endpoint_name="azure",
        endpoint="https://example.openai.azure.com",
        api_key="api-key",
    )


def _assistant_endpoint(model: str = "gpt-4o") -> AssistantEndpoint:
    """テスト用のアシスタントエンドポイントを作る。"""
    return AssistantEndpoint(
        assistant_id="assistant-1",
        endpoint_id="endpoint-1",
        tenant_id="tenant-1",
        model=model,
    )


def _assistant(assistant_type: AssistantType = AssistantType.SAAS_CHAT) -> Assistant:
    """テスト用のアシスタントを作る。"""
    return Assistant(
        id="assistant-1",
        tenant_id="tenant-1",
        type=assistant_type,
        name="Assistant",
        include_history=False,
    )


def _message(assistant_id: str | None = "assistant-1") -> MagicMock:
    """テスト用のメッセージを模したモックを作る。"""
    return MagicMock(id="msg-1", room_id="room-1", assistant_id=assistant_id)


def _rag_assistant(index_id: str | None = "index-1") -> Assistant:
    """テスト用のRAGアシスタントを作る。"""
    return Assistant(
        id="assistant-1",
        tenant_id="tenant-1",
        type=AssistantType.SAAS_RAG,
        name="RAG Assistant",
        include_history=False,
        index_id=index_id,
    )


def _index(index_id: str = "index-1") -> Index:
    """テスト用のインデックスを作る。"""
    return Index(id=index_id, tenant_id="tenant-1", type=IndexType.LOCAL, name="Index")


def _embedding_endpoint(endpoint_id: str = "embed-endpoint-1") -> TenantEndpoint:
    """テスト用の埋め込み用エンドポイントを作る。"""
    return TenantEndpoint(
        id=endpoint_id,
        tenant_id="tenant-1",
        type=EndpointType.AZURE_OPENAI_EMBEDDING,
        endpoint_name="azure-embedding",
        endpoint="https://example-embedding.openai.azure.com",
        api_key="embedding-api-key",
    )


def _vdb_endpoint(tenant_id: str = "tenant-1") -> TenantEndpoint:
    """テスト用のベクトルDBエンドポイントを作る。"""
    return TenantEndpoint(
        id="vdb-endpoint-1",
        tenant_id=tenant_id,
        type=EndpointType.VDB,
        endpoint_name="azure-search",
        endpoint="https://example-search.search.windows.net",
        api_key="vdb-api-key",
    )


def _file(file_id: str, reference: str | None) -> File:
    """テスト用のファイルを作る。"""
    return File(
        id=file_id,
        tenant_id="tenant-1",
        name=f"{file_id}.txt",
        reference=reference,
        status=FileStatus.ENABLE,
        user_id="11111111-1111-1111-1111-111111111111",
        index_id="index-1",
    )


def _sse_events(body: str) -> list[dict]:
    """SSE本文を、`type`を持つイベントの一覧へ変換する。

    secuaigent/clientの`parseSseDataLine`/`parseStreamEvent`と同じく`data:`行だけを
    JSONとして読み、種別`type`で判定する。frontendは`error`を処理せず捨てるが、
    サーバーが送る内容を検証するため、ここでは`type`を持つイベントをすべて返す。

    Parameters
    ----------
    body : str
        SSEレスポンスの本文。

    Returns
    -------
    list[dict]
        `type`を持つイベント(JSON)の一覧。
    """
    events = []
    for line in body.splitlines():
        if line.startswith("data:"):
            event = json.loads(line[len("data:") :].strip())
            if "type" in event:
                events.append(event)
    return events


def _request(**overrides: Any) -> MessageContentCreateRequest:
    """テスト用のリクエストを作る（`overrides` で既定値を上書きする）。"""
    defaults = {
        "messageId": "msg-1",
        "userInput": "こんにちは",
        "historyMessages": [],
    }
    defaults.update(overrides)
    return MessageContentCreateRequest(**defaults)


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


def _mock_new_session() -> MagicMock:
    """新規セッションを模した非同期モックを作る。"""
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
        self, mock_find_message: MagicMock, test_user: User
    ) -> None:
        """指定messageIdのメッセージが存在しない場合404になること"""
        mock_find_message.return_value = None

        with pytest.raises(HTTPException) as exc_info:
            await MessageService.stream_message_content(
                "tenant-1",
                test_user,
                _request(),
                session=None,  # type: ignore[arg-type]
            )

        assert exc_info.value.status_code == 404

    @patch("app.services.message_service.require_owned_room", new_callable=AsyncMock)
    @patch(
        "app.services.message_service.MessageRepository.find_by_tenant_id_and_id",
        new_callable=AsyncMock,
    )
    async def test_raises_403_when_room_not_owned(
        self,
        mock_find_message: MagicMock,
        mock_require_owned_room: MagicMock,
        test_user: User,
    ) -> None:
        """対象メッセージが所属するルームの所有者でない場合403になること"""
        mock_find_message.return_value = _message()
        mock_require_owned_room.side_effect = HTTPException(
            status_code=403, detail="Access Denied"
        )

        with pytest.raises(HTTPException) as exc_info:
            await MessageService.stream_message_content(
                "tenant-1",
                test_user,
                _request(),
                session=None,  # type: ignore[arg-type]
            )

        assert exc_info.value.status_code == 403

    @patch("app.services.message_service.require_owned_room", new_callable=AsyncMock)
    @patch(
        "app.services.message_service.MessageRepository.find_by_tenant_id_and_id",
        new_callable=AsyncMock,
    )
    async def test_raises_400_when_message_has_no_assistant_id(
        self,
        mock_find_message: MagicMock,
        mock_require_owned_room: MagicMock,
        test_user: User,
    ) -> None:
        """対象メッセージにassistant_idが紐づいていない場合400になること"""
        mock_find_message.return_value = _message(assistant_id=None)

        with pytest.raises(HTTPException) as exc_info:
            await MessageService.stream_message_content(
                "tenant-1",
                test_user,
                _request(),
                session=None,  # type: ignore[arg-type]
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
        mock_find_message: MagicMock,
        mock_require_owned_room: MagicMock,
        mock_find_assistant: MagicMock,
        test_user: User,
    ) -> None:
        """メッセージのassistant_idに対応するアシスタントが存在しない場合400になること"""
        mock_find_message.return_value = _message()
        mock_find_assistant.return_value = None

        with pytest.raises(HTTPException) as exc_info:
            await MessageService.stream_message_content(
                "tenant-1",
                test_user,
                _request(),
                session=None,  # type: ignore[arg-type]
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
        mock_find_message: MagicMock,
        mock_require_owned_room: MagicMock,
        mock_find_assistant: MagicMock,
        test_user: User,
    ) -> None:
        """アシスタント種別がSECUREの場合400になること"""
        mock_find_message.return_value = _message()
        mock_find_assistant.return_value = _assistant(AssistantType.SECURE)

        with pytest.raises(HTTPException) as exc_info:
            await MessageService.stream_message_content(
                "tenant-1",
                test_user,
                _request(),
                session=None,  # type: ignore[arg-type]
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
        mock_find_message: MagicMock,
        mock_require_owned_room: MagicMock,
        mock_find_assistant: MagicMock,
        mock_enforce: MagicMock,
        test_user: User,
    ) -> None:
        """テナントのクレジット上限を超過している場合429になること"""
        mock_find_message.return_value = _message()
        mock_find_assistant.return_value = _assistant()
        mock_enforce.side_effect = HTTPException(status_code=429, detail="quota")

        with pytest.raises(HTTPException) as exc_info:
            await MessageService.stream_message_content(
                "tenant-1",
                test_user,
                _request(),
                session=None,  # type: ignore[arg-type]
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
        mock_find_message: MagicMock,
        mock_require_owned_room: MagicMock,
        mock_find_assistant: MagicMock,
        mock_enforce: MagicMock,
        mock_find_endpoint: MagicMock,
        test_user: User,
    ) -> None:
        """アシスタントに紐づくチャットエンドポイントが存在しない場合400になること"""
        mock_find_message.return_value = _message()
        mock_find_assistant.return_value = _assistant()
        mock_find_endpoint.return_value = None

        with pytest.raises(HTTPException) as exc_info:
            await MessageService.stream_message_content(
                "tenant-1",
                test_user,
                _request(),
                session=None,  # type: ignore[arg-type]
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
        mock_find_message: MagicMock,
        mock_require_owned_room: MagicMock,
        mock_find_assistant: MagicMock,
        mock_enforce: MagicMock,
        mock_find_endpoint: MagicMock,
        mock_find_model: MagicMock,
        test_user: User,
    ) -> None:
        """アシスタントのエンドポイントに対応するAIモデルが存在しない場合400になること"""
        mock_find_message.return_value = _message()
        mock_find_assistant.return_value = _assistant()
        mock_find_endpoint.return_value = (_assistant_endpoint(), _tenant_endpoint())
        mock_find_model.return_value = None

        with pytest.raises(HTTPException) as exc_info:
            await MessageService.stream_message_content(
                "tenant-1",
                test_user,
                _request(),
                session=None,  # type: ignore[arg-type]
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
        mock_find_message: MagicMock,
        mock_require_owned_room: MagicMock,
        mock_find_assistant: MagicMock,
        mock_enforce: MagicMock,
        mock_find_endpoint: MagicMock,
        mock_find_model: MagicMock,
        mock_stream_chat: MagicMock,
        mock_find_room: MagicMock,
        mock_save_content: MagicMock,
        mock_get_session_maker: MagicMock,
        test_user: User,
    ) -> None:
        """text_delta・message_stop・message_contentイベントを順に送出し、内容を永続化すること"""
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
            "tenant-1",
            test_user,
            _request(),
            session=None,  # type: ignore[arg-type]
        )
        chunks = await _consume(response)
        body = b"".join(chunks).decode()

        # 移植元と同じく、イベント名の行は付けずdata行のJSONのtypeで種別を表すこと
        assert "event:" not in body
        events = _sse_events(body)
        assert [event["type"] for event in events] == [
            "text_delta",
            "text_delta",
            "message_stop",
            "message_content",
        ]
        assert [event["text"] for event in events[:2]] == ["こんに", "ちは"]
        assert events[2]["inputTokens"] == 10
        assert events[2]["outputTokens"] == 5
        assert events[3]["data"]["id"] == "content-1"
        assert events[3]["data"]["status"] == "OK"
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
        mock_find_message: MagicMock,
        mock_require_owned_room: MagicMock,
        mock_find_assistant: MagicMock,
        mock_enforce: MagicMock,
        mock_find_endpoint: MagicMock,
        mock_find_model: MagicMock,
        mock_stream_chat: MagicMock,
        mock_find_room: MagicMock,
        mock_save_content: MagicMock,
        mock_get_session_maker: MagicMock,
        test_user: User,
    ) -> None:
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
            session=None,  # type: ignore[arg-type]
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
        mock_find_message: MagicMock,
        mock_require_owned_room: MagicMock,
        mock_find_assistant: MagicMock,
        mock_enforce: MagicMock,
        mock_find_endpoint: MagicMock,
        mock_find_model: MagicMock,
        mock_stream_chat: MagicMock,
        mock_find_room: MagicMock,
        mock_save_content: MagicMock,
        mock_get_session_maker: MagicMock,
        test_user: User,
    ) -> None:
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
            "tenant-1",
            test_user,
            _request(),
            session=None,  # type: ignore[arg-type]
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
        mock_find_message: MagicMock,
        mock_require_owned_room: MagicMock,
        mock_find_assistant: MagicMock,
        mock_enforce: MagicMock,
        mock_find_endpoint: MagicMock,
        mock_find_model: MagicMock,
        mock_stream_chat: MagicMock,
        mock_find_room: MagicMock,
        mock_save_content: MagicMock,
        mock_get_session_maker: MagicMock,
        test_user: User,
    ) -> None:
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
        mock_find_message: MagicMock,
        mock_require_owned_room: MagicMock,
        mock_find_assistant: MagicMock,
        mock_enforce: MagicMock,
        mock_find_endpoint: MagicMock,
        mock_find_model: MagicMock,
        mock_stream_chat: MagicMock,
        mock_find_room: MagicMock,
        mock_save_content: MagicMock,
        mock_get_session_maker: MagicMock,
        test_user: User,
    ) -> None:
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
        mock_find_message: MagicMock,
        mock_require_owned_room: MagicMock,
        mock_find_assistant: MagicMock,
        mock_enforce: MagicMock,
        mock_find_endpoint: MagicMock,
        mock_find_model: MagicMock,
        mock_stream_chat: MagicMock,
        mock_find_room: MagicMock,
        mock_save_content: MagicMock,
        mock_get_session_maker: MagicMock,
        test_user: User,
    ) -> None:
        """Azure呼び出し中に例外が発生した場合、errorイベント送出後ERRORステータスで永続化すること"""
        from app.models.message import MessageContent, MessageContentStatus

        async def _raise(*args: Any, **kwargs: Any) -> AsyncIterator[Any]:
            """最初に例外を送出する非同期ジェネレータ。"""
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
            "tenant-1",
            test_user,
            _request(),
            session=None,  # type: ignore[arg-type]
        )
        chunks = await _consume(response)
        body = b"".join(chunks).decode()

        # 移植元と同じく、errorイベントの後にERRORステータスのmessage_contentが届くこと
        events = _sse_events(body)
        assert [event["type"] for event in events] == ["error", "message_content"]
        assert "azure error" in events[0]["message"]
        assert events[1]["data"]["status"] == "ERROR"

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
        mock_find_message: MagicMock,
        mock_require_owned_room: MagicMock,
        mock_find_assistant: MagicMock,
        mock_enforce: MagicMock,
        mock_find_endpoint: MagicMock,
        mock_find_model: MagicMock,
        mock_stream_chat: MagicMock,
        mock_find_room: MagicMock,
        mock_save_content: MagicMock,
        mock_get_session_maker: MagicMock,
        test_user: User,
    ) -> None:
        """途中までtext_deltaを配信後に例外が発生した場合、例外メッセージで回答を上書きしないこと"""
        from app.core.llm_client import ChatStreamChunk
        from app.models.message import MessageContent, MessageContentStatus

        async def _raise_after_first_chunk(
            *args: Any, **kwargs: Any
        ) -> AsyncIterator[Any]:
            """最初のチャンクを返した後に例外を送出する非同期ジェネレータ。"""
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
            "tenant-1",
            test_user,
            _request(),
            session=None,  # type: ignore[arg-type]
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
        mock_find_message: MagicMock,
        mock_require_owned_room: MagicMock,
        mock_find_assistant: MagicMock,
        mock_enforce: MagicMock,
        mock_find_endpoint: MagicMock,
        mock_find_model: MagicMock,
        mock_stream_chat: MagicMock,
        mock_find_room: MagicMock,
        mock_save_content: MagicMock,
        mock_get_session_maker: MagicMock,
        test_user: User,
    ) -> None:
        """クライアント切断でジェネレータがaclose()された場合でも、内容とトークン使用量を永続化すること"""
        from app.core.llm_client import ChatStreamChunk
        from app.models.message import MessageContent, MessageContentStatus

        async def _hang_after_first_chunk(
            *args: Any, **kwargs: Any
        ) -> AsyncIterator[Any]:
            """最初のチャンクを返した後に待ち続ける非同期ジェネレータ。"""
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
            "tenant-1",
            test_user,
            _request(),
            session=None,  # type: ignore[arg-type]
        )
        agen = response.body_iterator
        # message_stopまで届く前に切断された状況を模すため、text_deltaイベントを
        # 1件読み進めた直後にaclose()し、GeneratorExitを送出させる。
        await agen.__anext__()  # type: ignore[attr-defined]
        await agen.aclose()  # type: ignore[attr-defined]

        # GeneratorExitはfinallyでの永続化を妨げないこと（try/exceptでは捕捉されない
        # BaseException派生のため、finallyへ確実に到達している必要がある）。
        mock_save_content.assert_awaited_once()
        saved_content = mock_save_content.await_args.args[0]
        assert saved_content.answer == "途中まで"


class TestStreamMessageContentRegenerate:
    """MessageService.stream_message_content のmessageContentId(再生成)分岐のテスト"""

    @patch(
        "app.services.message_service.MessageContentRepository.find_by_id_and_tenant_id",
        new_callable=AsyncMock,
    )
    async def test_raises_404_when_message_content_not_found_for_regenerate(
        self, mock_find_content: MagicMock, test_user: User
    ) -> None:
        """指定messageContentIdのメッセージ内容が存在しない場合404になること"""
        mock_find_content.return_value = None

        with pytest.raises(HTTPException) as exc_info:
            await MessageService.stream_message_content(
                "tenant-1",
                test_user,
                _request(messageId=None, messageContentId="content-1"),
                session=None,  # type: ignore[arg-type]
            )

        assert exc_info.value.status_code == 404

    @patch("app.services.message_service.get_session_maker")
    @patch("app.services.message_service.MessageContentRepository.update_answer")
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
    @patch(
        "app.services.message_service.MessageContentRepository.find_by_id_and_tenant_id",
        new_callable=AsyncMock,
    )
    async def test_regenerates_existing_content_and_overwrites_answer(
        self,
        mock_find_content: MagicMock,
        mock_find_message: MagicMock,
        mock_require_owned_room: MagicMock,
        mock_find_assistant: MagicMock,
        mock_enforce: MagicMock,
        mock_find_endpoint: MagicMock,
        mock_find_model: MagicMock,
        mock_stream_chat: MagicMock,
        mock_find_room: MagicMock,
        mock_update_answer: MagicMock,
        mock_get_session_maker: MagicMock,
        test_user: User,
    ) -> None:
        """messageContentId指定時、既存の回答が上書きされ質問文は変更されないこと"""
        from app.core.llm_client import ChatStreamChunk
        from app.models.message import MessageContent, MessageContentStatus

        mock_find_content.return_value = MessageContent(
            id="content-1",
            tenant_id="tenant-1",
            message_id="msg-1",
            status=MessageContentStatus.OK,
            question="元の質問",
            answer="元の回答",
        )
        mock_find_message.return_value = _message()
        mock_find_assistant.return_value = _assistant()
        mock_find_endpoint.return_value = (_assistant_endpoint(), _tenant_endpoint())
        mock_find_model.return_value = _ai_model()
        mock_stream_chat.return_value = _AsyncChunkIterator(
            [
                ChatStreamChunk(text_delta="新しい回答"),
                ChatStreamChunk(input_tokens=10, output_tokens=5),
            ]
        )
        mock_update_answer.return_value = MessageContent(
            id="content-1",
            tenant_id="tenant-1",
            message_id="msg-1",
            status=MessageContentStatus.OK,
            question="元の質問",
            answer="新しい回答",
        )
        mock_find_room.return_value = MagicMock(updated_at=None)

        mock_new_session = _mock_new_session()
        mock_session_maker = MagicMock(return_value=mock_new_session)
        mock_get_session_maker.return_value = mock_session_maker

        response = await MessageService.stream_message_content(
            "tenant-1",
            test_user,
            _request(messageId=None, messageContentId="content-1"),
            session=None,  # type: ignore[arg-type]
        )
        chunks = await _consume(response)
        body = b"".join(chunks).decode()

        final_event = _sse_events(body)[-1]
        assert final_event["type"] == "message_content"
        assert final_event["data"]["question"] == "元の質問"
        assert final_event["data"]["answer"] == "新しい回答"

        mock_update_answer.assert_awaited_once()
        _, update_kwargs = mock_update_answer.await_args
        assert update_kwargs["answer"] == "新しい回答"
        assert update_kwargs["status"] == MessageContentStatus.OK

    @patch("app.services.message_service.get_session_maker")
    @patch("app.services.message_service.MessageContentRepository.update_answer")
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
    @patch(
        "app.services.message_service.MessageContentRepository.find_by_id_and_tenant_id",
        new_callable=AsyncMock,
    )
    async def test_emits_error_event_when_regenerate_target_deleted_during_stream(
        self,
        mock_find_content: MagicMock,
        mock_find_message: MagicMock,
        mock_require_owned_room: MagicMock,
        mock_find_assistant: MagicMock,
        mock_enforce: MagicMock,
        mock_find_endpoint: MagicMock,
        mock_find_model: MagicMock,
        mock_stream_chat: MagicMock,
        mock_update_answer: MagicMock,
        mock_get_session_maker: MagicMock,
        test_user: User,
    ) -> None:
        """再生成対象がストリーミング中に削除され永続化できない場合、最後にerrorイベントを送ること"""
        from app.core.llm_client import ChatStreamChunk
        from app.models.message import MessageContent, MessageContentStatus

        # 開始時の存在確認では見つかり、永続化時の再取得では削除済み(None)になる競合
        mock_find_content.side_effect = [
            MessageContent(
                id="content-1",
                tenant_id="tenant-1",
                message_id="msg-1",
                status=MessageContentStatus.OK,
                question="元の質問",
                answer="元の回答",
            ),
            None,
        ]
        mock_find_message.return_value = _message()
        mock_find_assistant.return_value = _assistant()
        mock_find_endpoint.return_value = (_assistant_endpoint(), _tenant_endpoint())
        mock_find_model.return_value = _ai_model()
        mock_stream_chat.return_value = _AsyncChunkIterator(
            [
                ChatStreamChunk(text_delta="新しい回答"),
                ChatStreamChunk(input_tokens=10, output_tokens=5),
            ]
        )
        mock_new_session = _mock_new_session()
        mock_get_session_maker.return_value = MagicMock(return_value=mock_new_session)

        response = await MessageService.stream_message_content(
            "tenant-1",
            test_user,
            _request(messageId=None, messageContentId="content-1"),
            session=None,  # type: ignore[arg-type]
        )
        body = b"".join(await _consume(response)).decode()

        events = _sse_events(body)
        assert [event["type"] for event in events] == [
            "text_delta",
            "message_stop",
            "error",
        ]
        assert events[-1]["message"] == "エラーが発生しました。"
        mock_update_answer.assert_not_called()

    @patch("app.services.message_service.get_session_maker")
    @patch("app.services.message_service.MessageContentRepository.update_answer")
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
    @patch(
        "app.services.message_service.MessageContentRepository.find_by_id_and_tenant_id",
        new_callable=AsyncMock,
    )
    async def test_regenerate_preserves_question_when_error_occurs(
        self,
        mock_find_content: MagicMock,
        mock_find_message: MagicMock,
        mock_require_owned_room: MagicMock,
        mock_find_assistant: MagicMock,
        mock_enforce: MagicMock,
        mock_find_endpoint: MagicMock,
        mock_find_model: MagicMock,
        mock_stream_chat: MagicMock,
        mock_find_room: MagicMock,
        mock_update_answer: MagicMock,
        mock_get_session_maker: MagicMock,
        test_user: User,
    ) -> None:
        """再生成中にエラーが発生した場合もERRORステータスで上書きされ質問文は保持されること"""
        from app.models.message import MessageContent, MessageContentStatus

        async def _raise(*args: Any, **kwargs: Any) -> AsyncIterator[Any]:
            """最初に例外を送出する非同期ジェネレータ。"""
            raise RuntimeError("azure error")
            yield  # pragma: no cover - ジェネレータにするためのダミー

        mock_find_content.return_value = MessageContent(
            id="content-1",
            tenant_id="tenant-1",
            message_id="msg-1",
            status=MessageContentStatus.OK,
            question="元の質問",
            answer="元の回答",
        )
        mock_find_message.return_value = _message()
        mock_find_assistant.return_value = _assistant()
        mock_find_endpoint.return_value = (_assistant_endpoint(), _tenant_endpoint())
        mock_find_model.return_value = _ai_model()
        mock_stream_chat.return_value = _raise()
        mock_update_answer.return_value = MessageContent(
            id="content-1",
            tenant_id="tenant-1",
            message_id="msg-1",
            status=MessageContentStatus.ERROR,
            question="元の質問",
            answer="",
        )
        mock_find_room.return_value = None

        mock_new_session = _mock_new_session()
        mock_session_maker = MagicMock(return_value=mock_new_session)
        mock_get_session_maker.return_value = mock_session_maker

        response = await MessageService.stream_message_content(
            "tenant-1",
            test_user,
            _request(messageId=None, messageContentId="content-1"),
            session=None,  # type: ignore[arg-type]
        )
        await _consume(response)

        mock_update_answer.assert_awaited_once()
        _, update_kwargs = mock_update_answer.await_args
        assert update_kwargs["status"] == MessageContentStatus.ERROR
        assert update_kwargs["answer"] == ""


class TestStreamMessageContentCreateLibrary:
    """MessageService.stream_message_content のライブラリ生成(isCreateLibrary)モードのテスト"""

    def _library_prompt(self) -> MagicMock:
        """ライブラリ生成用のシステムプロンプトを模したモックを作る。"""
        return MagicMock(content="ライブラリ生成用システムプロンプト")

    @patch("app.services.message_service.get_session_maker")
    @patch(
        "app.services.message_service.LibraryRepository.create_with_content",
        new_callable=AsyncMock,
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
        mock_find_message: MagicMock,
        mock_require_owned_room: MagicMock,
        mock_find_assistant: MagicMock,
        mock_enforce: MagicMock,
        mock_find_endpoint: MagicMock,
        mock_find_model: MagicMock,
        mock_stream_chat: MagicMock,
        mock_find_room: MagicMock,
        mock_save_content: MagicMock,
        mock_find_prompt: MagicMock,
        mock_save_library: MagicMock,
        mock_get_session_maker: MagicMock,
        test_user: User,
    ) -> None:
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
            "tenant-1",
            test_user,
            _request(isCreateLibrary=True),
            session=None,  # type: ignore[arg-type]
        )
        chunks = await _consume(response)
        body = b"".join(chunks).decode()

        events = _sse_events(body)
        texts_by_type: dict[str, str] = {}
        for event in events:
            if "text" in event:
                texts_by_type[event["type"]] = (
                    texts_by_type.get(event["type"], "") + event["text"]
                )
        assert texts_by_type["library_title_delta"].startswith("タイトルA")
        assert texts_by_type["library_content_delta"].startswith("本文B")
        assert texts_by_type["text_delta"] == "コメントC"
        assert [event["type"] for event in events][-2:] == [
            "message_stop",
            "message_content",
        ]

        mock_save_library.assert_awaited_once()
        saved_library = mock_save_library.await_args.args[0]
        assert saved_library.title == "タイトルA"
        assert mock_save_library.await_args.args[1] == "本文B"
        assert saved_library.tenant_id == "tenant-1"
        assert saved_library.message_id == "msg-1"

    @patch("app.services.message_service.get_session_maker")
    @patch(
        "app.services.message_service.LibraryRepository.create_with_content",
        new_callable=AsyncMock,
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
        mock_find_message: MagicMock,
        mock_require_owned_room: MagicMock,
        mock_find_assistant: MagicMock,
        mock_enforce: MagicMock,
        mock_find_endpoint: MagicMock,
        mock_find_model: MagicMock,
        mock_stream_chat: MagicMock,
        mock_find_room: MagicMock,
        mock_save_content: MagicMock,
        mock_find_prompt: MagicMock,
        mock_save_library: MagicMock,
        mock_get_session_maker: MagicMock,
        test_user: User,
    ) -> None:
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
            "tenant-1",
            test_user,
            _request(isCreateLibrary=True),
            session=None,  # type: ignore[arg-type]
        )
        chunks = await _consume(response)
        body = b"".join(chunks).decode()

        assert '"text": "「ライブラリ」を作成しました"' in body
        saved_library = mock_save_library.await_args.args[0]
        assert saved_library.title == "ライブラリ"

    @patch("app.services.message_service.get_session_maker")
    @patch(
        "app.services.message_service.LibraryRepository.create_with_content",
        new_callable=AsyncMock,
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
        mock_find_message: MagicMock,
        mock_require_owned_room: MagicMock,
        mock_find_assistant: MagicMock,
        mock_enforce: MagicMock,
        mock_find_endpoint: MagicMock,
        mock_find_model: MagicMock,
        mock_stream_chat: MagicMock,
        mock_find_room: MagicMock,
        mock_save_content: MagicMock,
        mock_find_prompt: MagicMock,
        mock_save_library: MagicMock,
        mock_get_session_maker: MagicMock,
        test_user: User,
    ) -> None:
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
            "tenant-1",
            test_user,
            _request(isCreateLibrary=True),
            session=None,  # type: ignore[arg-type]
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
        self,
        mock_find_message: MagicMock,
        mock_require_owned_room: MagicMock,
        test_user: User,
    ) -> None:
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
                    "tenant-1",
                    test_user,
                    _request(),
                    session=None,  # type: ignore[arg-type]
                )

        assert exc_info.value.status_code == 400

    @patch("app.services.message_service.require_owned_room", new_callable=AsyncMock)
    @patch(
        "app.services.message_service.MessageRepository.find_by_tenant_id_and_id",
        new_callable=AsyncMock,
    )
    async def test_raises_400_when_rag_index_not_found(
        self,
        mock_find_message: MagicMock,
        mock_require_owned_room: MagicMock,
        test_user: User,
    ) -> None:
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
                    "tenant-1",
                    test_user,
                    _request(),
                    session=None,  # type: ignore[arg-type]
                )

        assert exc_info.value.status_code == 400

    @patch("app.services.message_service.require_owned_room", new_callable=AsyncMock)
    @patch(
        "app.services.message_service.MessageRepository.find_by_tenant_id_and_id",
        new_callable=AsyncMock,
    )
    async def test_raises_400_when_rag_embedding_endpoint_not_found(
        self,
        mock_find_message: MagicMock,
        mock_require_owned_room: MagicMock,
        test_user: User,
    ) -> None:
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
                    "tenant-1",
                    test_user,
                    _request(),
                    session=None,  # type: ignore[arg-type]
                )

        assert exc_info.value.status_code == 400

    @patch("app.services.message_service.require_owned_room", new_callable=AsyncMock)
    @patch(
        "app.services.message_service.MessageRepository.find_by_tenant_id_and_id",
        new_callable=AsyncMock,
    )
    async def test_raises_400_when_rag_vector_db_endpoint_not_found(
        self,
        mock_find_message: MagicMock,
        mock_require_owned_room: MagicMock,
        test_user: User,
    ) -> None:
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
                    "tenant-1",
                    test_user,
                    _request(),
                    session=None,  # type: ignore[arg-type]
                )

        assert exc_info.value.status_code == 400

    @patch("app.services.message_service.require_owned_room", new_callable=AsyncMock)
    @patch(
        "app.services.message_service.MessageRepository.find_by_tenant_id_and_id",
        new_callable=AsyncMock,
    )
    async def test_raises_400_when_rag_embedding_creation_fails(
        self,
        mock_find_message: MagicMock,
        mock_require_owned_room: MagicMock,
        test_user: User,
    ) -> None:
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
                    "tenant-1",
                    test_user,
                    _request(),
                    session=None,  # type: ignore[arg-type]
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
        "app.services.message_service.FileRepository.find_not_deleted_by_ids_and_tenant_id",
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
        mock_find_message: MagicMock,
        mock_require_owned_room: MagicMock,
        mock_find_assistant: MagicMock,
        mock_enforce: MagicMock,
        mock_find_endpoint: MagicMock,
        mock_find_model: MagicMock,
        mock_find_index: MagicMock,
        mock_find_index_endpoints: MagicMock,
        mock_find_vdb_endpoints: MagicMock,
        mock_create_embedding: MagicMock,
        mock_similarity_search: MagicMock,
        mock_find_files: MagicMock,
        mock_stream_chat: MagicMock,
        mock_find_room: MagicMock,
        mock_save_content: MagicMock,
        mock_get_session_maker: MagicMock,
        test_user: User,
    ) -> None:
        """ベクトル検索結果からRAGコンテキストを構築し、システムメッセージ追加・永続化すること"""
        from app.core.llm_client import ChatStreamChunk
        from app.models.message import MessageContent, MessageContentStatus

        mock_find_message.return_value = _message()
        mock_find_assistant.return_value = _rag_assistant()
        mock_find_endpoint.return_value = (_assistant_endpoint(), _tenant_endpoint())

        def _find_model_side_effect(
            endpoint_type: AIModelEndpointType, name: str, session: AsyncSession
        ) -> AIModel:
            """エンドポイント種別ごとに対応するAIモデルを返す。"""
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
            "tenant-1",
            test_user,
            _request(),
            session=None,  # type: ignore[arg-type]
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
        "app.services.message_service.FileRepository.find_not_deleted_by_ids_and_tenant_id",
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
        mock_find_message: MagicMock,
        mock_require_owned_room: MagicMock,
        mock_find_assistant: MagicMock,
        mock_enforce: MagicMock,
        mock_find_endpoint: MagicMock,
        mock_find_model: MagicMock,
        mock_find_index: MagicMock,
        mock_find_index_endpoints: MagicMock,
        mock_find_vdb_endpoints: MagicMock,
        mock_create_embedding: MagicMock,
        mock_similarity_search: MagicMock,
        mock_find_files: MagicMock,
        mock_stream_chat: MagicMock,
        mock_find_room: MagicMock,
        mock_save_content: MagicMock,
        mock_get_session_maker: MagicMock,
        test_user: User,
    ) -> None:
        """SAAS_RAGでtoolsを指定した場合、AzureLlmChatClient.stream_chatへ変換済みtoolsが渡ること"""
        from app.models.message import MessageContent, MessageContentStatus
        from app.schemas.message import ToolConfig

        def _find_model_side_effect(
            endpoint_type: AIModelEndpointType, name: str, session: AsyncSession
        ) -> AIModel:
            """エンドポイント種別ごとに対応するAIモデルを返す。"""
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
            session=None,  # type: ignore[arg-type]
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
        "app.services.message_service.FileRepository.find_not_deleted_by_ids_and_tenant_id",
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
        mock_find_message: MagicMock,
        mock_require_owned_room: MagicMock,
        mock_find_assistant: MagicMock,
        mock_enforce: MagicMock,
        mock_find_endpoint: MagicMock,
        mock_find_model: MagicMock,
        mock_find_index: MagicMock,
        mock_find_index_endpoints: MagicMock,
        mock_find_vdb_endpoints: MagicMock,
        mock_create_embedding: MagicMock,
        mock_similarity_search: MagicMock,
        mock_find_files: MagicMock,
        mock_stream_chat: MagicMock,
        mock_find_room: MagicMock,
        mock_save_content: MagicMock,
        mock_get_session_maker: MagicMock,
        test_user: User,
    ) -> None:
        """SAAS_RAGでresponseFormat指定時、JSON指示のsystemメッセージがRAGコンテキストの
        systemメッセージより先頭に来ること"""
        from app.core.llm_client import ChatStreamChunk
        from app.models.message import MessageContent, MessageContentStatus

        def _find_model_side_effect(
            endpoint_type: AIModelEndpointType, name: str, session: AsyncSession
        ) -> AIModel:
            """エンドポイント種別ごとに対応するAIモデルを返す。"""
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
            session=None,  # type: ignore[arg-type]
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
        "app.services.message_service.FileRepository.find_not_deleted_by_ids_and_tenant_id",
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
        mock_find_message: MagicMock,
        mock_require_owned_room: MagicMock,
        mock_find_assistant: MagicMock,
        mock_enforce: MagicMock,
        mock_find_endpoint: MagicMock,
        mock_find_model: MagicMock,
        mock_find_index: MagicMock,
        mock_find_index_endpoints: MagicMock,
        mock_find_vdb_endpoints: MagicMock,
        mock_create_embedding: MagicMock,
        mock_similarity_search: MagicMock,
        mock_find_files: MagicMock,
        mock_stream_chat: MagicMock,
        mock_find_room: MagicMock,
        mock_save_content: MagicMock,
        mock_get_session_maker: MagicMock,
        test_user: User,
    ) -> None:
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
            "tenant-1",
            test_user,
            _request(),
            session=None,  # type: ignore[arg-type]
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
        "app.services.message_service.FileRepository.find_not_deleted_by_ids_and_tenant_id",
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
        mock_find_message: MagicMock,
        mock_require_owned_room: MagicMock,
        mock_find_assistant: MagicMock,
        mock_enforce: MagicMock,
        mock_find_endpoint: MagicMock,
        mock_find_model: MagicMock,
        mock_find_index: MagicMock,
        mock_find_index_endpoints: MagicMock,
        mock_find_vdb_endpoints: MagicMock,
        mock_create_embedding: MagicMock,
        mock_similarity_search: MagicMock,
        mock_find_files: MagicMock,
        mock_stream_chat: MagicMock,
        mock_find_room: MagicMock,
        mock_save_content: MagicMock,
        mock_get_session_maker: MagicMock,
        test_user: User,
    ) -> None:
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
            "tenant-1",
            test_user,
            _request(),
            session=None,  # type: ignore[arg-type]
        )
        await _consume(response)

        chat_messages_arg = mock_stream_chat.call_args.args[3]
        assert chat_messages_arg[0].role == "user"

        saved_content = mock_save_content.await_args.args[0]
        assert saved_content.context is None
        assert saved_content.file_paths is None


class TestApplyAdditionalPrompt:
    """message_service._apply_additional_prompt のテスト"""

    def test_returns_as_is_when_no_additional_prompt(self) -> None:
        """additionalPrompt未指定ならそのまま返すこと"""
        messages = [ChatMessage(role="user", content="こんにちは")]
        assert _apply_additional_prompt(messages, None) == messages

    def test_prepends_to_last_user_turn(self) -> None:
        """末尾がuserロールの場合、その発話に前置すること"""
        messages = [
            ChatMessage(role="system", content="system prompt"),
            ChatMessage(role="user", content="質問1"),
        ]
        result = _apply_additional_prompt(messages, "追加指示")

        assert result[0] == messages[0]
        assert result[1] == ChatMessage(role="user", content="追加指示\n\n質問1")

    def test_skips_trailing_non_user_turns_to_find_last_user_turn(self) -> None:
        """末尾がuser以外のロールでも、遡って最後のuser発話に前置すること"""
        messages = [
            ChatMessage(role="user", content="質問1"),
            ChatMessage(role="assistant", content="回答1"),
        ]
        result = _apply_additional_prompt(messages, "追加指示")

        assert result[0] == ChatMessage(role="user", content="追加指示\n\n質問1")
        assert result[1] == messages[1]

    def test_returns_as_is_when_no_user_turn_exists(self) -> None:
        """user発話が存在しない場合は何もしないこと"""
        messages = [ChatMessage(role="assistant", content="回答のみ")]
        assert _apply_additional_prompt(messages, "追加指示") == messages


class TestMessageContentCreateRequestHistory:
    """MessageContentHistoryTurn を含むリクエストの組み立て確認"""

    def test_history_messages_default_to_empty_list(self) -> None:
        """historyMessages省略時は空リストになること"""
        req = MessageContentCreateRequest(messageId="msg-1", userInput="質問")
        assert req.historyMessages == []

    def test_history_messages_are_parsed(self) -> None:
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
        """テスト用の添付ファイルを作る。"""
        return AttachmentFile(name=name, type="image/png", data=b"data")

    def test_attachment_files_default_to_empty_list(self) -> None:
        """attachmentFiles/historyAttachmentFiles省略時は空リストになること"""
        req = MessageContentCreateRequest(messageId="msg-1", userInput="質問")
        assert req.attachmentFiles == []
        assert req.historyAttachmentFiles == []

    def test_accepts_when_history_attachment_count_mismatches(self) -> None:
        """historyAttachmentFilesの件数がattachmentsCount合計と一致しなくても、移植元と同じく受け付けること"""
        req = MessageContentCreateRequest(
            messageId="msg-1",
            userInput="質問",
            historyMessages=[
                MessageContentHistoryTurn(
                    role="user", content="過去の質問", attachmentsCount=2
                )
            ],
            historyAttachmentFiles=[self._file("a.png")],
        )
        assert len(req.historyAttachmentFiles) == 1


class TestApplyAttachmentFiles:
    """message_service._apply_attachment_files のテスト"""

    def _file(
        self, name: str = "photo.png", content_type: str = "image/png"
    ) -> AttachmentFile:
        """テスト用の添付ファイルを作る。"""
        return AttachmentFile(name=name, type=content_type, data=b"data")

    def test_returns_as_is_when_no_files(self) -> None:
        """添付ファイルがない場合そのまま返すこと"""
        messages = [ChatMessage(role="user", content="こんにちは")]
        assert _apply_attachment_files(messages, []) == messages

    def test_converts_last_user_turn_content_to_multimodal_list(self) -> None:
        """末尾のuser発話のcontentがマルチモーダル形式に変換されること"""
        messages = [
            ChatMessage(role="assistant", content="回答1"),
            ChatMessage(role="user", content="質問2"),
        ]
        result = _apply_attachment_files(messages, [self._file()])

        assert result[0] == messages[0]
        assert isinstance(result[1].content, list)
        assert result[1].content[0] == {"type": "text", "text": "質問2"}

    def test_returns_as_is_when_no_user_turn_exists(self) -> None:
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
    async def test_persists_attachment_files_and_reflects_them_in_message_content_event(
        self,
        mock_find_message: MagicMock,
        mock_require_owned_room: MagicMock,
        mock_find_assistant: MagicMock,
        mock_enforce: MagicMock,
        mock_find_endpoint: MagicMock,
        mock_find_model: MagicMock,
        mock_stream_chat: MagicMock,
        mock_find_room: MagicMock,
        mock_save_content: MagicMock,
        mock_save_attachment_files: MagicMock,
        mock_get_session_maker: MagicMock,
        test_user: User,
    ) -> None:
        """attachmentFilesを含むリクエストの場合、MessageFileを保存しmessage_contentイベントに反映すること"""
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
            "tenant-1",
            test_user,
            req,
            session=None,  # type: ignore[arg-type]
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
        mock_find_message: MagicMock,
        mock_require_owned_room: MagicMock,
        mock_find_assistant: MagicMock,
        mock_enforce: MagicMock,
        mock_find_endpoint: MagicMock,
        mock_find_model: MagicMock,
        mock_stream_chat: MagicMock,
        mock_find_room: MagicMock,
        mock_save_content: MagicMock,
        mock_save_attachment_files: MagicMock,
        mock_get_session_maker: MagicMock,
        test_user: User,
    ) -> None:
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
            "tenant-1",
            test_user,
            _request(),
            session=None,  # type: ignore[arg-type]
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
    async def test_persists_token_usage_and_emits_message_content_even_when_attachment_save_fails(
        self,
        mock_find_message: MagicMock,
        mock_require_owned_room: MagicMock,
        mock_find_assistant: MagicMock,
        mock_enforce: MagicMock,
        mock_find_endpoint: MagicMock,
        mock_find_model: MagicMock,
        mock_stream_chat: MagicMock,
        mock_find_room: MagicMock,
        mock_save_content: MagicMock,
        mock_save_attachment_files: MagicMock,
        mock_get_session_maker: MagicMock,
        test_user: User,
    ) -> None:
        """添付ファイルの永続化が失敗しても、トークン使用量の永続化とmessage_contentイベント送出は行われること"""
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
            "tenant-1",
            test_user,
            req,
            session=None,  # type: ignore[arg-type]
        )
        body = b"".join(await _consume(response)).decode()

        mock_save_attachment_files.assert_awaited_once()
        mock_new_session.rollback.assert_awaited_once()
        # 添付ファイル保存失敗後もRoom更新・message_contentイベント送出まで到達すること
        final_event = _sse_events(body)[-1]
        assert final_event["type"] == "message_content"
        assert final_event["data"]["attachmentFiles"] == []


class TestStreamMessageContentPersistFailure:
    """MessageService.stream_message_content の保存処理が失敗した場合のテスト（Issue #254）"""

    # 内部の例外文字列。errorイベントにそのまま含まれないことを確かめるために使う。
    _INTERNAL_ERROR = "db connection lost"

    @pytest.fixture
    def stream_mocks(self) -> Iterator[dict[str, MagicMock]]:
        """ストリーミング開始前のDB検証・LLM呼び出し・保存処理をモックする。"""
        from app.core.llm_client import ChatStreamChunk

        prefix = "app.services.message_service"
        with (
            patch(
                f"{prefix}.MessageRepository.find_by_tenant_id_and_id",
                new_callable=AsyncMock,
                return_value=_message(),
            ),
            patch(f"{prefix}.require_owned_room", new_callable=AsyncMock),
            patch(
                f"{prefix}.AssistantRepository.find_by_id_and_tenant_id",
                new_callable=AsyncMock,
                return_value=_assistant(),
            ),
            patch(f"{prefix}.enforce_within_quota", new_callable=AsyncMock),
            patch(
                f"{prefix}.AssistantEndpointRepository.find_chat_endpoint",
                new_callable=AsyncMock,
                return_value=(_assistant_endpoint(), _tenant_endpoint()),
            ),
            patch(
                f"{prefix}.AIModelRepository.find_by_endpoint_type_and_name",
                new_callable=AsyncMock,
                return_value=_ai_model(),
            ),
            patch(
                f"{prefix}.SystemPromptTemplateRepository.find_by_type",
                new_callable=AsyncMock,
                return_value=MagicMock(content="ライブラリ生成用システムプロンプト"),
            ),
            patch(f"{prefix}.AzureLlmChatClient.stream_chat") as mock_stream_chat,
            patch.object(
                MessageService, "_persist_message_content", new_callable=AsyncMock
            ) as mock_persist_content,
            patch.object(
                MessageService, "_persist_library", new_callable=AsyncMock
            ) as mock_persist_library,
            patch.object(
                MessageService, "_persist_token_usage", new_callable=AsyncMock
            ) as mock_persist_usage,
        ):
            mock_stream_chat.return_value = _AsyncChunkIterator(
                [
                    ChatStreamChunk(text_delta="回答"),
                    ChatStreamChunk(input_tokens=10, output_tokens=5),
                ]
            )
            mock_persist_content.return_value = MagicMock(
                model_dump=MagicMock(return_value={"id": "content-1"})
            )
            yield {
                "stream_chat": mock_stream_chat,
                "persist_content": mock_persist_content,
                "persist_library": mock_persist_library,
                "persist_usage": mock_persist_usage,
            }

    async def test_emits_error_event_when_persist_message_content_fails(
        self, stream_mocks: dict[str, MagicMock], test_user: User
    ) -> None:
        """メッセージ内容の保存でDB障害等の例外が起きた場合、errorイベントを送ってから終えること"""
        stream_mocks["persist_content"].side_effect = RuntimeError(self._INTERNAL_ERROR)

        response = await MessageService.stream_message_content(
            "tenant-1",
            test_user,
            _request(),
            session=None,  # type: ignore[arg-type]
        )
        events = _sse_events(b"".join(await _consume(response)).decode())

        assert [event["type"] for event in events] == [
            "text_delta",
            "message_stop",
            "error",
        ]
        assert events[-1]["message"] == "エラーが発生しました。"
        # 保存に失敗しても、消費済みのトークン使用量は記録すること
        stream_mocks["persist_usage"].assert_awaited_once()

    async def test_emits_error_event_without_message_content_when_persist_token_usage_fails(
        self, stream_mocks: dict[str, MagicMock], test_user: User
    ) -> None:
        """トークン使用量の保存で例外が起きた場合、message_contentを送らずerrorイベントを送ること"""
        stream_mocks["persist_usage"].side_effect = RuntimeError(self._INTERNAL_ERROR)

        response = await MessageService.stream_message_content(
            "tenant-1",
            test_user,
            _request(),
            session=None,  # type: ignore[arg-type]
        )
        events = _sse_events(b"".join(await _consume(response)).decode())

        assert [event["type"] for event in events] == [
            "text_delta",
            "message_stop",
            "error",
        ]
        assert events[-1]["message"] == "エラーが発生しました。"

    async def test_emits_error_event_without_message_content_when_persist_library_fails(
        self, stream_mocks: dict[str, MagicMock], test_user: User
    ) -> None:
        """ライブラリの保存で例外が起きた場合、message_contentを送らずerrorイベントを送ること"""
        from app.core.llm_client import ChatStreamChunk

        stream_mocks["stream_chat"].return_value = _AsyncChunkIterator(
            [
                ChatStreamChunk(text_delta="<<<TITLE>>>\nタイトルA\n"),
                ChatStreamChunk(text_delta="<<<CONTENT>>>\n本文B\n"),
                ChatStreamChunk(input_tokens=10, output_tokens=5),
            ]
        )
        stream_mocks["persist_library"].side_effect = RuntimeError(self._INTERNAL_ERROR)

        response = await MessageService.stream_message_content(
            "tenant-1",
            test_user,
            _request(isCreateLibrary=True),
            session=None,  # type: ignore[arg-type]
        )
        events = _sse_events(b"".join(await _consume(response)).decode())

        stream_mocks["persist_library"].assert_awaited_once()
        assert "message_content" not in [event["type"] for event in events]
        assert events[-1] == {"type": "error", "message": "エラーが発生しました。"}
        stream_mocks["persist_usage"].assert_awaited_once()

    async def test_does_not_expose_internal_exception_message_in_error_event(
        self, stream_mocks: dict[str, MagicMock], test_user: User
    ) -> None:
        """保存処理の例外文字列をerrorイベントにそのまま含めないこと"""
        stream_mocks["persist_content"].side_effect = RuntimeError(self._INTERNAL_ERROR)

        response = await MessageService.stream_message_content(
            "tenant-1",
            test_user,
            _request(),
            session=None,  # type: ignore[arg-type]
        )
        body = b"".join(await _consume(response)).decode()

        assert self._INTERNAL_ERROR not in body

    async def test_emits_error_events_when_llm_and_persist_both_fail(
        self, stream_mocks: dict[str, MagicMock], test_user: User
    ) -> None:
        """LLM呼び出しと保存の両方が失敗した場合も、例外を伝播せずerrorイベントを送ること"""

        async def _raise(*args: Any, **kwargs: Any) -> AsyncIterator[Any]:
            """最初に例外を送出する非同期ジェネレータ。"""
            raise RuntimeError("azure error")
            yield  # pragma: no cover - ジェネレータにするためのダミー

        stream_mocks["stream_chat"].return_value = _raise()
        stream_mocks["persist_content"].side_effect = RuntimeError(self._INTERNAL_ERROR)

        response = await MessageService.stream_message_content(
            "tenant-1",
            test_user,
            _request(),
            session=None,  # type: ignore[arg-type]
        )
        events = _sse_events(b"".join(await _consume(response)).decode())

        assert [event["type"] for event in events] == ["error", "error"]
        assert events[-1]["message"] == "エラーが発生しました。"

    async def test_does_not_raise_when_persist_fails_after_client_disconnects(
        self, stream_mocks: dict[str, MagicMock], test_user: User
    ) -> None:
        """クライアント切断後の保存で例外が起きても、ジェネレータの終了処理で例外を送出しないこと"""
        stream_mocks["persist_content"].side_effect = RuntimeError(self._INTERNAL_ERROR)

        response = await MessageService.stream_message_content(
            "tenant-1",
            test_user,
            _request(),
            session=None,  # type: ignore[arg-type]
        )
        body_iterator = response.body_iterator
        await body_iterator.__anext__()  # type: ignore[attr-defined]
        await body_iterator.aclose()  # type: ignore[attr-defined]

        stream_mocks["persist_content"].assert_awaited_once()
        stream_mocks["persist_usage"].assert_awaited_once()


_BEDROCK_MODEL = "anthropic.claude-sonnet-5"


def _bedrock_tenant_endpoint() -> TenantEndpoint:
    """テスト用のBedrockエンドポイントを作る。"""
    return TenantEndpoint(
        id="endpoint-1",
        tenant_id="tenant-1",
        type=EndpointType.BEDROCK_CHAT,
        endpoint_name="bedrock",
        endpoint="https://bedrock-mantle.ap-northeast-1.api.aws/anthropic",
        api_key="api-key",
    )


def _bedrock_ai_model() -> AIModel:
    """テスト用のBedrockのAIモデルを作る。"""
    return AIModel(
        id=2,
        endpoint_type=AIModelEndpointType.BEDROCK_CHAT,
        name=_BEDROCK_MODEL,
        max_tokens=4096,
        token_weight=Decimal("1.0"),
    )


class TestStreamMessageContentProviderDispatch:
    """MessageService.stream_message_content のプロバイダ（Azure OpenAI/Bedrock）分岐のテスト"""

    @pytest.fixture
    def mocks(self) -> Iterator[dict[str, MagicMock]]:
        """送信に必要なリポジトリ・LLMクライアント・永続化先をまとめてモックする。"""
        from app.models.message import MessageContent, MessageContentStatus

        async_targets = {
            "find_message": "MessageRepository.find_by_tenant_id_and_id",
            "require_owned_room": "require_owned_room",
            "find_assistant": "AssistantRepository.find_by_id_and_tenant_id",
            "enforce": "enforce_within_quota",
            "find_endpoint": "AssistantEndpointRepository.find_chat_endpoint",
            "find_model": "AIModelRepository.find_by_endpoint_type_and_name",
            "find_room": "RoomRepository.find_by_id_and_tenant_id",
        }
        sync_targets = {
            "azure_stream": "AzureLlmChatClient.stream_chat",
            "bedrock_stream": "BedrockLlmChatClient.stream_chat",
            "save_content": "MessageContentRepository.save",
            "get_session_maker": "get_session_maker",
        }
        patchers = {
            name: patch(
                f"app.services.message_service.{target}", new_callable=AsyncMock
            )
            for name, target in async_targets.items()
        }
        patchers.update(
            {
                name: patch(f"app.services.message_service.{target}")
                for name, target in sync_targets.items()
            }
        )
        result = {name: patcher.start() for name, patcher in patchers.items()}

        result["find_message"].return_value = _message()
        result["find_assistant"].return_value = _assistant()
        result["find_room"].return_value = MagicMock(updated_at=None)
        result["save_content"].return_value = MessageContent(
            id="content-1",
            tenant_id="tenant-1",
            message_id="msg-1",
            status=MessageContentStatus.OK,
            question="こんにちは",
            answer="こんにちは",
        )
        result["new_session"] = _mock_new_session()
        result["get_session_maker"].return_value = MagicMock(
            return_value=result["new_session"]
        )
        yield result
        for patcher in patchers.values():
            patcher.stop()

    @staticmethod
    def _added_token_usages(new_session: MagicMock) -> list[TokenUsage]:
        """新規セッションに追加されたトークン使用量を取り出す。"""
        return [
            call.args[0]
            for call in new_session.add.call_args_list
            if isinstance(call.args[0], TokenUsage)
        ]

    async def test_streams_with_bedrock_client_for_bedrock_endpoint(
        self, mocks: dict[str, MagicMock], test_user: User
    ) -> None:
        """Bedrockのエンドポイントでは、Bedrockの種別でAIモデルを検索し、Bedrockクライアントで応答して使用量にBEDROCK_CHATを記録すること"""
        from app.core.llm_client import ChatStreamChunk

        mocks["find_endpoint"].return_value = (
            _assistant_endpoint(model=_BEDROCK_MODEL),
            _bedrock_tenant_endpoint(),
        )
        mocks["find_model"].return_value = _bedrock_ai_model()
        mocks["bedrock_stream"].return_value = _AsyncChunkIterator(
            [
                ChatStreamChunk(input_tokens=10),
                ChatStreamChunk(text_delta="こんにちは"),
                ChatStreamChunk(output_tokens=5),
            ]
        )

        response = await MessageService.stream_message_content(
            "tenant-1",
            test_user,
            _request(),
            session=None,  # type: ignore[arg-type]
        )
        body = b"".join(await _consume(response)).decode()

        assert [event["type"] for event in _sse_events(body)] == [
            "text_delta",
            "message_stop",
            "message_content",
        ]
        mocks["find_model"].assert_awaited_once_with(
            AIModelEndpointType.BEDROCK_CHAT, _BEDROCK_MODEL, None
        )
        mocks["azure_stream"].assert_not_called()
        args = mocks["bedrock_stream"].call_args.args
        assert args[2] == _BEDROCK_MODEL
        # Bedrockは上限が必須のため、AIモデルの上限が渡されること
        assert args[5] == 4096
        token_usages = self._added_token_usages(mocks["new_session"])
        assert len(token_usages) == 1
        assert token_usages[0].endpoint_type == "BEDROCK_CHAT"
        assert token_usages[0].input_tokens == 10
        assert token_usages[0].output_tokens == 5

    async def test_raises_400_when_tools_specified_for_bedrock(
        self, mocks: dict[str, MagicMock], test_user: User
    ) -> None:
        """Bedrockのエンドポイントでtoolsを指定すると、ストリーミング開始前に400になりLLM呼び出し・応答保存をしないこと"""
        from app.schemas.message import ToolConfig

        mocks["find_endpoint"].return_value = (
            _assistant_endpoint(model=_BEDROCK_MODEL),
            _bedrock_tenant_endpoint(),
        )
        mocks["find_model"].return_value = _bedrock_ai_model()

        with pytest.raises(HTTPException) as exc_info:
            await MessageService.stream_message_content(
                "tenant-1",
                test_user,
                _request(tools=[ToolConfig(name="web_search")]),
                session=None,  # type: ignore[arg-type]
            )

        assert exc_info.value.status_code == 400
        assert "web_search/mcp" in exc_info.value.detail
        mocks["bedrock_stream"].assert_not_called()
        mocks["azure_stream"].assert_not_called()
        mocks["save_content"].assert_not_called()
        mocks["new_session"].add.assert_not_called()

    async def test_records_azure_endpoint_type_for_azure_endpoint(
        self, mocks: dict[str, MagicMock], test_user: User
    ) -> None:
        """Azure OpenAIのエンドポイントでは、Azureの種別でAIモデルを検索し、使用量にAZURE_OPENAI_CHATを記録すること"""
        from app.core.llm_client import ChatStreamChunk

        mocks["find_endpoint"].return_value = (
            _assistant_endpoint(),
            _tenant_endpoint(),
        )
        mocks["find_model"].return_value = _ai_model()
        mocks["azure_stream"].return_value = _AsyncChunkIterator(
            [ChatStreamChunk(input_tokens=10, output_tokens=5)]
        )

        response = await MessageService.stream_message_content(
            "tenant-1",
            test_user,
            _request(),
            session=None,  # type: ignore[arg-type]
        )
        await _consume(response)

        mocks["find_model"].assert_awaited_once_with(
            AIModelEndpointType.AZURE_OPENAI_CHAT, "gpt-4o", None
        )
        mocks["bedrock_stream"].assert_not_called()
        # Azureは従来どおり、メッセージ送信では上限を指定しない（モデルの既定値に従う）
        assert mocks["azure_stream"].call_args.args[5] is None
        token_usages = self._added_token_usages(mocks["new_session"])
        assert len(token_usages) == 1
        assert token_usages[0].endpoint_type == "AZURE_OPENAI_CHAT"
