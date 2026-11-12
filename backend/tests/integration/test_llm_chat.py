"""汎用チャットAPI（`POST /api/llm/chat`）の結合テスト。

移植元と同じmultipart（`textData`・`attachmentFiles`）で送信し、移植元と同じ
`data: {"type": ...}`形式のSSEが返ることを、Azure OpenAI・Bedrockの両経路で確認する
（issue-224）。LLM呼び出しは差し替え、渡された会話履歴を記録する。
"""

import json
from collections.abc import AsyncIterator, Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any
from unittest.mock import patch
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker

from app.core.llm_client import ChatMessage, ChatStreamChunk
from app.core.security import create_access_token
from app.models.ai_model import AIModel, AIModelEndpointType
from app.models.tenant import Tenant
from app.models.tenant_endpoint import EndpointType, TenantEndpoint
from app.models.token_usage import TokenUsage
from app.models.user import User, UserRole

_TENANT_ID = "tenant-llm-chat-test"
_AZURE_MODEL = "gpt-4o"
_BEDROCK_MODEL = "anthropic.claude-sonnet-5"
_AZURE_STREAM = "app.services.llm_chat_service.AzureLlmChatClient.stream_chat"
_BEDROCK_STREAM = "app.services.llm_chat_service.BedrockLlmChatClient.stream_chat"

# 1x1の透過PNG。画像として添付されることを確認するための最小のデータ。
_PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d4948445200000001000000010806000000"
    "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082"
)


