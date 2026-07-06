from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tenant_endpoint import EndpointType, TenantEndpoint


class TenantEndpointRepository:

    @staticmethod
    async def find_by_tenant_id(tenant_id: str, session: AsyncSession) -> list[TenantEndpoint]:
        """テナント内の全エンドポイントを取得する。

        Args:
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            エンドポイント一覧。
        """
        stmt = select(TenantEndpoint).where(TenantEndpoint.tenant_id == tenant_id)
        result = await session.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def find_by_tenant_id_and_type(
        tenant_id: str, endpoint_type: EndpointType, session: AsyncSession
    ) -> list[TenantEndpoint]:
        """テナント内の指定タイプのエンドポイントを取得する。

        Args:
            tenant_id: テナントID。
            endpoint_type: エンドポイントタイプ。
            session: 非同期DBセッション。

        Returns:
            エンドポイント一覧。
        """
        stmt = select(TenantEndpoint).where(
            TenantEndpoint.tenant_id == tenant_id, TenantEndpoint.type == endpoint_type
        )
        result = await session.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def find_by_id_and_tenant_id(
        endpoint_id: str, tenant_id: str, session: AsyncSession
    ) -> TenantEndpoint | None:
        """エンドポイントIDとテナントIDでエンドポイントを取得する。

        Args:
            endpoint_id: エンドポイントID。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            該当する TenantEndpoint。存在しない場合は None。
        """
        stmt = select(TenantEndpoint).where(
            TenantEndpoint.id == endpoint_id, TenantEndpoint.tenant_id == tenant_id
        )
        result = await session.execute(stmt)
        return result.scalars().first()

    @staticmethod
    async def delete(endpoint: TenantEndpoint, session: AsyncSession) -> None:
        """エンドポイントを削除する。

        Args:
            endpoint: 削除対象の TenantEndpoint。
            session: 非同期DBセッション。
        """
        await session.delete(endpoint)
        await session.commit()
