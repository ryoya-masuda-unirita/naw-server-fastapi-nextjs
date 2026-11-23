"""Bedrock（Claude）の Messages API 送信のテスト（Python 版だけの独自の拡張）。

移植元に対応する実装がないため、移植元のテストはない。外部通信は respx でモックし、
本物の Bedrock には接続しない。Bedrock の部品を消すとき（`bedrock-ext` の行と
`clients/bedrock.py`）は、このファイルも一緒に削除する。
"""

import base64
import json
from collections.abc import Iterator
from typing import Any

import httpx
import pytest
import respx
from generative_ai_core.chat.models import (
    GENERATION_OPTIONS_ATTRIBUTE,
    CoreChatRequest,
    CoreChatRequestBuilder,
    CoreGenerationOptions,
    CoreImageExplanationRequest,
    CoreMedia,
    CoreMessage,
    CoreRagContext,
    CoreRagRequest,
)
from generative_ai_core.provider.clients.base import (
    GenericCoreProviderChatClient,
)
from generative_ai_core.provider.clients.bedrock import (
    ANTHROPIC_VERSION,
    DEFAULT_MAX_TOKENS,
    BedrockCoreChatClient,
    BedrockMessagesTransport,
    extract_text,
    generation_body,
    request_target,
    to_messages_payload,
)
from generative_ai_core.provider.clients.openai_compatible import (
    ProviderHttpError,
    to_provider_messages,
)
from generative_ai_core.provider.factory import (
    CoreProviderRuntimeFactory,
    default_client,
)
from generative_ai_core.provider.model import (
    Capability,
    CoreCredential,
    CoreProviderId,
    RuntimeProviderConfiguration,
)
from generative_ai_core.provider.runtime import ExecutionContext

ENDPOINT = "https://bedrock-mantle.example.invalid/anthropic"
MESSAGES_URL = f"{ENDPOINT}/v1/messages"
MODEL = "anthropic.claude-haiku-4-5"
API_KEY = "bedrock-key-fixture"
SUPPORTED = '{"answer":true,"reason":"supported"}'
RAG_ANSWER = '{"answer":"rag answer","id":[1]}'


class Provider:
    """respx に仕込んだ応答の順番と、送られたリクエストを持つ。"""

    def __init__(self, router: respx.MockRouter, texts: list[str]) -> None:
        """応答の本文を順番に返すルートを作る。

        Parameters
        ----------
        router : respx.MockRouter
            ルーター。
        texts : list[str]
            呼び出しごとに返す回答の本文。足りなければ空の回答を返す。
        """
        self.requests: list[httpx.Request] = []
        self._texts = list(texts)
        router.post(MESSAGES_URL).mock(side_effect=self._respond)

    def _respond(self, request: httpx.Request) -> httpx.Response:
        """リクエストを記録し、次の本文を返す。

        Parameters
        ----------
        request : httpx.Request
            受け取ったリクエスト。

        Returns
        -------
        httpx.Response
            次の回答の本文を持つ応答。
        """
        self.requests.append(request)
        text = self._texts.pop(0) if self._texts else ""
        return httpx.Response(
            200,
            json={"content": [{"type": "text", "text": text}], "role": "assistant"},
        )

    def body(self, index: int) -> dict[str, Any]:
        """指定した回のリクエスト本文を返す。

        Parameters
        ----------
        index : int
            何回目の呼び出しか（0 始まり）。

        Returns
        -------
        dict[str, Any]
            リクエスト本文の JSON。
        """
        parsed: dict[str, Any] = json.loads(self.requests[index].content)
        return parsed


@pytest.fixture
def router() -> Iterator[respx.MockRouter]:
    """すべての HTTP をモックするルーターを返す。

    Yields
    ------
    respx.MockRouter
        ルーター。
    """
    with respx.mock(assert_all_called=False) as mock:
        yield mock


def _configuration(endpoint: str = ENDPOINT) -> RuntimeProviderConfiguration:
    """Bedrock の設定を作る。

    Parameters
    ----------
    endpoint : str, optional
        接続先の URL。

    Returns
    -------
    RuntimeProviderConfiguration
        設定。
    """
    return RuntimeProviderConfiguration(
        CoreProviderId.Bedrock, MODEL, endpoint, CoreCredential.api_key(API_KEY)
    )


def _context(capability: Capability = Capability.CHAT) -> ExecutionContext:
    """実行コンテキストを作る。

    Parameters
    ----------
    capability : Capability, optional
        能力。

    Returns
    -------
    ExecutionContext
        実行コンテキスト。
    """
    return ExecutionContext("Bedrock", capability)


