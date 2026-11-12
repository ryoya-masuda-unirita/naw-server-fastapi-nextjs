import asyncio
import json
import logging
from collections.abc import Callable
from pathlib import Path
from typing import Any

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.clients.waha_client import ResultStatus
from app.core.config import Settings
from app.models import MessageContent
from app.schemas.message import CreateMessageContentCommand, UploadedFile
from app.services.message_content_stream_service import (
    MessageContentStreamService,
    StreamMode,
)
from tests.conftest import AUTH_HEADERS, FakeNawApiClient, FakeWahaClient, make_settings
from tests.helpers import insert_message_content, multipart_files, parse_sse

CONTENT_URL = "/api/messages/content"
LEGACY_URL = "/api/messages/content/stream"
TEXT_DATA = {
    "assistantId": "svc",
    "messageId": "msg-1",
    "userInput": "質問",
    "accessToken": "token-abc",
    "tenantId": "tenant-1",
}


def write_stream(lines: list[str]) -> Callable[[str], None]:
    """execute 時に Waha! がストリームファイルへ書き込む動きを再現する。"""

    def _write(path: str) -> None:
        with Path(path).open("a", encoding="utf-8") as f:
            f.write("".join(lines))

    return _write


def event_types(events: list[dict[str, Any]]) -> list[str]:
    return [e["type"] for e in events]


async def get_content(
    session_factory: async_sessionmaker[AsyncSession], content_id: str
) -> MessageContent:
    async with session_factory() as session:
        content = await session.get(MessageContent, content_id)
        assert content is not None
        return content


def make_service(
    settings: Settings,
    session_factory: async_sessionmaker[AsyncSession],
    waha: FakeWahaClient,
    naw: FakeNawApiClient,
) -> MessageContentStreamService:
    return MessageContentStreamService(
        settings=settings,
        session_factory=session_factory,
        waha=waha,  # 偽物を差し込むため型は一致しない
        naw=naw,
    )


async def test_prepare_stream_creates_stub_and_file(
    settings: Settings,
    session_factory: async_sessionmaker[AsyncSession],
    fake_waha: FakeWahaClient,
    fake_naw: FakeNawApiClient,
) -> None:
    """新規質問では空の回答で仮レコードを作り、空のストリームファイルを用意すること"""
    service = make_service(settings, session_factory, fake_waha, fake_naw)
    command = CreateMessageContentCommand(
        assistant_id="svc",
        message_id="msg-1",
        message_content_id=None,
        additional_prompt=None,
        user_input="質問",
        attachment_files=[UploadedFile("a.txt", "text/plain", b"x")],
    )
    async with session_factory() as session:
        stream_session = await service.prepare_stream(session, command)
    assert stream_session.message_id == "msg-1"
    assert stream_session.stream_file_path.exists()
    assert stream_session.stream_file_path.stat().st_size == 0
    assert stream_session.stream_file_path.name == (
        f"{stream_session.message_content_id}.txt"
    )
    content = await get_content(session_factory, stream_session.message_content_id)
    assert content.answer == ""
    assert content.question == "質問"
    assert content.status == "OK"


async def test_prepare_stream_file_failure_leaves_no_record(
    tmp_path: Path,
    session_factory: async_sessionmaker[AsyncSession],
    fake_waha: FakeWahaClient,
    fake_naw: FakeNawApiClient,
) -> None:
    """ストリームファイルを作れなければ仮レコードを残さず、同じ messageId で再試行できること"""
    blocker = tmp_path / "not-a-dir"
    blocker.write_text("x")
    settings = make_settings(tmp_path, STREAM_OUTPUT_DIR=str(blocker / "out"))
    service = make_service(settings, session_factory, fake_waha, fake_naw)
    command = CreateMessageContentCommand(
        assistant_id="svc",
        message_id="msg-1",
        message_content_id=None,
        additional_prompt=None,
        user_input="質問",
    )
    async with session_factory() as session:
        with pytest.raises(OSError):
            await service.prepare_stream(session, command)
    async with session_factory() as session:
        rows = (await session.execute(select(MessageContent))).scalars().all()
        assert rows == []


