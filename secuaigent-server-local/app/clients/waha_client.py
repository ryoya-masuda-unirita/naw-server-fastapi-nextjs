import asyncio
import logging
import mimetypes
import re
from enum import StrEnum
from typing import Any

import httpx

from app.core.errors import ExternalServiceError

logger = logging.getLogger(__name__)

SERVICE_RUN_PATH = "WahaServer/servicerun/api"
START_SESSION_PATH = "/startsession"
END_SESSION_PATH = "/endsession"
FILE_UPLOAD_PATH = "/upload"
EXECUTE_PATH = "/execute"
DOWNLOAD_PATH = "/download"
RESULTS_PATH = "/result"

# Waha! のスロット名（REST 管理コンソールでサービスを登録するときのパラメーター名）
SLOT_FILE = "file"
SLOT_QUESTION = "question"
SLOT_ATTACHMENT = "attachmentfile"
SLOT_HISTORY = "history"
SLOT_OUTPUT = "outputfile"
SLOT_TEXTDATA = "textdata"

DEFAULT_CONTENT_TYPE = "application/octet-stream"

# 移植元 RestTemplate（Spring 6.1 の DefaultResponseErrorHandler・LogFormatUtils）の
# HTTP エラーメッセージの書式
NO_BODY_TEXT = "[no body]"
NEWLINE_PATTERN = re.compile(r"[\n\r]")
NEWLINE_REPLACEMENT = "<EOL>"
CONTROL_CHARACTER_PATTERN = re.compile(r"[\x00-\x1f\x7f-\x9f]")
CONTROL_CHARACTER_REPLACEMENT = "?"


class ResultStatus(StrEnum):
    """Waha! の ``/result`` が返すジョブの状態。

    移植元の判定に合わせ、成功・実行中以外の応答はすべて失敗として扱う。
    """

    SUCCESS = "SUCCESS"
    RUNNING = "RUNNING"
    FAILURE = "FAILURE"


def status_error_message(response: httpx.Response) -> str:
    """HTTP エラー応答を、移植元の HttpStatusCodeException と同じ書式のメッセージにする。

    例: `503 Service Unavailable: [no body]` / `500 Internal Server Error: "本文"`。
    移植元と同じく URL を含めないため、クエリの authkey が応答・ログに出ない（#252）。
    理由句は応答のものをそのまま使う。理由句を返さないサーバーでは空になり
    `503 : [no body]` となるが、移植元（HttpURLConnection）も同じ。
    本文の改行は ``<EOL>`` に、制御文字は ``?`` に置き換える（移植元の LogFormatUtils どおり）。

    Parameters
    ----------
    response : httpx.Response
        成功以外のステータスの応答。

    Returns
    -------
    str
        ``{ステータス} {理由句}: {本文}`` の形式のメッセージ。
    """
    preface = f"{response.status_code} {response.reason_phrase}: "
    body = response.text
    if not body:
        return f"{preface}{NO_BODY_TEXT}"
    body = NEWLINE_PATTERN.sub(NEWLINE_REPLACEMENT, body)
    body = CONTROL_CHARACTER_PATTERN.sub(CONTROL_CHARACTER_REPLACEMENT, body)
    return f'{preface}"{body}"'


def io_error_message(method: str, url: str, error: httpx.RequestError) -> str:
    """通信エラーを、移植元の ResourceAccessException と同じ書式のメッセージにする。

    移植元は URL のクエリ（authkey など）を除いて出すため、同じく除く。
    httpx の通信エラーは本文が空のことがあるため、そのときは例外の型名を出す。

    Parameters
    ----------
    method : str
        送ろうとした HTTP メソッド。
    url : str
        送ろうとした URL（クエリ付きでもよい）。
    error : httpx.RequestError
        httpx が投げた通信エラー。

    Returns
    -------
    str
        ``I/O error on {メソッド} request for "{URL}": {理由}`` の形式のメッセージ。
    """
    resource = str(httpx.URL(url).copy_with(query=None))
    reason = str(error) or type(error).__name__
    return f'I/O error on {method} request for "{resource}": {reason}'


