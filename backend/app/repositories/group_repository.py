from collections.abc import Sequence
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.search import escape_like_pattern
from app.core.sort import SortOrder, build_order_by
from app.models.group import Group

_SORT_COLUMNS: dict[str, Any] = {
    "name": Group.name,
    "updatedAt": Group.updated_at,
}


class GroupRepository:
    """グループのDBアクセスをまとめたリポジトリ。"""

    @staticmethod
    async def find_by_id_and_tenant_id(
        group_id: str, tenant_id: str, session: AsyncSession
    ) -> Group | None:
        """グループIDとテナントIDでグループを取得する。

        Parameters
        ----------
        group_id : str
            グループID。
        tenant_id : str
            テナントID。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        Group | None
            該当する Group。存在しない場合は None。
        """
        stmt = select(Group).where(Group.id == group_id, Group.tenant_id == tenant_id)
        result = await session.execute(stmt)
        return result.scalars().first()

    @staticmethod
    async def find_by_tenant_id_and_ids(
        tenant_id: str, ids: list[str], session: AsyncSession
    ) -> list[Group]:
        """テナントIDとグループID一覧に合致するグループを取得する。存在しないIDは無視される。

        Parameters
        ----------
        tenant_id : str
            テナントID。
        ids : list[str]
            対象のグループID一覧。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        list[Group]
            該当するグループ一覧。
        """
        if not ids:
            return []
        stmt = select(Group).where(Group.tenant_id == tenant_id, Group.id.in_(ids))
        result = await session.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def find_all_by_tenant_ordered_by_name(
        tenant_id: str, session: AsyncSession
    ) -> list[Group]:
        """テナント内の全グループを名前昇順で取得する（isBelonged=false用）。

        Parameters
        ----------
        tenant_id : str
            テナントID。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        list[Group]
            グループ一覧。
        """
        stmt = (
            select(Group).where(Group.tenant_id == tenant_id).order_by(Group.name.asc())
        )
        result = await session.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def find_page(
        tenant_id: str,
        name_search: str | None,
        allowed_group_ids: list[str] | None,
        sort: Sequence[SortOrder],
        page: int,
        size: int,
        session: AsyncSession,
    ) -> tuple[list[Group], int]:
        """グループ一覧をページネーションで取得する。

        Parameters
        ----------
        tenant_id : str
            テナントID。
        name_search : str | None
            グループ名の部分一致検索文字列。
        allowed_group_ids : list[str] | None
            絞り込み対象のグループID一覧（グループ管理者が非テナント管理者の場合に指定）。
            Noneの場合は絞り込みなし。
        sort : Sequence[SortOrder]
            並べ替え指定の並び（キーは"name"・"updatedAt"。それ以外はグループ名順）。
        page : int
            ページ番号（0始まり）。
        size : int
            1ページあたりの件数。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        tuple[list[Group], int]
            (グループ一覧, 総件数) のタプル。
        """
        stmt = select(Group).where(Group.tenant_id == tenant_id)

        if allowed_group_ids is not None:
            if not allowed_group_ids:
                return [], 0
            stmt = stmt.where(Group.id.in_(allowed_group_ids))

        if name_search:
            pattern = escape_like_pattern(name_search.lower())
            stmt = stmt.where(func.lower(Group.name).like(pattern, escape="\\"))

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await session.execute(count_stmt)).scalar() or 0

        # 同名・同時刻のグループの並びが不定にならないよう、IDを最終キーにする
        stmt = stmt.order_by(
            *build_order_by(
                sort, _SORT_COLUMNS, fallback=Group.name, tie_breaker=Group.id
            )
        )
        stmt = stmt.offset(page * size).limit(size)

        groups = (await session.execute(stmt)).scalars().all()
        return list(groups), total

    @staticmethod
    async def delete(group: Group, session: AsyncSession) -> None:
        """グループを削除する。所属ユーザー（groups_users）はDBのON DELETE CASCADEで連動削除される。

        Parameters
        ----------
        group : Group
            削除対象のGroup。
        session : AsyncSession
            非同期DBセッション。
        """
        await session.delete(group)
        await session.commit()
