"""移植元 SecuAiGentSseParserTest・SecuAiGentAuthClientTest・
SecuAiGentFailureClassifierBranchTest と SecuAiGentFailureRedactionTest・
SecuAiGentSslRuntimeParityTest の分類（classifier）の部分の移植。

Java の例外は次のように置き換える。IOException は OSError、IllegalArgumentException は
ValueError、SocketTimeoutException は TimeoutError、ConnectTimeoutException は
httpx.ConnectTimeout、SSLException は ssl.SSLError、`initCause` は `__cause__`、
`addSuppressed` は ExceptionGroup。
"""

import ssl

import httpx
import pytest
from generative_ai_core.provider.clients.secuaigent import failure
from generative_ai_core.provider.clients.secuaigent.auth import parse_token
from generative_ai_core.provider.clients.secuaigent.sse import (
    ErrorEvent,
    LibraryContentDelta,
    LibraryTitleDelta,
    MessageStop,
    ReasoningDelta,
    TextDelta,
    parse_data_line,
    parse_data_lines,
)

SENTINEL = "credential-sentinel.invalid"
KNOWN_CODES = {
    failure.AUTH_FAILURE,
    failure.NETWORK_FAILURE,
    failure.PROXY_AUTH_FAILURE,
    failure.TIMEOUT,
    failure.SSL_FAILURE,
    failure.VALIDATION_FAILURE,
}


class ChangingMessageError(OSError):
    """`str()` を呼ぶたびにメッセージが変わる例外（移植元 ChangingMessageException）。"""

    def __init__(self, first: str, second: str) -> None:
        """1 回目と 2 回目に返すメッセージを受け取る。

        Parameters
        ----------
        first : str
            1 回目の `str()` が返す文字列。
        second : str
            2 回目以降の `str()` が返す文字列。
        """
        super().__init__()
        self._first = first
        self._second = second
        self._calls = 0

    def __str__(self) -> str:
        """呼び出し回数に応じたメッセージを返す。

        Returns
        -------
        str
            1 回目は first、それ以降は second。
        """
        self._calls += 1
        return self._first if self._calls == 1 else self._second


def _caused_by(outer: BaseException, cause: BaseException) -> BaseException:
    """外側の例外に原因をつなぐ（Java の `initCause`・コンストラクタの cause）。

    Parameters
    ----------
    outer : BaseException
        外側の例外。
    cause : BaseException
        原因。

    Returns
    -------
    BaseException
        原因をつないだ外側の例外。
    """
    outer.__cause__ = cause
    return outer


def test_parses_reasoning_text_delta_error_and_message_stop_events() -> None:
    """reasoning・text・error・message_stop の各イベントを順番どおり読めること"""
    events = parse_data_lines(
        [
            'data: {"type":"reasoning_delta","text":"think-a"}',
            'data: {"type":"text_delta","text":"answer-a"}',
            'data: {"type":"error","message":"stream failed"}',
            'data: {"type":"message_stop","inputTokens":10,"outputTokens":20}',
        ]
    )

    assert events == [
        ReasoningDelta("think-a"),
        TextDelta("answer-a"),
        ErrorEvent("stream failed"),
        MessageStop(10, 20),
    ]


def test_parses_library_delta_primitive_and_empty_text_boundaries() -> None:
    """library の delta で、数値・真偽値は文字列に、欠落・null は空文字列になること"""
    events = parse_data_lines(
        [
            'data: {"type":"library_title_delta","text":"title-a"}',
            'data: {"type":"library_content_delta","text":42}',
            'data: {"type":"library_title_delta","text":true}',
            'data: {"type":"library_content_delta"}',
            'data: {"type":"library_title_delta","text":null}',
        ]
    )

    assert events == [
        LibraryTitleDelta("title-a"),
        LibraryContentDelta("42"),
        LibraryTitleDelta("true"),
        LibraryContentDelta(""),
        LibraryTitleDelta(""),
    ]


@pytest.mark.parametrize(
    "line",
    [
        f'data: {{"type":"library_title_delta","text":{{"value":"{SENTINEL}"}}}}',
        f'data: {{"type":"library_content_delta","text":["{SENTINEL}"]}}',
        'data: {"type":"library_content_delta","text":]}',
    ],
)
def test_rejects_library_delta_object_array_and_malformed_json_without_leaking_payload(
    line: str,
) -> None:
    """オブジェクト・配列・壊れた JSON の delta を、本文を漏らさずに拒否すること"""
    with pytest.raises(Exception) as error:
        parse_data_line(line)

    assert SENTINEL not in str(error.value)


def test_ignores_blank_lines_and_data_prefix_only_lines() -> None:
    """空行・data 以外の行・`data:` だけの行を無視すること"""
    events = parse_data_lines(
        ["", "event: message", "data:", 'data: {"type":"text_delta","text":"ok"}']
    )

    assert events == [TextDelta("ok")]


def test_parses_default_token_and_null_text_boundaries() -> None:
    """空の入力は None、欠落・null の値は既定値になること"""
    assert parse_data_line(None) is None
    assert parse_data_line("   ") is None
    assert parse_data_line("data:    ") is None
    assert parse_data_line('data: {"type":"text_delta"}') == TextDelta("")
    assert parse_data_line(
        'data: {"type":"reasoning_delta","text":null}'
    ) == ReasoningDelta("")
    assert parse_data_line('data: {"type":"error"}') == ErrorEvent("stream error")
    assert parse_data_line('data: {"type":"error","message":null}') == ErrorEvent(
        "stream error"
    )
    assert parse_data_line('data: {"type":"message_stop"}') == MessageStop(0, 0)


