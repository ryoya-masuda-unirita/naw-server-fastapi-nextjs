from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core.llm_client import (
    AzureLlmChatClient,
    AzureLlmEmbeddingClient,
    ChatMessage,
    ToolConfig,
    _build_responses_tool,
)


def _chat_delta_chunk(content: str | None) -> MagicMock:
    chunk = MagicMock()
    chunk.usage = None
    delta = MagicMock()
    delta.content = content
    chunk.choices = [MagicMock(delta=delta)]
    return chunk


def _chat_usage_chunk(prompt_tokens: int, completion_tokens: int) -> MagicMock:
    chunk = MagicMock()
    usage = MagicMock()
    usage.prompt_tokens = prompt_tokens
    usage.completion_tokens = completion_tokens
    chunk.usage = usage
    chunk.choices = []
    return chunk


class _AsyncChunkIterator:
    """テスト用の非同期チャンクストリーム。"""

    def __init__(self, chunks: list) -> None:
        self._chunks = chunks

    def __aiter__(self):
        return self._gen()

    async def _gen(self):
        for chunk in self._chunks:
            yield chunk


def _as_async_context_manager(mock_client: MagicMock) -> None:
    """MagicMockが`async with`で使えるよう`__aenter__`/`__aexit__`を設定する。

    `AzureLlmChatClient`/`AzureLlmEmbeddingClient`が`AsyncAzureOpenAI`を
    `async with`で使うようになったため、テスト側のモックも非同期コンテキスト
    マネージャとして振る舞う必要がある。

    Args:
        mock_client: `async with`エントリ時に返すクライアントのモック。
    """
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)


def _responses_text_delta_event(delta: str) -> MagicMock:
    event = MagicMock()
    event.type = "response.output_text.delta"
    event.delta = delta
    return event


def _responses_completed_event(input_tokens: int, output_tokens: int) -> MagicMock:
    event = MagicMock()
    event.type = "response.completed"
    usage = MagicMock()
    usage.input_tokens = input_tokens
    usage.output_tokens = output_tokens
    event.response = MagicMock(usage=usage)
    return event


def _responses_error_event(message: str) -> MagicMock:
    event = MagicMock()
    event.type = "error"
    event.message = message
    return event


def _responses_failed_event(message: str) -> MagicMock:
    event = MagicMock()
    event.type = "response.failed"
    error = MagicMock()
    error.message = message
    event.response = MagicMock(error=error)
    return event


class TestBuildResponsesTool:
    """_build_responses_tool のテスト"""

    def test_web_search_tool(self):
        """web_searchツールをResponses APIの組み込みツール宣言へ変換すること"""
        tool = ToolConfig(name="web_search")

        assert _build_responses_tool(tool) == {"type": "web_search"}

    def test_mcp_tool_minimal_fields(self):
        """mcpツールを必須項目のみで変換すること"""
        tool = ToolConfig(
            name="mcp", server_label="my-mcp", server_url="https://mcp.example.com"
        )

        assert _build_responses_tool(tool) == {
            "type": "mcp",
            "server_label": "my-mcp",
            "server_url": "https://mcp.example.com",
        }

    def test_mcp_tool_all_fields(self):
        """mcpツールの任意項目をすべて含めて変換すること"""
        tool = ToolConfig(
            name="mcp",
            server_label="my-mcp",
            server_url="https://mcp.example.com",
            authorization="secret-token",
            headers={"X-Custom": "value"},
            allowed_tools=["search", "fetch"],
            require_approval="never",
        )

        assert _build_responses_tool(tool) == {
            "type": "mcp",
            "server_label": "my-mcp",
            "server_url": "https://mcp.example.com",
            "authorization": "secret-token",
            "headers": {"X-Custom": "value"},
            "allowed_tools": ["search", "fetch"],
            "require_approval": "never",
        }

    def test_unsupported_tool_name_raises(self):
        """未対応のツール名を変換しようとするとValueErrorが送出されること"""
        tool = ToolConfig(name="unknown")

        with pytest.raises(ValueError, match="未対応のツール名"):
            _build_responses_tool(tool)


