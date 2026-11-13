from collections.abc import AsyncIterator
from types import SimpleNamespace
from typing import Any, ClassVar, Self

import pytest

from tests.conftest import make_settings
from waha_emulator.llm import azure_openai
from waha_emulator.llm.azure_openai import AzureOpenAiLlmClient
from waha_emulator.llm.base import ChatMessage
from waha_emulator.llm.echo import ECHO_CHUNK_SIZE, EchoLlmClient
from waha_emulator.llm.factory import create_llm_client


async def test_echo_streams_question_in_chunks() -> None:
    """echo は最後のメッセージを数文字ずつ返し、つなぐと質問と同じになること"""
    question = "これは確認用の質問です。そのまま返ってきます。"
    messages = [
        ChatMessage(role="user", content="前の質問"),
        ChatMessage(role="user", content=question),
    ]

    deltas = [d async for d in EchoLlmClient().stream_chat(messages)]

    assert "".join(deltas) == question
    assert len(deltas) > 1
    assert all(len(d) <= ECHO_CHUNK_SIZE for d in deltas)


def _chunk(content: str | None, *, has_choice: bool = True) -> SimpleNamespace:
    choices = [SimpleNamespace(delta=SimpleNamespace(content=content))]
    return SimpleNamespace(choices=choices if has_choice else [])


class _FakeStream:
    def __init__(self, chunks: list[SimpleNamespace]) -> None:
        self._chunks = chunks

    async def __aiter__(self) -> AsyncIterator[SimpleNamespace]:
        for chunk in self._chunks:
            yield chunk


class _FakeAzureOpenAI:
    instances: ClassVar[list["_FakeAzureOpenAI"]] = []

    def __init__(self, **kwargs: Any) -> None:
        self.init_kwargs = kwargs
        self.create_kwargs: dict[str, Any] = {}
        self.closed = False
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))
        _FakeAzureOpenAI.instances.append(self)

    async def _create(self, **kwargs: Any) -> _FakeStream:
        self.create_kwargs = kwargs
        return _FakeStream(
            [
                _chunk(None, has_choice=False),
                _chunk("こん"),
                _chunk(None),
                _chunk("にちは"),
            ]
        )

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(self, *args: object) -> None:
        self.closed = True


async def test_azure_openai_streams_content_deltas(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Azure OpenAI をストリーミングで呼び、内容のある差分だけを返すこと"""
    _FakeAzureOpenAI.instances.clear()
    monkeypatch.setattr(azure_openai, "AsyncAzureOpenAI", _FakeAzureOpenAI)
    client = AzureOpenAiLlmClient(
        endpoint="https://example.openai.azure.com",
        api_key="secret",
        deployment="gpt-4o",
        api_version="2024-10-21",
    )
    messages = [
        ChatMessage(role="system", content="s"),
        ChatMessage(role="assistant", content="a"),
        ChatMessage(role="user", content="u"),
    ]

    deltas = [d async for d in client.stream_chat(messages)]

    fake = _FakeAzureOpenAI.instances[0]
    assert deltas == ["こん", "にちは"]
    assert fake.init_kwargs == {
        "azure_endpoint": "https://example.openai.azure.com",
        "api_key": "secret",
        "api_version": "2024-10-21",
    }
    assert fake.create_kwargs == {
        "model": "gpt-4o",
        "messages": [
            {"role": "system", "content": "s"},
            {"role": "assistant", "content": "a"},
            {"role": "user", "content": "u"},
        ],
        "stream": True,
    }
    assert fake.closed


def test_create_llm_client_selects_provider() -> None:
    """LLM_PROVIDER で接続先が選ばれ、既定は echo であること"""
    default = create_llm_client(make_settings())
    azure = create_llm_client(
        make_settings(
            LLM_PROVIDER="azure_openai",
            AZURE_OPENAI_ENDPOINT="https://example.openai.azure.com",
            AZURE_OPENAI_API_KEY="secret",
            AZURE_OPENAI_DEPLOYMENT="gpt-4o",
        )
    )

    assert isinstance(default, EchoLlmClient)
    assert isinstance(azure, AzureOpenAiLlmClient)
