import base64
import json

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models import MessageContent, MessageContentFile
from tests.conftest import FakeWahaClient
from tests.helpers import insert_message_content, multipart_files

SYNC_URL = "/api/messages/content/sync"
OUTPUT_WITH_REFERENCES = json.dumps(
    {
        "answer": "参照付きの回答",
        "filepaths": ["a.pdf", "b.pdf"],
        "references": [
            {"role": "system", "content": "参照1"},
            {"role": "system", "content": "参照2"},
        ],
    }
)


async def test_sync_success(
    client: httpx.AsyncClient,
    fake_waha: FakeWahaClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Waha! 成功時は回答・参照を保存し、移植元と同じ JSON を返すこと"""
    fake_waha.download_content = OUTPUT_WITH_REFERENCES
    res = await client.post(
        SYNC_URL,
        files=multipart_files(
            {"assistantId": "svc", "messageId": "msg-1", "userInput": "質問"}
        ),
    )
    assert res.status_code == 200
    body = res.json()
    assert list(body) == [
        "id",
        "messageId",
        "status",
        "question",
        "answer",
        "context",
        "attachmentFiles",
        "referencePaths",
        "isRated",
    ]
    assert body["messageId"] == "msg-1"
    assert body["status"] == "OK"
    assert body["question"] == "質問"
    assert body["answer"] == "参照付きの回答"
    assert body["context"] == "参照1\n参照2"
    assert body["referencePaths"] == ["a.pdf", "b.pdf"]
    assert body["attachmentFiles"] == []
    assert body["isRated"] is False
    assert len(body["id"]) == 32
    assert fake_waha.call_names() == [
        "start_session",
        "upload_file",
        "execute",
        "get_results",
        "download_file",
        "end_session",
    ]
    assert fake_waha.calls[2][1] == ("session-1", "svc")
    async with session_factory() as session:
        saved = await session.get(MessageContent, body["id"])
        assert saved is not None
        assert saved.file_paths == "a.pdf,b.pdf"


async def test_sync_waha_failure_saves_error(
    client: httpx.AsyncClient,
    fake_waha: FakeWahaClient,
) -> None:
    """Waha! 失敗時は ERROR 状態で保存して返し、セッションは必ず終了すること"""
    fake_waha.fail_on = {"get_results"}
    res = await client.post(
        SYNC_URL,
        files=multipart_files(
            {"assistantId": "svc", "messageId": "msg-1", "userInput": "質問"}
        ),
    )
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ERROR"
    assert body["answer"] == "get_results failed"
    assert body["referencePaths"] is None
    assert fake_waha.call_names()[-1] == "end_session"


async def test_sync_regenerate(
    client: httpx.AsyncClient,
    fake_waha: FakeWahaClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """既存のメッセージ内容 ID を指定すると回答を更新すること（回答再生成）"""
    await insert_message_content(
        session_factory, content_id="c" * 32, message_id="msg-1"
    )
    fake_waha.download_content = '{"answer":"新しい回答"}'
    res = await client.post(
        SYNC_URL,
        files=multipart_files(
            {"assistantId": "svc", "messageContentId": "c" * 32, "userInput": "質問"}
        ),
    )
    assert res.status_code == 200
    body = res.json()
    assert body["id"] == "c" * 32
    assert body["messageId"] == "msg-1"
    assert body["answer"] == "新しい回答"
    assert body["question"] == "既存の質問"
    assert body["context"] is None
    async with session_factory() as session:
        rows = (await session.execute(select(MessageContent))).scalars().all()
        assert len(rows) == 1


async def test_sync_both_ids_missing_returns_400(
    client: httpx.AsyncClient, fake_waha: FakeWahaClient
) -> None:
    """messageId と messageContentId がどちらもなければ 400 になること"""
    res = await client.post(
        SYNC_URL, files=multipart_files({"assistantId": "svc", "userInput": "質問"})
    )
    assert res.status_code == 400
    assert res.json()["message"] == "対象データが指定されていません"
    assert fake_waha.calls == []


async def test_sync_content_not_found_returns_404(client: httpx.AsyncClient) -> None:
    """指定したメッセージ内容 ID が存在しなければ 404 になること"""
    res = await client.post(
        SYNC_URL,
        files=multipart_files({"assistantId": "svc", "messageContentId": "none"}),
    )
    assert res.status_code == 404
    assert res.json()["message"] == "対象データが見つかりません"


async def test_sync_with_additional_prompt_history_and_attachment(
    client: httpx.AsyncClient,
    fake_waha: FakeWahaClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """追加プロンプト・履歴・添付があれば Waha! にそれぞれアップロードすること"""
    res = await client.post(
        SYNC_URL,
        files=multipart_files(
            {
                "assistantId": "svc",
                "messageId": "msg-1",
                "additionalPrompt": "前置き:",
                "userInput": "質問",
                "historyMessages": [
                    {"type": "USER", "content": "前の質問", "attachmentsCount": 0},
                    {"type": "ASSISTANT", "content": "前の回答", "attachmentsCount": 0},
                ],
            },
            attachments=[
                ("a.txt", b"first", "text/plain"),
                ("b.png", b"\x89PNG", "image/png"),
            ],
            history_attachments=[("old.txt", b"old", "text/plain")],
        ),
    )
    assert res.status_code == 200
    uploads = {u.slot: u for u in fake_waha.uploads}
    assert set(uploads) == {"question", "history", "attachmentfile"}
    assert uploads["question"].filename == "question.txt"
    assert uploads["question"].content.decode() == "前置き:質問"
    assert uploads["history"].filename == "histories.json"
    assert json.loads(uploads["history"].content) == [
        {"role": "USER", "content": "前の質問"},
        {"role": "ASSISTANT", "content": "前の回答"},
    ]
    assert uploads["attachmentfile"].filename == "a.txt"
    assert uploads["attachmentfile"].content == b"first"

    body = res.json()
    assert body["question"] == "質問"
    assert body["attachmentFiles"] == [
        {
            "name": "a.txt",
            "type": "text/plain",
            "data": base64.b64encode(b"first").decode(),
        },
        {
            "name": "b.png",
            "type": "image/png",
            "data": base64.b64encode(b"\x89PNG").decode(),
        },
    ]
    async with session_factory() as session:
        files = (await session.execute(select(MessageContentFile))).scalars().all()
        assert len(files) == 2


async def test_sync_accepts_waha_service_id_alias(
    client: httpx.AsyncClient, fake_waha: FakeWahaClient
) -> None:
    """旧フィールド名 wahaServiceId も assistantId として受け付けること"""
    res = await client.post(
        SYNC_URL,
        files=multipart_files(
            {"wahaServiceId": "legacy-svc", "messageId": "msg-1", "userInput": "q"}
        ),
    )
    assert res.status_code == 200
    assert ("execute", ("session-1", "legacy-svc")) in fake_waha.calls


async def test_sync_text_data_as_plain_form_field(
    client: httpx.AsyncClient,
) -> None:
    """textData を通常のフォーム文字列で送っても受け付けること"""
    res = await client.post(
        SYNC_URL,
        data={"textData": json.dumps({"assistantId": "s", "messageId": "m"})},
        files=[("attachmentFiles", ("a.txt", b"x", "text/plain"))],
    )
    assert res.status_code == 200


async def test_sync_invalid_text_data_returns_400(client: httpx.AsyncClient) -> None:
    """textData が JSON として不正なら 400 になること"""
    res = await client.post(
        SYNC_URL,
        files=[("textData", ("blob", b"{invalid", "application/json"))],
    )
    assert res.status_code == 400


async def test_sync_requires_multipart(client: httpx.AsyncClient) -> None:
    """multipart 以外は受け付けないこと"""
    res = await client.post(SYNC_URL, json={"assistantId": "s", "messageId": "m"})
    assert res.status_code == 400
