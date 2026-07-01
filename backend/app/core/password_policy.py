import uuid

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import verify_password_async
from app.models.tenant import Tenant
from app.repositories.password_history_repository import PasswordHistoryRepository


def verify_password_strength(new_password: str, tenant: Tenant) -> None:
    """新パスワードがテナントの最小長ポリシーを満たすか検証する。

    Args:
        new_password: 検証対象の新パスワード。
        tenant: パスワードポリシーを持つテナント。

    Raises:
        HTTPException: 最小長を満たさない場合 400 を返す。
    """
    if len(new_password) < tenant.pw_policy_min_length:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Password must be at least {tenant.pw_policy_min_length} characters",
        )


async def check_password_not_reused(
    user_id: uuid.UUID,
    new_password: str,
    tenant: Tenant,
    session: AsyncSession,
) -> None:
    """新パスワードが直近の使用履歴に含まれていないか検証する。

    Args:
        user_id: 検証対象ユーザーのID。
        new_password: 検証対象の新パスワード。
        tenant: パスワード履歴件数のポリシーを持つテナント。
        session: 非同期DBセッション。

    Raises:
        HTTPException: 直近の使用履歴に含まれる場合 400 を返す。
    """
    recent_hashes = await PasswordHistoryRepository.get_recent_hashes(
        user_id, tenant.pw_histories_limit, session
    )
    for hashed in recent_hashes:
        if await verify_password_async(new_password, hashed):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Password has been used before",
            )
