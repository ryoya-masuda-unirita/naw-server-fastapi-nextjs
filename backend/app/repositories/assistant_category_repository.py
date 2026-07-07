from sqlalchemy import exists, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.assistant_category import AssistantCategory


class AssistantCategoryRepository:
    @staticmethod
    async def exists_by_tenant_id_and_name(
        tenant_id: str, name: str, session: AsyncSession, exclude_id: str | None = None
    ) -> bool:
        """同一テナント内に同名のアシスタントカテゴリが存在するかを判定する。

        Args:
            tenant_id: テナントID。
            name: カテゴリ名。
            session: 非同期DBセッション。
            exclude_id: 判定から除外するカテゴリID（更新時、自分自身との重複を除くため）。

        Returns:
            同名のカテゴリが存在する場合True。
        """
        conditions = [
            AssistantCategory.tenant_id == tenant_id,
            AssistantCategory.name == name,
        ]
        if exclude_id:
            conditions.append(AssistantCategory.id != exclude_id)
        stmt = select(exists().where(*conditions))
        result = await session.execute(stmt)
        return bool(result.scalar())

    @staticmethod
    async def find_by_tenant_id_and_ids(
        tenant_id: str, ids: list[str], session: AsyncSession
    ) -> list[AssistantCategory]:
        """テナントIDとカテゴリID一覧に合致するアシスタントカテゴリを取得する。存在しないIDは無視される。

        Args:
            tenant_id: テナントID。
            ids: 対象のアシスタントカテゴリID一覧。
            session: 非同期DBセッション。

        Returns:
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