async def test_access_token_is_not_logged(
    client: httpx.AsyncClient,
    fake_waha: FakeWahaClient,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """textData のログにアクセストークンを出さず、Waha! には送ること"""
    with caplog.at_level(logging.DEBUG):
        await client.post(CONTENT_URL, files=multipart_files(TEXT_DATA))
    assert "token-abc" not in caplog.text
    assert '"accessToken":"***"' in caplog.text
    upload = next(u for u in fake_waha.uploads if u.slot == "textdata")
    assert json.loads(upload.content)["accessToken"] == "token-abc"


async def test_prepare_stream_regenerate_resets_content(
    settings: Settings,
    session_factory: async_sessionmaker[AsyncSession],
    fake_waha: FakeWahaClient,
    fake_naw: FakeNawApiClient,
) -> None:
    """回答再生成では既存レコードの回答・コンテキスト・参照を初期化すること"""
    await insert_message_content(
        session_factory, content_id="c" * 32, message_id="msg-9", file_paths="a.pdf"
    )
    service = make_service(settings, session_factory, fake_waha, fake_naw)
    command = CreateMessageContentCommand(
        assistant_id="svc",
        message_id=None,
        message_content_id="c" * 32,
        additional_prompt=None,
        user_input="質問",
    )
    async with session_factory() as session:
        stream_session = await service.prepare_stream(session, command)
    assert stream_session.message_id == "msg-9"
    content = await get_content(session_factory, "c" * 32)
    assert content.answer == ""
    assert content.context is None
    assert content.file_paths == ""


async def test_naw_stream_success_events(
    client: httpx.AsyncClient,
    fake_waha: FakeWahaClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """推論途中経過を中継し、回答・終了・メッセージ内容の順で返して DB を確定すること"""
    fake_waha.on_execute_with_stream_file = write_stream(
        [
            'data:{"type":"reasoning_delta","text":"考え中"}\n\n',
            'data:{"type":"reasoning_delta","text":"…"}\n',
            'data:{"type":"completed"}\n',
        ]
    )
    fake_waha.result_statuses = [ResultStatus.RUNNING, ResultStatus.SUCCESS]
    fake_waha.download_content = json.dumps(
        {"answer": "最終回答", "filepaths": ["a.pdf"], "references": [{"content": "c"}]}
    )
    res = await client.post(CONTENT_URL, files=multipart_files(TEXT_DATA))
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/event-stream")
    events = parse_sse(res.text)
    assert event_types(events) == [
        "reasoning_delta",
        "reasoning_delta",
        "text_delta",
        "message_stop",
        "message_content",
    ]
    assert events[0] == {"type": "reasoning_delta", "text": "考え中"}
    assert events[2] == {"type": "text_delta", "text": "最終回答"}
    assert events[3] == {"type": "message_stop", "inputTokens": 0, "outputTokens": 0}
    data = events[4]["data"]
    assert data["answer"] == "最終回答"
    assert data["referencePaths"] == ["a.pdf"]
    assert data["isRated"] is False

    content = await get_content(session_factory, data["id"])
    assert content.answer == "最終回答"
    assert content.context == "c"
    assert fake_waha.call_names()[-1] == "end_session"


async def test_naw_stream_empty_stream_file(
    client: httpx.AsyncClient, fake_waha: FakeWahaClient
) -> None:
    """ストリームファイルが空のままでも、Waha! の成功で outputfile から確定すること"""
    res = await client.post(CONTENT_URL, files=multipart_files(TEXT_DATA))
    events = parse_sse(res.text)
    assert event_types(events) == ["text_delta", "message_stop", "message_content"]
    assert events[0]["text"] == "回答です"


async def test_naw_stream_ignores_stream_text_delta(
    client: httpx.AsyncClient, fake_waha: FakeWahaClient
) -> None:
    """回答は outputfile の内容を使い、ストリーム側の text_delta 等は無視すること"""
    fake_waha.on_execute_with_stream_file = write_stream(
        [
            'data:{"type":"text_delta","text":"ストリームの回答"}\n\n',
            'data:{"type":"message_stop"}\n\n',
            'data:{"type":"unknown_event","text":"x"}\n\n',
            ": comment line\n",
        ]
    )
    res = await client.post(CONTENT_URL, files=multipart_files(TEXT_DATA))
    events = parse_sse(res.text)
    assert event_types(events) == ["text_delta", "message_stop", "message_content"]
    assert events[0]["text"] == "回答です"


async def test_naw_stream_library_flow(
    client: httpx.AsyncClient,
    fake_waha: FakeWahaClient,
    fake_naw: FakeNawApiClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """ライブラリ作成時はスタブ作成・ID 通知・途中経過中継・本文保存・タイトル更新を行うこと"""
    fake_waha.on_execute_with_stream_file = write_stream(
        [
            'data:{"type":"library_title_delta","text":" 議事録"}\n\n',
            'data:{"type":"library_title_delta","text":"まとめ "}\n\n',
            'data:{"type":"library_content_delta","text":"# 見出し\\n"}\n\n',
            'data:{"type":"library_content_delta","text":"本文"}\n\n',
        ]
    )
    res = await client.post(
        CONTENT_URL, files=multipart_files({**TEXT_DATA, "createLibrary": True})
    )
    events = parse_sse(res.text)
    assert event_types(events) == [
        "library_id",
        "library_title_delta",
        "library_title_delta",
        "library_content_delta",
        "library_content_delta",
        "text_delta",
        "message_stop",
        "message_content",
    ]
    assert events[0] == {"type": "library_id", "libraryId": "library-1"}
    assert fake_naw.calls == [
        ("create_library_stub", ("msg-1", "token-abc", "tenant-1")),
        (
            "update_library_title",
            ("library-1", "議事録まとめ", "token-abc", "tenant-1"),
        ),
    ]
    library = await client.get("/api/libraries/library-1/content")
    assert library.json() == {"data": "# 見出し\n本文"}
    text_data = json.loads(
        next(u for u in fake_waha.uploads if u.slot == "textdata").content
    )
    assert text_data["createLibrary"] is True


async def test_naw_stream_library_stub_failure(
    client: httpx.AsyncClient,
    fake_waha: FakeWahaClient,
    fake_naw: FakeNawApiClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """ライブラリスタブ作成に失敗したら Waha! を起動せずエラーで終えること"""
    fake_naw.fail_create = True
    res = await client.post(
        CONTENT_URL, files=multipart_files({**TEXT_DATA, "createLibrary": True})
    )
    events = parse_sse(res.text)
    assert event_types(events) == ["error", "message_content"]
    assert events[0]["message"] == "NAW のライブラリスタブ作成に失敗しました"
    assert fake_waha.calls == []
    assert events[1]["data"]["status"] == "ERROR"


async def test_naw_stream_waha_failure_with_attachments(
    client: httpx.AsyncClient,
    fake_waha: FakeWahaClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Waha! ジョブ失敗時はエラーと添付つきのメッセージ内容を返し ERROR で保存すること"""
    fake_waha.result_statuses = [ResultStatus.FAILURE]
    res = await client.post(
        CONTENT_URL,
        files=multipart_files(TEXT_DATA, attachments=[("a.txt", b"hi", "text/plain")]),
    )
    events = parse_sse(res.text)
    assert event_types(events) == ["error", "message_content"]
    assert events[0]["message"] == "ジョブの実行に失敗しました。"
    data = events[1]["data"]
    assert data["status"] == "ERROR"
    assert data["answer"] == "ジョブの実行に失敗しました。"
    assert [f["name"] for f in data["attachmentFiles"]] == ["a.txt"]
    content = await get_content(session_factory, data["id"])
    assert content.status == "ERROR"
    assert fake_waha.call_names()[-1] == "end_session"


async def test_naw_stream_error_terminal(
    client: httpx.AsyncClient, fake_waha: FakeWahaClient
) -> None:
    """ストリームが error イベントで終わったらエラーで終了すること"""
    fake_waha.result_statuses = [ResultStatus.RUNNING]
    fake_waha.on_execute_with_stream_file = write_stream(
        ['data:{"type":"reasoning_delta","text":"a"}\n\n', 'data:{"type":"error"}\n\n']
    )
    res = await client.post(CONTENT_URL, files=multipart_files(TEXT_DATA))
    events = parse_sse(res.text)
    assert event_types(events) == ["reasoning_delta", "error", "message_content"]
    assert events[1]["message"] == "ストリームが error イベントで終了しました。"


async def test_naw_stream_execute_failure(
    client: httpx.AsyncClient, fake_waha: FakeWahaClient
) -> None:
    """Waha! のジョブ起動に失敗したらエラーで終了しセッションを閉じること"""
    fake_waha.fail_on = {"execute_with_stream_file"}
    res = await client.post(CONTENT_URL, files=multipart_files(TEXT_DATA))
    events = parse_sse(res.text)
    assert event_types(events) == ["error", "message_content"]
    assert events[0]["message"] == "execute_with_stream_file failed"
    assert fake_waha.call_names()[-1] == "end_session"


async def test_result_not_polled_before_initial_delay(
    tmp_path: Path,
    session_factory: async_sessionmaker[AsyncSession],
    fake_waha: FakeWahaClient,
    fake_naw: FakeNawApiClient,
) -> None:
    """結果ポーリングは初回遅延（結果ポーリング間隔）が経つまで行わないこと"""
    settings = make_settings(tmp_path, STREAM_RESULT_POLL_INTERVAL_MS=500)
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
    service.start_streaming(command, stream_session, StreamMode.NAW_COMPATIBLE)
    await asyncio.sleep(0.15)
    assert "execute_with_stream_file" in fake_waha.call_names()
    assert "poll_result_once" not in fake_waha.call_names()
    await service.shutdown()


async def test_text_data_format(
    client: httpx.AsyncClient, fake_waha: FakeWahaClient, settings: Settings
) -> None:
    """textData は移植元と同じキー構成で Waha! に送ること"""
    res = await client.post(
        CONTENT_URL,
        files=multipart_files(
            {
                **TEXT_DATA,
                "tools": [
                    {"name": "web_search", "server_label": "l", "server_url": "u"}
                ],
            }
        ),
    )
    message_content_id = parse_sse(res.text)[-1]["data"]["id"]
    upload = next(u for u in fake_waha.uploads if u.slot == "textdata")
    assert upload.filename == "textData.json"
    expected_path = str(
        Path(settings.stream_output_dir).resolve() / f"{message_content_id}.txt"
    )
    assert json.loads(upload.content) == {
        "streamfilepath": expected_path,
        "createLibrary": False,
        "tools": [{"name": "web_search"}],
        "accessToken": "token-abc",
        "messageId": "msg-1",
    }
    assert fake_waha.call_names()[:3] == ["start_session", "upload_file", "upload_file"]
    execute = next(c for c in fake_waha.calls if c[0] == "execute_with_stream_file")
    assert execute[1] == ("session-1", "svc", expected_path)


async def test_text_data_omits_empty_values(
    client: httpx.AsyncClient, fake_waha: FakeWahaClient
) -> None:
    """ツールが空・accessToken が未指定なら textData から省略すること"""
    await client.post(
        CONTENT_URL,
        files=multipart_files({"assistantId": "svc", "messageId": "m", "tools": []}),
    )
    upload = next(u for u in fake_waha.uploads if u.slot == "textdata")
    text_data = json.loads(upload.content)
    assert "tools" not in text_data
    assert "accessToken" not in text_data


async def test_text_data_uses_waha_output_dir(
    tmp_path: Path,
    app_factory: Callable[[Settings], Any],
    fake_waha: FakeWahaClient,
) -> None:
    """Waha! 側の出力先を設定すると、Waha! に渡すパスだけを置き換えること"""
    settings = make_settings(tmp_path, STREAM_WAHA_OUTPUT_DIR="/shared/stream/")
    app = app_factory(settings)
    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://test", headers=AUTH_HEADERS
        ) as client:
            res = await client.post(CONTENT_URL, files=multipart_files(TEXT_DATA))
    message_content_id = parse_sse(res.text)[-1]["data"]["id"]
    upload = next(u for u in fake_waha.uploads if u.slot == "textdata")
    assert json.loads(upload.content)["streamfilepath"] == (
        f"/shared/stream/{message_content_id}.txt"
    )
    assert (Path(settings.stream_output_dir) / f"{message_content_id}.txt").exists()


async def test_legacy_stream_passthrough_and_headers(
    client: httpx.AsyncClient, fake_waha: FakeWahaClient
) -> None:
    """旧形式はストリームの内容をそのまま中継し、ID をヘッダーで返すこと"""
    fake_waha.on_execute_with_stream_file = write_stream(
        [
            'data:{"type":"text_delta","text":"a"}\n\n',
            'data:{"type":"completed"}\n\n',
        ]
    )
    res = await client.post(LEGACY_URL, files=multipart_files(TEXT_DATA))
    assert res.status_code == 200
    assert len(res.headers["x-message-content-id"]) == 32
    assert res.headers["x-message-id"] == "msg-1"
    events = parse_sse(res.text)
    assert events == [{"type": "text_delta", "text": "a"}, {"type": "completed"}]


async def test_legacy_stream_failure_sends_error(
    client: httpx.AsyncClient, fake_waha: FakeWahaClient
) -> None:
    """旧形式でもジョブ失敗時は error イベントだけを送ること"""
    fake_waha.result_statuses = [ResultStatus.FAILURE]
    res = await client.post(LEGACY_URL, files=multipart_files(TEXT_DATA))
    assert parse_sse(res.text) == [
        {"type": "error", "message": "ジョブの実行に失敗しました。"}
    ]


async def test_stream_prepare_errors_return_http_error(
    client: httpx.AsyncClient,
) -> None:
    """準備段階のエラー（対象未指定）は SSE ではなく HTTP 400 で返すこと"""
    res = await client.post(CONTENT_URL, files=multipart_files({"assistantId": "svc"}))
    assert res.status_code == 400
    assert res.json()["message"] == "対象データが指定されていません"


async def test_stream_emitter_timeout_closes_response(
    tmp_path: Path,
    app_factory: Callable[[Settings], Any],
    fake_waha: FakeWahaClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """SSE のタイムアウトでレスポンスは閉じるが、処理は続いて DB は確定すること"""
    settings = make_settings(
        tmp_path, STREAM_EMITTER_TIMEOUT_MS=50, STREAM_RESULT_POLL_INTERVAL_MS=150
    )
    app = app_factory(settings)
    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://test", headers=AUTH_HEADERS
        ) as client:
            res = await client.post(LEGACY_URL, files=multipart_files(TEXT_DATA))
            assert res.text == ""
            content_id = res.headers["x-message-content-id"]
            await asyncio.sleep(0.4)
    content = await get_content(session_factory, content_id)
    assert content.answer == "回答です"
