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
    SUCCESS = "SUCCESS"
    RUNNING = "RUNNING"
    FAILURE = "FAILURE"


def status_error_message(response: httpx.Response) -> str:
    """HTTP エラー応答を、移植元の HttpStatusCodeException と同じ書式のメッセージにする。

    例: `503 Service Unavailable: [no body]` / `500 Internal Server Error: "本文"`。
    移植元と同じく URL を含めないため、クエリの authkey が応答・ログに出ない（#252）。
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
    """
    resource = str(httpx.URL(url).copy_with(query=None))
    return f'I/O error on {method} request for "{resource}": {error}'


def parse_result_status(response: str | None) -> ResultStatus:
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
        # 移植元は `waha.url`（末尾 `/` 付き）に文字列連結しているため、同じく連結する
        self._api_base = f"{base_url}{SERVICE_RUN_PATH}"
        self._auth_key = auth_key
        self._http = http_client
        self._retry_interval = result_retry_interval_seconds
        self._max_retries = result_max_retries

    async def _send(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        """Waha! を呼び、失敗したら URL を含まない ExternalServiceError にする。

        httpx の例外は authkey 付きの URL をメッセージに含むため、そのまま応答・SSE・
        DB・ログに出さない。元の例外を連鎖させるとログのトレースバックに URL が
        出るため、連鎖も切る（from None）。
        """
        url = f"{self._api_base}{path}"
        try:
            response = await self._http.request(method, url, **kwargs)
        except httpx.RequestError as e:
            raise ExternalServiceError(io_error_message(method, url, e)) from None
        if not response.is_success:
            raise ExternalServiceError(status_error_message(response))
        return response

    async def _get_text(self, path: str, params: dict[str, str | int]) -> str:
        response = await self._send("GET", path, params=params)
        return response.text

    async def start_session(self) -> str:
        return await self._get_text(START_SESSION_PATH, {"authkey": self._auth_key})

    async def end_session(self, session_id: str) -> str:
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
        await self._get_text(f"{EXECUTE_PATH}/{service_id}", {"sessionid": session_id})

    async def execute_with_stream_file(
        self, session_id: str, service_id: str, stream_file_path: str
    ) -> None:
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
        params: dict[str, str | int] = {"sessionid": session_id}
        # RestTemplate の queryParam は null を値なし（`splitLength`）で送るが、
        # httpx は None を送れないため空文字列で送る（Waha! 側ではどちらも未指定扱い）
        params["splitLength"] = split_length or ""
        params["filepath"] = reference or ""
        await self._get_text(f"{EXECUTE_PATH}/{service_id}", params)

    async def execute_sync(
        self, session_id: str, service_id: str, start: int, end: int
    ) -> None:
        await self._get_text(
            f"{EXECUTE_PATH}/{service_id}",
            {"sessionid": session_id, "start": start, "end": end},
        )

    async def poll_result_once(self, session_id: str) -> ResultStatus:
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
        logger.info("Waha download: sessionId=%s, fileId=%s", session_id, slot)
        return await self._get_text(
            f"{DOWNLOAD_PATH}/{slot}", {"sessionid": session_id}
        )
