import json
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models import MessageContent, MessageContentFile


def multipart_files(
    text_data: dict[str, Any],
    attachments: list[tuple[str, bytes, str]] | None = None,
    history_attachments: list[tuple[str, bytes, str]] | None = None,
) -> list[tuple[str, tuple[str, bytes, str]]]:
    """ブラウザと同じく textData を application/json の Blob として送る multipart。"""
    files: list[tuple[str, tuple[str, bytes, str]]] = [
        (
            "textData",
            ("blob", json.dumps(text_data).encode("utf-8"), "application/json"),
        )
    ]
    for name, data, content_type in attachments or []:
        files.append(("attachmentFiles", (name, data, content_type)))
    for name, data, content_type in history_attachments or []:
        files.append(("historyAttachmentFiles", (name, data, content_type)))
    return files


async def insert_message_content(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    content_id: str,
    message_id: str,
    answer: str = "既存の回答",
    file_paths: str | None = None,
    attachments: list[tuple[str, str, bytes]] | None = None,
) -> None:
    async with session_factory() as session:
        session.add(
            MessageContent(
                id=content_id,
                message_id=message_id,
                status="OK",
                question="既存の質問",
                answer=answer,
                context="既存のコンテキスト",
                file_paths=file_paths,
            )
        )
        await session.flush()
        for index, (name, content_type, data) in enumerate(attachments or []):
            session.add(
                MessageContentFile(
                    id=f"{content_id[:28]}f{index:03d}",
                    message_content_id=content_id,
                    name=name,
                    type=content_type,
                    data=data,
                )
            )
        await session.commit()


def parse_sse(body: str) -> list[dict[str, Any]]:
    """`data:{json}` + 空行の SSE を JSON のリストにする。"""
    events: list[dict[str, Any]] = []
    for block in body.split("\n\n"):
        if not block:
            continue
        assert block.startswith("data:"), block
        assert not block.startswith("data: "), "data: の後ろに空白を入れない"
        events.append(json.loads(block[len("data:") :]))
    return events
