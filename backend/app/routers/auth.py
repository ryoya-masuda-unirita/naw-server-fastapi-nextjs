from fastapi import APIRouter, Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, get_current_user
from app.database import get_session
from app.models.user import User
from app.schemas.auth import LoginRequest, PasswordResetRequest, AuthResponse
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])
api_router = APIRouter(prefix="/api", tags=["api"])


@router.post("/login", response_model=AuthResponse)
async def login(
    request: LoginRequest,
    x_tenant_id: str = Header(..., alias="X-Tenant-ID"),
    session: AsyncSession = Depends(get_session),
) -> AuthResponse:
    """ログイン"""
    return await AuthService.login(request.username, request.password, x_tenant_id, session)


@router.post("/logout")
async def logout():
    """ログアウト"""
    return {"message": "Logout successful."}


@router.post("/password/reset", response_model=AuthResponse)
async def reset_password(
    request: PasswordResetRequest,
    x_tenant_id: str = Header(..., alias="X-Tenant-ID"),
    session: AsyncSession = Depends(get_session),
) -> AuthResponse:
    """パスワードリセット"""
    return await AuthService.reset_password(
        request.loginId,
        request.oldPassword,
        request.newPassword,
        x_tenant_id,
        session,
    )


@api_router.get("/auth", response_model=AuthResponse)
async def get_auth(
    current_user: User = Depends(get_current_user),
    x_tenant_id: str = Header(..., alias="X-Tenant-ID"),
    session: AsyncSession = Depends(get_session),
) -> AuthResponse:
    """認証トークン取得（新しいトークンを再発行）"""
    token = create_access_token(current_user.login_id, x_tenant_id)

    return AuthResponse(
        id=current_user.login_id,
        name=current_user.name,
        role=current_user.role.value,
        token=token,
        groups=[],
        loginStatus="SUCCESS",
    )
