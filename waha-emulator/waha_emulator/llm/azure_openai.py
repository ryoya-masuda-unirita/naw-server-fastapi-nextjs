from collections.abc import AsyncIterator, Sequence

from openai import AsyncAzureOpenAI
from openai.types.chat import (
    ChatCompletionAssistantMessageParam,
    ChatCompletionMessageParam,
    ChatCompletionSystemMessageParam,
    ChatCompletionUserMessageParam,
)

from waha_emulator.llm.base import ChatMessage


def _to_param(message: ChatMessage) -> ChatCompletionMessageParam:
    if message.role == "system":
        return ChatCompletionSystemMessageParam(role="system", content=message.content)
    if message.role == "assistant":
        return ChatCompletionAssistantMessageParam(
            role="assistant", content=message.content
        )
    return ChatCompletionUserMessageParam(role="user", content=message.content)


class AzureOpenAiLlmClient:
    """Azure OpenAI の chat completions をストリーミングで呼ぶ。

    backend の AzureLlmChatClient.stream_chat と同じ SDK・呼び方。temperature・
    max_tokens はモデルによって受け付けないものがあるため送らない（モデルの既定値）。
    """

    def __init__(
        self, *, endpoint: str, api_key: str, deployment: str, api_version: str
    ) -> None:
        self._endpoint = endpoint
        self._api_key = api_key
        self._deployment = deployment
        self._api_version = api_version

    async def stream_chat(self, messages: Sequence[ChatMessage]) -> AsyncIterator[str]:
        # ストリームを読み終えるまでクライアントを閉じないよう、読み取りも with の中で行う
        async with AsyncAzureOpenAI(
            azure_endpoint=self._endpoint,
            api_key=self._api_key,
            api_version=self._api_version,
        ) as client:
            stream = await client.chat.completions.create(
                model=self._deployment,
                messages=[_to_param(m) for m in messages],
                stream=True,
            )
            async for chunk in stream:
                if not chunk.choices:
                    continue
                delta = chunk.choices[0].delta
                if delta is not None and delta.content:
                    yield delta.content
