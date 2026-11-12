from http import HTTPStatus

from fastapi import FastAPI, Request
from fastapi.responses import PlainTextResponse, Response


class EmulatorError(Exception):
    """HTTP エラーとしてテキストで返すエラー。

    server-local は Waha! の HTTP エラーを本文付きのメッセージにするため、
    本文に認証キーなどを含めないこと。
    """

    def __init__(self, status: HTTPStatus, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(EmulatorError)
    async def handle_emulator_error(request: Request, exc: EmulatorError) -> Response:
        return PlainTextResponse(exc.message, status_code=exc.status)
