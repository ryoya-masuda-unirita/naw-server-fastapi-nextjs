import redis.asyncio as redis
from fastapi import APIRouter, Cookie, Depends, Header, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import session_store
from app.core.security import (
    clear_session_cookie,
    create_access_token,
    get_current_user,
    set_session_cookie,
)
from app.core.database import get_session
from app.core.redis_client import get_redis_client
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


async def _issue_session(
    response: Response,
    auth_response: AuthResponse,
    tenant_id: str,
    redis_client: redis.Redis,
) -> None:
    """認証成功時にセッションを作成し、セッションCookieを発行する。

    Args:
        response: Cookieを設定する対象のレスポンス。
        auth_response: 認証結果（`token`が設定されていればセッションを作成する）。
        tenant_id: 認証済みユーザーのテナントID。
        redis_client: Redis非同期クライアント。
    """
    if auth_response.token:
        session_id = await session_store.create_session(
            auth_response.id, tenant_id, redis_client
        )
        set_session_cookie(response, session_id)


@router.post("/login", response_model=AuthResponse)
async def login(
    request: LoginRequest,
    response: Response,
    x_tenant_id: str = Header(..., alias="X-Tenant-ID"),
    session: AsyncSession = Depends(get_session),
    redis_client: redis.Redis = Depends(get_redis_client),
) -> AuthResponse:
    """ログイン"""
    auth_response = await AuthService.login(
        request.username, request.password, x_tenant_id, session
    )
    await _issue_session(response, auth_response, x_tenant_id, redis_client)
    return auth_response


@router.post("/login-key", response_model=AuthResponse)
async def login_with_login_key(
    request: LoginKeyRequest,
    response: Response,
    x_tenant_id: str = Header(..., alias="X-Tenant-ID"),
    session: AsyncSession = Depends(get_session),
    redis_client: redis.Redis = Depends(get_redis_client),
) -> AuthResponse:
    """ログインキーによるログイン"""
    auth_response = await AuthService.login_with_login_key(
        request.loginKey, x_tenant_id, session
    )
    await _issue_session(response, auth_response, x_tenant_id, redis_client)
    return auth_response


@router.post("/logout")
async def logout(
    response: Response,
    session_id: str | None = Cookie(
        default=None, alias=session_store.SESSION_COOKIE_NAME
    ),
    redis_client: redis.Redis = Depends(get_redis_client),
) -> dict[str, str]:
    """ログアウト"""
    if session_id:
        await session_store.delete_session(session_id, redis_client)
    clear_session_cookie(response)
    return {"message": "Logout successful."}


@router.post("/password/reset", response_model=AuthResponse)
async def reset_password(
    request: PasswordResetRequest,
    response: Response,
    x_tenant_id: str = Header(..., alias="X-Tenant-ID"),
    session: AsyncSession = Depends(get_session),
    redis_client: redis.Redis = Depends(get_redis_client),
) -> AuthResponse:
    """パスワードリセット"""
    auth_response = await AuthService.reset_password(
        request.loginId,
        request.oldPassword,
        request.newPassword,
        x_tenant_id,
        session,
    )
    await _issue_session(response, auth_response, x_tenant_id, redis_client)
    return auth_response


@api_router.get("/auth", response_model=AuthResponse)
async def get_auth(
    response: Response,
    current_user: User = Depends(get_current_user),
    x_tenant_id: str = Header(..., alias="X-Tenant-ID"),
    session_id: str | None = Cookie(
        default=None, alias=session_store.SESSION_COOKIE_NAME
    ),
    redis_client: redis.Redis = Depends(get_redis_client),
) -> AuthResponse:
    """認証トークン取得（新しいトークンを再発行）"""
    if session_id:
        await session_store.touch_session(session_id, redis_client)
        set_session_cookie(response, session_id)

    token = create_access_token(current_user.login_id, x_tenant_id)

    return AuthResponse(
        id=current_user.login_id,
        name=current_user.name,
        role=current_user.role.value,
        token=token,
        groups=[],
        loginStatus="SUCCESS",
    )
