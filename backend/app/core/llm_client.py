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

from app.core.config import get_azure_openai_settings


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
class ToolConfig:
    """チャット送信時に指定するツール設定(web_search / mcp)。

    `schemas.message.ToolConfig`(Pydanticモデル)とは別に、呼び出しクライアントが
    必要とする最小限のフィールドのみを持つ軽量なdataclassとして定義する
    (`core/`は`schemas/`に依存しない既存レイヤー規約のため、`ChatMessage`と同じ設計方針)。
    `authorization` / `headers`はAzure OpenAIへの送信のみに使う秘密情報のため、
    呼び出し元でログ出力・永続化しないこと。
    """

    name: str
    server_label: str | None = None
    server_url: str | None = None
    require_approval: str | None = None
    authorization: str | None = None
    headers: dict[str, str] | None = None
    allowed_tools: list[str] | None = None


def _build_responses_tool(tool: ToolConfig) -> dict:
    """`ToolConfig`をAzure OpenAI Responses APIの`tools`要素へ変換する。

    移植元Java版`OpenAiLlmChatAdapter.toTool`/`buildMcpTool`に対応する。Azure OpenAI
    (OpenAI)側がサーバーサイドでweb検索・MCPサーバー呼び出しを実行する組み込みツール
    (built-in tools)の宣言をそのまま渡すだけで、このクライアント自身がWeb検索・MCP
    プロトコルを実装するわけではない。

    Args:
        tool: 変換対象のツール設定。

    Returns:
        Responses APIの`tools`パラメータへ渡す辞書。

    Raises:
        ValueError: `name`が`web_search`/`mcp`のいずれでもない場合
            (リクエストスキーマのバリデーションで通常は到達しない防御的分岐)。
    """
    name = tool.name.lower()
    if name == "web_search":
        return {"type": "web_search"}
    if name == "mcp":
        param: dict = {
            "type": "mcp",
            "server_label": tool.server_label,
            "server_url": tool.server_url,
        }
        if tool.authorization:
            param["authorization"] = tool.authorization
        if tool.headers:
            param["headers"] = tool.headers
        if tool.allowed_tools:
            param["allowed_tools"] = tool.allowed_tools
        if tool.require_approval:
            param["require_approval"] = tool.require_approval
        return param
    raise ValueError(f"未対応のツール名: {tool.name}")


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
        tools: list[ToolConfig] | None = None,
        response_format: dict | None = None,
    ) -> AsyncIterator[ChatStreamChunk]:
        """Azure OpenAI Chatモデルへ会話履歴を送信し、応答をストリーミングで受け取る。

        `tools`未指定時は既存どおりChat Completions APIを使用する。`tools`指定時は
        web_search/mcp組み込みツールをサポートするResponses APIへ切り替える
        (Chat Completions APIには、OpenAI側がサーバーサイドで実行を管理する
        web_search/mcpのような組み込みツールという概念自体が存在しないため)。

        Args:
            endpoint: テナントに紐づくAzure OpenAIエンドポイントURL。
            api_key: テナントに紐づくAzure OpenAI APIキー。
            deploy_name: 呼び出すデプロイ名（モデル名）。
            messages: 会話履歴。
            temperature: 応答のランダム性(0.0〜1.0)。
            max_tokens: 出力トークン数の上限。未指定の場合はモデルの既定値に従う。
            tools: 有効化するツール(web_search / mcp)。未指定・空の場合はツールなし。
            response_format: 構造化出力の指定(例: `{"type": "json_object"}`)。
                未指定の場合は自由文で応答する。tools指定時はResponses APIへ切り替わり
                response_formatは使用しない(組み合わせ非対応)。

        Yields:
            テキスト差分、および完了時の入出力トークン数を持つチャンク。
        """
        if tools:
            async for chunk in AzureLlmChatClient._stream_chat_responses_api(
                endpoint, api_key, deploy_name, messages, temperature, max_tokens, tools
            ):
                yield chunk
            return

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
        if response_format is not None:
            create_kwargs["response_format"] = response_format

        settings = get_azure_openai_settings()

        # クライアントは`async with`でリクエスト単位に生成・破棄する。ストリーム消費が
        # 終わるまで(このジェネレータが最後までイテレートされるまで)コンテキストマネージャ
        # を閉じないよう、ストリームの読み取りも`async with`ブロック内で行う。
        async with AsyncAzureOpenAI(
            azure_endpoint=endpoint,
            api_key=api_key,
            api_version=settings.api_version,
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

    @staticmethod
    async def _stream_chat_responses_api(
        endpoint: str,
        api_key: str,
        deploy_name: str,
        messages: list[ChatMessage],
        temperature: float,
        max_tokens: int | None,
        tools: list[ToolConfig],
    ) -> AsyncIterator[ChatStreamChunk]:
        """Azure OpenAI Responses APIでweb_search/mcp組み込みツールを使いストリーミング呼び出しする。

        移植元Java版`OpenAiLlmChatAdapter`/`OpenAiResponsesClient`に対応する。
        ツール呼び出し(web検索の実行・MCPサーバーへの接続等)はAzure OpenAI側で
        完結し、その中間過程はSSEの専用イベントとして個別通知せず、最終テキストが
        通常のテキスト差分として配信される(移植元も同様の挙動)。

        Args:
            endpoint: テナントに紐づくAzure OpenAIエンドポイントURL。
            api_key: テナントに紐づくAzure OpenAI APIキー。
            deploy_name: 呼び出すデプロイ名（モデル名）。
            messages: 会話履歴。
            temperature: 応答のランダム性(0.0〜1.0)。
            max_tokens: 出力トークン数の上限。未指定の場合はモデルの既定値に従う。
            tools: 有効化するツール(web_search / mcp)。

        Yields:
            テキスト差分、および完了時の入出力トークン数を持つチャンク。
        """
        create_kwargs: dict = {
            "model": deploy_name,
            "input": [
                {"role": message.role, "content": message.content}
                for message in messages
            ],
            "tools": [_build_responses_tool(tool) for tool in tools],
            "temperature": temperature,
            "stream": True,
        }
        if max_tokens is not None:
            create_kwargs["max_output_tokens"] = max_tokens

        settings = get_azure_openai_settings()

        async with AsyncAzureOpenAI(
            azure_endpoint=endpoint,
            api_key=api_key,
            api_version=settings.responses_api_version,
        ) as client:
            stream = await client.responses.create(**create_kwargs)
            async for event in stream:
                if event.type == "response.output_text.delta":
                    yield ChatStreamChunk(text_delta=event.delta)
                elif event.type == "response.completed":
                    usage = event.response.usage
                    if usage is not None:
                        yield ChatStreamChunk(
                            input_tokens=usage.input_tokens,
                            output_tokens=usage.output_tokens,
                        )
                elif event.type == "error":
                    # web検索・MCPサーバー呼び出しの失敗等は例外を送出せず、この専用
                    # イベントとしてストリーム内で通知される場合がある(移植元Java版
                    # `OpenAiResponsesClient`も`error`イベントを明示的に処理している)。
                    # 例外化して呼び出し元の`try/except`に流し込み、空回答がOKステータス
                    # で永続化されてしまわないようにする。
                    raise RuntimeError(event.message)
                elif event.type == "response.failed":
                    error = event.response.error
                    message = error.message if error is not None else "response.failed"
                    raise RuntimeError(message)


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

        settings = get_azure_openai_settings()

        async with AsyncAzureOpenAI(
            azure_endpoint=endpoint,
            api_key=api_key,
            api_version=settings.api_version,
        ) as client:
            response = await client.embeddings.create(**create_kwargs)
            return EmbeddingResult(
                embedding=list(response.data[0].embedding),
                tokens=response.usage.prompt_tokens,
            )
