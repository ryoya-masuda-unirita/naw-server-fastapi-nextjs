from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.assistant import AssistantCategoryMapping
from app.models.assistant_category import AssistantCategory


class AssistantCategoryMappingRepository:
    @staticmethod
    async def find_categories_grouped_by_assistant_ids(
        assistant_ids: list[str], tenant_id: str, session: AsyncSession
    ) -> dict[str, list[AssistantCategory]]:
        """アシスタントID一覧に対して、それぞれの紐付けカテゴリ一覧を1クエリでまとめて取得する。

        アシスタントごとに個別クエリを発行するとN+1になるため、対象アシスタントID一覧に対する
        (assistant_id, AssistantCategory) の組を1クエリで取得しPython側で集約する。

        Args:
            assistant_ids: 対象のアシスタントID一覧。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            アシスタントIDをキーとしたカテゴリ一覧の辞書。
        """
        if not assistant_ids:
            return {}
        stmt = (
            select(AssistantCategoryMapping.assistant_id, AssistantCategory)
            .join(
                AssistantCategory,
                AssistantCategory.id == AssistantCategoryMapping.category_id,
            )
            .where(
                AssistantCategoryMapping.assistant_id.in_(assistant_ids),
                AssistantCategoryMapping.tenant_id == tenant_id,
            )
        )
        result = await session.execute(stmt)

        grouped: dict[str, list[AssistantCategory]] = {
            assistant_id: [] for assistant_id in assistant_ids
        }
        for assistant_id, category in result.all():
            grouped[assistant_id].append(category)
        return grouped

    @staticmethod
    async def replace_categories_for_assistant(
        assistant_id: str,
        tenant_id: str,
        category_ids: set[str],
        session: AsyncSession,
    ) -> None:
        """対象アシスタントの既存カテゴリ紐付けを全削除し、指定カテゴリ集合で置き換える。

        コミットは呼び出し側で行う。

        Args:
            assistant_id: 対象のアシスタントID。
            tenant_id: テナントID。
            category_ids: 紐付け先のカテゴリID集合（実在確認済みのものを渡すこと）。
            session: 非同期DBセッション。
        """
        await session.execute(
            delete(AssistantCategoryMapping).where(
                AssistantCategoryMapping.assistant_id == assistant_id,
                AssistantCategoryMapping.tenant_id == tenant_id,
            )
        )

        for category_id in category_ids:
            session.add(
                AssistantCategoryMapping(
                    assistant_id=assistant_id,
                    category_id=category_id,
                    tenant_id=tenant_id,
                )
            )
