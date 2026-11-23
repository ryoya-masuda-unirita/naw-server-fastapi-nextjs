from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import EntityNotFoundError
from app.models import LibraryContent
from app.repositories import library_content_repository


async def get_content(session: AsyncSession, library_id: str) -> str:
    """生成済みライブラリの本文を取得する。

    Parameters
    ----------
    session : AsyncSession
        DB セッション。
    library_id : str
        ライブラリ ID。

    Returns
    -------
    str
        ライブラリ本文。

    Raises
    ------
    EntityNotFoundError
        ライブラリ本文が登録されていない場合。
    """
    entity = await library_content_repository.find_by_id(session, library_id)
    if entity is None:
        raise EntityNotFoundError("対象データが見つかりません")
    return entity.content


async def save_content(
    session: AsyncSession, library_id: str, content: str | None
) -> None:
    """ライブラリ本文を登録し、既にあれば上書きして更新日時を進める。

    本文が None の場合は空文字列として保存する（列は NOT NULL のため）。

    Parameters
    ----------
    session : AsyncSession
        DB セッション。
    library_id : str
        ライブラリ ID。
    content : str | None
        保存する本文。
    """
    entity = await library_content_repository.find_by_id(session, library_id)
    if entity is None:
        entity = LibraryContent(library_id=library_id, content=content or "")
        session.add(entity)
    else:
        entity.content = content or ""
        entity.touch()
    await session.commit()


async def delete_content(session: AsyncSession, library_id: str) -> None:
    """ライブラリ本文を削除してコミットする。

    存在しない ID を指定してもエラーにしない（移植元 deleteById と同じ）。

    Parameters
    ----------
    session : AsyncSession
        DB セッション。
    library_id : str
        ライブラリ ID。
    """
    await library_content_repository.delete_by_id(session, library_id)
    await session.commit()
