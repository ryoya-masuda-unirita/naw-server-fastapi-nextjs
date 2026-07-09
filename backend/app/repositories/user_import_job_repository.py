from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user_import_job import UserImportJob


class UserImportJobRepository:
    @staticmethod
    async def find_by_id_and_tenant_id(
        job_id: str, tenant_id: str, session: AsyncSession
    ) -> UserImportJob | None:
        stmt = select(UserImportJob).where(
            UserImportJob.id == job_id, UserImportJob.tenant_id == tenant_id
        )
        result = await session.execute(stmt)
        return result.scalars().first()
