import logging
import secrets
from http import HTTPStatus

from starlette.datastructures import Headers
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from app.core.errors import spring_default_error_body

logger = logging.getLogger(__name__)

SERVER_AUTH_KEY_HEADER = "X-SERVER-AUTH-KEY"
HEALTH_CHECK_PATH = "/api/hello"


class ServerAuthKeyMiddleware:
    """移植元 ServerAuthKeyFilter の移植。

    純粋な ASGI ミドルウェアにしているのは、BaseHTTPMiddleware だと SSE の
    StreamingResponse がミドルウェア内でバッファ・キャンセルされる問題を避けるため。
    """

    def __init__(self, app: ASGIApp, *, expected_key: str, context_path: str) -> None:
        self.app = app
        self.expected_key = expected_key
        # 移植元は `/secuaigent` をハードコードしていたが、配置先に合わせて変えられる
        # ようコンテキストパスの設定に追従させる。
        self.health_check_prefix = f"{context_path}{HEALTH_CHECK_PATH}"

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or self._should_not_filter(scope):
            await self.app(scope, receive, send)
            return

        provided = Headers(scope=scope).get(SERVER_AUTH_KEY_HEADER)
        if provided is None or not secrets.compare_digest(
            provided.encode(), self.expected_key.encode()
        ):
            logger.warning("Unauthorized: Invalid Server Auth Key: %s", scope["path"])
            status = HTTPStatus.UNAUTHORIZED
            response = JSONResponse(
                status_code=status,
                content=spring_default_error_body(status, scope["path"]),
            )
            await response(scope, receive, send)
            return

        await self.app(scope, receive, send)

    def _should_not_filter(self, scope: Scope) -> bool:
        is_preflight = scope["method"].upper() == "OPTIONS"
        is_health_check = scope["path"].startswith(self.health_check_prefix)
        return is_preflight or is_health_check
