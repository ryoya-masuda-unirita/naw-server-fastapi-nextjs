"""Azure OpenAI(Chat/Embeddings) API呼び出しクライアント。

移植元(Spring Boot)版はチャット用(`openai-java`のResponses API)と埋め込み用
(Spring AI経由の`azure-ai-openai`)で異なるSDK系統を使っているが、FastAPI側は
Python公式`openai`SDKの`AsyncAzureOpenAI`クライアント1本に統一する
（Chat Completions API・Embeddings APIの両方をこの1クライアントで呼び出せるため）。

`services/`配下の他サービスから呼び出す外部API連携のため、「serviceが別serviceを
呼ばない」規約に抵触しないよう`core/`（インフラ層）に配置する。Azure SDKの呼び出しを
このモジュールに閉じ込めることで、テスト時は`AsyncAzureOpenAI`のみをモックすればよい
ようにする。
"""

from collections.abc import AsyncIterator
from dataclasses import dataclass

from openai import AsyncAzureOpenAI

# Azure OpenAI REST APIのAPIバージョン。移植元Java版のAzure SDK
# (`OpenAIServiceVersion.V2024_06_01`相当)より新しい、Chat Completions
# ストリーミングでの`stream_options.include_usage`に対応したバージョンを固定で使う。
AZURE_OPENAI_API_VERSION = "2024-10-21"


@dataclass(frozen=True)
class ChatMessage:
    """チャットの1発話。

    `content`は添付ファイルがない場合は`str`のまま、添付ファイルがある場合は
    OpenAI Chat Completions APIのマルチモーダル形式(`build_user_content`が
    組み立てるテキストパート・画像パートのリスト)を許容する。
    """

    role: str
    content: str | list[dict[str, object]]


@dataclass(frozen=True)
class ChatStreamChunk:
    """チャットストリーミングの1チャンク。

    `text_delta`はテキスト差分がある場合のみ設定される。`input_tokens`・
    `output_tokens`は、ストリーム最終チャンク（Azureから利用量情報を含めて
    送出されるチャンク）でのみ設定される。
    """

    text_delta: str | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None


@dataclass(frozen=True)
class EmbeddingResult:
    """埋め込みAPIの呼び出し結果。"""

    embedding: list[float]
    tokens: int


class AzureLlmChatClient:
    """Azure OpenAI Chat Completions APIをストリーミング呼び出しするクライアント。"""

    @staticmethod
    async def stream_chat(
        endpoint: str,
        api_key: str,
        deploy_name: str,
        messages: list[ChatMessage],
        temperature: float,
        max_tokens: int | None,
    ) -> AsyncIterator[ChatStreamChunk]:
        """Azure OpenAI Chatモデルへ会話履歴を送信し、応答をストリーミングで受け取る。

        Args:
            endpoint: テナントに紐づくAzure OpenAIエンドポイントURL。
            api_key: テナントに紐づくAzure OpenAI APIキー。
            deploy_name: 呼び出すデプロイ名（モデル名）。
            messages: 会話履歴。
            temperature: 応答のランダム性(0.0〜1.0)。
            max_tokens: 出力トークン数の上限。未指定の場合はモデルの既定値に従う。

        Yields:
            テキスト差分、および完了時の入出力トークン数を持つチャンク。
        """
        create_kwargs: dict = {
            "model": deploy_name,
            "messages": [
                {"role": message.role, "content": message.content}
                for message in messages
            ],
            "temperature": temperature,
            "stream": True,
            "stream_options": {"include_usage": True},
        }
        if max_tokens is not None:
            create_kwargs["max_tokens"] = max_tokens

        # クライアントは`async with`でリクエスト単位に生成・破棄する。ストリーム消費が
        # 終わるまで(このジェネレータが最後までイテレートされるまで)コンテキストマネージャ
        # を閉じないよう、ストリームの読み取りも`async with`ブロック内で行う。
        async with AsyncAzureOpenAI(
            azure_endpoint=endpoint,
            api_key=api_key,
            api_version=AZURE_OPENAI_API_VERSION,
        ) as client:
            stream = await client.chat.completions.create(**create_kwargs)
            async for chunk in stream:
                if chunk.usage is not None:
                    yield ChatStreamChunk(
                        input_tokens=chunk.usage.prompt_tokens,
                        output_tokens=chunk.usage.completion_tokens,
                    )
                    continue
                if not chunk.choices:
                    continue
                delta = chunk.choices[0].delta
                if delta is not None and delta.content:
                    yield ChatStreamChunk(text_delta=delta.content)


class AzureLlmEmbeddingClient:
    """Azure OpenAI Embeddings APIを呼び出すクライアント。"""

    @staticmethod
    async def create_embedding(
        endpoint: str,
        api_key: str,
        deploy_name: str,
        input_text: str,
        dimensions: int | None,
    ) -> EmbeddingResult:
        """Azure OpenAI Embeddingsモデルで入力テキストをベクトル化する。

        Args:
            endpoint: テナントに紐づくAzure OpenAIエンドポイントURL。
            api_key: テナントに紐づくAzure OpenAI APIキー。
            deploy_name: 呼び出すデプロイ名（モデル名）。
            input_text: ベクトル化対象の入力テキスト。
            dimensions: 出力ベクトルの次元数。未指定の場合はモデルの既定値に従う。

        Returns:
            埋め込みベクトルと消費した入力トークン数。
        """
        create_kwargs: dict = {"model": deploy_name, "input": input_text}
        if dimensions is not None:
            create_kwargs["dimensions"] = dimensions

        async with AsyncAzureOpenAI(
            azure_endpoint=endpoint,
            api_key=api_key,
            api_version=AZURE_OPENAI_API_VERSION,
        ) as client:
            response = await client.embeddings.create(**create_kwargs)
            return EmbeddingResult(
                embedding=list(response.data[0].embedding),
                tokens=response.usage.prompt_tokens,
            )
