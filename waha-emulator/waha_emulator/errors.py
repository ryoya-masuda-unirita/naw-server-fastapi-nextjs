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


async def _handle_emulator_error(request: Request, exc: Exception) -> Response:
    if not isinstance(exc, EmulatorError):
        raise exc
    return PlainTextResponse(exc.message, status_code=exc.status)


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(EmulatorError, _handle_emulator_error)
