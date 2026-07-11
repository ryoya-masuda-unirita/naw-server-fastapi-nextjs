from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.system_prompt_template import SystemPromptTemplate


class SystemPromptTemplateRepository:
    @staticmethod
    async def find_by_type(
        type_: str, session: AsyncSession
    ) -> SystemPromptTemplate | None:
        """タイプで固定システムプロンプトを取得する。

        Args:
            type_: プロンプトの種別(例: `"LIBRARY"`)。
            session: 非同期DBセッション。

        Returns:
            該当する固定システムプロンプト。存在しない場合はNone。
        """
        stmt = select(SystemPromptTemplate).where(SystemPromptTemplate.type == type_)
        result = await session.execute(stmt)
        return result.scalars().first()