def parse_result_status(response: str | None) -> ResultStatus:
    """Waha! の ``/result`` の応答本文をジョブの状態に変換する。

    成功時の応答は ``SUCCESS`` の後ろに付加情報が付くことがあるため前方一致で、
    実行中は ``RUNNING`` との完全一致で判定する（移植元どおり）。

    Parameters
    ----------
    response : str | None
        ``/result`` の応答本文。

    Returns
    -------
    ResultStatus
        判定した状態。成功・実行中のどちらでもなければ ``FAILURE``。
    """
    if response is not None and response.startswith("SUCCESS"):
        return ResultStatus.SUCCESS
    if response == "RUNNING":
        return ResultStatus.RUNNING
    return ResultStatus.FAILURE


class WahaClient:
    """移植元 ServiceRunService（Waha! servicerun API の呼び出し）の移植。"""

    def __init__(
        self,
        *,
        base_url: str,
        auth_key: str,
        http_client: httpx.AsyncClient,
        result_retry_interval_seconds: float,
        result_max_retries: int,
    ) -> None:
        """接続先・認証キー・結果待ちの設定を受け取る。

        Parameters
        ----------
        base_url : str
            Waha! サーバーの URL（``waha.url``。末尾 ``/`` 付きを想定）。
        auth_key : str
            セッション開始時に送る Waha! の認証キー。
        http_client : httpx.AsyncClient
            Waha! の呼び出しに使う HTTP クライアント。テストでは偽の応答に差し替える。
        result_retry_interval_seconds : float
            ``get_results`` でジョブの状態を問い合わせる間隔（秒）。
        result_max_retries : int
            ``get_results`` で ``RUNNING`` が続いたときに問い合わせる上限回数。
        """
        # 移植元は `waha.url`（末尾 `/` 付き）に文字列連結しているため、同じく連結する
        self._api_base = f"{base_url}{SERVICE_RUN_PATH}"
        self._auth_key = auth_key
        self._http = http_client
        self._retry_interval = result_retry_interval_seconds
        self._max_retries = result_max_retries

    async def _send(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        """Waha! を呼び、失敗したら URL を含まない ExternalServiceError にする。

        httpx の HTTPStatusError は authkey 付きの URL をメッセージに含むため、
        raise_for_status() は使わず、応答から直接メッセージを作る。通信エラー
        （RequestError）のメッセージは URL を含まないため、原因を追えるよう連鎖は残す。

        Parameters
        ----------
        method : str
            HTTP メソッド。
        path : str
            servicerun API のベース URL からのパス。
        **kwargs : Any
            ``httpx.AsyncClient.request`` にそのまま渡す引数（``params``・``files`` など）。

        Returns
        -------
        httpx.Response
            成功（2xx）の応答。

        Raises
        ------
        ExternalServiceError
            通信に失敗した場合、または成功以外のステータスが返った場合。
        """
        url = f"{self._api_base}{path}"
        try:
            response = await self._http.request(method, url, **kwargs)
        except httpx.RequestError as e:
            raise ExternalServiceError(io_error_message(method, url, e)) from e
        if not response.is_success:
            raise ExternalServiceError(status_error_message(response))
        return response

    async def _get_text(self, path: str, params: dict[str, str | int]) -> str:
        """Waha! に GET を送り、応答本文を文字列で返す。

        servicerun API はほとんどが GET で、結果をテキストで返すため共通化している。

        Parameters
        ----------
        path : str
            servicerun API のベース URL からのパス。
        params : dict[str, str | int]
            クエリパラメーター。

        Returns
        -------
        str
            応答本文。

        Raises
        ------
        ExternalServiceError
            呼び出しに失敗した場合。
        """
        response = await self._send("GET", path, params=params)
        return response.text

    async def start_session(self) -> str:
        """認証キーで Waha! のセッションを開始する。

        アップロード・実行・結果取得はすべてこのセッション ID に紐づけて行う。

        Returns
        -------
        str
            Waha! が払い出したセッション ID。

        Raises
        ------
        ExternalServiceError
            呼び出しに失敗した場合。
        """
        return await self._get_text(START_SESSION_PATH, {"authkey": self._auth_key})

    async def end_session(self, session_id: str) -> str:
        """Waha! のセッションを終了し、サーバー側の作業領域を解放させる。

        Parameters
        ----------
        session_id : str
            ``start_session`` で得たセッション ID。

        Returns
        -------
        str
            Waha! の応答本文。

        Raises
        ------
        ExternalServiceError
            呼び出しに失敗した場合。
        """
        return await self._get_text(END_SESSION_PATH, {"sessionid": session_id})

    async def upload_file(
        self,
        *,
        filename: str,
        content: bytes,
        slot: str,
        session_id: str,
        content_type: str | None = None,
    ) -> str:
        """セッションのスロットにファイルを multipart でアップロードする。

        Content-Type が渡されなければファイル名の拡張子から推測し、推測できなければ
        ``application/octet-stream`` にする。

        Parameters
        ----------
        filename : str
            Waha! に送るファイル名。
        content : bytes
            ファイルの中身。
        slot : str
            アップロード先のスロット名（``file``・``question`` など）。
        session_id : str
            ``start_session`` で得たセッション ID。
        content_type : str | None, optional
            ファイルの Content-Type。省略時は推測する。

        Returns
        -------
        str
            Waha! の応答本文。

        Raises
        ------
        ExternalServiceError
            呼び出しに失敗した場合。
        """
        media_type = (
            content_type or mimetypes.guess_type(filename)[0] or DEFAULT_CONTENT_TYPE
        )
        response = await self._send(
            "POST",
            f"{FILE_UPLOAD_PATH}/{slot}",
            params={"sessionid": session_id},
            files={"file": (filename, content, media_type)},
        )
        logger.info(
            "Waha file uploaded: sessionId=%s, slot=%s, filename=%s, response=%s",
            session_id,
            slot,
            filename,
            response.text,
        )
        return response.text

    async def execute(self, session_id: str, service_id: str) -> None:
        """セッションでサービスを実行する（ストリームファイルなし）。

        同期の回答作成やファイルの削除など、結果をスロットから取り出す処理で使う。

        Parameters
        ----------
        session_id : str
            ``start_session`` で得たセッション ID。
        service_id : str
            実行する Waha! のサービス名。

        Raises
        ------
        ExternalServiceError
            呼び出しに失敗した場合。
        """
        await self._get_text(f"{EXECUTE_PATH}/{service_id}", {"sessionid": session_id})

    async def execute_with_stream_file(
        self, session_id: str, service_id: str, stream_file_path: str
    ) -> None:
        """出力先のストリームファイルを指定してサービスを実行する。

        ストリーミング回答では、Waha! が生成途中の回答をこのファイルに追記し、
        こちらがそれを読みながら SSE で返す。

        Parameters
        ----------
        session_id : str
            ``start_session`` で得たセッション ID。
        service_id : str
            実行する Waha! のサービス名。
        stream_file_path : str
            Waha! から見たストリームファイルのパス。

        Raises
        ------
        ExternalServiceError
            呼び出しに失敗した場合。
        """
        logger.info(
            "Waha execute started: sessionId=%s, serviceId=%s, streamFilePath=%s",
            session_id,
            service_id,
            stream_file_path,
        )
        await self._get_text(
            f"{EXECUTE_PATH}/{service_id}",
            {"sessionid": session_id, "streamfilepath": stream_file_path},
        )

    async def execute_learning(
        self,
        session_id: str,
        service_id: str,
        split_length: str | None,
        reference: str | None,
    ) -> None:
        """分割長と参照先を指定して、インデックスへの学習サービスを実行する。

        Parameters
        ----------
        session_id : str
            ``start_session`` で得たセッション ID。
        service_id : str
            実行する学習サービス名。
        split_length : str | None
            文書を分割する長さ。None なら空文字で送り、Waha! 側の既定にする。
        reference : str | None
            学習するファイルの参照先パス。None なら空文字で送る。

        Raises
        ------
        ExternalServiceError
            呼び出しに失敗した場合。
        """
        params: dict[str, str | int] = {"sessionid": session_id}
        # RestTemplate の queryParam は null を値なし（`splitLength`）で送るが、
        # httpx は None を送れないため空文字列で送る（Waha! 側ではどちらも未指定扱い）
        params["splitLength"] = split_length or ""
        params["filepath"] = reference or ""
        await self._get_text(f"{EXECUTE_PATH}/{service_id}", params)

    async def execute_sync(
        self, session_id: str, service_id: str, start: int, end: int
    ) -> None:
        """取得範囲を指定して、インデックス同期のサービスを実行する。

        Parameters
        ----------
        session_id : str
            ``start_session`` で得たセッション ID。
        service_id : str
            実行する同期サービス名。
        start : int
            取得する範囲の開始位置。
        end : int
            取得する範囲の終了位置。

        Raises
        ------
        ExternalServiceError
            呼び出しに失敗した場合。
        """
        await self._get_text(
            f"{EXECUTE_PATH}/{service_id}",
            {"sessionid": session_id, "start": start, "end": end},
        )

    async def poll_result_once(self, session_id: str) -> ResultStatus:
        """ジョブの状態を 1 回だけ問い合わせる。

        ストリーミング回答では、ストリームファイルの読み取りと交互に状態を確かめる
        必要があるため、待ち合わせ（``get_results``）とは別に 1 回分を用意している。

        Parameters
        ----------
        session_id : str
            ``start_session`` で得たセッション ID。

        Returns
        -------
        ResultStatus
            問い合わせ時点のジョブの状態。

        Raises
        ------
        ExternalServiceError
            呼び出しに失敗した場合。
        """
        response = await self._get_text(RESULTS_PATH, {"sessionid": session_id})
        status = parse_result_status(response)
        logger.debug(
            "Waha result poll: sessionId=%s, rawResponse=%s, status=%s",
            session_id,
            response,
            status,
        )
        return status

    async def get_results(self, session_id: str) -> None:
        """ジョブ完了を待つ。

        ジョブ起動直後の未確定応答を FAILURE と誤判定しないよう、初回取得前から
        間隔を空ける。上限回数 RUNNING が続いた場合は例外にせず戻る（移植元どおり）。

        Parameters
        ----------
        session_id : str
            ``start_session`` で得たセッション ID。

        Raises
        ------
        ExternalServiceError
            Waha! がジョブの失敗を返した場合、または呼び出しに失敗した場合。
        """
        retry_count = 0
        while retry_count < self._max_retries:
            await asyncio.sleep(self._retry_interval)
            response = await self._get_text(RESULTS_PATH, {"sessionid": session_id})
            status = parse_result_status(response)
            if status == ResultStatus.SUCCESS:
                logger.info("API responded with OK")
                return
            if status == ResultStatus.RUNNING:
                retry_count += 1
                logger.info("Response is RUNNING, retrying... (%d)", retry_count)
                continue
            logger.error("Response is FAILURE.")
            raise ExternalServiceError("ジョブの実行に失敗しました。")

    async def download_file(self, session_id: str, slot: str) -> str:
        """セッションのスロットから実行結果のファイルを取り出す。

        Parameters
        ----------
        session_id : str
            ``start_session`` で得たセッション ID。
        slot : str
            取り出すスロット名（通常は ``outputfile``）。

        Returns
        -------
        str
            ファイルの中身（テキスト）。

        Raises
        ------
        ExternalServiceError
            呼び出しに失敗した場合。
        """
        logger.info("Waha download: sessionId=%s, fileId=%s", session_id, slot)
        return await self._get_text(
            f"{DOWNLOAD_PATH}/{slot}", {"sessionid": session_id}
        )
