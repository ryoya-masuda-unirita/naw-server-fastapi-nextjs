"""Tika のクライアント（media/tika.py）のテスト。

Tika への HTTP は偽の通信（httpx.MockTransport）、子プロセスの起動は偽の Popen で行う。
実際の Tika との通信は、コンテナでの実機の確認（docs/issue-482/08）で確かめる。
"""

import subprocess
import threading
from pathlib import Path

import httpx
import pytest
from generative_ai_core.media import (
    CORRUPT_FILE,
    UNSUPPORTED_MIME,
    TikaClient,
    TikaFileError,
    TikaSettings,
    TikaUnavailableError,
    get_tika_client,
    shutdown_tika,
)

DOC_TYPE = "application/msword"
JAR = "/opt/tika-server.jar"


class FakeProcess:
    """子プロセスの偽物。"""

    def __init__(self, *, ignore_terminate: bool = False) -> None:
        """子プロセスの偽物を作る。"""
        self.returncode: int | None = None
        self.terminated = False
        self.killed = False
        self._ignore_terminate = ignore_terminate

    def poll(self) -> int | None:
        """終了コードを返す（動いていれば None）。"""
        return self.returncode

    def terminate(self) -> None:
        """止める。ignore_terminate のときは、止まらない。"""
        self.terminated = True
        if not self._ignore_terminate:
            self.returncode = 0

    def kill(self) -> None:
        """強制終了する。"""
        self.killed = True
        self.returncode = -9

    def wait(self, timeout: float | None = None) -> int:
        """終わるのを待つ。動いたままなら、時間切れにする。"""
        if self.returncode is None:
            raise subprocess.TimeoutExpired("java", timeout or 0)
        return self.returncode


class FakeTika:
    """Tika のサーバーと、その子プロセスの起動の偽物。"""

    def __init__(
        self, *, ready: bool = False, status: int = 200, text: str = "本文"
    ) -> None:
        """偽の Tika を作る。"""
        self.down = False
        self.ready = ready
        self.status = status
        self.text = text
        self.requests: list[httpx.Request] = []
        self.processes: list[FakeProcess] = []
        self.popen_args: list[list[str]] = []
        self.config_text = ""
        self.popen_error: OSError | None = None
        self.ready_after_popen = True

    def handler(self, request: httpx.Request) -> httpx.Response:
        """偽の Tika の HTTP 応答を返す（down のときは、接続できない）。"""
        if self.down:
            raise httpx.ConnectError("gone")
        if request.url.path == "/version":
            return httpx.Response(200 if self.ready else 503)
        self.requests.append(request)
        return httpx.Response(self.status, text=self.text)

    def popen(self, args: list[str], **_: object) -> FakeProcess:
        """偽の子プロセスを起動し、渡された設定ファイルの中身を控える。"""
        if self.popen_error is not None:
            raise self.popen_error
        self.popen_args.append(args)
        self.config_text = Path(args[args.index("-c") + 1]).read_text(encoding="utf-8")
        process = FakeProcess()
        self.processes.append(process)
        self.ready = self.ready_after_popen
        return process

    def client(
        self,
        settings: TikaSettings | None = None,
        *,
        timeout: float = 60.0,
    ) -> TikaClient:
        """偽の通信と偽の起動を使うクライアントを作る。"""
        clock = {"now": 0.0}

        def fake_sleep(seconds: float) -> None:
            """待たずに、偽の時計だけを進める。"""
            clock["now"] += seconds

        resolved = settings or TikaSettings(
            server_jar=JAR, start_timeout_seconds=timeout
        )
        return TikaClient(
            resolved,
            transport=httpx.MockTransport(self.handler),
            popen=self.popen,
            sleep=fake_sleep,
            clock=lambda: clock["now"],
        )


