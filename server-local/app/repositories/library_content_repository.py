from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import LibraryContent


async def find_by_id(session: AsyncSession, library_id: str) -> LibraryContent | None:
    """ライブラリ ID でライブラリ本文を取得する。

    Parameters
    ----------
    session : AsyncSession
        DB セッション。
    library_id : str
        ライブラリ ID。

    Returns
    -------
    LibraryContent | None
        見つかったライブラリ本文。なければ None。
    """
    return await session.get(LibraryContent, library_id)


async def delete_by_id(session: AsyncSession, library_id: str) -> None:
    """ライブラリ ID でライブラリ本文を削除する。

    Spring Data 3 の deleteById と同じく、存在しなくても例外にせず何もしない。
    コミットは呼び出し側で行う。

    Parameters
    ----------
    session : AsyncSession
        DB セッション。
    library_id : str
        ライブラリ ID。
    """
    # Spring Data 3 の deleteById と同じく、存在しなくても何もしない
    await session.execute(
        delete(LibraryContent).where(LibraryContent.library_id == library_id)
    )
