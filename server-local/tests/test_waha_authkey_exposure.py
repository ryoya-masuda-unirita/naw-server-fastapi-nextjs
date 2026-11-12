"""Waha! の authkey が API の応答・SSE・DB・ログに出ないこと（#252）。

テスト用の偽物（FakeWahaClient）ではなく実際の WahaClient を使い、httpx.MockTransport
で Waha! の応答を返して、httpx の例外が起きる実際の経路を通す。
"""

import logging
from collections.abc import AsyncIterator, Callable
from typing import Any

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlmodel import col

from app.clients.waha_client import WahaClient
from app.core.config import Settings
from app.main import create_app
from app.models import MessageContent
from tests.conftest import AUTH_HEADERS, FakeNawApiClient
from tests.helpers import multipart_files, parse_sse

FILES_URL = "/api/admin/indexes/idx-1/files"
SYNC_URL = "/api/messages/content/sync"
CONTENT_URL = "/api/messages/content"
TENANT = {"X-Tenant-ID": "tenant-1"}
TEXT_DATA = {"assistantId": "svc", "messageId": "msg-1", "userInput": "質問"}
UNAVAILABLE_MESSAGE = "503 Service Unavailable: [no body]"

WahaHandler = Callable[[httpx.Request], httpx.Response]


def waha_failing_at(failing_path_suffix: str) -> WahaHandler:
    """指定したパスだけ 503 を返し、ほかは成功を返す Waha! の偽物。"""

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith(failing_path_suffix):
            return httpx.Response(503)
        if request.url.path.endswith("/startsession"):
            return httpx.Response(200, text="waha-session-1")
        return httpx.Response(200, text="OK")

    return handler


@pytest.fixture
def waha_handler() -> list[WahaHandler]:
    """テストごとに Waha! の応答を差し替えるための入れ物。"""
    return [waha_failing_at("/startsession")]


@pytest.fixture
async def real_waha_client(
    settings: Settings,
    session_factory: async_sessionmaker[AsyncSession],
    waha_handler: list[WahaHandler],
) -> AsyncIterator[httpx.AsyncClient]:
    waha_http = httpx.AsyncClient(
        transport=httpx.MockTransport(lambda request: waha_handler[0](request))
    )
    waha = WahaClient(
        base_url=settings.waha_url,
        auth_key=settings.waha_authkey,
        http_client=waha_http,
        result_retry_interval_seconds=0,
        result_max_retries=settings.waha_result_max_retries,
    )
    naw: Any = FakeNawApiClient()  # 偽物を差し込むため型は一致しない
    app: Any = create_app(
        settings,
        session_factory=session_factory,
        waha_client=waha,
        naw_client=naw,
        enable_cleanup=False,
    )
    async with waha_http, app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://test", headers=AUTH_HEADERS
        ) as client:
            yield client


async def get_answers(session_factory: async_sessionmaker[AsyncSession]) -> list[str]:
    async with session_factory() as session:
        result = await session.execute(select(col(MessageContent.answer)))
        return list(result.scalars().all())


async def test_upload_file_error_response_hides_authkey(
    real_waha_client: httpx.AsyncClient,
    settings: Settings,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """学習ファイル登録で Waha! が 503 のとき、500 の message・ログに authkey を出さないこと"""
    with caplog.at_level(logging.DEBUG):
        res = await real_waha_client.post(
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
    real_waha_client: httpx.AsyncClient,
    waha_handler: list[WahaHandler],
    settings: Settings,
    session_factory: async_sessionmaker[AsyncSession],
    caplog: pytest.LogCaptureFixture,
) -> None:
    """同期の質問で Waha! が 503 のとき、応答・DB の回答・ログに authkey を出さないこと"""
    waha_handler[0] = waha_failing_at("/execute/svc")
    with caplog.at_level(logging.DEBUG):
        res = await real_waha_client.post(SYNC_URL, files=multipart_files(TEXT_DATA))
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ERROR"
    assert body["answer"] == UNAVAILABLE_MESSAGE
    assert await get_answers(session_factory) == [UNAVAILABLE_MESSAGE]
    # startsession は成功しており、httpx のリクエストログに authkey が出うる
    assert settings.waha_authkey not in res.text
    assert settings.waha_authkey not in caplog.text


async def test_sse_error_event_hides_authkey(
    real_waha_client: httpx.AsyncClient,
    waha_handler: list[WahaHandler],
    settings: Settings,
    session_factory: async_sessionmaker[AsyncSession],
    caplog: pytest.LogCaptureFixture,
) -> None:
    """SSE で Waha! が 503 のとき、error イベント・DB の回答・ログに authkey を出さないこと"""
    waha_handler[0] = waha_failing_at("/execute/svc")
    with caplog.at_level(logging.DEBUG):
        res = await real_waha_client.post(CONTENT_URL, files=multipart_files(TEXT_DATA))
    events = parse_sse(res.text)
    assert events[0] == {"type": "error", "message": UNAVAILABLE_MESSAGE}
    assert await get_answers(session_factory) == [UNAVAILABLE_MESSAGE]
    assert settings.waha_authkey not in res.text
    assert settings.waha_authkey not in caplog.text