class TestTikaSettings:
    """TikaSettings のテスト。"""

    def test_disabled_by_default(self) -> None:
        """何も設定がなければ、Tika を使わないこと"""
        assert not TikaSettings.from_env({}).is_enabled

    def test_enabled_with_url(self) -> None:
        """TIKA_URL だけで、有効になること"""
        assert TikaSettings.from_env({"TIKA_URL": "http://tika:9998"}).is_enabled

    def test_enabled_with_server_jar(self) -> None:
        """TIKA_SERVER_JAR だけで、有効になること"""
        assert TikaSettings.from_env({"TIKA_SERVER_JAR": JAR}).is_enabled

    def test_empty_values_are_unset(self) -> None:
        """空文字（compose の既定）は、未設定として扱うこと"""
        settings = TikaSettings.from_env({"TIKA_URL": "", "TIKA_SERVER_JAR": " "})
        assert not settings.is_enabled

    def test_defaults(self) -> None:
        """既定値が、設計どおりであること"""
        settings = TikaSettings.from_env({"TIKA_SERVER_JAR": JAR})
        assert settings.java_command == "java"
        assert settings.port == 9998
        assert settings.heap == "256m"
        assert settings.start_timeout_seconds == 60.0
        assert settings.request_timeout_seconds == 120.0

    @pytest.mark.parametrize(
        "url", ["tika:9998", "http://", "ftp://tika:9998", "localhost"]
    )
    def test_invalid_url_raises(self, url: str) -> None:
        """TIKA_URL が http(s) の URL でないとき、エラーになること"""
        with pytest.raises(ValueError):
            TikaSettings.from_env({"TIKA_URL": url})

    @pytest.mark.parametrize("port", ["0", "65536", "abc"])
    def test_invalid_port_raises(self, port: str) -> None:
        """ポートが範囲外・数値でないとき、エラーになること"""
        with pytest.raises(ValueError):
            TikaSettings.from_env({"TIKA_PORT": port})

    @pytest.mark.parametrize("heap", ["256", "m", "256k", "-Xmx1g"])
    def test_invalid_heap_raises(self, heap: str) -> None:
        """ヒープの形式が不正なとき、エラーになること"""
        with pytest.raises(ValueError):
            TikaSettings.from_env({"TIKA_HEAP": heap})

    @pytest.mark.parametrize(
        "name", ["TIKA_START_TIMEOUT_SECONDS", "TIKA_REQUEST_TIMEOUT_SECONDS"]
    )
    def test_non_positive_timeout_raises(self, name: str) -> None:
        """時間が 0 以下のとき、エラーになること"""
        with pytest.raises(ValueError):
            TikaSettings.from_env({name: "0"})


class TestExtractText:
    """extract_text のテスト。"""

    def test_sends_mime_and_encoded_filename(self) -> None:
        """判定済みの MIME と、エンコードしたファイル名を送ること"""
        fake = FakeTika(ready=True)
        client = fake.client(TikaSettings(url="http://tika:9998"))
        client.extract_text("議事録 1.doc", DOC_TYPE, b"data")
        request = fake.requests[0]
        assert request.method == "PUT"
        assert request.url.path == "/tika"
        assert request.headers["Accept"] == "text/plain"
        assert request.headers["Content-Type"] == DOC_TYPE
        assert request.headers["Content-Disposition"] == (
            "attachment; filename*=UTF-8''%E8%AD%B0%E4%BA%8B%E9%8C%B2%201.doc"
        )
        assert request.content == b"data"

    def test_returns_response_text(self) -> None:
        """応答の本文を返すこと"""
        fake = FakeTika(ready=True, text="こんにちは")
        client = fake.client(TikaSettings(url="http://tika:9998"))
        assert client.extract_text("a.doc", DOC_TYPE, b"x") == "こんにちは"

    def test_415_raises_file_error_unsupported(self) -> None:
        """415 は、未対応の形式（ファイルの問題）になること"""
        fake = FakeTika(ready=True, status=415)
        client = fake.client(TikaSettings(url="http://tika:9998"))
        with pytest.raises(TikaFileError) as info:
            client.extract_text("a.bin", DOC_TYPE, b"x")
        assert info.value.code == UNSUPPORTED_MIME

    @pytest.mark.parametrize("status", [400, 422])
    def test_4xx_raises_file_error_corrupt(self, status: int) -> None:
        """そのほかの 4xx は、解析できない文書（ファイルの問題）になること"""
        fake = FakeTika(ready=True, status=status)
        client = fake.client(TikaSettings(url="http://tika:9998"))
        with pytest.raises(TikaFileError) as info:
            client.extract_text("a.doc", DOC_TYPE, b"x")
        assert info.value.code == CORRUPT_FILE

    @pytest.mark.parametrize("status", [500, 503, 404, 405, 413, 429, 302])
    def test_non_file_status_raises_unavailable(self, status: int) -> None:
        """5xx と、ファイルの中身を表さない状態（404・405・413・429・3xx）は、Tika 側の障害になること"""
        fake = FakeTika(ready=True, status=status)
        client = fake.client(TikaSettings(url="http://tika:9998"))
        with pytest.raises(TikaUnavailableError):
            client.extract_text("a.doc", DOC_TYPE, b"x")

    def test_connection_error_raises_unavailable(self) -> None:
        """接続できないとき、Tika 側の障害になること"""

        def refuse(request: httpx.Request) -> httpx.Response:
            """どの要求も、接続できないことにする。"""
            raise httpx.ConnectError("refused")

        client = TikaClient(
            TikaSettings(url="http://tika:9998"),
            transport=httpx.MockTransport(refuse),
        )
        with pytest.raises(TikaUnavailableError):
            client.extract_text("a.doc", DOC_TYPE, b"x")

    def test_no_content_in_error_message(self) -> None:
        """失敗のメッセージに、応答の本文（ファイルの中身）を出さないこと"""
        fake = FakeTika(ready=True, status=422, text="SECRET-CONTENT")
        client = fake.client(TikaSettings(url="http://tika:9998"))
        with pytest.raises(TikaFileError) as info:
            client.extract_text("a.doc", DOC_TYPE, b"x")
        assert "SECRET-CONTENT" not in str(info.value)

    def test_not_configured_raises_unavailable(self) -> None:
        """URL も jar もないとき、Tika 側の障害になること"""
        client = FakeTika().client(TikaSettings())
        with pytest.raises(TikaUnavailableError):
            client.extract_text("a.doc", DOC_TYPE, b"x")


