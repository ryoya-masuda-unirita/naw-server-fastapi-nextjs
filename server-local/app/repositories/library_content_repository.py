from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import LibraryContent


async def find_by_id(session: AsyncSession, library_id: str) -> LibraryContent | None:
    return await session.get(LibraryContent, library_id)


async def delete_by_id(session: AsyncSession, library_id: str) -> None:
    # Spring Data 3 の deleteById と同じく、存在しなくても何もしない
    await session.execute(
        delete(LibraryContent).where(LibraryContent.library_id == library_id)
    )
