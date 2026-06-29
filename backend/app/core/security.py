from datetime import datetime, timedelta
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer
from passlib.context import CryptContext

# JWT 設定
SECRET_KEY = "your-secret-key-change-in-production"
ALGORITHM = "HS512"
ACCESS_TOKEN_EXPIRE_HOURS = 5

# パスワードハッシュ設定
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()


def hash_password(password: str) -> str:
    """パスワードを bcrypt ハッシュ化"""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """パスワードを検証"""
    return pwd_context.verify(plain_password, hashed_password)


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
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


def _get_session_dependency():
    """get_session を遅延ロード"""
    from app.core.database import get_session
    return get_session


async def get_current_user(
    credentials=Depends(security),
    session: AsyncSession = Depends(_get_session_dependency),
):
    """認証済みユーザーを取得（/api/** の保護に使用）"""
    from app.models.user import User

    token = credentials.credentials
    payload = decode_token(token)
    login_id = payload.get("sub")
    tenant_id = payload.get("tenantId")

    if not login_id or not tenant_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    stmt = select(User).where(User.login_id == login_id, User.tenant_id == tenant_id)
    result = await session.execute(stmt)
    user = result.scalars().first()

    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    return user


def get_tenant_id_from_header(x_tenant_id: str) -> str:
    """X-Tenant-ID ヘッダーを検証"""
    if not x_tenant_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="X-Tenant-ID header is required")
    return x_tenant_id
