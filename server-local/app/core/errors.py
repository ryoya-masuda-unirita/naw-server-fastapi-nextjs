import logging
import time
from datetime import UTC, datetime
from http import HTTPStatus
from typing import Any

import httpx
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)


class AppError(Exception):
    """移植元 APIControllerAdvice が ErrorResponse に変換していた例外の基底。"""

    status_code: int = HTTPStatus.INTERNAL_SERVER_ERROR

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class BadRequestError(AppError):
    """IllegalArgumentException / BadRequestException 相当（400）。"""

    status_code = HTTPStatus.BAD_REQUEST


class EntityNotFoundError(AppError):
    """EntityNotFoundException 相当（404）。"""

    status_code = HTTPStatus.NOT_FOUND


class ExternalServiceError(AppError):
    """RestClientException 相当（500）。Waha! のジョブ失敗など。"""

    status_code = HTTPStatus.INTERNAL_SERVER_ERROR


class PayloadTooLargeError(Exception):
    """multipart の上限超過（Spring の MaxUploadSizeExceededException 相当）。"""


def error_response_body(message: str) -> dict[str, Any]:
    """移植元 ErrorResponse（timestamp は UNIX 秒）。"""
    return {"timestamp": int(time.time()), "message": message}


# Spring（HttpStatus の理由句）と Python（http.HTTPStatus）で語が異なるもの
SPRING_REASON_PHRASES: dict[int, str] = {
    HTTPStatus.REQUEST_ENTITY_TOO_LARGE: "Payload Too Large",
}


def spring_default_error_body(status: int, path: str) -> dict[str, Any]:
    """Spring Boot の既定エラー応答（BasicErrorController）と同じ形にする。

    呼び出し元（ブラウザ・NAW 本体）が移植元と同じ形でエラーを扱えるようにするため。
    """
    now = datetime.now(UTC)
    return {
        "timestamp": now.isoformat(timespec="milliseconds"),
        "status": status,
        "error": SPRING_REASON_PHRASES.get(status, HTTPStatus(status).phrase),
        "path": path,
    }


def unexpected_error_response(path: str) -> JSONResponse:
    """想定外の例外をログに出し、Spring 既定の形の 500 を作る。

    CORS の内側のミドルウェア（UnhandledErrorMiddleware）と、その外側で起きた例外を
    扱う汎用の例外ハンドラーの両方で使う。
    """
    logger.exception("Unhandled exception: path=%s", path)
    status = HTTPStatus.INTERNAL_SERVER_ERROR
    return JSONResponse(
        status_code=status, content=spring_default_error_body(status, path)
    )


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _handle_app_error(_request: Request, exc: AppError) -> JSONResponse:
        logger.error(exc.message)
        return JSONResponse(
            status_code=int(exc.status_code), content=error_response_body(exc.message)
        )

    @app.exception_handler(httpx.HTTPError)
    async def _handle_http_error(
        _request: Request, exc: httpx.HTTPError
    ) -> JSONResponse:
        # RestTemplate の失敗（RestClientException）は移植元で 500 + ErrorResponse
        logger.error(str(exc))
        return JSONResponse(
            status_code=HTTPStatus.INTERNAL_SERVER_ERROR,
            content=error_response_body(str(exc)),
        )

    @app.exception_handler(RequestValidationError)
    async def _handle_validation_error(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        # 必須ヘッダー・パラメーターの欠落や型不一致は Spring では 400。
        # FastAPI 既定の 422 にすると呼び出し側の扱いが変わるため 400 に揃える。
        logger.warning(
            "Bad request: path=%s, errors=%s", request.url.path, exc.errors()
        )
        return JSONResponse(
            status_code=HTTPStatus.BAD_REQUEST,
            content=spring_default_error_body(HTTPStatus.BAD_REQUEST, request.url.path),
        )

    @app.exception_handler(PayloadTooLargeError)
    async def _handle_payload_too_large(
        request: Request, _exc: PayloadTooLargeError
    ) -> JSONResponse:
        status = HTTPStatus.REQUEST_ENTITY_TOO_LARGE
        return JSONResponse(
            status_code=status,
            content=spring_default_error_body(status, request.url.path),
        )

    @app.exception_handler(StarletteHTTPException)
    async def _handle_http_exception(
        request: Request, exc: StarletteHTTPException
    ) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=spring_default_error_body(exc.status_code, request.url.path),
            headers=exc.headers,
        )

    @app.exception_handler(Exception)
    async def _handle_unexpected(request: Request, exc: Exception) -> JSONResponse:
        # 認証ミドルウェアなど、UnhandledErrorMiddleware より外側で起きた例外を扱う
        return unexpected_error_response(request.url.path)
