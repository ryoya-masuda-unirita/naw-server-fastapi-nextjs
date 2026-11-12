from collections.abc import AsyncIterator, Sequence
from dataclasses import dataclass
from typing import Literal, Protocol

Role = Literal["system", "user", "assistant"]


@dataclass(frozen=True)
class ChatMessage:
    role: Role
    content: str


class LlmClient(Protocol):
    """ワークフローから呼ぶ LLM。応答の差分（テキスト）を順に返す。"""

    def stream_chat(self, messages: Sequence[ChatMessage]) -> AsyncIterator[str]: ...
