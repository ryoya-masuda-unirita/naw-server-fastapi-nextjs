from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.assistant import Assistant


class AssistantRepository:
    @staticmethod
    async def find_by_ids_and_tenant_id(
        assistant_ids: list[str], tenant_id: str, session: AsyncSession
    ) -> list[Assistant]:
        """アシスタントID一覧とテナントIDでアシスタントを取得する。

        Args:
            assistant_ids: 取得対象のアシスタントID一覧。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            アシスタント一覧。
        """
        if not assistant_ids:
            return []
        stmt = select(Assistant).where(
            Assistant.id.in_(assistant_ids), Assistant.tenant_id == tenant_id
        )
        result = await session.execute(stmt)
        return list(result.scalars().all())
