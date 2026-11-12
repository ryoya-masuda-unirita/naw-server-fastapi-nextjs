import asyncio
import sys
from collections.abc import AsyncIterator, Sequence
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx
import pytest
from fastapi import FastAPI

from waha_emulator.config import Settings
from waha_emulator.llm.base import ChatMessage, LlmClient
from waha_emulator.main import create_app
from waha_emulator.workflows.registry import WorkflowRegistry

AUTH_KEY = "waha-key"
API = "/WahaServer/servicerun/api"

# server-local との結合テスト（test_server_local_roundtrip.py）で server-local の
# パッケージ（`app`）を読み込めるようにする。テストのモジュールより先に読み込まれる
# conftest で足す。末尾に足し、エミュレーターの `tests` を server-local のもので隠さない
SERVER_LOCAL_DIR = Path(__file__).resolve().parents[2] / "server-local"
if str(SERVER_LOCAL_DIR) not in sys.path:
    sys.path.append(str(SERVER_LOCAL_DIR))


def make_settings(**overrides: Any) -> Settings:
    values: dict[str, Any] = {"WAHA_AUTHKEY": AUTH_KEY}
    values.update(overrides)
    return Settings(_env_file=None, **values)


@dataclass
class ScriptedLlmClient:
    """決めた差分を返す偽の LLM。受け取ったメッセージを記録する。"""

    deltas: list[str] = field(default_factory=lambda: ["こんにちは", "、", "世界"])
    error: Exception | None = None
    # 設定すると、差分を返す前にこのイベントを待つ（実行中の状態を作るため）
    gate: asyncio.Event | None = None
    delay_seconds: float = 0.0
    received: list[list[ChatMessage]] = field(default_factory=list)

    async def stream_chat(self, messages: Sequence[ChatMessage]) -> AsyncIterator[str]:
        self.received.append(list(messages))
        if self.gate is not None:
            await self.gate.wait()
        if self.delay_seconds:
            await asyncio.sleep(self.delay_seconds)
        for delta in self.deltas:
            yield delta
        if self.error is not None:
            raise self.error


@asynccontextmanager
async def running_emulator(
    settings: Settings | None = None,
    *,
    llm_client: LlmClient | None = None,
    registry: WorkflowRegistry | None = None,
) -> AsyncIterator[tuple[FastAPI, httpx.AsyncClient]]:
    """エミュレーターを lifespan 付きで起動し、ASGI でつないだクライアントを返す。"""
    app = create_app(
        settings or make_settings(), llm_client=llm_client, registry=registry
    )
    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://waha.test"
        ) as client:
            yield app, client


@pytest.fixture
def llm() -> ScriptedLlmClient:
    return ScriptedLlmClient()


@pytest.fixture
async def client(llm: ScriptedLlmClient) -> AsyncIterator[httpx.AsyncClient]:
    async with running_emulator(llm_client=llm) as (_, http_client):
        yield http_client


async def start_session(client: httpx.AsyncClient) -> str:
    response = await client.get(f"{API}/startsession", params={"authkey": AUTH_KEY})
    assert response.status_code == 200
    return response.text


async def upload(
    client: httpx.AsyncClient, session_id: str, slot: str, content: bytes
) -> httpx.Response:
    return await client.post(
        f"{API}/upload/{slot}",
        params={"sessionid": session_id},
        files={"file": (f"{slot}.txt", content, "text/plain")},
    )


async def wait_for_result(
    client: httpx.AsyncClient, session_id: str, *, timeout: float = 5.0
) -> str:
    """ジョブが終わるまで `/result` を待つ。"""
    async with asyncio.timeout(timeout):
        while True:
            response = await client.get(
                f"{API}/result", params={"sessionid": session_id}
            )
            if response.text != "RUNNING":
                return response.text
            await asyncio.sleep(0.01)
