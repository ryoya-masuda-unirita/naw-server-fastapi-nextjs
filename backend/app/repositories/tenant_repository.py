from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tenant import Tenant


class TenantRepository:
    @staticmethod
    async def find_by_id(tenant_id: str, session: AsyncSession) -> Tenant | None:
        """テナントIDでテナントを取得する。

        Args:
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            該当する Tenant。存在しない場合は None。
        """
        stmt = select(Tenant).where(Tenant.id == tenant_id)
        result = await session.execute(stmt)
        return result.scalars().first()
