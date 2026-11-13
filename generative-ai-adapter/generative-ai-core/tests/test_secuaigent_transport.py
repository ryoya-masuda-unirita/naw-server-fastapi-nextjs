"""移植元 SecuAiGentTransportTest・SecuAiGentStreamingReasoningTest・
SecuAiGentFailureRedactionTest（runtime の部分）・SecuAiGentNetworkRuntimeParityTest・
SecuAiGentSslRuntimeParityTest（chat・認証の部分）の移植。

移植元はローカルの HTTP サーバーを立てるが、Python 版は respx で HTTP をモックする。
SSE の「途中経過が全部届く前にコールバックが呼ばれる」確認は、sleep や latch の代わりに、
遅延評価されるジェネレーターの本文と、コールバックの記録の突き合わせで行う。
TLS の検証失敗は、自己署名証明書のサーバーの代わりに SSL エラーの接続失敗を返して
再現し、`verify=False` が httpx.Client に渡ることを記録して確かめる。

対象外: Excel・Word・PowerPoint の埋め込み画像の検証（media の移植）、
Embedding のクライアント（未移植）。
"""

import json
import ssl
from collections import deque
from collections.abc import Iterable, Iterator
from typing import Any

import httpx
import pytest
import respx
from generative_ai_core.chat.models import (
    STREAM_CALLBACKS_ATTRIBUTE,
    CoreChatRequest,
    CoreChatRequestBuilder,
    CoreChatResult,
    CoreImageExplanationRequest,
    CoreImageExplanationResult,
    CoreMedia,
    CoreMessage,
    CoreRagContext,
    CoreRagRequest,
    OutputModeHint,
)
from generative_ai_core.network.setting import CoreNetworkSetting, CoreProxySetting
from generative_ai_core.network.transport import create_transport
from generative_ai_core.provider.clients.base import ChatTransportBase
from generative_ai_core.provider.clients.secuaigent import failure, keys
from generative_ai_core.provider.clients.secuaigent.auth import SecuAiGentAuthClient
from generative_ai_core.provider.clients.secuaigent.transport import (
    SecuAiGentCoreChatClient,
    SecuAiGentTransport,
)
from generative_ai_core.provider.model import (
    Capability,
    CoreCredential,
    CoreProviderId,
    RuntimeProviderConfiguration,
)
from generative_ai_core.provider.runtime import ExecutionContext

BASE_URL = "http://secuaigent.example.invalid"
PROVIDER = CoreProviderId.SecuAiGent.canonical_name
JWT = "fixture-jwt-token"
STOP_LINE = 'data: {"type":"message_stop","inputTokens":1,"outputTokens":2}\n\n'
DEFAULT_SSE = (
    'data: {"type":"reasoning_delta","text":"reason-one"}\n'
    'data: {"type":"reasoning_delta","text":"reason-two"}\n'
    'data: {"type":"text_delta","text":"final-answer"}\n'
    'data: {"type":"message_stop","inputTokens":1,"outputTokens":2}\n'
)
RAG_ANSWER = '{"answer":"rag answer","id":[1]}'
SUPPORTED = '{"answer":true,"reason":"supported"}'
HTTP_ERROR = 500
INVALID_RAG_ANSWERS = [
    '{"answer":"rag answer"}',
    '{"answer":"rag answer","id":[]}',
    '{"answer":"rag answer","id":[3]}',
    '{"answer":"rag answer","id":[0]}',
    '{"answer":"rag answer","id":[0,0]}',
    '{"answer":"rag answer","id":[-1]}',
    '{"answer":"rag answer","id":[true]}',
    '{"answer":"rag answer","id":[false]}',
    '{"answer":"rag answer","id":[null]}',
    '{"answer":"rag answer","id":["1"]}',
    '{"answer":"rag answer","id":["01"]}',
    '{"answer":"rag answer","id":[1.2]}',
    '{"id":[1]}',
    '{"answer":{},"id":[1]}',
    '{"answer":true,"id":[1]}',
    '{"answer":"rag answer","id":{}}',
    '{"answer":"rag answer","id":[{}]}',
    '{"answer":"rag answer","id":[1]} trailing',
]
INVALID_VALIDATIONS = [
    '{"answer":false,"reason":"not supported"}',
    "{}",
    '{"answer":"true"}',
    "{malformed",
]
SECRET_TEXT = "raw-secret-token tenant-fixture first context"


class RecordingCallbacks:
    """受け取った途中経過を `種類:本文` の形で記録するコールバック。"""

    def __init__(self, fail_on_title: Exception | None = None) -> None:
        """記録先を用意する。

        Parameters
        ----------
        fail_on_title : Exception | None, optional
            library のタイトルを受け取ったときに投げる例外。
        """
        self.events: list[str] = []
        self._fail_on_title = fail_on_title

    def on_reasoning_delta(self, text: str) -> None:
        """推論の途中経過を記録する。

        Parameters
        ----------
        text : str
            途中経過の本文。
        """
        self.events.append(f"reasoning:{text}")

    def on_library_title_delta(self, text: str) -> None:
        """library のタイトルを記録する（指定があれば例外を投げる）。

        Parameters
        ----------
        text : str
            タイトルの本文。

        Raises
        ------
        Exception
            `fail_on_title` を指定したとき。
        """
        if self._fail_on_title is not None:
            raise self._fail_on_title
        self.events.append(f"title:{text}")

    def on_library_content_delta(self, text: str) -> None:
        """library の本文を記録する。

        Parameters
        ----------
        text : str
            本文。
        """
        self.events.append(f"content:{text}")


