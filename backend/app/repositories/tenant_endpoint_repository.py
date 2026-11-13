from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tenant_endpoint import EndpointType, TenantEndpoint


class TenantEndpointRepository:
    """テナントエンドポイントのDBアクセスをまとめたリポジトリ。"""

    @staticmethod
    async def find_by_tenant_id(
        tenant_id: str, session: AsyncSession
    ) -> list[TenantEndpoint]:
        """テナント内の全エンドポイントを取得する。

        Parameters
        ----------
        tenant_id : str
            テナントID。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        list[TenantEndpoint]
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

        Parameters
        ----------
        tenant_id : str
            テナントID。
        endpoint_type : EndpointType
            エンドポイントタイプ。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        list[TenantEndpoint]
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

        Parameters
        ----------
        endpoint_id : str
            エンドポイントID。
        tenant_id : str
            テナントID。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        TenantEndpoint | None
            該当する TenantEndpoint。存在しない場合は None。
        """
        stmt = select(TenantEndpoint).where(
            TenantEndpoint.id == endpoint_id, TenantEndpoint.tenant_id == tenant_id
        )
        result = await session.execute(stmt)
        return result.scalars().first()

    @staticmethod
    async def find_by_ids_and_tenant_id(
        ids: list[str], tenant_id: str, session: AsyncSession
    ) -> list[TenantEndpoint]:
        """エンドポイントID一覧とテナントIDでエンドポイントを取得する。

        Parameters
        ----------
        ids : list[str]
            取得対象のエンドポイントID一覧。
        tenant_id : str
            テナントID。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        list[TenantEndpoint]
            該当するエンドポイント一覧。
        """
        if not ids:
            return []
        stmt = select(TenantEndpoint).where(
            TenantEndpoint.id.in_(ids), TenantEndpoint.tenant_id == tenant_id
        )
        result = await session.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def delete(endpoint: TenantEndpoint, session: AsyncSession) -> None:
        """エンドポイントを削除する。

        Parameters
        ----------
        endpoint : TenantEndpoint
            削除対象の TenantEndpoint。
        session : AsyncSession
            非同期DBセッション。
        """
        await session.delete(endpoint)
        await session.commit()