class TestServerLifecycle:
    """遅延起動・借りる・再起動のテスト。"""

    def test_not_started_until_needed(self) -> None:
        """クライアントを作っただけでは、起動しないこと"""
        fake = FakeTika()
        fake.client()
        assert fake.processes == []

    def test_starts_and_waits_until_ready(self) -> None:
        """最初の呼び出しで起動し、応答するまで待ってから呼ぶこと"""
        fake = FakeTika()
        fake.ready_after_popen = True
        client = fake.client(
            TikaSettings(server_jar=JAR, port=19998, java_command="jre")
        )
        assert client.extract_text("a.doc", DOC_TYPE, b"x") == "本文"
        args = fake.popen_args[0]
        assert args[0] == "jre"
        assert args[args.index("--host") + 1] == "127.0.0.1"
        assert args[args.index("--port") + 1] == "19998"
        assert args[args.index("-jar") + 1] == JAR

    def test_concurrent_calls_start_once(self) -> None:
        """同時に呼ばれても、起動は 1 回だけであること"""
        fake = FakeTika()
        client = fake.client()
        errors: list[Exception] = []

        def call() -> None:
            """別のスレッドから抽出を呼び、失敗を集める。"""
            try:
                client.extract_text("a.doc", DOC_TYPE, b"x")
            except Exception as error:  # noqa: BLE001 — テストで集めて検査する
                errors.append(error)

        threads = [threading.Thread(target=call) for _ in range(8)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        assert errors == []
        assert len(fake.processes) == 1

    def test_borrows_running_server(self) -> None:
        """すでに応答する Tika があれば、起動せずに借りること"""
        fake = FakeTika(ready=True)
        client = fake.client()
        client.extract_text("a.doc", DOC_TYPE, b"x")
        client.extract_text("a.doc", DOC_TYPE, b"x")
        assert fake.processes == []

    def test_restarts_after_borrowed_server_died(self) -> None:
        """借りた先が落ちたら、その呼び出しは失敗し、次の呼び出しで自分で起動すること"""
        fake = FakeTika(ready=True)
        client = fake.client()
        client.extract_text("a.doc", DOC_TYPE, b"x")
        assert fake.processes == []
        fake.down = True
        with pytest.raises(TikaUnavailableError):
            client.extract_text("a.doc", DOC_TYPE, b"x")
        fake.down = False
        fake.ready = False
        client.extract_text("a.doc", DOC_TYPE, b"x")
        assert len(fake.processes) == 1

    def test_restarts_after_child_exited(self) -> None:
        """子プロセスが落ちたら、次の呼び出しで起動し直すこと"""
        fake = FakeTika()
        client = fake.client()
        client.extract_text("a.doc", DOC_TYPE, b"x")
        fake.processes[0].returncode = 1
        fake.ready = False
        client.extract_text("a.doc", DOC_TYPE, b"x")
        assert len(fake.processes) == 2

    def test_start_timeout_raises_unavailable(self) -> None:
        """時間内に応答しないとき、Tika 側の障害になり、子プロセスを止めること"""
        fake = FakeTika()
        fake.ready_after_popen = False
        client = fake.client(timeout=2.0)
        with pytest.raises(TikaUnavailableError):
            client.extract_text("a.doc", DOC_TYPE, b"x")
        assert fake.processes[0].terminated

    def test_child_exit_during_start_raises_unavailable(self) -> None:
        """起動の待ちの間に子プロセスが終わったとき、すぐ失敗すること"""
        fake = FakeTika()
        fake.ready_after_popen = False
        original = fake.popen

        def dying_popen(args: list[str], **kwargs: object) -> FakeProcess:
            """起動した直後に終了する子プロセスを返す。"""
            process = original(args, **kwargs)
            process.returncode = 1
            return process

        fake.popen = dying_popen  # type: ignore[method-assign]
        client = fake.client()
        with pytest.raises(TikaUnavailableError):
            client.extract_text("a.doc", DOC_TYPE, b"x")

    def test_url_setting_never_starts_process(self) -> None:
        """TIKA_URL のときは、jar があっても起動しないこと"""
        fake = FakeTika(ready=True)
        client = fake.client(TikaSettings(url="http://tika:9998", server_jar=JAR))
        client.extract_text("a.doc", DOC_TYPE, b"x")
        assert fake.processes == []

    def test_start_failure_raises_unavailable(self) -> None:
        """java を起動できないとき、Tika 側の障害になること"""
        fake = FakeTika()
        fake.popen_error = FileNotFoundError("java")
        client = fake.client()
        with pytest.raises(TikaUnavailableError):
            client.extract_text("a.doc", DOC_TYPE, b"x")


class TestShutdown:
    """終了のテスト。"""

    def test_terminates_started_process(self) -> None:
        """起動した子プロセスを止めること"""
        fake = FakeTika()
        client = fake.client()
        client.extract_text("a.doc", DOC_TYPE, b"x")
        client.shutdown()
        assert fake.processes[0].terminated

    def test_kills_when_terminate_times_out(self) -> None:
        """止まらないときは kill すること"""
        fake = FakeTika()
        client = fake.client()
        client.extract_text("a.doc", DOC_TYPE, b"x")
        fake.processes[0]._ignore_terminate = True
        client.shutdown()
        assert fake.processes[0].killed

    def test_removes_config_file(self) -> None:
        """設定ファイルを消すこと"""
        fake = FakeTika()
        client = fake.client()
        client.extract_text("a.doc", DOC_TYPE, b"x")
        config = Path(fake.popen_args[0][fake.popen_args[0].index("-c") + 1])
        assert config.exists()
        client.shutdown()
        assert not config.exists()

    def test_no_restart_after_shutdown(self) -> None:
        """止めたあとの呼び出しは、Tika を起動し直さず、失敗すること"""
        fake = FakeTika()
        client = fake.client()
        client.extract_text("a.doc", DOC_TYPE, b"x")
        client.shutdown()
        fake.ready = False
        with pytest.raises(TikaUnavailableError):
            client.extract_text("a.doc", DOC_TYPE, b"x")
        assert len(fake.processes) == 1

    def test_shutdown_without_start_is_noop(self) -> None:
        """起動していなくても、止める呼び出しがエラーにならないこと"""
        FakeTika().client().shutdown()

    def test_does_not_stop_borrowed_server(self) -> None:
        """借りた Tika は、止めないこと（自分が起動したものではない）"""
        fake = FakeTika(ready=True)
        client = fake.client()
        client.extract_text("a.doc", DOC_TYPE, b"x")
        client.shutdown()
        assert fake.processes == []


class TestServerConfig:
    """Tika に渡す設定ファイルのテスト。"""

    def test_config_has_heap_args(self) -> None:
        """子の JVM のヒープ上限を渡すこと"""
        fake = FakeTika()
        fake.client(TikaSettings(server_jar=JAR, heap="512m")).extract_text(
            "a.doc", DOC_TYPE, b"x"
        )
        assert "<arg>-Xmx512m</arg>" in fake.config_text
        assert "<arg>-Djava.awt.headless=true</arg>" in fake.config_text

    def test_config_excludes_tesseract_parser(self) -> None:
        """OCR のパーサーを除外すること（移植元は OCR をしない）"""
        fake = FakeTika()
        fake.client().extract_text("a.doc", DOC_TYPE, b"x")
        assert (
            '<parser-exclude class="org.apache.tika.parser.ocr.TesseractOCRParser"/>'
            in fake.config_text
        )


class TestSharedClient:
    """環境変数から作る共有クライアントのテスト。"""

    def test_none_without_settings(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """設定がなければ None（Tika を使わない）を返すこと"""
        monkeypatch.delenv("TIKA_URL", raising=False)
        monkeypatch.delenv("TIKA_SERVER_JAR", raising=False)
        shutdown_tika()
        assert get_tika_client() is None

    def test_same_instance_until_shutdown(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """設定があれば同じクライアントを返し、shutdown_tika で破棄すること"""
        monkeypatch.setenv("TIKA_URL", "http://tika:9998")
        shutdown_tika()
        first = get_tika_client()
        assert first is not None
        assert get_tika_client() is first
        shutdown_tika()
        assert get_tika_client() is not first

    def test_invalid_settings_raise(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """設定の値が不正なとき、エラーになること"""
        monkeypatch.setenv("TIKA_URL", "http://tika:9998")
        monkeypatch.setenv("TIKA_PORT", "0")
        shutdown_tika()
        with pytest.raises(ValueError):
            get_tika_client()
