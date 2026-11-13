from sqlalchemy import delete, exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.library_tag import LibraryTag


def _escape_like(value: str) -> str:
    """LIKE句のワイルドカード文字（%, _, \\）をエスケープする。

    Parameters
    ----------
    value : str
        エスケープ対象の検索文字列。

    Returns
    -------
    str
        エスケープ済みの検索文字列。
    """
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


class LibraryTagRepository:
    """ライブラリタグのDBアクセスをまとめたリポジトリ。"""

    @staticmethod
    async def exists_by_tenant_id_and_name(
        tenant_id: str, name: str, session: AsyncSession, exclude_id: str | None = None
    ) -> bool:
        """同一テナント内に同名のライブラリタグが存在するかを判定する。

        Parameters
        ----------
        tenant_id : str
            テナントID。
        name : str
            タグ名。
        session : AsyncSession
            非同期DBセッション。
        exclude_id : str | None
            判定から除外するタグID（更新時、自分自身との重複を除くため）。

        Returns
        -------
        bool
            同名のタグが存在する場合True。
        """
        conditions = [LibraryTag.tenant_id == tenant_id, LibraryTag.name == name]
        if exclude_id:
            conditions.append(LibraryTag.id != exclude_id)
        stmt = select(exists().where(*conditions))
        result = await session.execute(stmt)
        return bool(result.scalar())

    @staticmethod
    async def find_by_tenant_id_order_by_name(
        tenant_id: str, session: AsyncSession
    ) -> list[LibraryTag]:
        """テナント内のライブラリタグを名前順に全件取得する。

        Parameters
        ----------
        tenant_id : str
            テナントID。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        list[LibraryTag]
            名前順のライブラリタグ一覧。
        """
        stmt = (
            select(LibraryTag)
            .where(LibraryTag.tenant_id == tenant_id)
            .order_by(LibraryTag.name.asc())
        )
        result = await session.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def find_page(
        tenant_id: str,
        search: str | None,
        page: int,
        size: int,
        session: AsyncSession,
    ) -> tuple[list[LibraryTag], int]:
        """テナント内のライブラリタグをページング・検索付きで取得する。

        Parameters
        ----------
        tenant_id : str
            テナントID。
        search : str | None
            タグ名の部分一致検索文字列。Noneまたは空文字なら絞り込まない。
        page : int
            0始まりのページ番号。
        size : int
            1ページあたりの件数。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        tuple[list[LibraryTag], int]
            (該当ページのライブラリタグ一覧, 全体件数) のタプル。
        """
        conditions = [LibraryTag.tenant_id == tenant_id]
        if search:
            escaped = _escape_like(search.lower())
            conditions.append(
                func.lower(LibraryTag.name).like(f"%{escaped}%", escape="\\")
            )

        count_stmt = select(func.count()).select_from(LibraryTag).where(*conditions)
        total = (await session.execute(count_stmt)).scalar_one()

        stmt = (
            select(LibraryTag)
            .where(*conditions)
            .order_by(LibraryTag.name.asc())
            .offset(page * size)
            .limit(size)
        )
        result = await session.execute(stmt)
        return list(result.scalars().all()), total

    @staticmethod
    async def find_by_id_and_tenant_id(
        tag_id: str, tenant_id: str, session: AsyncSession
    ) -> LibraryTag | None:
        """IDとテナントIDでライブラリタグを取得する。

        Parameters
        ----------
        tag_id : str
            ライブラリタグID。
        tenant_id : str
            テナントID。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        LibraryTag | None
            該当するライブラリタグ。存在しない場合はNone。
        """
        stmt = select(LibraryTag).where(
            LibraryTag.id == tag_id, LibraryTag.tenant_id == tenant_id
        )
        result = await session.execute(stmt)
        return result.scalars().first()

    @staticmethod
    async def find_by_tenant_id_and_ids(
        tenant_id: str, ids: list[str], session: AsyncSession
    ) -> list[LibraryTag]:
        """テナントIDとID一覧に合致するライブラリタグを取得する。存在しないIDは無視される。

        Parameters
        ----------
        tenant_id : str
            テナントID。
        ids : list[str]
            対象のライブラリタグID一覧。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        list[LibraryTag]
            該当するライブラリタグ一覧。
        """
        if not ids:
            return []
        stmt = select(LibraryTag).where(
            LibraryTag.tenant_id == tenant_id, LibraryTag.id.in_(ids)
        )
        result = await session.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def create(tag: LibraryTag, session: AsyncSession) -> LibraryTag:
        """ライブラリタグを新規作成する。

        Parameters
        ----------
        tag : LibraryTag
            作成するライブラリタグ。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        LibraryTag
            作成したライブラリタグ。
        """
        session.add(tag)
        await session.commit()
        await session.refresh(tag)
        return tag

    @staticmethod
    async def update(tag: LibraryTag, session: AsyncSession) -> LibraryTag:
        """ライブラリタグを更新する。

        Parameters
        ----------
        tag : LibraryTag
            更新するライブラリタグ。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        LibraryTag
            更新後のライブラリタグ。
        """
        session.add(tag)
        await session.commit()
        await session.refresh(tag)
        return tag

    @staticmethod
    async def delete_by_tenant_id_and_ids(
        tenant_id: str, ids: list[str], session: AsyncSession
    ) -> None:
        """テナントIDとID一覧に合致するライブラリタグを一括削除する。存在しないIDは無視される。

        Parameters
        ----------
        tenant_id : str
            テナントID。
        ids : list[str]
            削除対象のライブラリタグID一覧。
        session : AsyncSession
            非同期DBセッション。
        """
        if not ids:
            return
        stmt = delete(LibraryTag).where(
            LibraryTag.tenant_id == tenant_id, LibraryTag.id.in_(ids)
        )
        await session.execute(stmt)
        await session.commit()
