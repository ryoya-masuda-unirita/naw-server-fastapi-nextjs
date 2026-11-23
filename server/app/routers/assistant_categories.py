from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import get_verified_tenant_id, require_admin
from app.models.user import User
from app.schemas.assistant_category import (
    AssistantCategoryCreateRequest,
    AssistantCategoryResponse,
    AssistantCategoryUpdateRequest,
)
from app.services.assistant_category_service import AssistantCategoryService

router = APIRouter(
    prefix="/api/admin/assistant-categories", tags=["assistant-categories"]
)


@router.post("", response_model=AssistantCategoryResponse, status_code=201)
async def create_assistant_category(
    req: AssistantCategoryCreateRequest,
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> AssistantCategoryResponse:
    """アシスタントカテゴリ作成（テナント管理者専用）"""
    return await AssistantCategoryService.create_assistant_category(
        x_tenant_id, current_user, req, session
    )


@router.get("", response_model=list[AssistantCategoryResponse])
async def get_assistant_categories(
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> list[AssistantCategoryResponse]:
    """アシスタントカテゴリ一覧取得（テナント管理者専用）"""
    return await AssistantCategoryService.get_assistant_categories(x_tenant_id, session)


@router.get("/{id}", response_model=AssistantCategoryResponse)
async def get_assistant_category(
    id: str,
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> AssistantCategoryResponse:
    """アシスタントカテゴリ単体取得（テナント管理者専用）"""
    return await AssistantCategoryService.get_assistant_category(
        id, x_tenant_id, session
    )


@router.patch("/{id}", response_model=AssistantCategoryResponse)
async def update_assistant_category(
    id: str,
    req: AssistantCategoryUpdateRequest,
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> AssistantCategoryResponse:
    """アシスタントカテゴリ更新（テナント管理者専用）"""
    return await AssistantCategoryService.update_assistant_category(
        id, x_tenant_id, current_user, req, session
    )


@router.delete("/{id}", status_code=204)
async def delete_assistant_category(
    id: str,
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> None:
    """アシスタントカテゴリ削除（テナント管理者専用）"""
    await AssistantCategoryService.delete_assistant_category(id, x_tenant_id, session)
