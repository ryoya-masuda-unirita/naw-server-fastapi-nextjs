from fastapi import APIRouter, Depends, Header, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import (
    clear_access_token_cookie,
    create_access_token,
    get_current_user,
    set_access_token_cookie,
)
from app.core.database import get_session
from app.models.user import User
from app.schemas.auth import (
    LoginKeyRequest,
    LoginRequest,
    PasswordResetRequest,
    AuthResponse,
)
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])
api_router = APIRouter(prefix="/api", tags=["api"])


@router.post("/login", response_model=AuthResponse)
async def login(
    request: LoginRequest,
    response: Response,
    x_tenant_id: str = Header(..., alias="X-Tenant-ID"),
    session: AsyncSession = Depends(get_session),
) -> AuthResponse:
    """ログイン"""
    auth_response = await AuthService.login(
        request.username, request.password, x_tenant_id, session
    )
    if auth_response.token:
        set_access_token_cookie(response, auth_response.token)
    return auth_response


@router.post("/login-key", response_model=AuthResponse)
async def login_with_login_key(
    request: LoginKeyRequest,
    response: Response,
    x_tenant_id: str = Header(..., alias="X-Tenant-ID"),
    session: AsyncSession = Depends(get_session),
) -> AuthResponse:
    """ログインキーによるログイン"""
    auth_response = await AuthService.login_with_login_key(
        request.loginKey, x_tenant_id, session
    )
    if auth_response.token:
        set_access_token_cookie(response, auth_response.token)
    return auth_response


@router.post("/logout")
async def logout(response: Response) -> dict[str, str]:
    """ログアウト"""
    clear_access_token_cookie(response)
    return {"message": "Logout successful."}


@router.post("/password/reset", response_model=AuthResponse)
async def reset_password(
    request: PasswordResetRequest,
    response: Response,
    x_tenant_id: str = Header(..., alias="X-Tenant-ID"),
    session: AsyncSession = Depends(get_session),
) -> AuthResponse:
    """パスワードリセット"""
    auth_response = await AuthService.reset_password(
        request.loginId,
        request.oldPassword,
        request.newPassword,
        x_tenant_id,
        session,
    )
    if auth_response.token:
        set_access_token_cookie(response, auth_response.token)
    return auth_response


@api_router.get("/auth", response_model=AuthResponse)
async def get_auth(
    response: Response,
    current_user: User = Depends(get_current_user),
    x_tenant_id: str = Header(..., alias="X-Tenant-ID"),
    session: AsyncSession = Depends(get_session),
) -> AuthResponse:
    """認証トークン取得（新しいトークンを再発行）"""
    token = create_access_token(current_user.login_id, x_tenant_id)
    set_access_token_cookie(response, token)

    return AuthResponse(
        id=current_user.login_id,
        name=current_user.name,
        role=current_user.role.value,
        token=token,
        groups=[],
        loginStatus="SUCCESS",
    )
