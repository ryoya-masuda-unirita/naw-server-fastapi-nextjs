from app.repositories.tenant_repository import TenantRepository
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.tenant import Tenant


class TestFindById:
    """テナントIDによるテナント検索のテスト。"""

    async def test_returns_tenant_when_found(
        self, session: AsyncSession, test_tenant: Tenant
    ) -> None:
        """存在するtenantIdでTenantを取得できること"""
        result = await TenantRepository.find_by_id(test_tenant.id, session)

        assert result is not None
        assert result.id == test_tenant.id

    async def test_returns_none_when_not_found(self, session: AsyncSession) -> None:
        """存在しないtenantIdではNoneを返すこと"""
        result = await TenantRepository.find_by_id("nonexistent-tenant", session)

        assert result is None
