from unittest.mock import AsyncMock, MagicMock, patch


from app.core.llm_client import AzureLlmChatClient, AzureLlmEmbeddingClient, ChatMessage


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


class TestAzureLlmChatClient:
    """AzureLlmChatClient.stream_chat のテスト"""

    @patch("app.core.llm_client.AsyncAzureOpenAI")
    async def test_yields_text_delta_then_usage(self, mock_client_cls):
        """テキスト差分を順にyieldし、最後にトークン使用量を持つチャンクをyieldすること"""
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
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


class TestAzureLlmEmbeddingClient:
    """AzureLlmEmbeddingClient.create_embedding のテスト"""

    @patch("app.core.llm_client.AsyncAzureOpenAI")
    async def test_returns_embedding_and_tokens(self, mock_client_cls):
        """埋め込みベクトルと消費トークン数を返すこと"""
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
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
