from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.share import Share, ShareRoom


class ShareRoomRepository:
    @staticmethod
    async def find_group_ids_by_share_id(
        share_id: str, tenant_id: str, session: AsyncSession
    ) -> list[str]:
        """共有リンクIDに紐づく共有先グループID一覧を取得する。

        Args:
            share_id: 対象の共有リンクID。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            共有先グループID一覧。
        """
        stmt = select(ShareRoom.group_id).where(
            ShareRoom.share_id == share_id, ShareRoom.tenant_id == tenant_id
        )
        result = await session.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def replace_groups_for_share(
        share_id: str,
        room_id: str,
        tenant_id: str,
        group_ids: list[str],
        session: AsyncSession,
    ) -> None:
        """対象共有リンクの既存の共有先グループを全削除し、指定グループ一覧で置き換える。

        コミットは呼び出し側で行う。

        Args:
            share_id: 対象の共有リンクID。
            room_id: 共有対象のルームID。
            tenant_id: テナントID。
            group_ids: 共有先グループID一覧（実在確認済みのものを渡すこと）。
            session: 非同期DBセッション。
        """
        await session.execute(
            delete(ShareRoom).where(
                ShareRoom.share_id == share_id, ShareRoom.tenant_id == tenant_id
            )
        )
        for group_id in group_ids:
            session.add(
                ShareRoom(
                    tenant_id=tenant_id,
                    share_id=share_id,
                    room_id=room_id,
                    group_id=group_id,
                )
            )

    @staticmethod
    async def exists_shared_access(
        room_id: str, tenant_id: str, group_ids: list[str], session: AsyncSession
    ) -> bool:
        """指定ルームが、指定グループ集合のいずれかに共有されているかを判定する。

        Args:
            room_id: 対象のルームID。
            tenant_id: テナントID。
            group_ids: 判定に使うグループID一覧（アクセスしようとしているユーザーの所属グループ）。
            session: 非同期DBセッション。

        Returns:
            共有されていればTrue。
        """
        if not group_ids:
            return False
        stmt = (
            select(ShareRoom.id)
            .join(Share, Share.id == ShareRoom.share_id)
            .where(
                Share.room_id == room_id,
                ShareRoom.tenant_id == tenant_id,
                ShareRoom.group_id.in_(group_ids),
            )
        )
        result = await session.execute(stmt)
        return result.scalars().first() is not None
