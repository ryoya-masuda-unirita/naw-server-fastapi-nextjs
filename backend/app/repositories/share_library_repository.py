import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.group import Group
from app.models.library import ShareLibrary


class ShareLibraryRepository:
    @staticmethod
    async def find_groups_grouped_by_library_ids(
        library_ids: list[uuid.UUID], tenant_id: str, session: AsyncSession
    ) -> dict[uuid.UUID, list[tuple[str, str]]]:
        """ライブラリID一覧に対して、それぞれの共有先グループ(id, name)一覧を1クエリでまとめて取得する。

        ライブラリごとに個別クエリを発行するとN+1になるため、対象ライブラリID一覧に対する
        (library_id, group_id, group_name) の組を1クエリで取得しPython側で集約する。

        Args:
            library_ids: 対象のライブラリID一覧。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            ライブラリIDをキーとした (グループID, グループ名) 一覧の辞書。
        """
        if not library_ids:
            return {}
        stmt = (
            select(ShareLibrary.library_id, Group.id, Group.name)
            .join(Group, Group.id == ShareLibrary.group_id)
            .where(
                ShareLibrary.library_id.in_(library_ids),
                ShareLibrary.tenant_id == tenant_id,
            )
        )
        result = await session.execute(stmt)

        grouped: dict[uuid.UUID, list[tuple[str, str]]] = {
            library_id: [] for library_id in library_ids
        }
        for library_id, group_id, group_name in result.all():
            grouped[library_id].append((group_id, group_name))
        return grouped

    @staticmethod
    async def replace_groups_for_library(
        library_id: uuid.UUID,
        tenant_id: str,
        group_ids: list[str],
        session: AsyncSession,
    ) -> None:
        """対象ライブラリの既存の共有先グループを全削除し、指定グループ一覧で置き換える。

        コミットは呼び出し側で行う。

        Args:
            library_id: 対象のライブラリID。
            tenant_id: テナントID。
            group_ids: 共有先グループID一覧（実在確認済みのものを渡すこと）。
            session: 非同期DBセッション。
        """
        await session.execute(
            delete(ShareLibrary).where(
                ShareLibrary.library_id == library_id,
                ShareLibrary.tenant_id == tenant_id,
            )
        )
        for group_id in group_ids:
            session.add(
                ShareLibrary(
                    tenant_id=tenant_id, library_id=library_id, group_id=group_id
                )
            )
