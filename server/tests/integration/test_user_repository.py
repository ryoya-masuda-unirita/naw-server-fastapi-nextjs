import pytest

from app.models.tenant import Tenant
from app.repositories.user_repository import UserRepository
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.user import User


@pytest.fixture
async def other_tenant(session: AsyncSession) -> Tenant:
    """別テナント（テナント分離検証用）"""
    tenant = Tenant(id="other-tenant", name="Other Tenant", owner="admin")
    session.add(tenant)
    await session.flush()
    await session.refresh(tenant)
    return tenant


class TestFindByLoginId:
    """ログインIDによるユーザー検索のテスト。"""

    async def test_returns_user_when_found(
        self, session: AsyncSession, test_user: User, test_tenant: Tenant
    ) -> None:
        """存在するloginId・tenantIdでUserを取得できること"""
        result = await UserRepository.find_by_login_id(
            test_user.login_id, test_tenant.id, session
        )

        assert result is not None
        assert result.id == test_user.id

    async def test_returns_none_when_tenant_mismatched(
        self, session: AsyncSession, test_user: User, other_tenant: Tenant
    ) -> None:
        """存在するloginIdでも異なるtenantIdではNoneを返すこと（テナント分離）"""
        result = await UserRepository.find_by_login_id(
            test_user.login_id, other_tenant.id, session
        )

        assert result is None

    async def test_returns_none_when_not_found(
        self, session: AsyncSession, test_tenant: Tenant
    ) -> None:
        """存在しないloginIdではNoneを返すこと"""
        result = await UserRepository.find_by_login_id(
            "nonexistent", test_tenant.id, session
        )

        assert result is None
