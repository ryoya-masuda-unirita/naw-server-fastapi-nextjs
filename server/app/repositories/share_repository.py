from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.share import Share


class ShareRepository:
    """共有のDBアクセスをまとめたリポジトリ。"""

    @staticmethod
    async def find_by_room_id(
        room_id: str, tenant_id: str, session: AsyncSession
    ) -> Share | None:
        """ルームIDに対応する共有リンクを取得する。

        Parameters
        ----------
        room_id : str
            対象のルームID。
        tenant_id : str
            テナントID。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        Share | None
            該当する共有リンク。存在しない場合はNone。
        """
        stmt = select(Share).where(
            Share.room_id == room_id, Share.tenant_id == tenant_id
        )
        result = await session.execute(stmt)
        return result.scalars().first()

    @staticmethod
    async def find_by_id_and_tenant_id(
        share_id: str, tenant_id: str, session: AsyncSession
    ) -> Share | None:
        """共有リンクIDとテナントIDで共有リンクを取得する。

        Parameters
        ----------
        share_id : str
            対象の共有リンクID。
        tenant_id : str
            テナントID。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        Share | None
            該当する共有リンク。存在しない場合はNone。
        """
        stmt = select(Share).where(Share.id == share_id, Share.tenant_id == tenant_id)
        result = await session.execute(stmt)
        return result.scalars().first()

    @staticmethod
    async def save(share: Share, session: AsyncSession) -> Share:
        """共有リンクをセッションに登録し、IDを確定させる。

        コミットは呼び出し側で行う（共有先グループの置き換えとあわせて
        1トランザクションでコミットするため）。

        Parameters
        ----------
        share : Share
            保存対象の共有リンク（新規または既存インスタンス）。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        Share
            IDが確定した共有リンク。
        """
        session.add(share)
        await session.flush()
        return share

    @staticmethod
    async def delete(share: Share, session: AsyncSession) -> None:
        """共有リンクを削除する。

        Parameters
        ----------
        share : Share
            削除対象の共有リンク。
        session : AsyncSession
            非同期DBセッション。
        """
        await session.delete(share)
        await session.commit()
