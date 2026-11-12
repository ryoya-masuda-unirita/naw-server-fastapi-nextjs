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
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        response_started = False

        async def tracking_send(message: Message) -> None:
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
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
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
