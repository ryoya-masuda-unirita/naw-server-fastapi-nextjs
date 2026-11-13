import asyncio
import sys
import threading
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx
import pytest
from fastapi import FastAPI
from generative_ai_core.chat.models import (
    CoreChatRequest,
    CoreChatResult,
    CoreRagRequest,
)
from generative_ai_core.chat.runtime import CoreChatRuntime
from generative_ai_core.provider.clients.base import ChatTransportBase, controlled
from generative_ai_core.provider.factory import CoreProviderRuntimeFactory
from generative_ai_core.provider.model import RuntimeProviderConfiguration
from generative_ai_core.provider.runtime import ExecutionContext

from waha_emulator.config import Settings
from waha_emulator.main import create_app
from waha_emulator.workflows.registry import WorkflowRegistry

AUTH_KEY = "waha-key"
API = "/WahaServer/servicerun/api"
# ゲートが解放されないままでもテストが止まり続けないよう、待つ上限を決めておく
GATE_TIMEOUT_SECONDS = 10.0
RESULT_POLL_INTERVAL_SECONDS = 0.01
DEFAULT_RESULT_TIMEOUT_SECONDS = 5.0

# server-local との結合テスト（test_server_local_roundtrip.py）で server-local の
# パッケージ（`app`）を読み込めるようにする。テストのモジュールより先に読み込まれる
# conftest で足す。末尾に足し、エミュレーターの `tests` を server-local のもので隠さない
SERVER_LOCAL_DIR = Path(__file__).resolve().parents[2] / "server-local"
if str(SERVER_LOCAL_DIR) not in sys.path:
    sys.path.append(str(SERVER_LOCAL_DIR))


def make_settings(**overrides: Any) -> Settings:
    """`.env` を読まずに、テスト用の設定を作る。

    Parameters
    ----------
    **overrides : Any
        上書きする設定（環境変数名で指定する）。

    Returns
    -------
    Settings
        設定。
    """
    values: dict[str, Any] = {"WAHA_AUTHKEY": AUTH_KEY}
    values.update(overrides)
    return Settings(_env_file=None, **values)


@dataclass
class ScriptedProvider:
    """決めた途中経過と回答を返す偽のプロバイダ。受け取ったリクエストを記録する。

    生成AIアダプタは別スレッドで動くため、待ち合わせには `threading.Event` を使う。

    Attributes
    ----------
    reasoning : list[str]
        `reasoning_delta` として流す差分。つなげたものを回答にする。
    error : Exception | None
        設定すると、差分を流した後にこの例外を送出する。
    gate : threading.Event | None
        設定すると、差分を流す前にこのイベントを待つ（実行中の状態を作るため）。
    delay_seconds : float
        差分を流す前に待つ秒数（遅い LLM の代わり）。
    received : list[CoreChatRequest]
        受け取った chat のリクエスト（RAG はその chat のリクエスト）。
    """

    reasoning: list[str] = field(default_factory=lambda: ["こんにちは", "、", "世界"])
    error: Exception | None = None
    gate: threading.Event | None = None
    delay_seconds: float = 0.0
    received: list[CoreChatRequest] = field(default_factory=list)

    @property
    def answer(self) -> str:
        """返す回答（差分をつなげたもの）。

        Returns
        -------
        str
            回答。
        """
        return "".join(self.reasoning)

    def release(self) -> None:
        """ゲートを開ける（ゲートがなければ何もしない）。

        ワーカースレッドがゲートで止まったままだとイベントループを閉じられないため、
        テストの最後に必ず呼ぶ。
        """
        if self.gate is not None:
            self.gate.set()

    def respond(self, request: CoreChatRequest) -> CoreChatResult:
        """リクエストを記録し、ゲート・遅延の後に途中経過を流して回答する。

        Parameters
        ----------
        request : CoreChatRequest
            core の chat のリクエスト。

        Returns
        -------
        CoreChatResult
            回答。

        Raises
        ------
        Exception
            `error` が設定されているとき（その例外）。
        """
        self.received.append(request)
        if self.gate is not None:
            self.gate.wait(timeout=GATE_TIMEOUT_SECONDS)
        if self.delay_seconds:
            time.sleep(self.delay_seconds)
        callbacks = request.stream_callbacks()
        for delta in self.reasoning:
            callbacks.on_reasoning_delta(delta)
        if self.error is not None:
            raise self.error
        return CoreChatResult.success(self.answer, [], request.output_mode_hint)

    def chat_runtime_factory(
        self, configuration: RuntimeProviderConfiguration
    ) -> CoreChatRuntime:
        """設定のプロバイダをこの偽のプロバイダに差し替えた core の chat を作る。

        Parameters
        ----------
        configuration : RuntimeProviderConfiguration
            アダプタが作ったプロバイダの設定。

        Returns
        -------
        CoreChatRuntime
            core の chat。
        """
        client = controlled(configuration.provider_id, _ScriptedTransport(self))
        factory = CoreProviderRuntimeFactory.with_clients(
            {configuration.provider_id: client}
        )
        return factory.create_runtime(configuration)


