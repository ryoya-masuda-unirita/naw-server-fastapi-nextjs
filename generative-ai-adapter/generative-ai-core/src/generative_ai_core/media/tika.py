"""ファイルのテキストを Apache Tika で取り出すクライアント（移植元の Tika 呼び出しの置き換え）。

移植元（Java）は、Tika をアダプタのプロセスの中でライブラリとして呼ぶ。Python は Java の
ライブラリを直接呼べないため、Tika のサーバー（jar）と JRE をコンテナの中に入れ、同じ
コンテナの中で子プロセスとして起動し、``127.0.0.1`` で HTTP 接続して呼ぶ。コンテナ
（デプロイの単位）は増やさない。

- ``TIKA_SERVER_JAR`` があれば、必要になったときに（遅延起動）jar を起動する
- ``TIKA_URL`` があれば、そのサーバーを使う（起動しない）
- どちらもなければ、使わない（``get_tika_client`` が None を返す）

core の前処理は同期のため、このクライアントも同期にする（呼び出し側は
``asyncio.to_thread`` の別スレッドから呼ぶ）。
"""

from __future__ import annotations

import logging
import os
import re
import subprocess
import tempfile
import threading
import time
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import quote

import httpx

from generative_ai_core.media.model import CORRUPT_FILE, UNSUPPORTED_MIME

logger = logging.getLogger(__name__)

LOOPBACK_HOST = "127.0.0.1"
READY_POLL_SECONDS = 0.5
READY_CHECK_TIMEOUT_SECONDS = 2.0
STOP_TIMEOUT_SECONDS = 5.0
# Tika のサーバーは、親（監視役）と子（実際に処理する側）の 2 つの JVM で動く。親は小さく
# 固定し、子のヒープは設定の `TIKA_HEAP` を、設定ファイル（forkedJvmArgs）から渡す
PARENT_HEAP = "64m"
HEAP_PATTERN = re.compile(r"^[0-9]+[mMgG]$")
DEFAULT_PORT = 9998
DEFAULT_HEAP = "256m"
DEFAULT_START_TIMEOUT_SECONDS = 60.0
DEFAULT_REQUEST_TIMEOUT_SECONDS = 120.0
MIN_PORT = 1
MAX_PORT = 65535
HTTP_UNSUPPORTED_MEDIA = 415
HTTP_CLIENT_ERROR = 400
HTTP_SERVER_ERROR = 500
# 移植元は OCR をしない（`TesseractOCRConfig#setSkipOcr(true)`）。Tika の設定ファイルでは、
# OCR のパーサーを除外して再現する（コンテナに tesseract は入れないが、入っても動かさない）
CONFIG_TEMPLATE = """<?xml version="1.0" encoding="UTF-8"?>
<properties>
  <parsers>
    <parser class="org.apache.tika.parser.DefaultParser">
      <parser-exclude class="org.apache.tika.parser.ocr.TesseractOCRParser"/>
    </parser>
  </parsers>
  <server>
    <params>
      <forkedJvmArgs>
        <arg>-Xmx{heap}</arg>
        <arg>-Djava.awt.headless=true</arg>
      </forkedJvmArgs>
    </params>
  </server>
</properties>
"""


class TikaError(Exception):
    """Tika の呼び出しの失敗の基底。メッセージにファイルの中身は入れない。"""


class TikaFileError(TikaError):
    """ファイルの問題（未対応の形式・解析できない文書）による失敗。"""

    def __init__(self, code: str, message: str) -> None:
        """ファイルの問題の失敗を作る。

        Parameters
        ----------
        code : str
            前処理の失敗のコード（``UNSUPPORTED_MIME``・``CORRUPT_FILE``）。
        message : str
            失敗の要約。
        """
        super().__init__(message)
        self.code = code


class TikaUnavailableError(TikaError):
    """Tika 側の障害（起動できない・応答しない・5xx・設定が不正）による失敗。"""