class FakeSecuAiGent:
    """移植元のテストが立てるローカルサーバーに当たる、respx のルートの組。"""

    def __init__(self, router: respx.MockRouter, base_url: str = BASE_URL) -> None:
        """認証と chat のルートを登録する。

        Parameters
        ----------
        router : respx.MockRouter
            ルーター。
        base_url : str, optional
            接続先。
        """
        self.auth_calls = 0
        self.auth_tenant: str | None = None
        self.chat_authorization: str | None = None
        self.chat_bodies: list[bytes] = []
        self.chat_payloads: deque[str | Iterable[bytes]] = deque()
        self.chat_status_codes: deque[int] = deque()
        router.post(f"{base_url}/auth/login-key").mock(side_effect=self._auth)
        router.post(f"{base_url}/api/llm/chat").mock(side_effect=self._chat)

    @property
    def chat_calls(self) -> int:
        """chat が呼ばれた回数。

        Returns
        -------
        int
            回数。
        """
        return len(self.chat_bodies)

    def body_text(self, index: int) -> str:
        """送られた chat の本文を文字列にする。

        Parameters
        ----------
        index : int
            何回目の呼び出しか（0 始まり）。

        Returns
        -------
        str
            本文（バイナリは置換文字になる）。
        """
        return self.chat_bodies[index].decode("utf-8", errors="replace")

    def _auth(self, request: httpx.Request) -> httpx.Response:
        """ログインの呼び出しを記録し、トークンを返す。

        Parameters
        ----------
        request : httpx.Request
            受け取ったリクエスト。

        Returns
        -------
        httpx.Response
            JWT を持つ応答。
        """
        self.auth_calls += 1
        self.auth_tenant = request.headers.get("X-Tenant-ID")
        return httpx.Response(200, json={"token": JWT, "role": "SYSTEM"})

    def _chat(self, request: httpx.Request) -> httpx.Response:
        """chat の呼び出しを記録し、仕込んだ応答を返す。

        Parameters
        ----------
        request : httpx.Request
            受け取ったリクエスト。

        Returns
        -------
        httpx.Response
            仕込んだ状態コード・本文の応答。
        """
        self.chat_authorization = request.headers.get("Authorization")
        self.chat_bodies.append(request.read())
        status = self.chat_status_codes.popleft() if self.chat_status_codes else 200
        if status >= HTTP_ERROR:
            return httpx.Response(status, text="raw-secret-token tenant-fixture")
        payload = self.chat_payloads.popleft() if self.chat_payloads else DEFAULT_SSE
        headers = {"Content-Type": "text/event-stream"}
        if isinstance(payload, str):
            return httpx.Response(200, text=payload, headers=headers)
        return httpx.Response(200, content=iter(payload), headers=headers)


@pytest.fixture
def router() -> Iterator[respx.MockRouter]:
    """呼ばれなくてもよい respx のルーターを返す。

    Yields
    ------
    respx.MockRouter
        すべての HTTP をモックするルーター。
    """
    with respx.mock(assert_all_called=False) as mock:
        yield mock


@pytest.fixture
def server(router: respx.MockRouter) -> FakeSecuAiGent:
    """BASE_URL で動く SecuAiGent の偽のサーバーを返す。

    Parameters
    ----------
    router : respx.MockRouter
        ルーター。

    Returns
    -------
    FakeSecuAiGent
        偽のサーバー。
    """
    return FakeSecuAiGent(router)


