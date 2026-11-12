from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import ColumnElement, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import File, FilePart, FileStatus


@dataclass(frozen=True)
class FileSearchCondition:
    tenant_id: str
    index_id: str
    display_name: str | None = None
    user_id: str | None = None
    status: FileStatus | None = None
    updated_at_from: datetime | None = None
    updated_at_to: datetime | None = None


def _build_conditions(cond: FileSearchCondition) -> list[ColumnElement[bool]]:
    conditions: list[ColumnElement[bool]] = [
        File.tenant_id == cond.tenant_id,
        File.index_id == cond.index_id,
    ]
    if cond.display_name:
        # 移植元は LIKE '%x%'（H2 では大文字小文字を区別）。SQLite の LIKE は
        # ASCII の大文字小文字を区別しないため、instr で区別する部分一致にする。
        conditions.append(func.instr(File.display_name, cond.display_name) > 0)
    if cond.user_id:
        conditions.append(File.user_id == cond.user_id)
    if cond.status is not None:
        conditions.append(File.status == int(cond.status))
    if cond.updated_at_from is not None:
        conditions.append(File.updated_at >= cond.updated_at_from)
    if cond.updated_at_to is not None:
        conditions.append(File.updated_at <= cond.updated_at_to)
    return conditions


async def search(
    session: AsyncSession, cond: FileSearchCondition, offset: int, limit: int
) -> tuple[list[File], int]:
    conditions = _build_conditions(cond)
    total = await session.scalar(
        select(func.count()).select_from(File).where(*conditions)
    )
    result = await session.execute(
        select(File).where(*conditions).offset(offset).limit(limit)
    )
    return list(result.scalars().all()), int(total or 0)


async def find_by_id(session: AsyncSession, file_id: str) -> File | None:
    return await session.get(File, file_id)


async def find_by_id_and_index_id(
    session: AsyncSession, file_id: str, index_id: str
) -> File | None:
    result = await session.execute(
        select(File).where(File.id == file_id, File.index_id == index_id)
    )
    return result.scalars().first()


async def find_by_id_and_tenant_id(
    session: AsyncSession, file_id: str, tenant_id: str
) -> File | None:
    result = await session.execute(
        select(File).where(File.id == file_id, File.tenant_id == tenant_id)
    )
    return result.scalars().first()


async def find_all_ids(session: AsyncSession) -> set[str]:
    result = await session.execute(select(File.id))
    return set(result.scalars().all())


async def find_parts_by_file_ids(
    session: AsyncSession, file_ids: list[str]
) -> dict[str, list[FilePart]]:
    grouped: dict[str, list[FilePart]] = {fid: [] for fid in file_ids}
    if not file_ids:
        return grouped
    result = await session.execute(
        select(FilePart).where(FilePart.file_id.in_(file_ids))
    )
    for part in result.scalars().all():
        grouped[part.file_id].append(part)
    return grouped
