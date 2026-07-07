from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.assistant_category import AssistantCategory


class AssistantCategoryRepository:
    @staticmethod
    async def create(
        category: AssistantCategory, session: AsyncSession
    ) -> AssistantCategory:
        """アシスタントカテゴリを新規作成する。

        Args:
            category: 作成するアシスタントカテゴリ。
            session: 非同期DBセッション。

        Returns:
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

        Args:
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
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

        Args:
            category_id: アシスタントカテゴリID。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
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

        Args:
            category: 更新するアシスタントカテゴリ。
            session: 非同期DBセッション。

        Returns:
            更新後のアシスタントカテゴリ。
        """
        session.add(category)
        await session.commit()
        await session.refresh(category)
        return category

    @staticmethod
    async def delete(category: AssistantCategory, session: AsyncSession) -> None:
        """アシスタントカテゴリを削除する。

        Args:
            category: 削除するアシスタントカテゴリ。
            session: 非同期DBセッション。
        """
        await session.delete(category)
        await session.commit()
