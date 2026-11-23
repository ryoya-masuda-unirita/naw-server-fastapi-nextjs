import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.library import LibraryContent


class LibraryContentRepository:
    """ライブラリ本文（`library_contents`）のDBアクセスを行うリポジトリ。"""

    @staticmethod
    async def find_by_library_id_and_tenant_id(
        library_id: uuid.UUID, tenant_id: str, session: AsyncSession
    ) -> LibraryContent | None:
        """ライブラリIDとテナントIDで本文を取得する。

        Parameters
        ----------
        library_id : uuid.UUID
            対象のライブラリID。
        tenant_id : str
            テナントID。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        LibraryContent | None
            該当する本文。存在しない場合はNone。
        """
        stmt = select(LibraryContent).where(
            LibraryContent.library_id == library_id,
            LibraryContent.tenant_id == tenant_id,
        )
        result = await session.execute(stmt)
        return result.scalars().first()

    @staticmethod
    async def exists_by_library_id_and_tenant_id(
        library_id: uuid.UUID, tenant_id: str, session: AsyncSession
    ) -> bool:
        """ライブラリIDとテナントIDで本文が存在するかを判定する。

        Parameters
        ----------
        library_id : uuid.UUID
            対象のライブラリID。
        tenant_id : str
            テナントID。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        bool
            本文が存在する場合True。
        """
        # 存在確認だけのため、本文（大きなテキスト）は読み込まず主キーだけを取得する
        stmt = select(LibraryContent.library_id).where(
            LibraryContent.library_id == library_id,
            LibraryContent.tenant_id == tenant_id,
        )
        result = await session.execute(stmt)
        return result.first() is not None
