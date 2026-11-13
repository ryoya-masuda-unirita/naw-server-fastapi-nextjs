from datetime import datetime

from pydantic import BaseModel

from app.models.user_import_job import UserImportJob, UserImportJobStatus


class UserImportResponse(BaseModel):
    """ユーザーインポート開始時のレスポンス。"""

    jobId: str
    status: UserImportJobStatus


class UserImportJobResponse(BaseModel):
    """ユーザーインポートジョブの状況を表すレスポンス。"""

    id: str
    tenantId: str
    status: UserImportJobStatus
    fileName: str
    storageUrl: str | None
    errorDetails: str | None
    createdAt: datetime
    updatedAt: datetime
    queuedAt: datetime | None
    completedAt: datetime | None

    @classmethod
    def from_job(cls, job: UserImportJob) -> "UserImportJobResponse":
        """ジョブのモデルからレスポンスを組み立てる。

        Parameters
        ----------
        job : UserImportJob
            ユーザーインポートジョブ。

        Returns
        -------
        UserImportJobResponse
            ジョブの状況を表すレスポンス。
        """
        return cls(
            id=job.id,
            tenantId=job.tenant_id,
            status=job.status,
            fileName=job.file_name,
            storageUrl=job.storage_url,
            errorDetails=job.error_details,
            createdAt=job.created_at,
            updatedAt=job.updated_at,
            queuedAt=job.queued_at,
            completedAt=job.completed_at,
        )
