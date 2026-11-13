from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import ColumnElement, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import File, FilePart, FileStatus


@dataclass(frozen=True)
class FileSearchCondition:
    """学習データ（ファイル）一覧の検索条件。

    テナント ID とインデックス ID は必須で、それ以外は指定されたものだけを
    AND 条件として絞り込みに使う。

    Attributes
    ----------
    tenant_id : str
        テナント ID。
    index_id : str
        インデックス ID。
    display_name : str | None
        表示名の部分一致（大文字小文字を区別する）。
    user_id : str | None
        登録したユーザーの ID。
    status : FileStatus | None
        ファイルの状態。
    updated_at_from : datetime | None
        更新日時の下限（この日時を含む）。
    updated_at_to : datetime | None
        更新日時の上限（この日時を含む）。
    """

    tenant_id: str
    index_id: str
    display_name: str | None = None
    user_id: str | None = None
    status: FileStatus | None = None
    updated_at_from: datetime | None = None
    updated_at_to: datetime | None = None


def _build_conditions(cond: FileSearchCondition) -> list[ColumnElement[bool]]:
    """検索条件から WHERE 句に渡す条件式の一覧を組み立てる。

    件数取得と一覧取得で同じ条件を使うため、共通化している。

    Parameters
    ----------
    cond : FileSearchCondition
        検索条件。

    Returns
    -------
    list[ColumnElement[bool]]
        AND で結合する条件式の一覧。
    """
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
    """条件に合うファイルを 1 ページ分取得し、条件に合う総件数と一緒に返す。

    Parameters
    ----------
    session : AsyncSession
        DB セッション。
    cond : FileSearchCondition
        検索条件。
    offset : int
        取得開始位置（0 始まり）。
    limit : int
        取得する最大件数。

    Returns
    -------
    tuple[list[File], int]
        取得したファイルの一覧と、ページングしない場合の総件数。
    """
    conditions = _build_conditions(cond)
    total = await session.scalar(
        select(func.count()).select_from(File).where(*conditions)
    )
    result = await session.execute(
        select(File).where(*conditions).offset(offset).limit(limit)
    )
    return list(result.scalars().all()), int(total or 0)


async def find_by_id(session: AsyncSession, file_id: str) -> File | None:
    """ID でファイルを取得する。

    Parameters
    ----------
    session : AsyncSession
        DB セッション。
    file_id : str
        ファイル ID。

    Returns
    -------
    File | None
        見つかったファイル。なければ None。
    """
    return await session.get(File, file_id)


async def find_by_id_and_index_id(
    session: AsyncSession, file_id: str, index_id: str
) -> File | None:
    """ID とインデックス ID が両方一致するファイルを取得する。

    別のインデックスのファイルを操作できないよう、インデックスで絞って探すときに使う。

    Parameters
    ----------
    session : AsyncSession
        DB セッション。
    file_id : str
        ファイル ID。
    index_id : str
        インデックス ID。

    Returns
    -------
    File | None
        見つかったファイル。なければ None。
    """
    result = await session.execute(
        select(File).where(File.id == file_id, File.index_id == index_id)
    )
    return result.scalars().first()


async def find_by_id_and_tenant_id(
    session: AsyncSession, file_id: str, tenant_id: str
) -> File | None:
    """ID とテナント ID が両方一致するファイルを取得する。

    他テナントのファイルを参照できないよう、テナントで絞って探すときに使う。

    Parameters
    ----------
    session : AsyncSession
        DB セッション。
    file_id : str
        ファイル ID。
    tenant_id : str
        テナント ID。

    Returns
    -------
    File | None
        見つかったファイル。なければ None。
    """
    result = await session.execute(
        select(File).where(File.id == file_id, File.tenant_id == tenant_id)
    )
    return result.scalars().first()


async def find_all_ids(session: AsyncSession) -> set[str]:
    """登録済みのすべてのファイル ID を取得する。

    Waha! 側のファイル一覧と突き合わせて、ローカルに未登録のファイルを
    見分けるために使う。

    Parameters
    ----------
    session : AsyncSession
        DB セッション。

    Returns
    -------
    set[str]
        ファイル ID の集合。
    """
    result = await session.execute(select(File.id))
    return set(result.scalars().all())


async def find_parts_by_file_ids(
    session: AsyncSession, file_ids: list[str]
) -> dict[str, list[FilePart]]:
    """複数ファイルのパート（Waha! 側の分割断片）をファイル ID ごとにまとめて取得する。

    一覧表示でファイルごとに問い合わせると N+1 になるため、IN 句で一括取得する。

    Parameters
    ----------
    session : AsyncSession
        DB セッション。
    file_ids : list[str]
        ファイル ID の一覧。

    Returns
    -------
    dict[str, list[FilePart]]
        ファイル ID ごとのパート一覧。パートがないファイルも空リストで含める。
    """
    grouped: dict[str, list[FilePart]] = {fid: [] for fid in file_ids}
    if not file_ids:
        return grouped
    result = await session.execute(
        select(FilePart).where(FilePart.file_id.in_(file_ids))
    )
    for part in result.scalars().all():
        grouped[part.file_id].append(part)
    return grouped