@dataclass(frozen=True)
class TikaSettings:
    """Tika の設定。"""

    server_jar: str | None = None
    url: str | None = None
    java_command: str = "java"
    port: int = DEFAULT_PORT
    heap: str = DEFAULT_HEAP
    start_timeout_seconds: float = DEFAULT_START_TIMEOUT_SECONDS
    request_timeout_seconds: float = DEFAULT_REQUEST_TIMEOUT_SECONDS

    def __post_init__(self) -> None:
        """値を検証する。

        Raises
        ------
        ValueError
            ポート・ヒープ・時間が不正なとき。
        """
        if not MIN_PORT <= self.port <= MAX_PORT:
            raise ValueError(f"TIKA_PORT must be {MIN_PORT}-{MAX_PORT}")
        if not HEAP_PATTERN.match(self.heap):
            raise ValueError("TIKA_HEAP must be digits followed by m or g")
        if self.start_timeout_seconds <= 0:
            raise ValueError("TIKA_START_TIMEOUT_SECONDS must be positive")
        if self.request_timeout_seconds <= 0:
            raise ValueError("TIKA_REQUEST_TIMEOUT_SECONDS must be positive")

    @property
    def is_enabled(self) -> bool:
        """Tika を使う設定か。

        Returns
        -------
        bool
            ``TIKA_URL`` または ``TIKA_SERVER_JAR`` があるとき True。
        """
        return bool(self.url or self.server_jar)

    @classmethod
    def from_env(cls, environ: Mapping[str, str] | None = None) -> TikaSettings:
        """環境変数から設定を作る。空文字は未設定として扱う。

        Parameters
        ----------
        environ : Mapping[str, str] | None
            環境変数。None なら ``os.environ``。

        Returns
        -------
        TikaSettings
            Tika の設定。

        Raises
        ------
        ValueError
            数値でない・範囲外・形式が不正な値があるとき。
        """
        env = os.environ if environ is None else environ

        def text(name: str) -> str | None:
            return (env.get(name) or "").strip() or None

        try:
            port = int(text("TIKA_PORT") or DEFAULT_PORT)
            start_timeout = float(
                text("TIKA_START_TIMEOUT_SECONDS") or DEFAULT_START_TIMEOUT_SECONDS
            )
            request_timeout = float(
                text("TIKA_REQUEST_TIMEOUT_SECONDS") or DEFAULT_REQUEST_TIMEOUT_SECONDS
            )
        except ValueError:
            raise ValueError("Tika の設定の数値が不正です") from None
        return cls(
            server_jar=text("TIKA_SERVER_JAR"),
            url=text("TIKA_URL"),
            java_command=text("TIKA_JAVA_COMMAND") or "java",
            port=port,
            heap=text("TIKA_HEAP") or DEFAULT_HEAP,
            start_timeout_seconds=start_timeout,
            request_timeout_seconds=request_timeout,
        )


