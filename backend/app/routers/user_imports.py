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
    return await UserImportService.import_users(file, x_tenant_id, session)


@admin_router.get("/{job_id}", response_model=UserImportJobResponse)
async def get_import_job(
    job_id: str,
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> UserImportJobResponse:
    return await UserImportService.get_import_job(job_id, x_tenant_id, session)
