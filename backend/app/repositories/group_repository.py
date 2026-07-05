from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.group import Group


class GroupRepository:

    @staticmethod
    async def find_by_id_and_tenant_id(group_id: str, tenant_id: str, session: AsyncSession) -> Group | None:
        """グループIDとテナントIDでグループを取得する。

        Args:
            group_id: グループID。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            該当する Group。存在しない場合は None。
        """
        stmt = select(Group).where(Group.id == group_id, Group.tenant_id == tenant_id)
        result = await session.execute(stmt)
        return result.scalars().first()

    @staticmethod
    async def find_all_by_tenant_ordered_by_name(tenant_id: str, session: AsyncSession) -> list[Group]:
        """テナント内の全グループを名前昇順で取得する（isBelonged=false用）。

        Args:
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            グループ一覧。
        """
        stmt = select(Group).where(Group.tenant_id == tenant_id).order_by(Group.name.asc())
        result = await session.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def find_page(
        tenant_id: str,
        name_search: str | None,
        allowed_group_ids: list[str] | None,
        sort_col_name: str,
        sort_dir: str,
        page: int,
        size: int,
        session: AsyncSession,
    ) -> tuple[list[Group], int]:
        """グループ一覧をページネーションで取得する。

        Args:
            tenant_id: テナントID。
            name_search: グループ名の部分一致検索文字列。
            allowed_group_ids: 絞り込み対象のグループID一覧（グループ管理者が非テナント管理者の場合に指定）。
                Noneの場合は絞り込みなし。
            sort_col_name: ソート対象列名（"name" または "updatedAt"）。
            sort_dir: ソート方向（"asc" または "desc"）。
            page: ページ番号（0始まり）。
            size: 1ページあたりの件数。
            session: 非同期DBセッション。

        Returns:
            (グループ一覧, 総件数) のタプル。
        """
        stmt = select(Group).where(Group.tenant_id == tenant_id)

        if allowed_group_ids is not None:
            if not allowed_group_ids:
                return [], 0
            stmt = stmt.where(Group.id.in_(allowed_group_ids))

        if name_search:
            pattern = f"%{name_search.lower()}%"
            stmt = stmt.where(func.lower(Group.name).like(pattern))

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await session.execute(count_stmt)).scalar() or 0

        sort_col = Group.updated_at if sort_col_name == "updatedAt" else Group.name
        stmt = stmt.order_by(sort_col.desc() if sort_dir == "desc" else sort_col.asc())
        stmt = stmt.offset(page * size).limit(size)

        groups = (await session.execute(stmt)).scalars().all()
        return list(groups), total

    @staticmethod
    async def delete(group: Group, session: AsyncSession) -> None:
        """グループを削除する。所属ユーザー（groups_users）はDBのON DELETE CASCADEで連動削除される。

        Args:
            group: 削除対象のGroup。
            session: 非同期DBセッション。
        """
        await session.delete(group)
        await session.commit()