class _ScriptedTransport(ChatTransportBase):
    """偽のプロバイダへ送る core の送信。"""

    def __init__(self, provider: ScriptedProvider) -> None:
        """偽のプロバイダを受け取る。

        Parameters
        ----------
        provider : ScriptedProvider
            偽のプロバイダ。
        """
        self._provider = provider

    def chat(
        self,
        configuration: RuntimeProviderConfiguration,
        request: CoreChatRequest,
        context: ExecutionContext,
    ) -> CoreChatResult:
        """chat を偽のプロバイダに任せる。

        Parameters
        ----------
        configuration : RuntimeProviderConfiguration
            プロバイダの設定。
        request : CoreChatRequest
            リクエスト。
        context : ExecutionContext
            実行の文脈。

        Returns
        -------
        CoreChatResult
            回答。
        """
        return self._provider.respond(request)

    def rag(
        self,
        configuration: RuntimeProviderConfiguration,
        request: CoreRagRequest,
        context: ExecutionContext,
    ) -> CoreChatResult:
        """RAG を偽のプロバイダに任せ、すべてのコンテキストを参照したことにする。

        Parameters
        ----------
        configuration : RuntimeProviderConfiguration
            プロバイダの設定。
        request : CoreRagRequest
            リクエスト。
        context : ExecutionContext
            実行の文脈。

        Returns
        -------
        CoreChatResult
            回答。
        """
        result = self._provider.respond(request.chat_request)
        return CoreChatResult.success(
            result.answer,
            [c.path for c in request.contexts],
            result.output_mode_hint,
            list(range(1, len(request.contexts) + 1)),
        )


@asynccontextmanager
async def running_emulator(
    settings: Settings | None = None,
    *,
    provider: ScriptedProvider | None = None,
    registry: WorkflowRegistry | None = None,
) -> AsyncIterator[tuple[FastAPI, httpx.AsyncClient]]:
    """エミュレーターを lifespan 付きで起動し、ASGI でつないだクライアントを返す。

    抜けるときは偽のプロバイダのゲートを開け、ワーカースレッドを止めたままにしない。

    Parameters
    ----------
    settings : Settings | None
        設定。None ならテスト用の既定。
    provider : ScriptedProvider | None
        生成AIアダプタが使うプロバイダの代わり。None なら設定どおり（既定は echo）。
    registry : WorkflowRegistry | None
        サービス ID → ワークフロー。None なら設定から作る。

    Yields
    ------
    tuple[FastAPI, httpx.AsyncClient]
        アプリと、それにつないだクライアント。
    """
    app = create_app(
        settings or make_settings(),
        registry=registry,
        chat_runtime_factory=(
            None if provider is None else provider.chat_runtime_factory
        ),
    )
    try:
        async with app.router.lifespan_context(app):
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(
                transport=transport, base_url="http://waha.test"
            ) as client:
                yield app, client
    finally:
        if provider is not None:
            provider.release()


@pytest.fixture
def provider() -> ScriptedProvider:
    """既定の差分を返す偽のプロバイダ。

    Returns
    -------
    ScriptedProvider
        偽のプロバイダ。
    """
    return ScriptedProvider()


@pytest.fixture
async def client(provider: ScriptedProvider) -> AsyncIterator[httpx.AsyncClient]:
    """偽のプロバイダで動くエミュレーターにつないだクライアント。

    Parameters
    ----------
    provider : ScriptedProvider
        偽のプロバイダ。

    Yields
    ------
    httpx.AsyncClient
        クライアント。
    """
    async with running_emulator(provider=provider) as (_, http_client):
        yield http_client


async def start_session(client: httpx.AsyncClient) -> str:
    """セッションを始める。

    Parameters
    ----------
    client : httpx.AsyncClient
        エミュレーターのクライアント。

    Returns
    -------
    str
        セッション ID。
    """
    response = await client.get(f"{API}/startsession", params={"authkey": AUTH_KEY})
    assert response.status_code == 200
    return response.text


async def upload(
    client: httpx.AsyncClient,
    session_id: str,
    slot: str,
    content: bytes,
    *,
    filename: str | None = None,
) -> httpx.Response:
    """スロットにファイルをアップロードする。

    Parameters
    ----------
    client : httpx.AsyncClient
        エミュレーターのクライアント。
    session_id : str
        セッション ID。
    slot : str
        スロット名。
    content : bytes
        中身。
    filename : str | None
        ファイル名。None なら `<スロット名>.txt`。

    Returns
    -------
    httpx.Response
        応答。
    """
    return await client.post(
        f"{API}/upload/{slot}",
        params={"sessionid": session_id},
        files={"file": (filename or f"{slot}.txt", content, "text/plain")},
    )


async def wait_for_result(
    client: httpx.AsyncClient,
    session_id: str,
    *,
    timeout: float = DEFAULT_RESULT_TIMEOUT_SECONDS,
) -> str:
    """ジョブが終わるまで `/result` を待つ。

    Parameters
    ----------
    client : httpx.AsyncClient
        エミュレーターのクライアント。
    session_id : str
        セッション ID。
    timeout : float
        待つ上限（秒）。

    Returns
    -------
    str
        RUNNING 以外になった result の本文。

    Raises
    ------
    TimeoutError
        上限までに終わらないとき。
    """
    async with asyncio.timeout(timeout):
        while True:
            response = await client.get(
                f"{API}/result", params={"sessionid": session_id}
            )
            if response.text != "RUNNING":
                return response.text
            await asyncio.sleep(RESULT_POLL_INTERVAL_SECONDS)


async def wait_until_received(
    provider: ScriptedProvider, *, timeout: float = DEFAULT_RESULT_TIMEOUT_SECONDS
) -> None:
    """偽のプロバイダがリクエストを受け取るまで待つ。

    Parameters
    ----------
    provider : ScriptedProvider
        偽のプロバイダ。
    timeout : float
        待つ上限（秒）。

    Raises
    ------
    TimeoutError
        上限までに受け取らないとき。
    """
    async with asyncio.timeout(timeout):
        while not provider.received:
            await asyncio.sleep(RESULT_POLL_INTERVAL_SECONDS)