def _chat_request(
    options: CoreGenerationOptions | None = None,
    media: tuple[CoreMedia, ...] = (),
) -> CoreChatRequest:
    """system と user の 2 件を持つ chat リクエストを作る。

    Parameters
    ----------
    options : CoreGenerationOptions | None, optional
        生成オプション。
    media : tuple[CoreMedia, ...], optional
        user のメッセージに添付するメディア。

    Returns
    -------
    CoreChatRequest
        chat リクエスト。
    """
    builder = (
        CoreChatRequestBuilder("Bedrock")
        .add_message(CoreMessage.system("system prompt"))
        .add_message(CoreMessage.user("hello", media))
    )
    if options is not None:
        builder.attribute(GENERATION_OPTIONS_ATTRIBUTE, options)
    return builder.build()


def _rag_request(options: CoreGenerationOptions | None = None) -> CoreRagRequest:
    """コンテキスト 1 件の RAG リクエストを作る。

    Parameters
    ----------
    options : CoreGenerationOptions | None, optional
        生成オプション。

    Returns
    -------
    CoreRagRequest
        RAG リクエスト。
    """
    return CoreRagRequest(
        _chat_request(options),
        (CoreRagContext("path1", "first context", ("file1",)),),
    )


class TestRequestTarget:
    """接続先の URL と認証のヘッダー（接続先ごとの違いはここだけ）。"""

    def test_url_appends_messages_path(self) -> None:
        """接続先の URL に /v1/messages が付き、末尾の / は重ならないこと"""
        url, _ = request_target(_configuration(f"{ENDPOINT}/"))

        assert url == MESSAGES_URL

    def test_headers_carry_key_bearer_and_version(self) -> None:
        """キー用ヘッダー・Bearer・バージョンのヘッダーが付くこと"""
        _, headers = request_target(_configuration())

        assert headers["x-api-key"] == API_KEY
        assert headers["Authorization"] == f"Bearer {API_KEY}"
        assert headers["anthropic-version"] == ANTHROPIC_VERSION


class TestMessagesFormat:
    """Messages API の形式への変換。"""

    def test_system_is_separated_and_roles_are_lowercase(self) -> None:
        """system が別の項目に分かれ、messages の role が小文字になること"""
        messages = to_provider_messages(
            [
                CoreMessage.system("s1"),
                CoreMessage.user("u1"),
                CoreMessage.assistant("a1"),
                CoreMessage.system("s2"),
            ]
        )

        system, conversation = to_messages_payload(messages)

        assert system == "s1\n\ns2"
        assert conversation == [
            {"role": "user", "content": "u1"},
            {"role": "assistant", "content": "a1"},
        ]

    def test_no_system_gives_none(self) -> None:
        """system がなければ None になること"""
        system, _ = to_messages_payload(to_provider_messages([CoreMessage.user("u")]))

        assert system is None

    def test_image_becomes_base64_block(self) -> None:
        """画像が base64 の image ブロックになること"""
        payload = b"\x01\x02\x03"
        messages = to_provider_messages(
            [CoreMessage.user("see", [CoreMedia("image/png", "a.png", payload)])]
        )

        _, conversation = to_messages_payload(messages)

        blocks = conversation[0]["content"]
        assert blocks[0] == {"type": "text", "text": "see"}
        assert blocks[1] == {
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/png",
                "data": base64.b64encode(payload).decode("ascii"),
            },
        }

    def test_non_data_url_image_is_rejected(self) -> None:
        """base64 の data URL でない画像は拒否されること"""
        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": "https://x.invalid/a"}}
                ],
            }
        ]

        with pytest.raises(ValueError, match="base64 data url"):
            to_messages_payload(messages)

    def test_max_tokens_defaults_when_unspecified(self) -> None:
        """最大トークン数が未指定なら既定値、指定ならその値になること"""
        assert generation_body(CoreGenerationOptions.empty()) == {
            "max_tokens": DEFAULT_MAX_TOKENS
        }
        assert (
            generation_body(CoreGenerationOptions(max_tokens=100))["max_tokens"] == 100
        )

    def test_only_specified_options_are_sent(self) -> None:
        """温度・top_p・stop は、指定したものだけが送られること"""
        body = generation_body(CoreGenerationOptions(temperature=0.2, stop="END"))

        assert body == {
            "max_tokens": DEFAULT_MAX_TOKENS,
            "temperature": 0.2,
            "stop_sequences": ["END"],
        }

    def test_top_p_is_dropped_when_temperature_is_given(self) -> None:
        """温度と top_p が両方あるときは、温度だけが送られること"""
        body = generation_body(CoreGenerationOptions(temperature=0.2, top_p=0.9))

        assert body["temperature"] == 0.2
        assert "top_p" not in body

    def test_top_p_alone_is_sent(self) -> None:
        """top_p だけがあるときは、top_p が送られること"""
        body = generation_body(CoreGenerationOptions(top_p=0.9))

        assert body["top_p"] == 0.9
        assert "temperature" not in body

    def test_unsupported_options_are_ignored(self) -> None:
        """Messages API にないオプションは送られず、エラーにもならないこと"""
        body = generation_body(
            CoreGenerationOptions(
                frequency_penalty=0.5,
                presence_penalty=0.5,
                reasoning_effort="high",
                verbosity="low",
            )
        )

        assert body == {"max_tokens": DEFAULT_MAX_TOKENS}

    def test_extract_text_joins_text_blocks(self) -> None:
        """text ブロックが順につながり、ほかの種類のブロックは無視されること"""
        body = {
            "content": [
                {"type": "text", "text": "a"},
                {"type": "tool_use", "id": "x"},
                {"type": "text", "text": "b"},
            ]
        }

        assert extract_text(body) == "ab"

    @pytest.mark.parametrize("body", [None, {}, {"content": []}, {"content": "x"}])
    def test_extract_text_returns_none_without_text(self, body: Any) -> None:
        """text ブロックがなければ None になること"""
        assert extract_text(body) is None


