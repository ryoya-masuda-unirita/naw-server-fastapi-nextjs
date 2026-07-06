from app.repositories.tenant_repository import TenantRepository


class TestFindById:
    async def test_returns_tenant_when_found(self, session, test_tenant):
        """存在するtenantIdでTenantを取得できること"""
        result = await TenantRepository.find_by_id(test_tenant.id, session)

        assert result is not None
        assert result.id == test_tenant.id

    async def test_returns_none_when_not_found(self, session):
        """存在しないtenantIdではNoneを返すこと"""
        result = await TenantRepository.find_by_id("nonexistent-tenant", session)

        assert result is None
