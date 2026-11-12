from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import EntityNotFoundError
from app.models import LibraryContent
from app.repositories import library_content_repository


async def get_content(session: AsyncSession, library_id: str) -> str:
    entity = await library_content_repository.find_by_id(session, library_id)
    if entity is None:
        raise EntityNotFoundError("対象データが見つかりません")
    return entity.content


async def save_content(
    session: AsyncSession, library_id: str, content: str | None
) -> None:
    entity = await library_content_repository.find_by_id(session, library_id)
    if entity is None:
        entity = LibraryContent(library_id=library_id, content=content or "")
        session.add(entity)
    else:
        entity.content = content or ""
        entity.touch()
    await session.commit()


async def delete_content(session: AsyncSession, library_id: str) -> None:
    await library_content_repository.delete_by_id(session, library_id)
    await session.commit()
