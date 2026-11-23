"""Tika のクライアント（遅延起動・取り出し・失敗の扱い）のテスト（Issue #469）。"""

import asyncio
from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from fastapi import HTTPException

from app.core import file_vectorization
from app.core.config import TikaSettings
from app.core.tika_client import (
    TIKA_FAILED_DETAIL,
    TIKA_TEMPORARY_DETAIL,
    TIKA_UNAVAILABLE_DETAIL,
    TIKA_UNSUPPORTED_DETAIL,
    TikaClient,
    is_enabled,
)

TIKA_URL = "http://tika.example.invalid:9998"
SECRET_PATH = "/secret/dir/tika-server.jar"


def _settings(**values: Any) -> TikaSettings:
    """`.env` を読まずに、Tika の設定を作る。

    Parameters
    ----------
    **values : Any
        環境変数名（別名）をキーにした設定値。

    Returns
    -------
    TikaSettings
        Tika の設定。
    """
    return TikaSettings(_env_file=None, **values)


@pytest.fixture(autouse=True)
def _reset_client() -> Iterator[None]:
    """テストごとに、クライアントの状態（子プロセス・ロック）を初期化する"""
    TikaClient._process = None
    TikaClient._lock = None
    yield
    TikaClient._process = None
    TikaClient._lock = None


def _patch_settings(settings: TikaSettings) -> Any:
    """Tika の設定を差し替える。

    Parameters
    ----------
    settings : TikaSettings
        差し替える設定。

    Returns
    -------
    Any
        `patch` のコンテキストマネージャ。
    """
    return patch("app.core.tika_client.get_tika_settings", return_value=settings)


def _patch_http(handler: Callable[[httpx.Request], httpx.Response]) -> Any:
    """`httpx.AsyncClient` を、モックの通信を使うものに差し替える。

    Parameters
    ----------
    handler : Callable[[httpx.Request], httpx.Response]
        リクエストを受け取り、応答を返す関数。

    Returns
    -------
    Any
        `patch` のコンテキストマネージャ。
    """
    real_client = httpx.AsyncClient
    return patch(
        "app.core.tika_client.httpx.AsyncClient",
        lambda **kwargs: real_client(transport=httpx.MockTransport(handler), **kwargs),
    )


class TestIsEnabled:
    """is_enabled のテスト"""

    def test_disabled_without_settings(self) -> None:
        """URL も jar もなければ、使わないこと"""
        assert is_enabled(_settings()) is False

    def test_enabled_with_url_or_jar(self) -> None:
        """URL または jar があれば、使うこと"""
        assert is_enabled(_settings(TIKA_URL=TIKA_URL)) is True
        assert is_enabled(_settings(TIKA_SERVER_JAR=SECRET_PATH)) is True