class TestChat:
    """通常の chat の送信。"""

    def test_chat_sends_messages_api_request(self, router: respx.MockRouter) -> None:
        """URL・ヘッダー・本文が Messages API の形で送られ、回答が返ること"""
        provider = Provider(router, ["bedrock answer"])

        result = BedrockMessagesTransport(_configuration()).chat(
            _configuration(), _chat_request(), _context()
        )

        assert result.answer == "bedrock answer"
        assert provider.requests[0].headers["x-api-key"] == API_KEY
        assert provider.requests[0].headers["anthropic-version"] == ANTHROPIC_VERSION
        body = provider.body(0)
        assert body["model"] == MODEL
        assert body["stream"] is False
        assert body["max_tokens"] == DEFAULT_MAX_TOKENS
        assert body["system"] == "system prompt"
        assert body["messages"] == [{"role": "user", "content": "hello"}]
        assert "temperature" not in body

    def test_chat_passes_specified_options(self, router: respx.MockRouter) -> None:
        """生成オプションが本文に反映されること"""
        provider = Provider(router, ["ok"])
        options = CoreGenerationOptions(temperature=0.3, max_tokens=50)

        BedrockMessagesTransport(_configuration()).chat(
            _configuration(), _chat_request(options), _context()
        )

        assert provider.body(0)["temperature"] == 0.3
        assert provider.body(0)["max_tokens"] == 50

    def test_empty_response_is_empty_answer(self, router: respx.MockRouter) -> None:
        """text ブロックがない応答は、空文字の成功になること"""
        router.post(MESSAGES_URL).mock(return_value=httpx.Response(200, json={}))

        result = BedrockMessagesTransport(_configuration()).chat(
            _configuration(), _chat_request(), _context()
        )

        assert result.answer == ""

    def test_http_error_raises_provider_http_error(
        self, router: respx.MockRouter
    ) -> None:
        """HTTP エラーが ProviderHttpError になり、ステータスが入ること"""
        router.post(MESSAGES_URL).mock(
            return_value=httpx.Response(401, text="unauthorized")
        )

        with pytest.raises(ProviderHttpError, match="HTTP 401 - unauthorized"):
            BedrockMessagesTransport(_configuration()).chat(
                _configuration(), _chat_request(), _context()
            )

    def test_client_turns_error_into_failure_without_secret(
        self, router: respx.MockRouter
    ) -> None:
        """クライアントが HTTP エラーを失敗の結果にし、Bearer つきのキーを伏せること

        伏せる処理は、OpenAI 系と共通の失敗の変換（決まった形のキーだけを伏せる）に任せる。
        """
        router.post(MESSAGES_URL).mock(
            return_value=httpx.Response(401, text=f"invalid Bearer {API_KEY}")
        )

        result = BedrockCoreChatClient(_configuration()).chat(
            _chat_request(), _context()
        )

        assert result.failure is not None
        assert "HTTP 401" in result.failure.summary
        assert API_KEY not in result.failure.summary


