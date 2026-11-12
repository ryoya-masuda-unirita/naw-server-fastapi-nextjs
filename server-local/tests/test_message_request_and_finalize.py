"""質問 API の入力の扱いと SSE の確定処理を移植元に揃えること（#253）。"""

import asyncio
import json
import logging

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.clients.waha_client import ResultStatus
from app.core.config import Settings
from app.models import MessageContent
from app.schemas.message import CreateMessageContentCommand
from app.services.message_content_stream_service import StreamMode, StreamRuntime
from tests.conftest import FakeNawApiClient, FakeWahaClient
from tests.helpers import multipart_files, parse_sse
from tests.test_message_content_stream import (
    CONTENT_URL,
    TEXT_DATA,
    event_types,
    make_service,
    write_stream,
)

SYNC_URL = "/api/messages/content/sync"
FINALIZE_WITHOUT_TERMINAL_LOG = "Finalizing without stream terminal event"
INVALID_UTF8 = b'{"assistantId":"svc","messageId":"m","userInput":"\xff\xfe"}'


async def get_contents(
    session_factory: async_sessionmaker[AsyncSession],
) -> list[MessageContent]:
    async with session_factory() as session:
        result = await session.execute(select(MessageContent))
        return list(result.scalars().all())


class TestMessageRequest:
    async def test_invalid_utf8_text_data_returns_400(
        self, client: httpx.AsyncClient, fake_waha: FakeWahaClient
    ) -> None:
        """textData が UTF-8 として不正なら、移植元（JSON の解析エラー）と同じく 400 にすること"""
        res = await client.post(
            SYNC_URL,
            files=[("textData", ("blob", INVALID_UTF8, "application/json"))],
        )
        assert res.status_code == 400
        assert res.json()["status"] == 400
        assert fake_waha.calls == []

    @pytest.mark.parametrize("url", [CONTENT_URL, SYNC_URL])
    async def test_non_multipart_returns_415(
        self, client: httpx.AsyncClient, url: str
    ) -> None:
        """multipart 以外は移植元（consumes 指定）と同じく 415 にすること"""
        res = await client.post(url, json=TEXT_DATA)
        assert res.status_code == 415
        assert res.json()["error"] == "Unsupported Media Type"

    async def test_history_without_type(
        self, client: httpx.AsyncClient, fake_waha: FakeWahaClient
    ) -> None:
        """履歴の type は省略でき、移植元と同じく role を null にして Waha! に渡すこと"""
        text_data = {
            **TEXT_DATA,
            "historyMessages": [
                {"content": "前の質問"},
                {"type": "ASSISTANT", "content": "前の回答"},
            ],
        }
        res = await client.post(SYNC_URL, files=multipart_files(text_data))
        assert res.status_code == 200
        history = next(u for u in fake_waha.uploads if u.slot == "history")
        assert json.loads(history.content) == [
            {"role": None, "content": "前の質問"},
            {"role": "ASSISTANT", "content": "前の回答"},
        ]


class TestNawStream:
    async def test_empty_data_line_is_ignored(
        self, client: httpx.AsyncClient, fake_waha: FakeWahaClient
    ) -> None:
        """ストリームファイルの空の `data:` 行は、移植元と同じく無視して回答を返すこと"""
        fake_waha.on_execute_with_stream_file = write_stream(
            [
                # 空行区切りの形式と、`data:` 行だけの 1 行形式の両方で空の data を置く
                "data:\n\n",
                'data:{"type":"reasoning_delta","text":"考え中"}\n\n',
                "data:   \n",
                'data:{"type":"completed"}\n',
            ]
        )
        # ストリームファイルを読んでから確定させるため、最初の結果取得は実行中にする
        fake_waha.result_statuses = [ResultStatus.RUNNING, ResultStatus.SUCCESS]
        res = await client.post(CONTENT_URL, files=multipart_files(TEXT_DATA))
        events = parse_sse(res.text)
        assert event_types(events) == [
            "reasoning_delta",
            "text_delta",
            "message_stop",
            "message_content",
        ]
        assert events[1]["text"] == "回答です"

    @pytest.mark.parametrize(
        ("download_content", "fail_on"),
        [
            ("outputfile が JSON ではない", set()),
            ('{"answer":"回答です"}', {"download_file"}),
        ],
        ids=["invalid_outputfile", "download_failure"],
    )
    async def test_finalize_failure_sends_error(
        self,
        client: httpx.AsyncClient,
        fake_waha: FakeWahaClient,
        session_factory: async_sessionmaker[AsyncSession],
        download_content: str,
        fail_on: set[str],
    ) -> None:
        """確定処理（outputfile の取得・解析）に失敗したら、error を送り ERROR で保存すること"""
        fake_waha.download_content = download_content
        fake_waha.fail_on = fail_on
        res = await client.post(CONTENT_URL, files=multipart_files(TEXT_DATA))
        events = parse_sse(res.text)
        assert event_types(events) == ["error"]
        contents = await get_contents(session_factory)
        assert len(contents) == 1
        assert contents[0].status == "ERROR"
        assert contents[0].answer == events[0]["message"]
        assert events[0]["message"]
        assert fake_waha.call_names()[-1] == "end_session"


async def test_concurrent_finalize_runs_once(
    settings: Settings,
    session_factory: async_sessionmaker[AsyncSession],
    fake_waha: FakeWahaClient,
    fake_naw: FakeNawApiClient,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """ストリームの監視と結果のポーリングが同時に確定処理に入っても、確定処理（読み残しの
    処理・outputfile の取得）は 1 回だけ行うこと"""
    service = make_service(settings, session_factory, fake_waha, fake_naw)
    command = CreateMessageContentCommand(
        assistant_id="svc",
        message_id="msg-1",
        message_content_id=None,
        additional_prompt=None,
        user_input="質問",
    )
    async with session_factory() as session:
        stream_session = await service.prepare_stream(session, command)
    runtime = StreamRuntime(
        command=command, session=stream_session, mode=StreamMode.NAW_COMPATIBLE
    )
    runtime.result_status = ResultStatus.SUCCESS
    runtime.waha_session_id = "session-1"

    with caplog.at_level(logging.WARNING):
        await asyncio.gather(
            service._try_finalize(runtime), service._try_finalize(runtime)
        )

    assert fake_waha.call_names().count("download_file") == 1
    assert caplog.text.count(FINALIZE_WITHOUT_TERMINAL_LOG) == 1
    await service.shutdown()
