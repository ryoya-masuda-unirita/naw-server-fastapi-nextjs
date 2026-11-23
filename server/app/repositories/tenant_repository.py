from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tenant import Tenant


class TenantRepository:
    """テナントのDBアクセスをまとめたリポジトリ。"""

    @staticmethod
    async def find_by_id(tenant_id: str, session: AsyncSession) -> Tenant | None:
        """テナントIDでテナントを取得する。

        Parameters
        ----------
        tenant_id : str
            テナントID。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        Tenant | None
            該当する Tenant。存在しない場合は None。
        """
        stmt = select(Tenant).where(Tenant.id == tenant_id)
        result = await session.execute(stmt)
        return result.scalars().first()

    @staticmethod
    async def update(tenant: Tenant, session: AsyncSession) -> Tenant:
        """テナントの変更を永続化する。

        Parameters
        ----------
        tenant : Tenant
            更新対象の Tenant（属性は呼び出し側で変更済み）。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        Tenant
            更新後の Tenant。
        """
        session.add(tenant)
        await session.commit()
        await session.refresh(tenant)
        return tenant