@pytest.fixture
async def llm_chat_user(session) -> User:
    session.add(
        Tenant(
            id=_TENANT_ID,
            name=_TENANT_ID,
            owner="admin",
            pw_policy_min_length=8,
            pw_policy_use_uppercase=True,
            pw_policy_use_lowercase=True,
            pw_policy_use_digits=True,
            pw_policy_use_symbols=True,
            pw_policy_valid_symbols="!@#$",
            pw_validity_period_days=90,
            pw_histories_limit=3,
        )
    )
    await session.commit()
    user = User(
        id=uuid4(),
        tenant_id=_TENANT_ID,
        login_id="llm-chat-user",
        name="LLM Chat User",
        role=UserRole.USER,
        is_required_password_reset=False,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@pytest.fixture
async def chat_models(session, llm_chat_user) -> None:
    """Azure OpenAI・Bedrockのチャット用AIモデルとテナントエンドポイント一式"""
    session.add_all(
        [
            AIModel(
                endpoint_type=AIModelEndpointType.AZURE_OPENAI_CHAT,
                name=_AZURE_MODEL,
                max_tokens=4096,
                token_weight=Decimal("1.0"),
            ),
            AIModel(
                endpoint_type=AIModelEndpointType.BEDROCK_CHAT,
                name=_BEDROCK_MODEL,
                max_tokens=8192,
                token_weight=Decimal("1.0"),
            ),
            TenantEndpoint(
                tenant_id=_TENANT_ID,
                type=EndpointType.AZURE_OPENAI_CHAT,
                endpoint_name="azure",
                endpoint="https://example.openai.azure.com",
                api_key="api-key",
            ),
            TenantEndpoint(
                tenant_id=_TENANT_ID,
                type=EndpointType.BEDROCK_CHAT,
                endpoint_name="bedrock",
                endpoint="https://bedrock-mantle.ap-northeast-1.api.aws/anthropic",
                api_key="api-key",
            ),
        ]
    )
    await session.commit()


@pytest.fixture
def headers(llm_chat_user) -> dict[str, str]:
    token = create_access_token(llm_chat_user.login_id, _TENANT_ID)
    return {"Authorization": f"Bearer {token}", "X-Tenant-ID": _TENANT_ID}


@dataclass
class _LlmCalls:
    """差し替えたLLM呼び出しに渡された会話履歴の記録。"""

    azure: list[list[ChatMessage]] = field(default_factory=list)
    bedrock: list[list[ChatMessage]] = field(default_factory=list)


@contextmanager
def _patched_llm(
    engine: AsyncEngine, answer: list[str], error: Exception | None = None
) -> Iterator[_LlmCalls]:
    """Azure・BedrockのLLM呼び出しを固定応答に差し替え、トークン使用量の保存先をテスト用DBにする。

    Args:
        engine: テスト用DBエンジン。
        answer: LLMが返す回答テキストの差分。
        error: 指定した場合、応答の代わりにこの例外を送出する。

    Yields:
        LLM呼び出しに渡された会話履歴の記録。
    """
    calls = _LlmCalls()

    def _fake(recorded: list[list[ChatMessage]]) -> Any:
        async def _stream(
            endpoint: str,
            api_key: str,
            model: str,
            messages: list[ChatMessage],
            *args: Any,
            **kwargs: Any,
        ) -> AsyncIterator[ChatStreamChunk]:
            recorded.append(messages)
            if error is not None:
                raise error
            for text in answer:
                yield ChatStreamChunk(text_delta=text)
            yield ChatStreamChunk(input_tokens=10, output_tokens=5)

        return _stream

    test_session_maker = async_sessionmaker(engine, expire_on_commit=False)
    with (
        patch(_AZURE_STREAM, side_effect=_fake(calls.azure)),
        patch(_BEDROCK_STREAM, side_effect=_fake(calls.bedrock)),
        patch(
            "app.services.llm_chat_service.get_session_maker",
            return_value=test_session_maker,
        ),
    ):
        yield calls


def _form(
    text_data: dict[str, Any],
    attachment_files: list[tuple[str, bytes, str]] | None = None,
) -> list[tuple[str, tuple[str, str | bytes, str]]]:
    """汎用チャットAPIへ送るmultipartパートを組み立てる。

    移植元のクライアントと同じく、`textData`を`application/json`のBlobとして送る。

    Args:
        text_data: `textData`パートに入れるリクエスト本体。
        attachment_files: `attachmentFiles`パート（ファイル名・内容・Content-Type）。

    Returns:
        httpxの`files`引数に渡すmultipartパートの一覧。
    """
    parts: list[tuple[str, tuple[str, str | bytes, str]]] = [
        ("textData", ("blob", json.dumps(text_data), "application/json"))
    ]
    for name, data, content_type in attachment_files or []:
        parts.append(("attachmentFiles", (name, data, content_type)))
    return parts


def _sse_events(body: str) -> list[dict[str, Any]]:
    """SSE本文の`data:`行をJSONとして読み、イベントの一覧へ変換する。

    Args:
        body: SSEレスポンスの本文。

    Returns:
        イベント(JSON)の一覧。
    """
    return [
        json.loads(line[len("data:") :].strip())
        for line in body.splitlines()
        if line.startswith("data:")
    ]


def _image_urls(message: ChatMessage) -> list[str]:
    """マルチモーダル形式のcontentから画像のdata URLを取り出す。"""
    assert isinstance(message.content, list)
    return [
        part["image_url"]["url"]  # type: ignore[index]
        for part in message.content
        if part["type"] == "image_url"
    ]


class TestLlmChat:
    """POST /api/llm/chat のテスト"""

    @pytest.mark.parametrize(
        ("deploy_name", "provider"),
        [(_AZURE_MODEL, "azure"), (_BEDROCK_MODEL, "bedrock")],
        ids=["azure", "bedrock"],
    )
    async def test_streams_events_in_source_format(
        self, client, session, engine, headers, chat_models, deploy_name, provider
    ):
        """移植元と同じdata: {"type": ...}形式でtext_delta→message_stopを返し、トークン使用量を保存すること"""
        text_data = {
            "deployName": deploy_name,
            "messages": [{"role": "user", "content": "こんにちは"}],
        }
        with _patched_llm(engine, ["こんに", "ちは"]) as calls:
            response = await client.post(
                "/api/llm/chat", headers=headers, files=_form(text_data)
            )

        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")
        assert "event:" not in response.text
        assert _sse_events(response.text) == [
            {"type": "text_delta", "text": "こんに"},
            {"type": "text_delta", "text": "ちは"},
            {"type": "message_stop", "inputTokens": 10, "outputTokens": 5},
        ]
        called, not_called = (
            (calls.azure, calls.bedrock)
            if provider == "azure"
            else (calls.bedrock, calls.azure)
        )
        assert len(called) == 1
        assert not_called == []

        usages = (await session.execute(select(TokenUsage))).scalars().all()
        assert [(u.model, u.input_tokens, u.output_tokens) for u in usages] == [
            (deploy_name, 10, 5)
        ]

    @pytest.mark.parametrize(
        ("deploy_name", "provider"),
        [(_AZURE_MODEL, "azure"), (_BEDROCK_MODEL, "bedrock")],
        ids=["azure", "bedrock"],
    )
    async def test_attaches_files_to_each_user_turn(
        self, client, engine, headers, chat_models, deploy_name, provider
    ):
        """発話ごとのattachmentsで指定した画像だけが、そのuser発話に添付されてLLMへ渡ること"""
        other_png = _PNG + b"\x00"
        text_data = {
            "deployName": deploy_name,
            "messages": [
                {"role": "user", "content": "1枚目", "attachments": ["a.png"]},
                {"role": "assistant", "content": "回答"},
                {"role": "user", "content": "2枚目", "attatchments": ["b.png"]},
            ],
        }
        files = [("a.png", _PNG, "image/png"), ("b.png", other_png, "image/png")]
        with _patched_llm(engine, ["回答"]) as calls:
            response = await client.post(
                "/api/llm/chat", headers=headers, files=_form(text_data, files)
            )

        assert response.status_code == 200
        assert _sse_events(response.text)[-1]["type"] == "message_stop"
        sent = (calls.azure if provider == "azure" else calls.bedrock)[0]
        assert len(sent) == 3
        first_urls = _image_urls(sent[0])
        second_urls = _image_urls(sent[2])
        assert len(first_urls) == 1
        assert len(second_urls) == 1
        assert first_urls != second_urls
        assert sent[1] == ChatMessage(role="assistant", content="回答")

    async def test_accepts_text_data_as_form_field(
        self, client, engine, headers, chat_models
    ):
        """textDataを通常のフォーム値で送っても受け付けること"""
        text_data = {
            "deployName": _AZURE_MODEL,
            "messages": [{"role": "user", "content": "こんにちは"}],
        }
        with _patched_llm(engine, ["回答"]):
            response = await client.post(
                "/api/llm/chat",
                headers=headers,
                data={"textData": json.dumps(text_data)},
            )

        assert response.status_code == 200
        assert _sse_events(response.text)[-1]["type"] == "message_stop"

    async def test_rejects_json_body(self, client, headers, chat_models):
        """移植元と異なるJSONボディでの送信は400になること"""
        response = await client.post(
            "/api/llm/chat",
            headers=headers,
            json={
                "deployName": _AZURE_MODEL,
                "messages": [{"role": "user", "content": "こんにちは"}],
            },
        )

        assert response.status_code == 400

    async def test_rejects_text_data_without_deploy_name(
        self, client, headers, chat_models
    ):
        """textDataにdeployNameが無いと400になり、移植元と同じ文言が返ること"""
        response = await client.post(
            "/api/llm/chat",
            headers=headers,
            files=_form({"messages": [{"role": "user", "content": "こんにちは"}]}),
        )

        assert response.status_code == 400
        assert response.json()["message"] == "deployName は必須です"

    async def test_rejects_invalid_text_data_json(self, client, headers, chat_models):
        """textDataがJSONとして解釈できない場合は400になること"""
        response = await client.post(
            "/api/llm/chat",
            headers=headers,
            files=[("textData", ("blob", "{invalid", "application/json"))],
        )

        assert response.status_code == 400
        assert response.json()["message"].startswith("Invalid JSON")

    async def test_returns_400_when_attachment_not_uploaded(
        self, client, headers, chat_models
    ):
        """attachmentsにアップロードされていないファイル名がある場合は400になること"""
        text_data = {
            "deployName": _AZURE_MODEL,
            "messages": [
                {"role": "user", "content": "質問", "attachments": ["missing.png"]}
            ],
        }
        response = await client.post(
            "/api/llm/chat",
            headers=headers,
            files=_form(text_data, [("a.png", _PNG, "image/png")]),
        )

        assert response.status_code == 400
        assert response.json()["message"] == (
            "messages 内の添付ファイル名に一致するファイルがありません: missing.png"
        )

    async def test_rejects_duplicate_attachment_file_names(
        self, client, headers, chat_models
    ):
        """同じファイル名の添付ファイルが複数ある場合は400になること"""
        text_data = {
            "deployName": _AZURE_MODEL,
            "messages": [{"role": "user", "content": "質問", "attachments": ["a.png"]}],
        }
        response = await client.post(
            "/api/llm/chat",
            headers=headers,
            files=_form(
                text_data,
                [("a.png", _PNG, "image/png"), ("a.png", _PNG, "image/png")],
            ),
        )

        assert response.status_code == 400

    async def test_streams_error_event_when_llm_fails(
        self, client, engine, headers, chat_models
    ):
        """LLM呼び出し中に例外が発生した場合、移植元と同じ形式のerrorイベントを返すこと"""
        text_data = {
            "deployName": _AZURE_MODEL,
            "messages": [{"role": "user", "content": "こんにちは"}],
        }
        with _patched_llm(engine, [], error=RuntimeError("llm error")):
            response = await client.post(
                "/api/llm/chat", headers=headers, files=_form(text_data)
            )

        assert response.status_code == 200
        assert _sse_events(response.text) == [{"type": "error", "message": "llm error"}]

    async def test_requires_authentication(self, client, chat_models):
        """認証なしの場合は401になること"""
        text_data = {
            "deployName": _AZURE_MODEL,
            "messages": [{"role": "user", "content": "こんにちは"}],
        }
        response = await client.post(
            "/api/llm/chat",
            headers={"X-Tenant-ID": _TENANT_ID},
            files=_form(text_data),
        )

        assert response.status_code == 401