def test_rejects_unknown_event_types() -> None:
    """未知のイベントの種類を拒否すること"""
    with pytest.raises(ValueError, match="Unsupported SSE event type"):
        parse_data_line('data: {"type":"unknown","text":"x"}')


def test_parses_reasoning_delta_event_from_sse_fixture() -> None:
    """reasoning_delta の 1 行を ReasoningDelta として読めること"""
    event = parse_data_line('data: {"type":"reasoning_delta","text":"think-a"}')

    assert isinstance(event, ReasoningDelta)
    assert event.text == "think-a"


def test_parses_jwt_token_from_login_key_response_body() -> None:
    """ログインの応答から JWT を取り出せること"""
    token = parse_token('{"token":"fixture-jwt-token","role":"SYSTEM"}\n')

    assert token == "fixture-jwt-token"


@pytest.mark.parametrize(
    "body", ['{"role":"SYSTEM"}', '{"token":null}', '{"token":" "}']
)
def test_rejects_missing_token_field(body: str) -> None:
    """token がない・null・空白の応答を拒否すること"""
    with pytest.raises(ValueError, match="token"):
        parse_token(body)


def test_classifier_maps_ssl_failures_including_nested_and_suppressed() -> None:
    """SSL の失敗（メッセージ・原因・suppressed）が SSL に分類されること"""
    suppressed = ExceptionGroup("wrapper", [ssl.SSLError("pkix path failed")])
    wrapped = _caused_by(OSError("outer"), OSError("PKIX path building failed"))
    suppressed_io = ExceptionGroup(
        "outer", [ssl.SSLError("suppressed certificate failure")]
    )

    assert failure.classify(suppressed) == failure.SSL_FAILURE
    assert failure.classify(wrapped) == failure.SSL_FAILURE
    assert failure.classify(suppressed_io) == failure.SSL_FAILURE
    for message in (
        "certificate expired",
        "handshake failed",
        "certpath failed",
        "pkix failed",
        "certification path failed",
    ):
        assert failure.classify(OSError(message)) == failure.SSL_FAILURE
    assert failure.classify(ssl.SSLError("ssl transport failed")) == failure.SSL_FAILURE
    assert (
        failure.classify(ChangingMessageError("plain", "certificate rejected"))
        == failure.SSL_FAILURE
    )
    assert (
        failure.classify(ChangingMessageError("plain", "ssl handshake rejected"))
        == failure.SSL_FAILURE
    )


def test_classifier_maps_validation_timeout_and_auth_failures() -> None:
    """検証・タイムアウト・プロキシ認証・認証の失敗が、それぞれの分類になること"""
    assert failure.classify(ValueError("bad input")) == failure.VALIDATION_FAILURE
    assert failure.classify(ValueError("invalid tenant setting")) == (
        failure.VALIDATION_FAILURE
    )
    assert failure.classify(OSError("validation failed")) == failure.VALIDATION_FAILURE
    assert failure.classify(TimeoutError("read timed out")) == failure.TIMEOUT
    assert failure.classify(httpx.ConnectTimeout("timeout")) == failure.TIMEOUT
    for message in ("request timeout", "operation timed out", "connect timeout"):
        assert failure.classify(OSError(message)) == failure.TIMEOUT
    assert (
        failure.classify(ChangingMessageError("plain", "request timed out"))
        == failure.TIMEOUT
    )
    for message in ("407 proxy auth required", "proxy auth required", "407"):
        assert failure.classify(OSError(message)) == failure.PROXY_AUTH_FAILURE
    assert failure.classify(OSError("proxy auth required 407")) == (
        failure.PROXY_AUTH_FAILURE
    )
    for message in ("403 auth denied", "401 unauthorized", "401", "auth rejected"):
        assert failure.classify(OSError(message)) == failure.AUTH_FAILURE


def test_classifier_maps_other_failures_to_network_failure() -> None:
    """どれにも当たらない失敗・None・原因だけが違う失敗が NETWORK に分類されること"""
    outer = _caused_by(RuntimeError("outer"), OSError("connection reset"))
    suppressed = ExceptionGroup("outer network", [OSError("connection reset")])

    assert failure.classify(outer) == failure.NETWORK_FAILURE
    assert failure.classify(OSError("connection reset")) == failure.NETWORK_FAILURE
    assert failure.classify(OSError("generic route failure")) == failure.NETWORK_FAILURE
    assert failure.classify(OSError()) == failure.NETWORK_FAILURE
    assert failure.classify(suppressed) == failure.NETWORK_FAILURE
    assert failure.classify(None) == failure.NETWORK_FAILURE
    assert failure.NETWORK_FAILURE in failure.to_failure(None).code


def test_io_error_message_is_classified_without_raw_text() -> None:
    """IO エラーのメッセージが分類コードだけで、元の文言を含まないこと"""
    error = failure.to_io_error(OSError("token=secret https://internal.example"))

    assert failure.NETWORK_FAILURE in str(error)
    assert "secret" not in str(error)
    assert "internal.example" not in str(error)


def test_classifier_uses_safe_vocabulary_without_secret_values() -> None:
    """分類コードが固定の語彙で、要約に秘密情報・接続先が出ないこと"""
    source = OSError(
        "proxyUser=secret-user proxyPass=secret-pass token=secret-token "
        "https://internal.example/deploy raw-body"
    )

    result = failure.to_failure(source)

    assert result.code in KNOWN_CODES
    for secret in (
        "secret-user",
        "secret-pass",
        "secret-token",
        "internal.example",
        "raw-body",
    ):
        assert secret not in result.summary
