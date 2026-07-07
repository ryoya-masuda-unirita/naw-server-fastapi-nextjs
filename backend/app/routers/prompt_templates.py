from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import get_current_user, get_verified_tenant_id
from app.models.user import User
from app.schemas.prompt_template import (
    PagedPromptTemplateResponse,
    PromptTemplateCreateRequest,
    PromptTemplateCreateResponse,
)
from app.services.prompt_template_service import PromptTemplateService

prompt_template_router = APIRouter(
    prefix="/api/prompt-templates", tags=["prompt-templates"]
)
admin_prompt_template_router = APIRouter(
    prefix="/api/admin/prompt-templates", tags=["admin-prompt-templates"]
)


@prompt_template_router.get("", response_model=PagedPromptTemplateResponse)
async def get_prompt_templates(
    search: str | None = Query(None),
    page: int = Query(0, ge=0),
    size: int = Query(20, ge=1, le=100),
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> PagedPromptTemplateResponse:
    """プロンプトテンプレート一覧取得（一般ユーザー向け、所属グループに紐づくもののみ）"""
    return await PromptTemplateService.get_prompt_templates(
        x_tenant_id, current_user, search, page, size, session
    )


@admin_prompt_template_router.get("", response_model=PagedPromptTemplateResponse)
async def get_admin_prompt_templates(
    search: str | None = Query(None),
    team: str | None = Query(None),
    excludeGroupId: str | None = Query(None),
    page: int = Query(0, ge=0),
    size: int = Query(20, ge=1, le=100),
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> PagedPromptTemplateResponse:
    """プロンプトテンプレート一覧取得（管理者向け、検索・チームフィルタ・除外グループフィルタ対応）"""
    return await PromptTemplateService.get_admin_prompt_templates(
        x_tenant_id, current_user, search, team, excludeGroupId, page, size, session
    )


@admin_prompt_template_router.post("", response_model=PromptTemplateCreateResponse)
async def create_prompt_template(
    req: PromptTemplateCreateRequest,
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> PromptTemplateCreateResponse:
    """プロンプトテンプレート作成"""
    return await PromptTemplateService.create_prompt_template(x_tenant_id, req, session)


@admin_prompt_template_router.patch(
    "/{template_id}", response_model=PromptTemplateCreateResponse
)
async def update_prompt_template(
    template_id: str,
    req: PromptTemplateCreateRequest,
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> PromptTemplateCreateResponse:
    """プロンプトテンプレート更新"""
    updated = await PromptTemplateService.update_prompt_template(
        template_id, x_tenant_id, req, session
    )
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Prompt template not found"
        )
    return updated


@admin_prompt_template_router.delete("/{id}", status_code=204)
async def delete_prompt_template(
    id: str,
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    """プロンプトテンプレート削除"""
    await PromptTemplateService.delete_prompt_template(id, x_tenant_id, session)