@pytest.fixture
def http_clients(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    """作られた httpx.Client の引数を記録する。

    Parameters
    ----------
    monkeypatch : pytest.MonkeyPatch
        monkeypatch。

    Returns
    -------
    list[dict[str, Any]]
        作られた順の httpx.Client の引数。
    """
    created: list[dict[str, Any]] = []

    class RecordingClient(httpx.Client):
        """引数を記録してから、本物の httpx.Client を作る。"""

        def __init__(self, **kwargs: Any) -> None:
            """引数を記録する。

            Parameters
            ----------
            **kwargs : Any
                httpx.Client の引数。
            """
            created.append(kwargs)
            super().__init__(**kwargs)

    monkeypatch.setattr(httpx, "Client", RecordingClient)
    return created


def _configuration(
    endpoint: str = BASE_URL,
    attributes: dict[str, str] | None = None,
    network_setting: CoreNetworkSetting | None = None,
    credential: CoreCredential | None = None,
) -> RuntimeProviderConfiguration:
    """SecuAiGent の設定を作る。

    Parameters
    ----------
    endpoint : str, optional
        接続先。
    attributes : dict[str, str] | None, optional
        追加の属性。テナント ID は常に付ける。
    network_setting : CoreNetworkSetting | None, optional
        ネットワーク設定。
    credential : CoreCredential | None, optional
        資格情報。省略時はログインキー。

    Returns
    -------
    RuntimeProviderConfiguration
        設定。
    """
    return RuntimeProviderConfiguration(
        CoreProviderId.SecuAiGent,
        "deploy-fixture",
        endpoint,
        credential or CoreCredential.api_key("login-key-fixture"),
        network_setting or CoreNetworkSetting.defaults(),
        {keys.TENANT_ID: "tenant-fixture", **(attributes or {})},
    )


def _client(configuration: RuntimeProviderConfiguration) -> SecuAiGentCoreChatClient:
    """設定に当たる SecuAiGent クライアントを作る。

    Parameters
    ----------
    configuration : RuntimeProviderConfiguration
        設定。

    Returns
    -------
    SecuAiGentCoreChatClient
        クライアント。
    """
    return SecuAiGentCoreChatClient(configuration, SecuAiGentTransport(configuration))


def _context(capability: Capability = Capability.CHAT) -> ExecutionContext:
    """SecuAiGent の実行コンテキストを作る。

    Parameters
    ----------
    capability : Capability, optional
        能力。

    Returns
    -------
    ExecutionContext
        実行コンテキスト。
    """
    return ExecutionContext(PROVIDER, capability)


def _chat_request(callbacks: object | None = None) -> CoreChatRequest:
    """`hello` を送る chat リクエストを作る。

    Parameters
    ----------
    callbacks : object | None, optional
        ストリームのコールバック。

    Returns
    -------
    CoreChatRequest
        chat リクエスト。
    """
    builder = CoreChatRequestBuilder(PROVIDER).add_message(CoreMessage.user("hello"))
    if callbacks is not None:
        builder.attribute(STREAM_CALLBACKS_ATTRIBUTE, callbacks)
    return builder.build()


def _image_request(media: list[CoreMedia]) -> CoreImageExplanationRequest:
    """画像説明のリクエストを作る。

    Parameters
    ----------
    media : list[CoreMedia]
        添付するメディア。

    Returns
    -------
    CoreImageExplanationRequest
        画像説明リクエスト。
    """
    return CoreImageExplanationRequest(PROVIDER, media=tuple(media))


def _png(name: str = "image.png", payload: bytes = b"\x01") -> CoreMedia:
    """PNG のメディアを作る。

    Parameters
    ----------
    name : str, optional
        ファイル名。
    payload : bytes, optional
        中身。

    Returns
    -------
    CoreMedia
        メディア。
    """
    return CoreMedia("image/png", name, payload)


def _rag_request(
    contexts: int = 2,
    output_mode_hint: OutputModeHint = OutputModeHint.RETRIEVAL_ANSWER_JSON,
    callbacks: object | None = None,
    system: str = "system",
) -> CoreRagRequest:
    """質問と、指定件数のコンテキストを持つ RAG リクエストを作る。

    Parameters
    ----------
    contexts : int, optional
        コンテキストの件数（最大 3）。
    output_mode_hint : OutputModeHint, optional
        出力形式のヒント。
    callbacks : object | None, optional
        ストリームのコールバック。
    system : str, optional
        system の発言。

    Returns
    -------
    CoreRagRequest
        RAG リクエスト。
    """
    builder = (
        CoreChatRequestBuilder(PROVIDER)
        .output_mode_hint(output_mode_hint)
        .add_message(CoreMessage.system(system))
        .add_message(CoreMessage.user("Question: question"))
        .attribute("core.rag.jsonResponse", True)
    )
    if callbacks is not None:
        builder.attribute(STREAM_CALLBACKS_ATTRIBUTE, callbacks)
    names = ["first", "second", "third"]
    return CoreRagRequest(
        builder.build(),
        tuple(
            CoreRagContext(f"path{i + 1}", f"{names[i]} context", (f"file{i + 1}",))
            for i in range(contexts)
        ),
    )


def _text_sse(text: str) -> str:
    """text_delta と message_stop の SSE を作る。

    Parameters
    ----------
    text : str
        回答の本文。

    Returns
    -------
    str
        SSE の本文。
    """
    event = json.dumps({"type": "text_delta", "text": text})
    return f"data: {event}\n\n{STOP_LINE}"


def _delta_sse(event_type: str, text: str) -> str:
    """種類と本文を持つ 1 件の SSE を作る。

    Parameters
    ----------
    event_type : str
        イベントの種類。
    text : str
        本文。

    Returns
    -------
    str
        SSE の 1 件。
    """
    return "data: " + json.dumps({"type": event_type, "text": text}) + "\n\n"


def _error_sse(message: str) -> str:
    """error の SSE を作る。

    Parameters
    ----------
    message : str
        エラーのメッセージ。

    Returns
    -------
    str
        SSE の 1 件。
    """
    return "data: " + json.dumps({"type": "error", "message": message}) + "\n\n"


def _text_delta_only(text: str) -> str:
    """message_stop のない text_delta だけの SSE を作る。

    Parameters
    ----------
    text : str
        回答の本文。

    Returns
    -------
    str
        SSE の 1 件。
    """
    return _delta_sse("text_delta", text)


def _assert_no_secrets(summary: str, *secrets: str) -> None:
    """要約に、指定した文字列が含まれないことを確かめる。

    Parameters
    ----------
    summary : str
        失敗の要約。
    *secrets : str
        含まれてはいけない文字列。
    """
    for secret in secrets:
        assert secret not in summary


def test_streams_reasoning_and_answer_deltas_in_order_through_callbacks(
    server: FakeSecuAiGent,
) -> None:
    """推論の途中経過をコールバックへ順に渡し、回答を結果にすること"""
    callbacks = RecordingCallbacks()

    result = _client(_configuration()).chat(_chat_request(callbacks), _context())

    assert server.auth_tenant == "tenant-fixture"
    assert server.auth_calls == 1
    assert server.chat_authorization == f"Bearer {JWT}"
    assert callbacks.events == ["reasoning:reason-one", "reasoning:reason-two"]
    assert result.answer == "final-answer"
    assert result.failure is None


def test_bearer_credential_uses_access_token_directly_without_login_key_auth(
    server: FakeSecuAiGent,
) -> None:
    """Bearer の資格情報なら、ログインせずにアクセストークンをそのまま使うこと"""
    configuration = _configuration(
        BASE_URL + "/", credential=CoreCredential.bearer_token("direct-access-token")
    )

    result = _client(configuration).chat(_chat_request(), _context())

    assert server.auth_calls == 0
    assert server.chat_authorization == "Bearer direct-access-token"
    assert result.failure is None


def test_image_explanation_posts_binary_multipart_and_returns_sse_caption(
    server: FakeSecuAiGent,
) -> None:
    """画像をバイナリのまま multipart で送り、SSE の説明を返すこと"""
    first = bytes([0, 1, 2, 0xFF, 13, 10, 65])
    second = bytes([9, 8, 0xFE, 7])
    request = _image_request(
        [
            _png("original-image.png", first),
            CoreMedia("image/jpeg", "resource-image.jpg", second),
        ]
    )

    result = _client(_configuration()).image_explanation(
        request, _context(Capability.IMAGE_EXPLANATION)
    )

    assert result.failure is None
    assert result.explanation_present
    assert result.explanation == "final-answer"
    assert server.auth_calls == 1
    assert server.chat_calls == 1
    body = server.body_text(0)
    assert 'name="attachmentFiles"; filename="original-image.png"' in body
    assert "Content-Type: image/png" in body
    assert 'name="attachmentFiles"; filename="resource-image.jpg"' in body
    assert "Content-Type: image/jpeg" in body
    assert '"attachments":["original-image.png","resource-image.jpg"]' in body
    assert first in server.chat_bodies[0]
    assert second in server.chat_bodies[0]


@pytest.mark.parametrize(
    "media",
    [
        [CoreMedia("image/png", " ", b"\x01")],
        [CoreMedia("", "secret-file.png", b"\x01")],
        [CoreMedia("image/png", "secret-file.png", b"")],
        [
            CoreMedia("image/png", "duplicate.png", b"\x01"),
            CoreMedia("image/jpeg", "duplicate.png", b"\x02"),
        ],
    ],
)
def test_invalid_image_attachments_fail_before_provider_call_without_leaking_metadata(
    server: FakeSecuAiGent, media: list[CoreMedia]
) -> None:
    """不正な添付は、送信せずに検証の失敗にし、ファイル名などを漏らさないこと"""
    result = _client(_configuration()).image_explanation(
        _image_request(media), _context(Capability.IMAGE_EXPLANATION)
    )

    assert result.failure is not None
    assert result.failure.code == failure.VALIDATION_FAILURE
    _assert_no_secrets(
        result.failure.summary,
        "secret-file.png",
        "secret-payload",
        "tenant-fixture",
        "login-key-fixture",
    )
    assert server.auth_calls == 0
    assert server.chat_calls == 0


def test_missing_or_blank_image_caption_returns_sanitized_failure(
    server: FakeSecuAiGent,
) -> None:
    """説明が空・空白だけのとき、説明なしの失敗にして秘密情報を出さないこと"""
    server.chat_payloads.extend([STOP_LINE, _text_sse("   ")])
    client = _client(_configuration())

    for _ in range(2):
        result = client.image_explanation(
            _image_request([_png()]), _context(Capability.IMAGE_EXPLANATION)
        )

        assert not result.explanation_present
        assert result.failure is not None
        _assert_no_secrets(
            result.failure.summary, "image.png", "tenant-fixture", "login-key-fixture"
        )
    assert server.chat_calls == 2


def test_http_sse_and_early_termination_failures_stay_secret_safe_for_image(
    server: FakeSecuAiGent,
) -> None:
    """HTTP エラー・SSE の error・途中で切れた場合も、画像説明の失敗が秘密情報を含まないこと"""
    server.chat_status_codes.append(HTTP_ERROR)
    server.chat_payloads.extend(
        [
            _error_sse("raw-secret-token tenant-fixture image.png"),
            _text_delta_only("partial raw-secret-token"),
        ]
    )
    client = _client(_configuration())

    for _ in range(3):
        result = client.image_explanation(
            _image_request([_png()]), _context(Capability.IMAGE_EXPLANATION)
        )

        assert not result.explanation_present
        assert result.failure is not None
        _assert_no_secrets(
            result.failure.summary, "raw-secret-token", "tenant-fixture", "image.png"
        )


def test_timeout_and_missing_transport_result_become_sanitized_image_failures() -> None:
    """タイムアウトと Transport の結果なしが、秘密情報を含まない画像説明の失敗になること"""

    class TimeoutTransport(ChatTransportBase):
        """タイムアウトの例外を投げる Transport。"""

        def chat(
            self,
            configuration: RuntimeProviderConfiguration,
            request: CoreChatRequest,
            context: ExecutionContext,
        ) -> CoreChatResult:
            """秘密情報を含むタイムアウトの例外を投げる。

            Parameters
            ----------
            configuration : RuntimeProviderConfiguration
                設定。
            request : CoreChatRequest
                chat リクエスト。
            context : ExecutionContext
                実行コンテキスト。

            Raises
            ------
            TimeoutError
                常に。
            """
            raise TimeoutError("raw-secret-token timeout")

    class NullTransport(ChatTransportBase):
        """結果なしを返す Transport。"""

        def image_explanation(
            self,
            configuration: RuntimeProviderConfiguration,
            request: CoreImageExplanationRequest,
            context: ExecutionContext,
        ) -> CoreImageExplanationResult:
            """結果なし（None）を返す。

            Parameters
            ----------
            configuration : RuntimeProviderConfiguration
                設定。
            request : CoreImageExplanationRequest
                画像説明リクエスト。
            context : ExecutionContext
                実行コンテキスト。

            Returns
            -------
            CoreImageExplanationResult
                実際には None。
            """
            return None  # type: ignore[return-value]

    configuration = _configuration()
    request = _image_request([_png()])
    context = _context(Capability.IMAGE_EXPLANATION)

    timeout = SecuAiGentCoreChatClient(
        configuration, TimeoutTransport()
    ).image_explanation(request, context)
    missing = SecuAiGentCoreChatClient(
        configuration, NullTransport()
    ).image_explanation(request, context)

    assert timeout.failure is not None
    assert timeout.failure.code == failure.TIMEOUT
    assert "raw-secret-token" not in timeout.failure.summary
    assert missing.failure is not None
    assert not missing.explanation_present


def test_rag_json_answer_with_validation_true_deduplicates_and_validates_cited_contexts(
    server: FakeSecuAiGent,
) -> None:
    """id の重複をまとめ、引用したコンテキストだけで検証すること"""
    server.chat_payloads.extend(
        [
            _text_sse(
                '{"answer":"rag answer","id":[1,1,2],"FileName":["provider.txt"]}'
            ),
            _text_sse(SUPPORTED),
        ]
    )

    result = _client(_configuration()).rag(_rag_request(contexts=3), _context())

    assert result.answer_present
    assert result.answer == "rag answer"
    assert result.reference_ids == (1, 2)
    assert result.failure is None
    assert server.chat_calls == 2
    validation = server.body_text(1)
    assert "first context" in validation
    assert "second context" in validation
    assert "third context" not in validation


def test_rag_notifies_library_callbacks_for_primary_stream_only(
    server: FakeSecuAiGent,
) -> None:
    """ライブラリの途中経過は回答の呼び出しだけで通知し、検証では通知しないこと"""
    server.chat_payloads.extend(
        [
            _delta_sse("reasoning_delta", "primary-reason")
            + _delta_sse("library_title_delta", "primary-title")
            + _delta_sse("library_content_delta", "primary-content")
            + _text_sse(RAG_ANSWER),
            _delta_sse("library_title_delta", "validation-title")
            + _delta_sse("library_content_delta", "validation-content")
            + _text_sse(SUPPORTED),
        ]
    )
    callbacks = RecordingCallbacks()
    configuration = _configuration(
        attributes={
            keys.MESSAGE_ID: "  library-message-fixture  ",
            keys.CREATE_LIBRARY: "true",
        }
    )

    result = _client(configuration).rag(_rag_request(callbacks=callbacks), _context())

    assert callbacks.events == [
        "reasoning:primary-reason",
        "title:primary-title",
        "content:primary-content",
    ]
    assert result.answer == "rag answer"
    assert result.failure is None
    assert server.chat_calls == 2
    for index in range(2):
        assert '"messageId":"library-message-fixture"' in server.body_text(index)
        assert '"createLibrary":true' in server.body_text(index)


def test_rag_answer_request_body_keeps_contract_system_prompt_before_validation(
    server: FakeSecuAiGent,
) -> None:
    """回答の呼び出しが契約の system プロンプトを持ち、その後に検証を呼ぶこと"""
    server.chat_payloads.extend([_text_sse(RAG_ANSWER), _text_sse(SUPPORTED)])
    system = (
        "Your response MUST be a single, valid JSON object.\n"
        '"id" MUST be a list of JSON integers.\n'
        'Ignore any model-provided "FileName".\n'
    )

    result = _client(_configuration()).rag(
        _rag_request(contexts=1, system=system), _context()
    )

    assert result.answer_present
    assert server.chat_calls == 2
    answer_body = server.body_text(0)
    assert '"role":"system"' in answer_body
    assert "single, valid JSON object" in answer_body
    assert '\\"id\\" MUST be a list of JSON integers' in answer_body
    assert 'Ignore any model-provided \\"FileName\\"' in answer_body
    assert '"response_format":{"type":"json_object"}' in answer_body
    assert "validator" in server.body_text(1)


@pytest.mark.parametrize("invalid_answer", INVALID_RAG_ANSWERS)
def test_rag_json_invalid_ids_do_not_validate_or_surface_answer_present(
    server: FakeSecuAiGent, invalid_answer: str
) -> None:
    """id が不正な回答は、検証を呼ばず、回答ありにしないこと"""
    server.chat_payloads.append(_text_sse(invalid_answer))

    result = _client(_configuration()).rag(_rag_request(), _context())

    assert not result.answer_present
    assert result.reference_ids == ()
    assert server.chat_calls == 1


@pytest.mark.parametrize("validation", INVALID_VALIDATIONS)
def test_rag_validation_failures_do_not_surface_answer_present(
    server: FakeSecuAiGent, validation: str
) -> None:
    """検証が偽・不正な応答のとき、回答ありにしないこと"""
    server.chat_payloads.extend([_text_sse(RAG_ANSWER), _text_sse(validation)])

    result = _client(_configuration()).rag(_rag_request(), _context())

    assert not result.answer_present
    assert result.reference_ids == ()


def test_rag_validation_provider_error_does_not_leak_raw_provider_text(
    server: FakeSecuAiGent,
) -> None:
    """検証の SSE が error のとき、回答ありにせず、生の文言を出さないこと"""
    server.chat_payloads.extend([_text_sse(RAG_ANSWER), _error_sse(SECRET_TEXT)])

    result = _client(_configuration()).rag(_rag_request(), _context())

    assert not result.answer_present
    assert result.failure is not None
    _assert_no_secrets(
        result.failure.summary, "raw-secret-token", "tenant-fixture", "first context"
    )


def test_rag_json_invalid_ids_with_plain_answer_mode_do_not_surface_answer_present(
    server: FakeSecuAiGent,
) -> None:
    """プレーンな回答モードでも、不正な id の回答は回答ありにならず、出力形式を保つこと"""
    server.chat_payloads.append(_text_sse('{"answer":"rag answer","id":[3]}'))

    result = _client(_configuration()).rag(
        _rag_request(output_mode_hint=OutputModeHint.PLAIN_ANSWER_TEXT), _context()
    )

    assert not result.answer_present
    assert result.reference_ids == ()
    assert result.output_mode_hint == OutputModeHint.PLAIN_ANSWER_TEXT
    assert server.chat_calls == 1


def test_rag_first_answer_provider_failure_does_not_validate_or_leak_raw_text(
    server: FakeSecuAiGent,
) -> None:
    """最初の回答が失敗したら、検証せず、生の文言を出さないこと"""
    server.chat_payloads.append(_error_sse(SECRET_TEXT))

    result = _client(_configuration()).rag(_rag_request(), _context())

    assert not result.answer_present
    assert result.reference_ids == ()
    assert server.chat_calls == 1
    assert result.failure is not None
    _assert_no_secrets(
        result.failure.summary, "raw-secret-token", "tenant-fixture", "first context"
    )


def test_stream_ending_before_message_stop_returns_sanitized_failure(
    server: FakeSecuAiGent,
) -> None:
    """message_stop の前に切れたストリームが、固定文言の失敗になること"""
    server.chat_payloads.append(_text_delta_only("partial answer"))

    result = _client(_configuration()).chat(_chat_request(), _context())

    assert not result.answer_present
    assert result.failure is not None
    assert "SecuAiGent runtime failure" in result.failure.summary


def _reasoning(text: str) -> bytes:
    """reasoning_delta の SSE をバイト列にする。

    Parameters
    ----------
    text : str
        本文。

    Returns
    -------
    bytes
        SSE の 1 件。
    """
    return _delta_sse("reasoning_delta", text).encode()


def test_delivers_reasoning_deltas_in_receive_order_before_stream_completion(
    server: FakeSecuAiGent,
) -> None:
    """推論の途中経過を受け取った順に、ストリームの完了前に渡すこと"""
    callbacks = RecordingCallbacks()
    completed = False

    def body() -> Iterator[bytes]:
        """推論の途中経過を 3 つ流し、回答と終了を流す。

        Yields
        ------
        bytes
            SSE のチャンク。
        """
        nonlocal completed
        for delta in ("delta-a", "delta-b", "delta-c"):
            yield _reasoning(delta)
        yield _delta_sse("text_delta", "final-answer").encode()
        # message_stop を読んだ時点で結果を返すため、その後のチャンクは要求されない
        completed = True
        yield STOP_LINE.encode()

    server.chat_payloads.append(body())

    result = _client(_configuration()).chat(_chat_request(callbacks), _context())

    assert callbacks.events == [
        "reasoning:delta-a",
        "reasoning:delta-b",
        "reasoning:delta-c",
    ]
    assert result.answer == "final-answer"
    assert result.failure is None
    assert completed


def test_delivers_mixed_deltas_in_global_order_before_stream_completion(
    server: FakeSecuAiGent,
) -> None:
    """推論・library の途中経過が、全体の順番で、次のチャンクを受け取る前に渡ること"""
    callbacks = RecordingCallbacks()
    snapshots: list[list[str]] = []

    def body() -> Iterator[bytes]:
        """次のチャンクを流す前の、コールバックの記録を控えながら流す。

        Yields
        ------
        bytes
            SSE のチャンク。
        """
        yield _reasoning("reason-a")
        yield _delta_sse("library_title_delta", "title-a").encode()
        snapshots.append(list(callbacks.events))
        yield _delta_sse("library_content_delta", "content-a").encode()
        snapshots.append(list(callbacks.events))
        yield _reasoning("reason-b")
        yield _delta_sse("text_delta", "final-answer").encode()
        yield STOP_LINE.encode()

    server.chat_payloads.append(body())

    result = _client(_configuration()).chat(_chat_request(callbacks), _context())

    assert callbacks.events == [
        "reasoning:reason-a",
        "title:title-a",
        "content:content-a",
        "reasoning:reason-b",
    ]
    assert "title:title-a" in snapshots[0]
    assert "content:content-a" in snapshots[1]
    assert result.answer == "final-answer"
    assert result.failure is None


def test_library_callback_failure_prevents_successful_completion_and_sanitizes(
    server: FakeSecuAiGent,
) -> None:
    """コールバックが失敗したら成功にせず、失敗の要約に例外の文言を出さないこと"""
    sentinel = "credential-sentinel.invalid"
    server.chat_payloads.append(
        _delta_sse("library_title_delta", "title-a")
        + _delta_sse("text_delta", "must-not-succeed")
        + STOP_LINE
    )
    callbacks = RecordingCallbacks(fail_on_title=RuntimeError(sentinel))

    result = _client(_configuration()).chat(_chat_request(callbacks), _context())

    assert not result.answer_present
    assert result.answer == ""
    assert result.failure is not None
    assert sentinel not in result.failure.summary


def test_preserves_whitespace_only_typed_deltas_in_global_order_and_skips_empty(
    server: FakeSecuAiGent,
) -> None:
    """空白だけの途中経過は順番どおりに渡し、空・null は渡さないこと"""
    server.chat_payloads.append(
        'data: {"type":"reasoning_delta","text":"A"}\n'
        'data: {"type":"library_title_delta","text":" "}\n'
        'data: {"type":"library_content_delta","text":"\\t"}\n'
        'data: {"type":"reasoning_delta","text":"\\n"}\n'
        'data: {"type":"library_title_delta","text":"B"}\n'
        'data: {"type":"reasoning_delta","text":null}\n'
        'data: {"type":"library_title_delta"}\n'
        'data: {"type":"library_content_delta","text":""}\n'
        'data: {"type":"text_delta","text":"answer"}\n'
        'data: {"type":"message_stop","inputTokens":1,"outputTokens":2}\n'
    )
    callbacks = RecordingCallbacks()

    result = _client(_configuration()).chat(_chat_request(callbacks), _context())

    assert callbacks.events == [
        "reasoning:A",
        "title: ",
        "content:\t",
        "reasoning:\n",
        "title:B",
    ]
    assert "".join(e.split(":", 1)[1] for e in callbacks.events) == "A \t\nB"
    assert result.answer == "answer"
    assert result.failure is None


def test_preserves_sanitized_failure_for_malformed_sse_and_interrupted_stream(
    server: FakeSecuAiGent,
) -> None:
    """未知のイベントは検証の失敗、途中で切れたら NETWORK の失敗になり、文言を出さないこと"""
    sentinel = "credential-sentinel.invalid"
    client = _client(_configuration())
    server.chat_payloads.append(
        'data: {"type":"reasoning_delta","text":"partial"}\n'
        f'data: {{"type":"unknown","text":"{sentinel}"}}\n'
    )

    malformed = client.chat(_chat_request(RecordingCallbacks()), _context())
    server.chat_payloads.append('data: {"type":"reasoning_delta","text":"partial"}\n')
    interrupted = client.chat(_chat_request(RecordingCallbacks()), _context())

    assert malformed.failure is not None
    assert malformed.failure.code == failure.VALIDATION_FAILURE
    _assert_no_secrets(malformed.failure.summary, "login-key", sentinel)
    assert interrupted.failure is not None
    assert interrupted.failure.code == failure.NETWORK_FAILURE
    assert "login-key" not in interrupted.failure.summary


def test_invokes_reasoning_callback_before_all_server_chunks_are_sent(
    server: FakeSecuAiGent,
) -> None:
    """最初の途中経過のコールバックが、サーバーが全チャンクを送り終える前に呼ばれること"""
    chunks_sent = 0
    sent_at_first_callback: list[int] = []

    class FirstDeltaCallbacks(RecordingCallbacks):
        """最初の途中経過を受け取った時点の、送信済みチャンク数を記録する。"""

        def on_reasoning_delta(self, text: str) -> None:
            """送信済みのチャンク数を控える。

            Parameters
            ----------
            text : str
                途中経過の本文。
            """
            if text == "first" and not sent_at_first_callback:
                sent_at_first_callback.append(chunks_sent)

    def body() -> Iterator[bytes]:
        """チャンクを 1 つ流すたびに、送信済みの数を増やす。

        Yields
        ------
        bytes
            SSE のチャンク。
        """
        nonlocal chunks_sent
        for delta in ("first", "second", "third"):
            chunks_sent += 1
            yield _reasoning(delta)
        chunks_sent += 1
        yield _delta_sse("text_delta", "done").encode()
        chunks_sent += 1
        yield STOP_LINE.encode()

    server.chat_payloads.append(body())

    _client(_configuration()).chat(_chat_request(FirstDeltaCallbacks()), _context())

    assert 0 < sent_at_first_callback[0] < 4


def test_chat_runtime_exception_uses_secuaigent_safe_classifier() -> None:
    """Transport の例外が SecuAiGent の分類（SSL）になり、文言が出ないこと"""

    class SslFailingTransport(ChatTransportBase):
        """SSL の例外を投げる Transport。"""

        def chat(
            self,
            configuration: RuntimeProviderConfiguration,
            request: CoreChatRequest,
            context: ExecutionContext,
        ) -> CoreChatResult:
            """接続先・本文を含む SSL の例外を投げる。

            Parameters
            ----------
            configuration : RuntimeProviderConfiguration
                設定。
            request : CoreChatRequest
                chat リクエスト。
            context : ExecutionContext
                実行コンテキスト。

            Raises
            ------
            ssl.SSLError
                常に。
            """
            raise ssl.SSLError(
                "certificate failed for https://internal.example/deploy raw-body"
            )

    client = SecuAiGentCoreChatClient(
        _configuration("https://provider.example.invalid"), SslFailingTransport()
    )

    result = client.chat(_chat_request(), _context())

    assert result.failure is not None
    assert result.failure.code == failure.SSL_FAILURE
    _assert_no_secrets(
        result.failure.summary,
        "internal.example",
        "deploy",
        "raw-body",
        "certificate failed",
    )


def test_sse_error_message_is_classified_and_sanitized(
    server: FakeSecuAiGent,
) -> None:
    """SSE の error メッセージが分類され、本文・接続先が要約に出ないこと"""
    server.chat_payloads.append(
        _error_sse("timeout for deployment raw-provider-body https://internal.example")
    )

    result = _client(_configuration()).chat(_chat_request(), _context())

    assert result.failure is not None
    assert result.failure.code == failure.TIMEOUT
    _assert_no_secrets(
        result.failure.summary, "raw-provider-body", "internal.example", "deployment"
    )


def test_stream_end_without_message_stop_uses_safe_classifier_vocabulary(
    server: FakeSecuAiGent,
) -> None:
    """message_stop なしで終わったストリームが NETWORK に分類され、本文が出ないこと"""
    server.chat_payloads.append(_text_delta_only("partial answer"))

    result = _client(_configuration()).chat(_chat_request(), _context())

    assert result.failure is not None
    assert result.failure.code == failure.NETWORK_FAILURE
    _assert_no_secrets(
        result.failure.summary, "message_stop", "partial answer", "stream ended"
    )


def test_chat_auth_and_operation_use_manual_proxy_from_core_network_setting(
    server: FakeSecuAiGent, http_clients: list[dict[str, Any]]
) -> None:
    """認証・chat の両方が、ネットワーク設定の手動プロキシ経由で送られること"""
    server.chat_payloads.append(_text_sse("proxied-answer"))
    configuration = _configuration(
        network_setting=CoreNetworkSetting(
            CoreProxySetting.manual("proxy.example", 8080), False, 60
        )
    )

    result = SecuAiGentTransport(configuration).chat(
        configuration, _chat_request(), _context()
    )

    assert result.failure is None
    assert result.answer == "proxied-answer"
    assert server.auth_calls + server.chat_calls >= 2
    assert server.chat_authorization == f"Bearer {JWT}"
    assert len(http_clients) >= 2
    assert all(c["proxy"] == "http://proxy.example:8080" for c in http_clients)


def test_manual_proxy_credentials_must_be_both_present_or_both_absent() -> None:
    """手動プロキシの認証情報が、両方ある・両方ない場合だけ送信を作れること"""
    both_present = CoreProxySetting.manual("proxy.example", 8080, "user", "pass")
    both_absent = CoreProxySetting.manual("proxy.example", 8080)
    missing_password = CoreProxySetting.manual("proxy.example", 8080, "user", "")

    assert both_present.credentials_configured
    assert not both_absent.credentials_configured
    assert create_transport(CoreNetworkSetting(both_present, False, 60)) is not None
    assert create_transport(CoreNetworkSetting(both_absent, False, 60)) is not None
    with pytest.raises(ValueError, match="SECUAIGENT_VALIDATION_FAILURE") as error:
        create_transport(CoreNetworkSetting(missing_password, False, 60))
    assert "both present or both absent" in str(error.value)


def test_factory_accepts_insecure_ssl_as_per_client_transport_setting() -> None:
    """SSL 検証の無効化を、送信ごとの設定として受け付けること"""
    setting = CoreNetworkSetting(CoreProxySetting.none(), True, 60)

    assert create_transport(setting) is not None


def _ssl_aware_server(
    router: respx.MockRouter, http_clients: list[dict[str, Any]]
) -> None:
    """検証が有効なら SSL エラー、無効なら 200 を返すルートを登録する。

    Parameters
    ----------
    router : respx.MockRouter
        ルーター。
    http_clients : list[dict[str, Any]]
        作られた httpx.Client の引数の記録。
    """

    def respond(request: httpx.Request) -> httpx.Response:
        """最後に作られたクライアントの verify に応じて応答する。

        Parameters
        ----------
        request : httpx.Request
            受け取ったリクエスト。

        Returns
        -------
        httpx.Response
            検証が無効なら 200 の応答。

        Raises
        ------
        httpx.ConnectError
            検証が有効なとき（自己署名証明書の検証失敗に当たる）。
        """
        if http_clients[-1]["verify"]:
            raise httpx.ConnectError(
                "[SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed: "
                "self-signed certificate"
            )
        if request.url.path == "/auth/login-key":
            return httpx.Response(200, json={"token": JWT})
        return httpx.Response(200, text=_text_sse("proxied-answer"))

    router.post(url__startswith="https://secure.example.invalid").mock(
        side_effect=respond
    )


def test_ssl_verification_enabled_fails_with_sanitized_failure_for_auth(
    router: respx.MockRouter, http_clients: list[dict[str, Any]]
) -> None:
    """SSL 検証が有効で証明書が不正なら、認証が SSL の失敗になり、秘密情報が出ないこと"""
    _ssl_aware_server(router, http_clients)
    configuration = _configuration(
        "https://secure.example.invalid",
        network_setting=CoreNetworkSetting(CoreProxySetting.none(), False, 60),
    )

    with pytest.raises(OSError, match="SECUAIGENT_SSL_FAILURE") as error:
        SecuAiGentAuthClient().login(configuration)

    assert "login-key-fixture" not in str(error.value)
    assert "secure.example.invalid" not in str(error.value)


def test_ssl_verification_ignored_reaches_auth_and_chat_operation(
    router: respx.MockRouter, http_clients: list[dict[str, Any]]
) -> None:
    """SSL 検証を無効にすると、認証・chat の両方が接続先に届くこと"""
    _ssl_aware_server(router, http_clients)
    configuration = _configuration(
        "https://secure.example.invalid",
        network_setting=CoreNetworkSetting(CoreProxySetting.none(), True, 60),
    )

    result = SecuAiGentTransport(configuration).chat(
        configuration, _chat_request(), _context()
    )

    assert result.failure is None
    assert result.answer == "proxied-answer"
    assert [c["verify"] for c in http_clients] == [False, False]


@pytest.mark.parametrize("path", ["/auth/login-key", "/api/llm/chat"])
def test_ssl_matrix_covers_auth_and_chat_operations(
    router: respx.MockRouter, http_clients: list[dict[str, Any]], path: str
) -> None:
    """認証・chat の各経路で、検証有効は SSL の失敗、無効は 200 になること"""
    _ssl_aware_server(router, http_clients)
    headers = {"Content-Type": "application/json", "X-Tenant-ID": "tenant-fixture"}

    def post(insecure: bool) -> int:
        """指定の設定で POST し、状態コードを返す。

        Parameters
        ----------
        insecure : bool
            SSL 検証を無効にするか。

        Returns
        -------
        int
            状態コード。

        Raises
        ------
        OSError
            分類済みの失敗。
        """
        transport = create_transport(
            CoreNetworkSetting(CoreProxySetting.none(), insecure, 60)
        )
        try:
            return transport.post(
                "https://secure.example.invalid" + path, headers, b"{}"
            ).status_code
        except Exception as e:
            raise failure.to_io_error(e) from e

    with pytest.raises(OSError, match="SECUAIGENT_SSL_FAILURE"):
        post(False)
    assert post(True) == 200
