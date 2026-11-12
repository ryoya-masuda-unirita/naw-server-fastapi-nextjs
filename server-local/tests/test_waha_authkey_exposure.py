"""Waha! の authkey が API の応答・SSE・DB・ログに出ないこと（#252）。

テスト用の偽物（FakeWahaClient）ではなく実際の WahaClient を使い、httpx.MockTransport
で Waha! の応答を返して、httpx の例外が起きる実際の経路を通す。
"""

import logging
from collections.abc import AsyncIterator
from dataclasses import dataclass

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlmodel import col

from app.clients.waha_client import WahaClient
from app.core.config import Settings
from app.models import MessageContent
from tests.helpers import multipart_files, parse_sse

FILES_URL = "/api/admin/indexes/idx-1/files"
SYNC_URL = "/api/messages/content/sync"
CONTENT_URL = "/api/messages/content"
TENANT = {"X-Tenant-ID": "tenant-1"}
TEXT_DATA = {"assistantId": "svc", "messageId": "msg-1", "userInput": "質問"}
UNAVAILABLE_MESSAGE = "503 Service Unavailable: [no body]"


@dataclass
class WahaStub:
    """failing_path で終わるパスだけ 503 を返し、ほかは成功を返す Waha! の偽物。"""

    failing_path: str = "/startsession"

    def handle(self, request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith(self.failing_path):
            return httpx.Response(503)
        if request.url.path.endswith("/startsession"):
            return httpx.Response(200, text="waha-session-1")
        return httpx.Response(200, text="OK")


@pytest.fixture
def waha_stub() -> WahaStub:
    return WahaStub()


@pytest.fixture
async def fake_waha(
    settings: Settings, waha_stub: WahaStub
) -> AsyncIterator[WahaClient]:
    """conftest の fake_waha を上書きし、このモジュールでは実際の WahaClient を使う。"""
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(waha_stub.handle)
    ) as waha_http:
        yield WahaClient(
            base_url=settings.waha_url,
            auth_key=settings.waha_authkey,
            http_client=waha_http,
            result_retry_interval_seconds=0,
            result_max_retries=settings.waha_result_max_retries,
        )


async def get_answers(session_factory: async_sessionmaker[AsyncSession]) -> list[str]:
    async with session_factory() as session:
        result = await session.execute(select(col(MessageContent.answer)))
        return list(result.scalars().all())


async def test_upload_file_error_response_hides_authkey(
    client: httpx.AsyncClient,
    settings: Settings,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """学習ファイル登録で Waha! が 503 のとき、500 の message・ログに authkey を出さないこと"""
    with caplog.at_level(logging.DEBUG):
        res = await client.post(
            FILES_URL,
            headers=TENANT,
            data={"name": "a.txt", "userId": "u"},
            files={"file": ("a.txt", b"x", "text/plain")},
        )
    assert res.status_code == 500
    assert res.json()["message"] == UNAVAILABLE_MESSAGE
    assert settings.waha_authkey not in res.text
    assert settings.waha_authkey not in caplog.text


async def test_sync_error_answer_hides_authkey(
    client: httpx.AsyncClient,
    waha_stub: WahaStub,
    settings: Settings,
    session_factory: async_sessionmaker[AsyncSession],
    caplog: pytest.LogCaptureFixture,
) -> None:
    """同期の質問で Waha! が 503 のとき、応答・DB の回答・ログに authkey を出さないこと"""
    waha_stub.failing_path = "/execute/svc"
    with caplog.at_level(logging.DEBUG):
        res = await client.post(SYNC_URL, files=multipart_files(TEXT_DATA))
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ERROR"
    assert body["answer"] == UNAVAILABLE_MESSAGE
    assert await get_answers(session_factory) == [UNAVAILABLE_MESSAGE]
    # startsession は成功しており、httpx のリクエストログに authkey が出うる
    assert settings.waha_authkey not in res.text
    assert settings.waha_authkey not in caplog.text


async def test_sse_error_event_hides_authkey(
    client: httpx.AsyncClient,
    waha_stub: WahaStub,
    settings: Settings,
    session_factory: async_sessionmaker[AsyncSession],
    caplog: pytest.LogCaptureFixture,
) -> None:
    """SSE で Waha! が 503 のとき、error イベント・DB の回答・ログに authkey を出さないこと"""
    waha_stub.failing_path = "/execute/svc"
    with caplog.at_level(logging.DEBUG):
        res = await client.post(CONTENT_URL, files=multipart_files(TEXT_DATA))
    events = parse_sse(res.text)
    assert events[0] == {"type": "error", "message": UNAVAILABLE_MESSAGE}
    assert await get_answers(session_factory) == [UNAVAILABLE_MESSAGE]
    assert settings.waha_authkey not in res.text
    assert settings.waha_authkey not in caplog.text
