from collections.abc import AsyncIterator, Sequence

from waha_emulator.llm.base import ChatMessage

# 途中経過（ストリームファイル）が複数回に分かれて書かれることを確かめられるよう、
# 質問を数文字ずつに区切って返す
ECHO_CHUNK_SIZE = 8


class EchoLlmClient:
    """キーなしで動く確認用の LLM。最後のメッセージ（質問）をそのまま返す。"""

    async def stream_chat(self, messages: Sequence[ChatMessage]) -> AsyncIterator[str]:
        if not messages:
            return
        text = messages[-1].content
        for start in range(0, len(text), ECHO_CHUNK_SIZE):
            yield text[start : start + ECHO_CHUNK_SIZE]
