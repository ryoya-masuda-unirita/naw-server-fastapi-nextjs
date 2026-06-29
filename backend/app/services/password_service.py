from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.security import hash_password, verify_password
from backend.app.models.password_history import PasswordHistory
from backend.app.models.tenant import Tenant


class PasswordService:
    """パスワード管理サービス"""

    @staticmethod
    async def get_current_password_hash(user_id: str, session: AsyncSession) -> str:
        """最新のパスワードハッシュを取得"""
        stmt = (
            select(PasswordHistory)
            .where(PasswordHistory.user_id == user_id)
            .order_by(PasswordHistory.created_at.desc())
            .limit(1)
        )
        result = await session.execute(stmt)
        latest = result.scalars().first()

        if not latest:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User has no password")

        return latest.password

    @staticmethod
    async def verify_password_strength(
        new_password: str, tenant_id: str, session: AsyncSession
    ) -> bool:
        """テナントのパスワードポリシーに適合しているか検証"""
        stmt = select(Tenant).where(Tenant.id == tenant_id)
        result = await session.execute(stmt)
        tenant = result.scalars().first()

        if not tenant:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tenant not found")

        if len(new_password) < tenant.pw_policy_min_length:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Password must be at least {tenant.pw_policy_min_length} characters",
            )

        return True

    @staticmethod
    async def check_password_history(
        user_id: str, new_password: str, tenant_id: str, session: AsyncSession
    ) -> bool:
        """過去パスワードとの重複をチェック"""
        stmt = select(Tenant).where(Tenant.id == tenant_id)
        result = await session.execute(stmt)
        tenant = result.scalars().first()

        if not tenant:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tenant not found")

        pw_histories_limit = tenant.pw_histories_limit

        stmt = (
            select(PasswordHistory.password)
            .where(PasswordHistory.user_id == user_id)
            .order_by(PasswordHistory.created_at.desc())
            .limit(pw_histories_limit)
        )
        result = await session.execute(stmt)
        recent_passwords = result.scalars().all()

        for hashed in recent_passwords:
            if verify_password(new_password, hashed):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Password has been used before",
                )

        return True

    @staticmethod
    async def reset_password(user_id: str, new_password: str, tenant_id: str, session: AsyncSession) -> None:
        """新しいパスワードを password_histories に追加"""
        hashed_password = hash_password(new_password)

        new_history = PasswordHistory(
            tenant_id=tenant_id,
            user_id=user_id,
            password=hashed_password,
        )
        session.add(new_history)
        await session.flush()
