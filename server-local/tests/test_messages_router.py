import base64

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models import MessageContent, MessageContentFile
from tests.helpers import insert_message_content


async def test_get_message_contents(
    client: httpx.AsyncClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    """メッセージ ID を指定して、添付つきのメッセージ内容を返すこと"""
    await insert_message_content(
        session_factory,
        content_id="a" * 32,
        message_id="msg-1",
        file_paths="x.pdf, y.pdf",
        attachments=[("a.txt", "text/plain", b"hello")],
    )
    await insert_message_content(
        session_factory, content_id="b" * 32, message_id="msg-2"
    )
    await insert_message_content(
        session_factory, content_id="c" * 32, message_id="msg-3"
    )

    res = await client.post(
        "/api/messages/contents", json={"messageIds": ["msg-1", "msg-2", "none"]}
    )
    assert res.status_code == 200
    body = sorted(res.json(), key=lambda c: c["messageId"])
    assert [c["messageId"] for c in body] == ["msg-1", "msg-2"]
    first = body[0]
    assert list(first) == [
        "id",
        "messageId",
        "status",
        "question",
        "answer",
        "context",
        "attachmentFiles",
        "referencePaths",
    ]
    assert first["referencePaths"] == ["x.pdf", "y.pdf"]
    assert first["attachmentFiles"] == [
        {
            "name": "a.txt",
            "type": "text/plain",
            "data": base64.b64encode(b"hello").decode(),
        }
    ]


async def test_get_message_contents_empty_reference_paths_is_null(
    client: httpx.AsyncClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    """参照パスが空のときは referencePaths が null になること（移植元の挙動）"""
    await insert_message_content(
        session_factory, content_id="a" * 32, message_id="msg-1", file_paths=""
    )
    res = await client.post("/api/messages/contents", json={"messageIds": ["msg-1"]})
    assert res.json()[0]["referencePaths"] is None


async def test_delete_message_cascades_files(
    client: httpx.AsyncClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    """メッセージ ID を指定して削除すると、添付ファイルも削除されること"""
    await insert_message_content(
        session_factory,
        content_id="a" * 32,
        message_id="msg-1",
        attachments=[("a.txt", "text/plain", b"hello")],
    )
    res = await client.delete("/api/messages/msg-1")
    assert res.status_code == 204
    async with session_factory() as session:
        assert (await session.execute(select(MessageContent))).first() is None
        assert (await session.execute(select(MessageContentFile))).first() is None
