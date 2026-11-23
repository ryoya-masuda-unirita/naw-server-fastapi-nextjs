from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import get_verified_tenant_id, require_admin
from app.models.user import User
from app.schemas.user_import import UserImportJobResponse, UserImportResponse
from app.services.user_import_service import UserImportService

admin_router = APIRouter(prefix="/api/admin/users/import", tags=["admin-users"])


@admin_router.post("", response_model=UserImportResponse)
async def import_users(
    file: UploadFile = File(...),
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> UserImportResponse:
    """ユーザー一括登録用のファイルを受け付け、インポートジョブを作成する。

    Parameters
    ----------
    file : UploadFile
        アップロードされたユーザー一覧ファイル。
    x_tenant_id : str
        `X-Tenant-ID`ヘッダーで検証済みのテナントID。
    current_user : User
        操作しているユーザー。
    session : AsyncSession
        データベースセッション。

    Returns
    -------
    UserImportResponse
        作成したジョブの情報。
    """
    return await UserImportService.import_users(file, x_tenant_id, session)


@admin_router.get("/{job_id}", response_model=UserImportJobResponse)
async def get_import_job(
    job_id: str,
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> UserImportJobResponse:
    """ユーザーインポートジョブの状況を返す。

    Parameters
    ----------
    job_id : str
        ユーザーインポートジョブのID。
    x_tenant_id : str
        `X-Tenant-ID`ヘッダーで検証済みのテナントID。
    current_user : User
        操作しているユーザー。
    session : AsyncSession
        データベースセッション。

    Returns
    -------
    UserImportJobResponse
        ジョブの状況。
    """
    return await UserImportService.get_import_job(job_id, x_tenant_id, session)
