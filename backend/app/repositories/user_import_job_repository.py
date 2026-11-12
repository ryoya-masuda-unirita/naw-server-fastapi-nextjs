from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user_import_job import UserImportJob


class UserImportJobRepository:
    @staticmethod
    async def find_by_id(job_id: str, session: AsyncSession) -> UserImportJob | None:
        """ジョブIDのみでインポートジョブを取得する。

        テナントIDの一致検証自体を呼び出し側（キュー受信処理）で行うために、
        テナントIDでは絞り込まない。

        Args:
            job_id: インポートジョブID。
            session: 非同期DBセッション。

        Returns:
            該当する UserImportJob。存在しない場合は None。
        """
        stmt = select(UserImportJob).where(UserImportJob.id == job_id)
        result = await session.execute(stmt)
        return result.scalars().first()

    @staticmethod
    async def find_by_id_and_tenant_id(
        job_id: str, tenant_id: str, session: AsyncSession
    ) -> UserImportJob | None:
        stmt = select(UserImportJob).where(
            UserImportJob.id == job_id, UserImportJob.tenant_id == tenant_id
        )
        result = await session.execute(stmt)
        return result.scalars().first()
