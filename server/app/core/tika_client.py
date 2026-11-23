"""ファイルのテキストを、Apache Tika で取り出すクライアント（移植元 `TikaService` の移植）。

移植元（Java）は、Tika をサーバー本体のプロセスの中で使う。Python は Java のライブラリを
直接呼べないため、Tika のサーバー（jar）を、サーバーのコンテナの中に入れ、同じコンテナの
中で子プロセスとして起動し、``127.0.0.1`` で呼ぶ。コンテナ（デプロイの単位）は 1 つのまま。

- ``TIKA_SERVER_JAR`` があれば、必要になったときに（遅延起動）jar を起動する。Tika は親と子の
  2 つの JVM で動き、子のヒープ上限（``TIKA_HEAP``）は、設定ファイルで渡す
- ``TIKA_URL`` があれば、そのサーバーを使う（起動しない）
- どちらもなければ、使わない（``is_enabled`` が False）

jar は、ビルドのときに取得して、チェックサムで検証してある（実行時にダウンロードしない）。
"""

import asyncio
import logging
import os
import tempfile
from pathlib import Path
from urllib.parse import quote

import httpx
from fastapi import HTTPException, status

from app.core.config import TikaSettings, get_tika_settings

logger = logging.getLogger(__name__)

LOOPBACK_HOST = "127.0.0.1"
READY_POLL_SECONDS = 0.5
STOP_TIMEOUT_SECONDS = 5.0
# Tika のサーバーは、親（監視役）と子（実際に処理する側）の 2 つの JVM で動く。親は、小さく
# 固定し、子のヒープは、設定の `TIKA_HEAP` で、設定ファイル（forkedJvmArgs）から渡す
PARENT_HEAP = "64m"
CONFIG_TEMPLATE = """<?xml version="1.0" encoding="UTF-8"?>
<properties>
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
TIKA_FAILED_DETAIL = "ファイルのテキストを取り出せませんでした。"
TIKA_UNSUPPORTED_DETAIL = "このファイル形式のテキストは取り出せません。"
TIKA_UNAVAILABLE_DETAIL = "ファイルのテキストの取り出しが利用できません。"
TIKA_TEMPORARY_DETAIL = "ファイルのテキストの取り出しで、一時的な障害が発生しました。"
# Tika のサーバーが、未対応の形式に返すステータス
_UNSUPPORTED_MEDIA = 415


def is_enabled(settings: TikaSettings | None = None) -> bool:
    """Tika を使う設定かを返す。

    Parameters
    ----------
    settings : TikaSettings | None
        Tika の設定。None なら、アプリの設定。

    Returns
    -------
    bool
        ``TIKA_URL`` または ``TIKA_SERVER_JAR`` があるとき True。
    """
    current = settings or get_tika_settings()
    return bool(current.url or current.server_jar)


class TikaClient:
    """Tika のサーバーを、必要になったときに起動し、本文を取り出すクライアント。"""

    _process: asyncio.subprocess.Process | None = None
    _lock: asyncio.Lock | None = None
    _config_path: Path | None = None
    # すでに応答する Tika を、起動せずに借りているか（worker が複数あるとき、同じポートで
    # 取り合わないため）。借りた先が落ちたら、次の呼び出しで、自分で起動する
    _borrowed: bool = False

    @classmethod
    def _get_lock(cls) -> asyncio.Lock:
        """起動を直列にするためのロックを返す（イベントループの中で作る）。

        Returns
        -------
        asyncio.Lock
            起動用のロック。
        """
        if cls._lock is None:
            cls._lock = asyncio.Lock()
        return cls._lock

    @classmethod
    async def extract_text(
        cls, filename: str, content_type: str | None, data: bytes
    ) -> str:
        """ファイルから、本文のテキストを取り出す。

        Parameters
        ----------
        filename : str
            ファイル名（形式の判定の手がかりとして、Tika に渡す）。
        content_type : str | None
            アップロードの Content-Type。
        data : bytes
            ファイルの中身。

        Returns
        -------
        str
            取り出した本文。

        Raises
        ------
        HTTPException
            Tika が使えない・解析できない・未対応の形式のとき（400）。
        """
        settings = get_tika_settings()
        base_url = await cls._ensure_server(settings)
        headers = {
            "Accept": "text/plain",
            "Content-Type": content_type or "application/octet-stream",
            "Content-Disposition": (
                f"attachment; filename*=UTF-8''{quote(filename, safe='')}"
            ),
        }
        try:
            async with httpx.AsyncClient(
                timeout=settings.request_timeout_seconds
            ) as client:
                response = await client.put(
                    f"{base_url}/tika", content=data, headers=headers
                )
        except httpx.HTTPError as error:
            logger.error("Tika の呼び出しに失敗しました: %s", type(error).__name__)
            cls._borrowed = False  # 借りた先が落ちていたら、次は自分で起動する
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=TIKA_UNAVAILABLE_DETAIL,
            ) from None
        if response.status_code == _UNSUPPORTED_MEDIA:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=TIKA_UNSUPPORTED_DETAIL
            )
        if response.status_code >= 500:
            # Tika 側の障害（子の JVM のメモリ不足など）。ファイルの問題とは区別する
            logger.error("Tika が HTTP %d を返しました", response.status_code)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY, detail=TIKA_TEMPORARY_DETAIL
            )
        if response.status_code >= 400:  # 422（解析できない文書）など
            logger.error("Tika が HTTP %d を返しました", response.status_code)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=TIKA_FAILED_DETAIL
            )
        return response.text

    @classmethod
    async def _ensure_server(cls, settings: TikaSettings) -> str:
        """使う Tika のサーバーの URL を返す。必要なら、子プロセスを起動して待つ。

        Parameters
        ----------
        settings : TikaSettings
            Tika の設定。

        Returns
        -------
        str
            サーバーの URL（末尾の ``/`` なし）。

        Raises
        ------
        HTTPException
            設定がない・起動できない・起動を待ち切れないとき（400）。
        """
        if settings.url:
            return settings.url.rstrip("/")
        if not settings.server_jar:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=TIKA_UNAVAILABLE_DETAIL,
            )
        base_url = f"http://{LOOPBACK_HOST}:{settings.port}"
        async with cls._get_lock():
            running = cls._process is not None and cls._process.returncode is None
            if not running and not cls._borrowed:
                await cls._start(settings, base_url)
        return base_url

    @classmethod
    async def _start(cls, settings: TikaSettings, base_url: str) -> None:
        """Tika のサーバーを子プロセスとして起動し、応答するまで待つ。

        Parameters
        ----------
        settings : TikaSettings
            Tika の設定。
        base_url : str
            起動したサーバーの URL。

        Raises
        ------
        HTTPException
            起動できない、または時間内に応答しないとき（400）。
        """
        assert settings.server_jar is not None
        if await cls._is_ready(base_url):
            # 別の worker が起動した Tika が、すでに応答している。同じポートで取り合わない
            logger.info("応答している Tika を使います（起動しません）")
            cls._borrowed = True
            return
        config_path = cls._write_config(settings.heap)
        try:
            process = await asyncio.create_subprocess_exec(
                settings.java_command,
                f"-Xmx{PARENT_HEAP}",
                "-jar",
                settings.server_jar,
                "--host",
                LOOPBACK_HOST,
                "--port",
                str(settings.port),
                "-c",
                str(config_path),
                stdin=asyncio.subprocess.DEVNULL,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL,
            )
        except OSError as error:
            cls._remove_config()
            logger.error("Tika の起動に失敗しました: %s", type(error).__name__)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=TIKA_UNAVAILABLE_DETAIL,
            ) from None
        cls._process = process
        deadline = asyncio.get_running_loop().time() + settings.start_timeout_seconds
        while asyncio.get_running_loop().time() < deadline:
            if process.returncode is not None:
                break
            if await cls._is_ready(base_url):
                logger.info("Tika のサーバーを起動しました")
                return
            await asyncio.sleep(READY_POLL_SECONDS)
        await cls.shutdown()
        logger.error("Tika のサーバーが、時間内に起動しませんでした")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=TIKA_UNAVAILABLE_DETAIL,
        )

    @staticmethod
    async def _is_ready(base_url: str) -> bool:
        """Tika のサーバーが、応答する（`/version` が 200）かを返す。

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
            async with httpx.AsyncClient(timeout=READY_POLL_SECONDS * 4) as client:
                return (await client.get(f"{base_url}/version")).status_code == 200
        except httpx.HTTPError:
            return False

    @classmethod
    def _write_config(cls, heap: str) -> Path:
        """子の JVM のヒープ上限を書いた、Tika の設定ファイルを作る。

        Parameters
        ----------
        heap : str
            子の JVM のヒープ上限（``256m`` など。設定の検証で、数字＋単位に限っている）。

        Returns
        -------
        Path
            作った設定ファイルのパス。
        """
        cls._remove_config()
        descriptor, name = tempfile.mkstemp(prefix="tika-config-", suffix=".xml")
        with os.fdopen(descriptor, "w", encoding="utf-8") as file:
            file.write(CONFIG_TEMPLATE.format(heap=heap))
        cls._config_path = Path(name)
        return cls._config_path

    @classmethod
    def _remove_config(cls) -> None:
        """作った設定ファイルを消す。"""
        path, cls._config_path = cls._config_path, None
        if path is not None:
            path.unlink(missing_ok=True)

    @classmethod
    async def shutdown(cls) -> None:
        """起動した Tika のサーバーを止める（アプリの終了時・起動の失敗時）。"""
        process, cls._process = cls._process, None
        cls._borrowed = False
        cls._lock = None  # 次のイベントループで、作り直す
        cls._remove_config()
        if process is None or process.returncode is not None:
            return
        process.terminate()
        try:
            await asyncio.wait_for(process.wait(), timeout=STOP_TIMEOUT_SECONDS)
        except TimeoutError:
            process.kill()
            await process.wait()
