from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import MessageContent, MessageContentFile


async def find_by_id(session: AsyncSession, content_id: str) -> MessageContent | None:
    return await session.get(MessageContent, content_id)


async def exists_by_id(session: AsyncSession, content_id: str) -> bool:
    return await session.get(MessageContent, content_id) is not None


async def file_exists_by_id(session: AsyncSession, file_id: str) -> bool:
    return await session.get(MessageContentFile, file_id) is not None


async def find_by_message_ids(
    session: AsyncSession, message_ids: list[str]
) -> list[MessageContent]:
    if not message_ids:
        return []
    result = await session.execute(
        select(MessageContent).where(MessageContent.message_id.in_(message_ids))
    )
    return list(result.scalars().all())


async def find_files_by_content_ids(
    session: AsyncSession, content_ids: list[str]
) -> dict[str, list[MessageContentFile]]:
    """添付ファイルをメッセージ内容 ID ごとにまとめて返す（N+1 を避けるため一括取得）。"""
    grouped: dict[str, list[MessageContentFile]] = {cid: [] for cid in content_ids}
    if not content_ids:
        return grouped
    result = await session.execute(
        select(MessageContentFile)
        .where(MessageContentFile.message_content_id.in_(content_ids))
        .order_by(MessageContentFile.created_at)
    )
    for file in result.scalars().all():
        grouped[file.message_content_id].append(file)
    return grouped


async def delete_by_message_id(session: AsyncSession, message_id: str) -> None:
    # 添付ファイルは外部キーの ON DELETE CASCADE で一緒に消える
    await session.execute(
        delete(MessageContent).where(MessageContent.message_id == message_id)
    )
