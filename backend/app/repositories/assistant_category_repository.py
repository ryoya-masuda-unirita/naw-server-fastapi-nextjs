from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.assistant_category import AssistantCategory


class AssistantCategoryRepository:
    """アシスタントカテゴリのDBアクセスを行うリポジトリ。"""

    @staticmethod
    async def find_by_tenant_id_and_ids(
        tenant_id: str, ids: list[str], session: AsyncSession
    ) -> list[AssistantCategory]:
        """テナントIDとカテゴリID一覧に合致するアシスタントカテゴリを取得する。

        存在しないIDは無視される。

        Parameters
        ----------
        tenant_id : str
            テナントID。
        ids : list[str]
            対象のアシスタントカテゴリID一覧。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        list[AssistantCategory]
            該当するアシスタントカテゴリ一覧。
        """
        if not ids:
            return []
        stmt = select(AssistantCategory).where(
            AssistantCategory.tenant_id == tenant_id, AssistantCategory.id.in_(ids)
        )
        result = await session.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def create(
        category: AssistantCategory, session: AsyncSession
    ) -> AssistantCategory:
        """アシスタントカテゴリを新規作成する。

        Parameters
        ----------
        category : AssistantCategory
            作成するアシスタントカテゴリ。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        AssistantCategory
            作成したアシスタントカテゴリ。
        """
        session.add(category)
        await session.commit()
        await session.refresh(category)
        return category

    @staticmethod
    async def find_by_tenant_id(
        tenant_id: str, session: AsyncSession
    ) -> list[AssistantCategory]:
        """テナントIDに紐づく全てのアシスタントカテゴリを取得する。

        Parameters
        ----------
        tenant_id : str
            テナントID。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        list[AssistantCategory]
            アシスタントカテゴリ一覧。
        """
        stmt = select(AssistantCategory).where(AssistantCategory.tenant_id == tenant_id)
        result = await session.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def find_by_id_and_tenant_id(
        category_id: str, tenant_id: str, session: AsyncSession
    ) -> AssistantCategory | None:
        """IDとテナントIDでアシスタントカテゴリを取得する。

        Parameters
        ----------
        category_id : str
            アシスタントカテゴリID。
        tenant_id : str
            テナントID。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        AssistantCategory | None
            該当するアシスタントカテゴリ。存在しない場合はNone。
        """
        stmt = select(AssistantCategory).where(
            AssistantCategory.id == category_id,
            AssistantCategory.tenant_id == tenant_id,
        )
        result = await session.execute(stmt)
        return result.scalars().first()

    @staticmethod
    async def update(
        category: AssistantCategory, session: AsyncSession
    ) -> AssistantCategory:
        """アシスタントカテゴリを更新する。

        Parameters
        ----------
        category : AssistantCategory
            更新するアシスタントカテゴリ。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        AssistantCategory
            更新後のアシスタントカテゴリ。
        """
        session.add(category)
        await session.commit()
        await session.refresh(category)
        return category

    @staticmethod
    async def delete(category: AssistantCategory, session: AsyncSession) -> None:
        """アシスタントカテゴリを削除する。

        Parameters
        ----------
        category : AssistantCategory
            削除するアシスタントカテゴリ。
        session : AsyncSession
            非同期DBセッション。
        """
        await session.delete(category)
        await session.commit()