class TestExtractWithUrl:
    """TIKA_URL のサーバーに送る取り出しのテスト"""

    async def test_puts_file_and_returns_plain_text(self) -> None:
        """PUT /tika に、本文・Content-Type・ファイル名（UTF-8 のエンコード）を送り、テキストを返すこと"""
        seen: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            seen.append(request)
            return httpx.Response(200, text="抽出した本文")

        with _patch_settings(_settings(TIKA_URL=f"{TIKA_URL}/")), _patch_http(handler):
            text = await TikaClient.extract_text(
                "就業規則.pdf", "application/pdf", b"%PDF-data"
            )

        assert text == "抽出した本文"
        [request] = seen
        assert (request.method, str(request.url)) == ("PUT", f"{TIKA_URL}/tika")
        assert request.headers["accept"] == "text/plain"
        assert request.headers["content-type"] == "application/pdf"
        assert request.headers["content-disposition"] == (
            "attachment; filename*=UTF-8''%E5%B0%B1%E6%A5%AD%E8%A6%8F%E5%89%87.pdf"
        )
        assert request.content == b"%PDF-data"

    async def test_default_content_type_is_octet_stream(self) -> None:
        """Content-Type がないときは、octet-stream で送ること"""
        seen: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            seen.append(request)
            return httpx.Response(200, text="x")

        with _patch_settings(_settings(TIKA_URL=TIKA_URL)), _patch_http(handler):
            await TikaClient.extract_text("a.bin", None, b"x")

        assert seen[0].headers["content-type"] == "application/octet-stream"

    async def test_unsupported_media_type_is_reported(self) -> None:
        """415（未対応の形式）が、未対応のメッセージで 400 になること"""
        with (
            _patch_settings(_settings(TIKA_URL=TIKA_URL)),
            _patch_http(lambda request: httpx.Response(415)),
        ):
            with pytest.raises(HTTPException) as raised:
                await TikaClient.extract_text("a.xyz", None, b"x")

        assert raised.value.status_code == 400
        assert raised.value.detail == TIKA_UNSUPPORTED_DETAIL

    async def test_unprocessable_document_is_reported_as_bad_request(self) -> None:
        """解析できない文書（422）が、ファイルの問題として 400 になり、応答の本文を含まないこと"""
        with (
            _patch_settings(_settings(TIKA_URL=TIKA_URL)),
            _patch_http(lambda request: httpx.Response(422, text="stack trace")),
        ):
            with pytest.raises(HTTPException) as raised:
                await TikaClient.extract_text("a.pdf", "application/pdf", b"x")

        assert raised.value.status_code == 400
        assert raised.value.detail == TIKA_FAILED_DETAIL
        assert "stack trace" not in raised.value.detail

    @pytest.mark.parametrize("status_code", [500, 503])
    async def test_server_error_is_reported_as_bad_gateway(
        self, status_code: int
    ) -> None:
        """Tika 側の障害（5xx）が、ファイルの問題と区別されて、502 になること"""
        with (
            _patch_settings(_settings(TIKA_URL=TIKA_URL)),
            _patch_http(lambda request: httpx.Response(status_code, text="OOM")),
        ):
            with pytest.raises(HTTPException) as raised:
                await TikaClient.extract_text("a.pdf", "application/pdf", b"x")

        assert raised.value.status_code == 502
        assert raised.value.detail == TIKA_TEMPORARY_DETAIL

    async def test_connection_error_is_reported_as_unavailable(self) -> None:
        """接続の失敗が、利用できないものとして 503 になること"""

        def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("refused")

        with _patch_settings(_settings(TIKA_URL=TIKA_URL)), _patch_http(handler):
            with pytest.raises(HTTPException) as raised:
                await TikaClient.extract_text("a.pdf", None, b"x")

        assert raised.value.status_code == 503
        assert raised.value.detail == TIKA_UNAVAILABLE_DETAIL

    async def test_extract_without_settings_returns_503(self) -> None:
        """設定がないのに呼ぶと、利用できないものとして 503 になること"""
        with _patch_settings(_settings()):
            with pytest.raises(HTTPException) as raised:
                await TikaClient.extract_text("a.pdf", None, b"x")

        assert raised.value.status_code == 503
        assert raised.value.detail == TIKA_UNAVAILABLE_DETAIL


def _fake_process(returncode: int | None = None) -> MagicMock:
    """子プロセスの代わりを作る。

    Parameters
    ----------
    returncode : int | None
        終了コード。None なら実行中。

    Returns
    -------
    MagicMock
        `asyncio.subprocess.Process` の代わり。
    """
    process = MagicMock()
    process.returncode = returncode
    process.terminate = MagicMock()
    process.kill = MagicMock()
    process.wait = AsyncMock(return_value=0)
    return process


class _FakeTika:
    """起動したあとだけ応答する、偽の Tika のサーバー（子プロセスの起動を見立てる）。"""

    def __init__(self, already_up: bool = False) -> None:
        """起動の状態を持つ。

        Parameters
        ----------
        already_up : bool
            最初から応答している（別の worker が起動済み）か。
        """
        self.up = already_up
        self.processes: list[MagicMock] = []

    async def spawn(self, *args: Any, **kwargs: Any) -> MagicMock:
        """子プロセスの起動の代わり。起動したら、応答するようになる。

        Parameters
        ----------
        *args : Any
            起動の引数。
        **kwargs : Any
            起動のキーワード引数。

        Returns
        -------
        MagicMock
            子プロセスの代わり。
        """
        self.up = True
        process = _fake_process()
        self.processes.append(process)
        return process

    def handler(self, request: httpx.Request) -> httpx.Response:
        """`/version` と `/tika` に応答する（起動前の `/version` は接続できない）。

        Parameters
        ----------
        request : httpx.Request
            リクエスト。

        Returns
        -------
        httpx.Response
            応答。
        """
        if not self.up:
            raise httpx.ConnectError("not yet")
        if request.url.path == "/version":
            return httpx.Response(200, text="Apache Tika 3.1.0")
        return httpx.Response(200, text="本文")


