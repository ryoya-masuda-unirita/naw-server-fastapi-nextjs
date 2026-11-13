"""移植元 Spring Boot の`APIControllerAdvice`に相当するエラー応答の共通化。

移植元はエラーを`ErrorResponse`（`timestamp`・`message`）で返し、入力チェックの
エラーは400で返す。クライアントは移植元の形でエラーを扱うため、FastAPI標準の
`{"detail": ...}`・422ではなく同じ形・同じステータスで返す（Issue #228）。
"""

import logging
import time
from collections.abc import Sequence
from http import HTTPStatus
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from fastapi.utils import is_body_allowed_for_status_code
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)

# 入力チェックのエラーが1件も無い場合のメッセージ。移植元
# `handleConstraintViolationException`の`orElse`と同じ文言。
DEFAULT_VALIDATION_MESSAGE = "リクエストが不正です"

# `field_validator`/`model_validator`で送出した`ValueError`のメッセージに
# Pydanticが付ける接頭辞。独自チェックのメッセージをそのまま返すために外す。
_VALUE_ERROR_TYPE = "value_error"
_VALUE_ERROR_PREFIX = "Value error, "


def error_response_body(message: str | None) -> dict[str, Any]:
    """移植元`ErrorResponse`と同じ本文を作る。

    Parameters
    ----------
    message : str | None
        エラーメッセージ。

    Returns
    -------
    dict[str, Any]
        `timestamp`（UNIX秒の整数）と`message`を持つ本文。
    """
    return {"timestamp": int(time.time()), "message": message}


def validation_error_message(errors: Sequence[Any]) -> str:
    """入力チェックのエラー一覧から、応答に載せるメッセージを1つ選ぶ。

    移植元は複数のエラーを連結せず、最初の1件のメッセージだけを返すため合わせる。

    Parameters
    ----------
    errors : Sequence[Any]
        `RequestValidationError.errors()`の戻り値。

    Returns
    -------
    str
        最初の1件のメッセージ。一覧が空なら`DEFAULT_VALIDATION_MESSAGE`。
    """
    if not errors:
        return DEFAULT_VALIDATION_MESSAGE
    first = errors[0]
    message = str(first.get("msg", DEFAULT_VALIDATION_MESSAGE))
    if first.get("type") == _VALUE_ERROR_TYPE:
        return message.removeprefix(_VALUE_ERROR_PREFIX)
    return message


def _http_exception_message(detail: Any) -> str:
    """`HTTPException.detail`を`message`に変換する。

    `detail`には文字列を渡す規約だが、それ以外が渡されてもクライアントが`message`を
    文字列として扱えるよう文字列化する。

    Parameters
    ----------
    detail : Any
        `HTTPException`に渡された`detail`。

    Returns
    -------
    str
        応答の`message`に載せる文字列。
    """
    return detail if isinstance(detail, str) else str(detail)


async def _handle_http_exception(
    _request: Request, exc: StarletteHTTPException
) -> Response:
    """`HTTPException`（存在しないURLの404・405を含む）を移植元の形で返す。

    Parameters
    ----------
    _request : Request
        リクエスト（未使用）。
    exc : StarletteHTTPException
        送出された例外。

    Returns
    -------
    Response
        例外のステータスと`{"timestamp", "message"}`の応答。
    """
    # 204・304などは本文を持てないため、FastAPI標準と同じく本文なしで返す。
    if not is_body_allowed_for_status_code(exc.status_code):
        return Response(status_code=exc.status_code, headers=exc.headers)
    return JSONResponse(
        status_code=exc.status_code,
        content=error_response_body(_http_exception_message(exc.detail)),
        headers=exc.headers,
    )


async def _handle_request_validation_error(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """入力チェックのエラーを、移植元と同じく400で返す。

    Parameters
    ----------
    request : Request
        リクエスト（ログにパスを残すため）。
    exc : RequestValidationError
        送出された例外。

    Returns
    -------
    JSONResponse
        400と`{"timestamp", "message"}`の応答。
    """
    errors = exc.errors()
    # 応答には最初の1件しか載らないため、原因調査用に全件の位置と種類を残す。
    # 入力値はパスワードや添付ファイルを含み得るためログに出さない。
    logger.warning(
        "Request validation failed: path=%s, errors=%s",
        request.url.path,
        [(error.get("loc"), error.get("type")) for error in errors],
    )
    return JSONResponse(
        status_code=HTTPStatus.BAD_REQUEST,
        content=error_response_body(validation_error_message(errors)),
    )


def register_exception_handlers(app: FastAPI) -> None:
    """移植元`APIControllerAdvice`相当の例外ハンドラを登録する。

    FastAPIの`HTTPException`は`starlette`の`HTTPException`のサブクラスのため、
    `starlette`側に登録すればルーティングの404・405も含めて変換できる。

    Parameters
    ----------
    app : FastAPI
        登録先のアプリ。
    """
    app.exception_handler(StarletteHTTPException)(_handle_http_exception)
    app.exception_handler(RequestValidationError)(_handle_request_validation_error)
