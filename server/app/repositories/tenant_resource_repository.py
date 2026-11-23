from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tenant_resource import TenantResource


class TenantResourceRepository:
    """テナントリソースのDBアクセスをまとめたリポジトリ。"""

    @staticmethod
    async def find_by_tenant_id(
        tenant_id: str, session: AsyncSession
    ) -> list[TenantResource]:
        """テナント内の全リソースを取得する。

        Parameters
        ----------
        tenant_id : str
            テナントID。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        list[TenantResource]
            リソース一覧。
        """
        stmt = select(TenantResource).where(TenantResource.tenant_id == tenant_id)
        result = await session.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def find_by_id_and_tenant_id(
        resource_id: str, tenant_id: str, session: AsyncSession
    ) -> TenantResource | None:
        """リソースIDとテナントIDの組み合わせでリソースを取得する。

        移植元Java版`TenantService.queryCost`の`tenant.getResources().stream()
        .anyMatch(...)`（線形検索によるテナント⇔リソースの紐付けチェック）に相当する
        処理を、1クエリでの絞り込みに置き換える。

        Parameters
        ----------
        resource_id : str
            リソースID。
        tenant_id : str
            テナントID。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        TenantResource | None
            該当リソース。指定テナントに紐づくリソースが存在しない場合はNone。
        """
        stmt = select(TenantResource).where(
            TenantResource.id == resource_id,
            TenantResource.tenant_id == tenant_id,
        )
        result = await session.execute(stmt)
        return result.scalars().first()