class TestLocalServer:
    """TIKA_SERVER_JAR の子プロセスの、遅延起動・再起動・終了のテスト"""

    async def test_starts_jar_once_with_heap_limit_and_loopback(self) -> None:
        """jar を、ヒープ上限つきで、127.0.0.1 に起動し、同時の呼び出しでも 1 回だけであること"""
        fake = _FakeTika()
        spawn = AsyncMock(side_effect=fake.spawn)
        settings = _settings(
            TIKA_SERVER_JAR=SECRET_PATH, TIKA_PORT=19998, TIKA_HEAP="128m"
        )

        with (
            _patch_settings(settings),
            patch("app.core.tika_client.asyncio.create_subprocess_exec", spawn),
            _patch_http(fake.handler),
        ):
            results = await asyncio.gather(
                *[TikaClient.extract_text("a.pdf", None, b"x") for _ in range(5)]
            )

        assert results == ["本文"] * 5
        spawn.assert_awaited_once()
        assert spawn.await_args is not None
        args = spawn.await_args.args
        assert args[:8] == (
            "java",
            "-Xmx64m",
            "-jar",
            SECRET_PATH,
            "--host",
            "127.0.0.1",
            "--port",
            "19998",
        )
        assert args[8] == "-c"

    async def test_borrows_running_server_without_spawning(self) -> None:
        """すでに応答する Tika（別の worker が起動）があれば、起動せずに使うこと"""
        fake = _FakeTika(already_up=True)
        spawn = AsyncMock(side_effect=fake.spawn)

        with (
            _patch_settings(_settings(TIKA_SERVER_JAR=SECRET_PATH)),
            patch("app.core.tika_client.asyncio.create_subprocess_exec", spawn),
            _patch_http(fake.handler),
        ):
            text = await TikaClient.extract_text("a.pdf", None, b"x")

        assert text == "本文"
        spawn.assert_not_awaited()
        assert TikaClient._borrowed is True

    async def test_borrowed_server_that_goes_down_is_replaced_by_own_start(
        self,
    ) -> None:
        """借りた Tika が落ちたら、その呼び出しは 503、次の呼び出しで、自分で起動すること"""
        fake = _FakeTika(already_up=True)
        spawn = AsyncMock(side_effect=fake.spawn)

        with (
            _patch_settings(_settings(TIKA_SERVER_JAR=SECRET_PATH)),
            patch("app.core.tika_client.asyncio.create_subprocess_exec", spawn),
            _patch_http(fake.handler),
        ):
            await TikaClient.extract_text("a.pdf", None, b"x")
            fake.up = False  # 借りた先が落ちた
            with pytest.raises(HTTPException) as raised:
                await TikaClient.extract_text("a.pdf", None, b"x")
            recovered = await TikaClient.extract_text("a.pdf", None, b"x")

        assert raised.value.status_code == 503
        assert recovered == "本文"
        spawn.assert_awaited_once()

    async def test_config_file_passes_child_heap_and_is_removed_on_shutdown(
        self,
    ) -> None:
        """子の JVM のヒープ上限が、設定ファイルに書かれ、終了処理で、ファイルが消えること"""
        fake = _FakeTika()
        spawn = AsyncMock(side_effect=fake.spawn)
        config_contents: list[str] = []

        async def capture(*args: str, **kwargs: Any) -> MagicMock:
            """起動の時点の設定ファイルの中身を記録する。"""
            config_contents.append(Path(args[9]).read_text(encoding="utf-8"))
            return await spawn(*args, **kwargs)

        with (
            _patch_settings(_settings(TIKA_SERVER_JAR=SECRET_PATH, TIKA_HEAP="192m")),
            patch("app.core.tika_client.asyncio.create_subprocess_exec", capture),
            _patch_http(fake.handler),
        ):
            await TikaClient.extract_text("a.pdf", None, b"x")
            config_path = TikaClient._config_path
            assert config_path is not None and config_path.exists()
            await TikaClient.shutdown()

        assert "<arg>-Xmx192m</arg>" in config_contents[0]
        assert "<arg>-Djava.awt.headless=true</arg>" in config_contents[0]
        assert not config_path.exists()

    async def test_restarts_when_process_has_exited(self) -> None:
        """子プロセスが落ちていたら、次の呼び出しで起動し直すこと"""
        fake = _FakeTika()
        spawn = AsyncMock(side_effect=fake.spawn)

        with (
            _patch_settings(_settings(TIKA_SERVER_JAR=SECRET_PATH)),
            patch("app.core.tika_client.asyncio.create_subprocess_exec", spawn),
            _patch_http(fake.handler),
        ):
            await TikaClient.extract_text("a.pdf", None, b"x")
            fake.processes[0].returncode = 1  # 落ちた
            fake.up = False
            await TikaClient.extract_text("a.pdf", None, b"x")

        assert spawn.await_count == 2

    async def test_java_not_found_returns_503_without_path(self) -> None:
        """java がなく起動できないとき、503 になり、jar のパスがメッセージに出ないこと"""
        spawn = AsyncMock(side_effect=FileNotFoundError("java"))

        with (
            _patch_settings(_settings(TIKA_SERVER_JAR=SECRET_PATH)),
            patch("app.core.tika_client.asyncio.create_subprocess_exec", spawn),
        ):
            with pytest.raises(HTTPException) as raised:
                await TikaClient.extract_text("a.pdf", None, b"x")

        assert raised.value.status_code == 503
        assert raised.value.detail == TIKA_UNAVAILABLE_DETAIL
        assert SECRET_PATH not in raised.value.detail

    async def test_start_timeout_stops_process_and_returns_503(self) -> None:
        """時間内に応答しないとき、子プロセスを止めて、503 になること"""
        process = _fake_process()
        spawn = AsyncMock(return_value=process)

        def never_ready(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("not yet")

        with (
            _patch_settings(
                _settings(TIKA_SERVER_JAR=SECRET_PATH, TIKA_START_TIMEOUT_SECONDS=0.2)
            ),
            patch("app.core.tika_client.asyncio.create_subprocess_exec", spawn),
            patch("app.core.tika_client.READY_POLL_SECONDS", 0.05),
            _patch_http(never_ready),
        ):
            with pytest.raises(HTTPException) as raised:
                await TikaClient.extract_text("a.pdf", None, b"x")

        assert raised.value.status_code == 503
        process.terminate.assert_called_once()
        assert TikaClient._process is None

    async def test_shutdown_terminates_running_process(self) -> None:
        """終了処理が、実行中の子プロセスを止めること"""
        process = _fake_process()
        TikaClient._process = process

        await TikaClient.shutdown()

        process.terminate.assert_called_once()
        assert TikaClient._process is None

    async def test_shutdown_resets_lock_and_borrowed_state(self) -> None:
        """終了処理が、ロックと借りた状態を初期化すること（次のイベントループで作り直すため）"""
        TikaClient._get_lock()
        TikaClient._borrowed = True

        await TikaClient.shutdown()

        assert TikaClient._lock is None
        assert TikaClient._borrowed is False

    async def test_shutdown_without_process_is_noop(self) -> None:
        """子プロセスがなければ、終了処理は何もしないこと"""
        await TikaClient.shutdown()

        assert TikaClient._process is None


class TestExtractContent:
    """file_vectorization.extract_content の使い分けのテスト"""

    async def test_uses_tika_when_enabled(self) -> None:
        """Tika が使える設定なら、すべての形式を Tika で取り出すこと"""
        tika = AsyncMock(return_value="Tika の本文")

        with (
            patch(
                "app.core.file_vectorization.tika_client.is_enabled", return_value=True
            ),
            patch(
                "app.core.file_vectorization.tika_client.TikaClient.extract_text", tika
            ),
        ):
            text = await file_vectorization.extract_content(
                "a.docx", "application/octet-stream", b"PK"
            )

        assert text == "Tika の本文"
        tika.assert_awaited_once_with("a.docx", "application/octet-stream", b"PK")

    async def test_uses_simple_extraction_when_disabled(self) -> None:
        """Tika の設定がなければ、従来のテキスト系の取り出しになること"""
        with patch(
            "app.core.file_vectorization.tika_client.is_enabled", return_value=False
        ):
            text = await file_vectorization.extract_content(
                "a.txt", "text/plain", "こんにちは".encode()
            )

        assert text == "こんにちは"

    async def test_unsupported_format_still_rejected_when_disabled(self) -> None:
        """Tika の設定がなければ、PDF は、従来どおり 400 になること"""
        with patch(
            "app.core.file_vectorization.tika_client.is_enabled", return_value=False
        ):
            with pytest.raises(HTTPException) as raised:
                await file_vectorization.extract_content(
                    "a.pdf", "application/pdf", b"%PDF"
                )

        assert raised.value.status_code == 400