class TestAzureLlmChatClient:
    """AzureLlmChatClient.stream_chat のテスト"""

    @patch("app.core.llm_client.AsyncAzureOpenAI")
    @patch("app.core.llm_client.get_azure_openai_settings")
    async def test_uses_configured_api_version_for_chat_completions(
        self, mock_get_settings, mock_client_cls
    ):
        """Chat Completions APIは設定されたAPIバージョンでclientを生成すること"""
        mock_get_settings.return_value = MagicMock(api_version="2026-01-01")
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        _as_async_context_manager(mock_client)
        mock_client.chat.completions.create = AsyncMock(
            return_value=_AsyncChunkIterator([])
        )

        async for _ in AzureLlmChatClient.stream_chat(
            "https://example.openai.azure.com",
            "api-key",
            "gpt-4o",
            [ChatMessage(role="user", content="hi")],
            0.0,
            None,
        ):
            pass

        mock_client_cls.assert_called_once_with(
            azure_endpoint="https://example.openai.azure.com",
            api_key="api-key",
            api_version="2026-01-01",
        )

    @patch("app.core.llm_client.AsyncAzureOpenAI")
    @patch("app.core.llm_client.get_azure_openai_settings")
    async def test_uses_configured_api_version_for_responses_api(
        self, mock_get_settings, mock_client_cls
    ):
        """Responses APIは設定されたResponses用APIバージョンでclientを生成すること"""
        mock_get_settings.return_value = MagicMock(
            api_version="unused", responses_api_version="2026-02-01-preview"
        )
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        _as_async_context_manager(mock_client)
        mock_client.responses.create = AsyncMock(return_value=_AsyncChunkIterator([]))

        async for _ in AzureLlmChatClient.stream_chat(
            "https://example.openai.azure.com",
            "api-key",
            "gpt-4o",
            [ChatMessage(role="user", content="hi")],
            0.0,
            None,
            [ToolConfig(name="web_search")],
        ):
            pass

        mock_client_cls.assert_called_once_with(
            azure_endpoint="https://example.openai.azure.com",
            api_key="api-key",
            api_version="2026-02-01-preview",
        )

    @patch("app.core.llm_client.AsyncAzureOpenAI")
    async def test_yields_text_delta_then_usage(self, mock_client_cls):
        """テキスト差分を順にyieldし、最後にトークン使用量を持つチャンクをyieldすること"""
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        _as_async_context_manager(mock_client)
        mock_client.chat.completions.create = AsyncMock(
            return_value=_AsyncChunkIterator(
                [
                    _chat_delta_chunk("こんに"),
                    _chat_delta_chunk("ちは"),
                    _chat_delta_chunk(None),
                    _chat_usage_chunk(10, 5),
                ]
            )
        )

        chunks = [
            chunk
            async for chunk in AzureLlmChatClient.stream_chat(
                "https://example.openai.azure.com",
                "api-key",
                "gpt-4o",
                [ChatMessage(role="user", content="こんにちは")],
                0.0,
                None,
            )
        ]

        assert [c.text_delta for c in chunks if c.text_delta is not None] == [
            "こんに",
            "ちは",
        ]
        assert chunks[-1].input_tokens == 10
        assert chunks[-1].output_tokens == 5

    @patch("app.core.llm_client.AsyncAzureOpenAI")
    async def test_passes_max_tokens_only_when_specified(self, mock_client_cls):
        """maxTokens未指定時はcreate呼び出しにmax_tokensを含めないこと"""
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        _as_async_context_manager(mock_client)
        mock_client.chat.completions.create = AsyncMock(
            return_value=_AsyncChunkIterator([])
        )

        async for _ in AzureLlmChatClient.stream_chat(
            "https://example.openai.azure.com",
            "api-key",
            "gpt-4o",
            [ChatMessage(role="user", content="hi")],
            0.5,
            None,
        ):
            pass

        _, kwargs = mock_client.chat.completions.create.call_args
        assert "max_tokens" not in kwargs
        assert kwargs["temperature"] == 0.5
        assert kwargs["stream_options"] == {"include_usage": True}

    @patch("app.core.llm_client.AsyncAzureOpenAI")
    async def test_tools_none_uses_chat_completions(self, mock_client_cls):
        """tools未指定時はChat Completions APIが呼ばれ、Responses APIは呼ばれないこと"""
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        _as_async_context_manager(mock_client)
        mock_client.chat.completions.create = AsyncMock(
            return_value=_AsyncChunkIterator([])
        )
        mock_client.responses.create = AsyncMock()

        async for _ in AzureLlmChatClient.stream_chat(
            "https://example.openai.azure.com",
            "api-key",
            "gpt-4o",
            [ChatMessage(role="user", content="hi")],
            0.0,
            None,
            None,
        ):
            pass

        mock_client.chat.completions.create.assert_awaited_once()
        mock_client.responses.create.assert_not_awaited()

    @patch("app.core.llm_client.AsyncAzureOpenAI")
    async def test_omits_response_format_when_not_specified(self, mock_client_cls):
        """response_format未指定時はcreate呼び出しにresponse_formatを含めないこと"""
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        _as_async_context_manager(mock_client)
        mock_client.chat.completions.create = AsyncMock(
            return_value=_AsyncChunkIterator([])
        )

        async for _ in AzureLlmChatClient.stream_chat(
            "https://example.openai.azure.com",
            "api-key",
            "gpt-4o",
            [ChatMessage(role="user", content="hi")],
            0.0,
            None,
        ):
            pass

        _, kwargs = mock_client.chat.completions.create.call_args
        assert "response_format" not in kwargs

    @patch("app.core.llm_client.AsyncAzureOpenAI")
    async def test_passes_response_format_when_specified(self, mock_client_cls):
        """response_format指定時はcreate呼び出しにそのまま渡すこと"""
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        _as_async_context_manager(mock_client)
        mock_client.chat.completions.create = AsyncMock(
            return_value=_AsyncChunkIterator([])
        )

        async for _ in AzureLlmChatClient.stream_chat(
            "https://example.openai.azure.com",
            "api-key",
            "gpt-4o",
            [ChatMessage(role="user", content="hi")],
            0.0,
            None,
            None,
            {"type": "json_object"},
        ):
            pass

        _, kwargs = mock_client.chat.completions.create.call_args
        assert kwargs["response_format"] == {"type": "json_object"}

    @patch("app.core.llm_client.AsyncAzureOpenAI")
    async def test_tools_specified_uses_responses_api(self, mock_client_cls):
        """tools指定時はResponses APIが呼ばれ、変換済みtoolsが渡ること"""
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        _as_async_context_manager(mock_client)
        mock_client.responses.create = AsyncMock(return_value=_AsyncChunkIterator([]))
        mock_client.chat.completions.create = AsyncMock()

        async for _ in AzureLlmChatClient.stream_chat(
            "https://example.openai.azure.com",
            "api-key",
            "gpt-4o",
            [ChatMessage(role="user", content="hi")],
            0.0,
            None,
            [ToolConfig(name="web_search")],
        ):
            pass

        mock_client.chat.completions.create.assert_not_awaited()
        _, kwargs = mock_client.responses.create.call_args
        assert kwargs["tools"] == [{"type": "web_search"}]
        assert kwargs["input"] == [{"role": "user", "content": "hi"}]

    @patch("app.core.llm_client.AsyncAzureOpenAI")
    async def test_responses_api_yields_text_delta_then_usage(self, mock_client_cls):
        """Responses APIのテキスト差分・完了イベントをChatStreamChunkへ変換すること"""
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        _as_async_context_manager(mock_client)
        mock_client.responses.create = AsyncMock(
            return_value=_AsyncChunkIterator(
                [
                    _responses_text_delta_event("こんに"),
                    _responses_text_delta_event("ちは"),
                    _responses_completed_event(12, 6),
                ]
            )
        )

        chunks = [
            chunk
            async for chunk in AzureLlmChatClient.stream_chat(
                "https://example.openai.azure.com",
                "api-key",
                "gpt-4o",
                [ChatMessage(role="user", content="こんにちは")],
                0.0,
                None,
                [ToolConfig(name="web_search")],
            )
        ]

        assert [c.text_delta for c in chunks if c.text_delta is not None] == [
            "こんに",
            "ちは",
        ]
        assert chunks[-1].input_tokens == 12
        assert chunks[-1].output_tokens == 6

    @patch("app.core.llm_client.AsyncAzureOpenAI")
    async def test_responses_api_passes_max_output_tokens_only_when_specified(
        self, mock_client_cls
    ):
        """maxTokens未指定時はResponses API呼び出しにmax_output_tokensを含めないこと"""
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        _as_async_context_manager(mock_client)
        mock_client.responses.create = AsyncMock(return_value=_AsyncChunkIterator([]))

        async for _ in AzureLlmChatClient.stream_chat(
            "https://example.openai.azure.com",
            "api-key",
            "gpt-4o",
            [ChatMessage(role="user", content="hi")],
            0.5,
            None,
            [ToolConfig(name="web_search")],
        ):
            pass

        _, kwargs = mock_client.responses.create.call_args
        assert "max_output_tokens" not in kwargs
        assert kwargs["temperature"] == 0.5

    @patch("app.core.llm_client.AsyncAzureOpenAI")
    async def test_responses_api_raises_on_error_event(self, mock_client_cls):
        """Responses APIのerrorイベント受信時は例外を送出すること(web_search/mcp失敗時等)"""
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        _as_async_context_manager(mock_client)
        mock_client.responses.create = AsyncMock(
            return_value=_AsyncChunkIterator(
                [_responses_error_event("web_search呼び出しに失敗しました")]
            )
        )

        with pytest.raises(RuntimeError, match="web_search呼び出しに失敗しました"):
            async for _ in AzureLlmChatClient.stream_chat(
                "https://example.openai.azure.com",
                "api-key",
                "gpt-4o",
                [ChatMessage(role="user", content="hi")],
                0.0,
                None,
                [ToolConfig(name="web_search")],
            ):
                pass

    @patch("app.core.llm_client.AsyncAzureOpenAI")
    async def test_responses_api_raises_on_failed_event(self, mock_client_cls):
        """Responses APIのresponse.failedイベント受信時は例外を送出すること"""
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        _as_async_context_manager(mock_client)
        mock_client.responses.create = AsyncMock(
            return_value=_AsyncChunkIterator(
                [_responses_failed_event("mcpサーバーに接続できませんでした")]
            )
        )

        with pytest.raises(RuntimeError, match="mcpサーバーに接続できませんでした"):
            async for _ in AzureLlmChatClient.stream_chat(
                "https://example.openai.azure.com",
                "api-key",
                "gpt-4o",
                [ChatMessage(role="user", content="hi")],
                0.0,
                None,
                [
                    ToolConfig(
                        name="mcp",
                        server_label="s",
                        server_url="https://mcp.example.com",
                    )
                ],
            ):
                pass


