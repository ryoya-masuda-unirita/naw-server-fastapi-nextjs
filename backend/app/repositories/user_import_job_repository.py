from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user_import_job import UserImportJob


class UserImportJobRepository:
    """ユーザーインポートジョブのDBアクセスをまとめたリポジトリ。"""

    @staticmethod
    async def find_by_id(job_id: str, session: AsyncSession) -> UserImportJob | None:
        """ジョブIDのみでインポートジョブを取得する。

        テナントIDの一致検証自体を呼び出し側（キュー受信処理）で行うために、
        テナントIDでは絞り込まない。

        Parameters
        ----------
        job_id : str
            インポートジョブID。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        UserImportJob | None
            該当する UserImportJob。存在しない場合は None。
        """
        stmt = select(UserImportJob).where(UserImportJob.id == job_id)
        result = await session.execute(stmt)
        return result.scalars().first()

    @staticmethod
    async def find_by_id_and_tenant_id(
        job_id: str, tenant_id: str, session: AsyncSession
    ) -> UserImportJob | None:
        """IDとテナントIDでユーザーインポートジョブを取得する。

        Parameters
        ----------
        job_id : str
            ユーザーインポートジョブのID。
        tenant_id : str
            テナントID。
        session : AsyncSession
            データベースセッション。

        Returns
        -------
        UserImportJob | None
            該当するジョブ。なければ None。
        """
        stmt = select(UserImportJob).where(
            UserImportJob.id == job_id, UserImportJob.tenant_id == tenant_id
        )
        result = await session.execute(stmt)
        return result.scalars().first()