class TikaClient:
    """Tika のサーバーを、必要になったときに起動し、本文を取り出す同期クライアント。"""

    def __init__(
        self,
        settings: TikaSettings,
        *,
        transport: httpx.BaseTransport | None = None,
        popen: Callable[..., Any] = subprocess.Popen,
        sleep: Callable[[float], None] = time.sleep,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        """クライアントを作る。起動は、最初の呼び出しまで行わない。

        Parameters
        ----------
        settings : TikaSettings
            Tika の設定。
        transport : httpx.BaseTransport | None
            HTTP の通信路。テストで偽の通信に差し替える。
        popen : Callable[..., Any]
            子プロセスの起動。テストで差し替える。
        sleep : Callable[[float], None]
            待ち。テストで差し替える。
        clock : Callable[[], float]
            時計。テストで差し替える。
        """
        self._settings = settings
        self._transport = transport
        self._popen = popen
        self._sleep = sleep
        self._clock = clock
        self._lock = threading.Lock()
        self._process: Any = None
        self._config_path: Path | None = None
        # すでに応答する Tika を、起動せずに借りているか（複数のプロセスで同じポートを
        # 取り合わないため）。借りた先が落ちたら、次の呼び出しで自分で起動する
        self._borrowed = False

    def extract_text(self, filename: str, mime_type: str, data: bytes) -> str:
        """ファイルから、本文のテキストを取り出す。

        Parameters
        ----------
        filename : str
            ファイル名（形式の判定の手がかりとして Tika に渡す）。
        mime_type : str
            判定済みの MIME。必ず付ける（付けないと、Tika が本文を返さないことがある）。
        data : bytes
            ファイルの中身。

        Returns
        -------
        str
            取り出した本文（空白は除いていない）。

        Raises
        ------
        TikaFileError
            未対応の形式（415）・解析できない文書（そのほかの 4xx）のとき。
        TikaUnavailableError
            Tika が使えない・応答しない・5xx のとき。
        """
        base_url = self._ensure_server()
        headers = {
            "Accept": "text/plain",
            "Content-Type": mime_type,
            "Content-Disposition": (
                f"attachment; filename*=UTF-8''{quote(filename, safe='')}"
            ),
        }
        try:
            with httpx.Client(
                timeout=self._settings.request_timeout_seconds,
                transport=self._transport,
            ) as client:
                response = client.put(f"{base_url}/tika", content=data, headers=headers)
        except httpx.HTTPError as error:
            logger.error("Tika の呼び出しに失敗しました: %s", type(error).__name__)
            self._borrowed = False  # 借りた先が落ちていたら、次は自分で起動する
            raise TikaUnavailableError("Tika is unavailable") from None
        status = response.status_code
        if status == HTTP_UNSUPPORTED_MEDIA:
            raise TikaFileError(UNSUPPORTED_MIME, "Tika does not support this format")
        if status >= HTTP_SERVER_ERROR:
            # Tika 側の障害（子の JVM のメモリ不足など）。ファイルの問題とは区別する
            logger.error("Tika が HTTP %d を返しました", status)
            raise TikaUnavailableError("Tika failed temporarily")
        if status >= HTTP_CLIENT_ERROR:  # 422（解析できない文書）など
            logger.error("Tika が HTTP %d を返しました", status)
            raise TikaFileError(CORRUPT_FILE, "Tika could not parse this file")
        return response.text

    def shutdown(self) -> None:
        """起動した Tika のサーバーを止める（アプリの終了時）。"""
        with self._lock:
            self._stop_process()

    def _ensure_server(self) -> str:
        """使う Tika のサーバーの URL を返す。必要なら子プロセスを起動して待つ。

        Returns
        -------
        str
            サーバーの URL（末尾の ``/`` なし）。

        Raises
        ------
        TikaUnavailableError
            設定がない・起動できない・時間内に起動しないとき。
        """
        if self._settings.url:
            return self._settings.url.rstrip("/")
        if not self._settings.server_jar:
            raise TikaUnavailableError("Tika is not configured")
        base_url = f"http://{LOOPBACK_HOST}:{self._settings.port}"
        with self._lock:
            running = self._process is not None and self._process.poll() is None
            if not running and not self._borrowed:
                self._start(base_url)
        return base_url

    def _start(self, base_url: str) -> None:
        """Tika のサーバーを子プロセスとして起動し、応答するまで待つ。

        Parameters
        ----------
        base_url : str
            起動したサーバーの URL。

        Raises
        ------
        TikaUnavailableError
            起動できない、または時間内に応答しないとき。
        """
        assert self._settings.server_jar is not None
        self._stop_process()  # 前に落ちた子プロセスの後始末（設定ファイルを含む）
        if self._is_ready(base_url):
            # 別のプロセスが起動した Tika が、すでに応答している。同じポートで取り合わない
            logger.info("応答している Tika を使います（起動しません）")
            self._borrowed = True
            return
        config_path = self._write_config()
        try:
            process = self._popen(
                [
                    self._settings.java_command,
                    f"-Xmx{PARENT_HEAP}",
                    "-jar",
                    self._settings.server_jar,
                    "--host",
                    LOOPBACK_HOST,
                    "--port",
                    str(self._settings.port),
                    "-c",
                    str(config_path),
                ],
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        except OSError as error:
            self._remove_config()
            logger.error("Tika の起動に失敗しました: %s", type(error).__name__)
            raise TikaUnavailableError("Tika could not be started") from None
        self._process = process
        deadline = self._clock() + self._settings.start_timeout_seconds
        while self._clock() < deadline:
            if process.poll() is not None:
                break
            if self._is_ready(base_url):
                logger.info("Tika のサーバーを起動しました")
                return
            self._sleep(READY_POLL_SECONDS)
        self._stop_process()
        logger.error("Tika のサーバーが、時間内に起動しませんでした")
        raise TikaUnavailableError("Tika did not become ready")

    def _is_ready(self, base_url: str) -> bool:
        """Tika のサーバーが応答する（``/version`` が 200）かを返す。

        Parameters
        ----------
        base_url : str
            サーバーの URL。

        Returns
        -------
        bool
            応答するとき True。
        """
        try:
            with httpx.Client(
                timeout=READY_CHECK_TIMEOUT_SECONDS, transport=self._transport
            ) as client:
                return client.get(f"{base_url}/version").status_code == httpx.codes.OK
        except httpx.HTTPError:
            return False

    def _write_config(self) -> Path:
        """ヒープ上限と OCR の除外を書いた、Tika の設定ファイルを作る。

        Returns
        -------
        Path
            作った設定ファイルのパス。
        """
        self._remove_config()
        descriptor, name = tempfile.mkstemp(prefix="tika-config-", suffix=".xml")
        with os.fdopen(descriptor, "w", encoding="utf-8") as file:
            file.write(CONFIG_TEMPLATE.format(heap=self._settings.heap))
        self._config_path = Path(name)
        return self._config_path

    def _remove_config(self) -> None:
        """作った設定ファイルを消す。"""
        path, self._config_path = self._config_path, None
        if path is not None:
            path.unlink(missing_ok=True)

    def _stop_process(self) -> None:
        """起動した子プロセスを止め、設定ファイルを消す（ロックを持った状態で呼ぶ）。"""
        process, self._process = self._process, None
        self._borrowed = False
        self._remove_config()
        if process is None or process.poll() is not None:
            return
        process.terminate()
        try:
            process.wait(timeout=STOP_TIMEOUT_SECONDS)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()


_shared_client: TikaClient | None = None
_shared_lock = threading.Lock()


def get_tika_client() -> TikaClient | None:
    """環境変数の設定が有効なら、プロセス内で共有する Tika のクライアントを返す。

    Returns
    -------
    TikaClient | None
        設定が有効ならクライアント。どちらの設定もなければ None（Tika を使わない）。

    Raises
    ------
    ValueError
        設定の値が不正なとき。
    """
    global _shared_client
    with _shared_lock:
        if _shared_client is None:
            settings = TikaSettings.from_env()
            if not settings.is_enabled:
                return None
            _shared_client = TikaClient(settings)
        return _shared_client


def shutdown_tika() -> None:
    """共有クライアントが起動した Tika を止め、共有クライアントを破棄する。"""
    global _shared_client
    with _shared_lock:
        client, _shared_client = _shared_client, None
    if client is not None:
        client.shutdown()