class TestAzureLlmEmbeddingClient:
    """AzureLlmEmbeddingClient.create_embedding のテスト"""

    @patch("app.core.llm_client.AsyncAzureOpenAI")
    @patch("app.core.llm_client.get_azure_openai_settings")
    async def test_uses_configured_api_version_for_embeddings(
        self, mock_get_settings, mock_client_cls
    ):
        """Embeddings APIは設定されたAPIバージョンでclientを生成すること"""
        mock_get_settings.return_value = MagicMock(api_version="2026-01-01")
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        _as_async_context_manager(mock_client)
        response = MagicMock()
        response.data = [MagicMock(embedding=[0.1])]
        response.usage.prompt_tokens = 3
        mock_client.embeddings.create = AsyncMock(return_value=response)

        await AzureLlmEmbeddingClient.create_embedding(
            "https://example.openai.azure.com",
            "api-key",
            "text-embedding-3-small",
            "hello",
            None,
        )

        mock_client_cls.assert_called_once_with(
            azure_endpoint="https://example.openai.azure.com",
            api_key="api-key",
            api_version="2026-01-01",
        )

    @patch("app.core.llm_client.AsyncAzureOpenAI")
    async def test_returns_embedding_and_tokens(self, mock_client_cls):
        """埋め込みベクトルと消費トークン数を返すこと"""
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        _as_async_context_manager(mock_client)
        response = MagicMock()
        response.data = [MagicMock(embedding=[0.1, 0.2, 0.3])]
        response.usage.prompt_tokens = 7
        mock_client.embeddings.create = AsyncMock(return_value=response)

        result = await AzureLlmEmbeddingClient.create_embedding(
            "https://example.openai.azure.com",
            "api-key",
            "text-embedding-3-small",
            "hello",
            None,
        )

        assert result.embedding == [0.1, 0.2, 0.3]
        assert result.tokens == 7
        _, kwargs = mock_client.embeddings.create.call_args
        assert "dimensions" not in kwargs

    @patch("app.core.llm_client.AsyncAzureOpenAI")
    async def test_passes_dimensions_when_specified(self, mock_client_cls):
        """dimensions指定時はcreate呼び出しに含めること"""
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        _as_async_context_manager(mock_client)
        response = MagicMock()
        response.data = [MagicMock(embedding=[0.1])]
        response.usage.prompt_tokens = 3
        mock_client.embeddings.create = AsyncMock(return_value=response)

        await AzureLlmEmbeddingClient.create_embedding(
            "https://example.openai.azure.com",
            "api-key",
            "text-embedding-3-small",
            "hello",
            512,
        )

        _, kwargs = mock_client.embeddings.create.call_args
        assert kwargs["dimensions"] == 512
