from http import HTTPStatus

from fastapi import FastAPI, Request
from fastapi.responses import PlainTextResponse, Response


class EmulatorError(Exception):
    """HTTP エラーとしてテキストで返すエラー。

    server-local は Waha! の HTTP エラーを本文付きのメッセージにするため、
    本文に認証キーなどを含めないこと。
    """

    def __init__(self, status: HTTPStatus, message: str) -> None:
        """ステータスとメッセージを指定して作る。

        Parameters
        ----------
        status : HTTPStatus
            応答する HTTP ステータス。
        message : str
            応答本文のメッセージ。
        """
        super().__init__(message)
        self.status = status
        self.message = message


def register_exception_handlers(app: FastAPI) -> None:
    """`EmulatorError` を処理する例外ハンドラーを登録する。

    Parameters
    ----------
    app : FastAPI
        登録先のアプリ。
    """

    @app.exception_handler(EmulatorError)
    async def handle_emulator_error(request: Request, exc: EmulatorError) -> Response:
        """`EmulatorError` をテキストの HTTP エラーにする。

        Parameters
        ----------
        request : Request
            FastAPI のリクエスト。
        exc : EmulatorError
            発生したエラー。

        Returns
        -------
        Response
            エラーのメッセージを本文にしたテキスト応答。
        """
        return PlainTextResponse(exc.message, status_code=exc.status)
