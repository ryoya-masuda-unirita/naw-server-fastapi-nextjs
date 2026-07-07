import asyncio
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
import jwt
from fastapi import Cookie, Depends, Header, HTTPException, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from passlib.context import CryptContext

from app.core.config import get_settings
from app.core.database import get_session
from app.models.user import User, UserRole
from app.repositories.group_user_repository import GroupUserRepository
from app.repositories.user_repository import UserRepository

# JWT 設定
SECRET_KEY = "your-secret-key-change-in-production"
ALGORITHM = "HS512"
ACCESS_TOKEN_EXPIRE_HOURS = 5

# 認証トークンCookie設定
ACCESS_TOKEN_COOKIE_NAME = "access_token"

# パスワードハッシュ設定
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
# Cookie優先・Authorizationヘッダーフォールバックのため、ここではエラーにしない
security = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    """パスワードを bcrypt ハッシュ化"""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """パスワードを検証"""
    return pwd_context.verify(plain_password, hashed_password)


async def verify_password_async(plain_password: str, hashed_password: str) -> bool:
    """パスワードを別スレッドで検証し、イベントループの占有を防ぐ。

    bcrypt の検証処理は CPU バウンドな同期処理のため、async 関数内で直接呼び出すと
    イベントループを占有し他のリクエスト処理を遅延させる。asyncio.to_thread で
    別スレッドに退避させる。

    Args:
        plain_password: 検証対象の平文パスワード。
        hashed_password: 比較対象のハッシュ化済みパスワード。

    Returns:
        パスワードが一致すれば True。
    """
    return await asyncio.to_thread(verify_password, plain_password, hashed_password)


def create_access_token(login_id: str, tenant_id: str) -> str:
    """JWT トークンを生成"""
    from datetime import timezone

    now = datetime.now(timezone.utc)
    expire = now + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    payload = {
        "sub": login_id,
        "tenantId": tenant_id,
        "exp": int(expire.timestamp()),
        "iat": int(now.timestamp()),
    }
    encoded_jwt = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def decode_token(token: str) -> dict:
    """JWT トークンをデコード"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired"
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
        )


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    access_token: str | None = Cookie(default=None, alias=ACCESS_TOKEN_COOKIE_NAME),
    session: AsyncSession = Depends(get_session),
) -> User:
    """認証済みユーザーを取得（/api/** の保護に使用）。

    Cookie（`access_token`）を優先して認証し、Cookieが無い場合は
    `Authorization: Bearer <token>` ヘッダーにフォールバックする。移植元
    （Spring Boot + Spring Session）がCookieセッション認証を採用しており、
    ブラウザ側もCookie送信前提のため、Cookieを優先経路とする。

    Args:
        credentials: Authorization ヘッダーから取得した Bearer トークン（任意）。
        access_token: Cookie から取得したトークン（任意）。
        session: 非同期DBセッション。

    Returns:
        認証済みの User オブジェクト。

    Raises:
        HTTPException: トークンが存在しない・不正、またはユーザーが存在しない場合 401 を返す。
    """
    token = access_token or (credentials.credentials if credentials else None)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated"
        )

    payload = decode_token(token)
    login_id = payload.get("sub")
    tenant_id = payload.get("tenantId")

    if not login_id or not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
        )

    user = await UserRepository.find_by_login_id(login_id, tenant_id, session)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found"
        )

    return user


def set_access_token_cookie(response: Response, token: str) -> None:
    """認証トークンをHttpOnly Cookieとしてレスポンスに設定する。

    移植元（Spring Boot + Spring Session）がCookieセッション認証を採用しており、
    frontend-angular側もCookie送信（withCredentials）前提で作られているため、
    ブラウザ経由の認証を成立させるにはCookie発行が必要になる。

    Args:
        response: Cookieを設定する対象のレスポンス。
        token: 設定するJWT文字列。
    """
    settings = get_settings()
    response.set_cookie(
        key=ACCESS_TOKEN_COOKIE_NAME,
        value=token,
        max_age=ACCESS_TOKEN_EXPIRE_HOURS * 3600,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
    )


def clear_access_token_cookie(response: Response) -> None:
    """認証トークンのCookieを削除する（ログアウト時に使用）。

    Args:
        response: Cookieを削除する対象のレスポンス。
    """
    response.delete_cookie(key=ACCESS_TOKEN_COOKIE_NAME)


def get_tenant_id_from_header(x_tenant_id: str) -> str:
    """X-Tenant-ID ヘッダーを検証"""
    if not x_tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="X-Tenant-ID header is required",
        )
    return x_tenant_id


async def require_admin(
    current_user: User = Depends(get_current_user),
) -> User:
    """ADMIN または SYSTEM ロールのユーザーのみ通過させる。

    Args:
        current_user: 認証済みユーザー。

    Returns:
        認可済みの User オブジェクト。

    Raises:
        HTTPException: ロールが ADMIN/SYSTEM 以外の場合 403 を返す。
    """
    if current_user.role not in (UserRole.ADMIN, UserRole.SYSTEM):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Access Denied"
        )
    return current_user


async def get_verified_tenant_id(
    x_tenant_id: str = Header(..., alias="X-Tenant-ID"),
    current_user: User = Depends(get_current_user),
) -> str:
    """X-Tenant-ID ヘッダーが JWT 内の tenant_id と一致することを検証する。

    JWT の tenant_id とリクエストヘッダーの値が異なると、認証済みユーザーが
    自分の所属しないテナントのデータへアクセスできてしまうため検証する。

    Args:
        x_tenant_id: リクエストヘッダーのテナントID。
        current_user: JWT から認証されたユーザー。

    Returns:
        検証済みのテナントID。

    Raises:
        HTTPException: ヘッダーと JWT の tenant_id が一致しない場合 403 を返す。
    """
    if x_tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch"
        )

    return x_tenant_id


async def require_admin_for_tenant_path(
    tenant_id: str,
    current_user: User = Depends(require_admin),
) -> str:
    """パスパラメータのtenant_idが認証済みテナント管理者の所属テナントと一致することを確認する。

    移植元の`ensureTenantMatchesContext`相当。テナントIDをパスパラメータに含むエンドポイント
    （`/api/admin/tenants/{tenant_id}/...`）で使用する。

    Args:
        tenant_id: パスパラメータのテナントID。
        current_user: テナント管理者であることを確認済みのユーザー。

    Returns:
        検証済みのテナントID。

    Raises:
        HTTPException: パスのtenant_idが認証済みユーザーのテナントと一致しない場合 403 を返す。
    """
    if tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch"
        )
    return tenant_id


async def require_admin_or_group_admin(
    x_tenant_id: str = Depends(get_verified_tenant_id),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> User:
    """テナント管理者、またはいずれかのグループの管理者であることを検証する。

    移植元`AdminAuthorizationFilter`（`/api/admin/**`への一律フィルタ。ADMIN/SYSTEMロール
    またはグループ管理者のいずれかを許可）相当。

    Args:
        x_tenant_id: 検証済みテナントID。
        current_user: 認証済みユーザー。
        session: 非同期DBセッション。

    Returns:
        認可済みの User オブジェクト。

    Raises:
        HTTPException: テナント管理者でも、いずれのグループの管理者でもない場合 403 を返す。
    """
    if current_user.role in (UserRole.ADMIN, UserRole.SYSTEM):
        return current_user

    admin_group_ids = await GroupUserRepository.find_admin_group_ids_for_user(
        x_tenant_id, current_user.id, session
    )
    if not admin_group_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Access Denied"
        )
    return current_user
