"""CORS ミドルウェアの内側で動かす ASGI ミドルウェア。

FastAPI の汎用の例外ハンドラー（500）は最も外側の ServerErrorMiddleware で動き、
CORS ミドルウェアの外になる。移植元は Spring Security のフィルターで CORS を
設定しており、500 にも CORS ヘッダーが付くため、ここで扱う応答もすべて CORS の
内側で返す。
"""

from http import HTTPStatus

from fastapi.responses import JSONResponse
from starlette.datastructures import Headers
from starlette.exceptions import HTTPException
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.errors import spring_default_error_body, unexpected_error_response

MULTIPART_CONTENT_TYPE_PREFIX = "multipart/"


class UnhandledErrorMiddleware:
    """想定外の例外を、Spring 既定の形の 500 にして返す。

    応答を送り始めた後（SSE の途中など）の例外は応答を差し替えられないため、
    そのまま外側に投げる。
    """

    def __init__(self, app: ASGIApp) -> None:
        """内側の ASGI アプリを受け取る。

        Parameters
        ----------
        app : ASGIApp
            このミドルウェアの内側で動く ASGI アプリ。
        """
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        """HTTP リクエストを内側に渡し、応答前の想定外の例外を 500 にする。

        HTTP 以外（lifespan など）はそのまま内側に渡す。

        Parameters
        ----------
        scope : Scope
            ASGI のスコープ。
        receive : Receive
            リクエストを受け取る ASGI の関数。
        send : Send
            応答を送る ASGI の関数。
        """
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        response_started = False

        async def tracking_send(message: Message) -> None:
            """応答の送信を始めたかを記録してから送る。

            送信を始めた後の例外は 500 に差し替えられないため、その判定に使う。

            Parameters
            ----------
            message : Message
                送る ASGI のメッセージ。
            """
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        try:
            await self.app(scope, receive, tracking_send)
        except Exception:
            if response_started:
                raise
            await unexpected_error_response(scope["path"])(scope, receive, send)


class MultipartSizeLimitMiddleware:
    """multipart のリクエスト全体のサイズ上限（移植元の max-request-size）。

    移植元（Tomcat のマルチパート解析）と同じく、Content-Length が上限を超えて
    いればすぐに、Content-Length がなければ受信中に上限を超えた時点で 413 にする。
    """

    def __init__(self, app: ASGIApp, *, max_bytes: int) -> None:
        """内側の ASGI アプリとサイズの上限を受け取る。

        Parameters
        ----------
        app : ASGIApp
            このミドルウェアの内側で動く ASGI アプリ。
        max_bytes : int
            multipart のリクエスト本文全体の上限（バイト）。
        """
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        """multipart のリクエストだけ、本文のサイズが上限を超えないか確かめる。

        Content-Length が上限を超えていれば本文を読まずに 413 を返し、そうでなければ
        受信した本文の量を数えながら内側に渡す。

        Parameters
        ----------
        scope : Scope
            ASGI のスコープ。
        receive : Receive
            リクエストを受け取る ASGI の関数。
        send : Send
            応答を送る ASGI の関数。

        Raises
        ------
        HTTPException
            受信中に上限を超えた場合（ステータス 413。例外ハンドラーで応答にする）。
        """
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        headers = Headers(scope=scope)
        # メディアタイプは大文字小文字を区別しない（Starlette も小文字にして解析する）
        content_type = headers.get("content-type", "").lower()
        if not content_type.startswith(MULTIPART_CONTENT_TYPE_PREFIX):
            await self.app(scope, receive, send)
            return

        content_length = headers.get("content-length")
        if (
            content_length is not None
            and content_length.isdigit()
            and int(content_length) > self.max_bytes
        ):
            status = HTTPStatus.REQUEST_ENTITY_TOO_LARGE
            response = JSONResponse(
                status_code=status,
                content=spring_default_error_body(status, scope["path"]),
            )
            await response(scope, receive, send)
            return

        received = 0

        async def limited_receive() -> Message:
            """本文を受け取り、受信した合計が上限を超えたら例外にする。

            Returns
            -------
            Message
                受け取った ASGI のメッセージ。

            Raises
            ------
            HTTPException
                受信した本文の合計が上限を超えた場合（ステータス 413）。
            """
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    # FastAPI は本文の解析中の例外を 400 にするが、HTTPException は
                    # そのまま通すため、例外ハンドラーで Spring 既定の形の 413 になる
                    raise HTTPException(status_code=HTTPStatus.REQUEST_ENTITY_TOO_LARGE)
            return message

        await self.app(scope, limited_receive, send)
