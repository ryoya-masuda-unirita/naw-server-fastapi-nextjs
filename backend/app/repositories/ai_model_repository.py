from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_model import AIModel


class AIModelRepository:
    @staticmethod
    async def find_all(session: AsyncSession) -> list[AIModel]:
        """AIモデルを全件取得する。

        Args:
            session: 非同期DBセッション。

        Returns:
            AIモデル一覧。
        """
        stmt = select(AIModel)
        result = await session.execute(stmt)
        return list(result.scalars().all())
