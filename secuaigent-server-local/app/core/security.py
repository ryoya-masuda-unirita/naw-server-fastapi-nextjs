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
        """内側の ASGI アプリ・正しい認証キー・コンテキストパスを受け取る。

        Parameters
        ----------
        app : ASGIApp
            このミドルウェアの内側で動く ASGI アプリ。
        expected_key : str
            ``X-SERVER-AUTH-KEY`` ヘッダーに期待する認証キー。
        context_path : str
            ヘルスチェックのパスに前置きするコンテキストパス。
        """
        self.app = app
        self.expected_key = expected_key
        # 移植元は `/secuaigent` をハードコードしていたが、配置先に合わせて変えられる
        # ようコンテキストパスの設定に追従させる。
        self.health_check_prefix = f"{context_path}{HEALTH_CHECK_PATH}"

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        """``X-SERVER-AUTH-KEY`` ヘッダーを確かめ、一致しなければ 401 を返す。

        比較は ``secrets.compare_digest`` で行い、処理時間の差からキーを推測されない
        ようにする。プリフライトとヘルスチェックは確かめずに通す。

        Parameters
        ----------
        scope : Scope
            ASGI のスコープ。
        receive : Receive
            リクエストを受け取る ASGI の関数。
        send : Send
            応答を送る ASGI の関数。
        """
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
        """認証キーの確認を省くリクエストかを判定する。

        移植元 ServerAuthKeyFilter.shouldNotFilter と同じく、CORS のプリフライト
        （ヘッダーを付けられない）とヘルスチェック（``/api/hello``）は対象外にする。

        Parameters
        ----------
        scope : Scope
            ASGI のスコープ。

        Returns
        -------
        bool
            確認を省くなら True。
        """
        is_preflight = scope["method"].upper() == "OPTIONS"
        is_health_check = scope["path"].startswith(self.health_check_prefix)
        return is_preflight or is_health_check
