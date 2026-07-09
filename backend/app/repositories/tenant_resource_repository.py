from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tenant_resource import TenantResource


class TenantResourceRepository:
    @staticmethod
    async def find_by_tenant_id(
        tenant_id: str, session: AsyncSession
    ) -> list[TenantResource]:
        """テナント内の全リソースを取得する。

        Args:
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            リソース一覧。
        """
        stmt = select(TenantResource).where(TenantResource.tenant_id == tenant_id)
        result = await session.execute(stmt)
        return list(result.scalars().all())