class TestImage:
    """画像の添付と画像説明。"""

    def test_chat_with_media_sends_image_block(self, router: respx.MockRouter) -> None:
        """添付の画像が、base64 の image ブロックとして送られること"""
        provider = Provider(router, ["described"])
        media = (CoreMedia("image/png", "a.png", b"\x01\x02"),)

        BedrockMessagesTransport(_configuration()).chat(
            _configuration(), _chat_request(media=media), _context()
        )

        blocks = provider.body(0)["messages"][0]["content"]
        assert [block["type"] for block in blocks] == ["text", "image"]
        # 画像付きのときは、先頭に画像説明の system プロンプトが足される
        assert "画像" in provider.body(0)["system"]

    def test_image_explanation_runs_one_chat(self, router: respx.MockRouter) -> None:
        """画像説明が chat 1 回で行われ、説明が返ること"""
        provider = Provider(router, ["a picture"])
        request = CoreImageExplanationRequest(
            "Bedrock",
            instruction="describe",
            media=(CoreMedia("image/png", "a.png", b"\x01"),),
        )

        result = BedrockCoreChatClient(_configuration()).image_explanation(
            request, _context(Capability.IMAGE_EXPLANATION)
        )

        assert result.explanation == "a picture"
        assert len(provider.requests) == 1


class TestRag:
    """RAG の回答と検証。"""

    def test_answer_and_validation_are_two_calls(
        self, router: respx.MockRouter
    ) -> None:
        """回答 1 回・検証 1 回の 2 回送られ、検証を通った回答が成功になること"""
        provider = Provider(router, [RAG_ANSWER, SUPPORTED])

        result = BedrockMessagesTransport(_configuration()).rag(
            _configuration(), _rag_request(), _context(Capability.RAG)
        )

        assert result.answer_present
        assert result.answer == "rag answer"
        assert len(provider.requests) == 2

    def test_validation_keeps_only_temperature_and_max_tokens(
        self, router: respx.MockRouter
    ) -> None:
        """検証の呼び出しは、温度と最大トークン数だけを引き継ぐこと"""
        provider = Provider(router, [RAG_ANSWER, SUPPORTED])
        options = CoreGenerationOptions(temperature=0.1, stop="END", max_tokens=77)

        BedrockMessagesTransport(_configuration()).rag(
            _configuration(), _rag_request(options), _context(Capability.RAG)
        )

        assert provider.body(0)["stop_sequences"] == ["END"]
        validation = provider.body(1)
        assert validation["temperature"] == 0.1
        assert validation["max_tokens"] == 77
        assert "stop_sequences" not in validation

    def test_failed_validation_is_no_answer(self, router: respx.MockRouter) -> None:
        """検証が通らなければ、回答なしになること"""
        Provider(router, [RAG_ANSWER, '{"answer":false,"reason":"no"}'])

        result = BedrockMessagesTransport(_configuration()).rag(
            _configuration(), _rag_request(), _context(Capability.RAG)
        )

        assert not result.answer_present

    def test_answer_without_references_skips_validation(
        self, router: respx.MockRouter
    ) -> None:
        """参照 ID がない回答は、検証を呼ばず、回答なしになること"""
        provider = Provider(router, ['{"answer":"none","id":[]}'])

        result = BedrockMessagesTransport(_configuration()).rag(
            _configuration(), _rag_request(), _context(Capability.RAG)
        )

        assert not result.answer_present
        assert len(provider.requests) == 1


class TestClient:
    """クライアントとプロバイダの登録。"""

    def test_client_declares_provider_and_all_chat_capabilities(self) -> None:
        """Bedrock を名乗り、chat・RAG・画像説明の 3 能力を持つこと"""
        client = BedrockCoreChatClient(_configuration())

        assert isinstance(client, GenericCoreProviderChatClient)
        assert client.provider_id == CoreProviderId.Bedrock
        assert client.supported_capabilities() == {
            Capability.CHAT,
            Capability.RAG,
            Capability.IMAGE_EXPLANATION,
        }

    def test_provider_id_is_python_only_97(self) -> None:
        """ID 97・名前 Bedrock で引け、既存のプロバイダの ID と重ならないこと"""
        assert CoreProviderId.from_vendor_id(97) == CoreProviderId.Bedrock
        assert CoreProviderId.parse("bedrock") == CoreProviderId.Bedrock
        assert CoreProviderId.Bedrock.vendor_id not in {
            provider.vendor_id
            for provider in CoreProviderId
            if provider != CoreProviderId.Bedrock
        }

    def test_factory_returns_bedrock_client(self) -> None:
        """工場が Bedrock の設定に Bedrock のクライアントを返すこと"""
        assert isinstance(default_client(_configuration()), BedrockCoreChatClient)

    def test_capability_matrix_marks_bedrock_supported(self) -> None:
        """機能対応表で Bedrock がすべて対応済み、Anthropic は未対応のままであること"""
        matrix = CoreProviderRuntimeFactory.default_capability_matrix()

        assert {s.status.name for s in matrix[CoreProviderId.Bedrock]} == {"SUPPORTED"}
        assert "SUPPORTED" not in {
            s.status.name for s in matrix[CoreProviderId.Anthropic]
        }
