from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password, verify_password
from app.models.tenant import Tenant
from app.models.user import User
from app.repositories.password_history_repository import PasswordHistoryRepository
from app.schemas.auth import AuthResponse


class AuthService:
    """認証サービス"""

    @staticmethod
    async def login(username: str, password: str, tenant_id: str, session: AsyncSession) -> AuthResponse:
        """ログイン処理"""
        stmt = select(User).where(User.login_id == username, User.tenant_id == tenant_id)
        result = await session.execute(stmt)
        user = result.scalars().first()

        if not user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

        latest = await PasswordHistoryRepository.get_latest(user.id, session)
        if not latest:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

        if not verify_password(password, latest.password):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

        if user.is_required_password_reset:
            return AuthResponse(
                id=user.login_id,
                name=user.name,
                role=user.role.value,
                groups=[],
                loginStatus="REQUIRES_PASSWORD_RESET",
                reason="INITIAL",
            )

        token = create_access_token(user.login_id, tenant_id)

        return AuthResponse(
            id=user.login_id,
            name=user.name,
            role=user.role.value,
            token=token,
            groups=[],
            loginStatus="SUCCESS",
        )

    @staticmethod
    async def reset_password(
        login_id: str, old_password: str, new_password: str, tenant_id: str, session: AsyncSession
    ) -> AuthResponse:
        """パスワードリセット処理"""
        stmt = select(User).where(User.login_id == login_id, User.tenant_id == tenant_id)
        result = await session.execute(stmt)
        user = result.scalars().first()

        if not user:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User not found")

        latest = await PasswordHistoryRepository.get_latest(user.id, session)
        if not latest or not verify_password(old_password, latest.password):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid old password")

        await AuthService._verify_password_strength(new_password, tenant_id, session)
        await AuthService._check_password_history(user.id, new_password, tenant_id, session)
        await PasswordHistoryRepository.save(user.id, tenant_id, hash_password(new_password), session)

        user.is_required_password_reset = False
        session.add(user)
        await session.flush()
        await session.commit()

        token = create_access_token(user.login_id, tenant_id)

        return AuthResponse(
            id=user.login_id,
            name=user.name,
            role=user.role.value,
            token=token,
            groups=[],
            loginStatus="SUCCESS",
        )

    @staticmethod
    async def _verify_password_strength(new_password: str, tenant_id: str, session: AsyncSession) -> None:
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

    @staticmethod
    async def _check_password_history(
        user_id, new_password: str, tenant_id: str, session: AsyncSession
    ) -> None:
        stmt = select(Tenant).where(Tenant.id == tenant_id)
        result = await session.execute(stmt)
        tenant = result.scalars().first()

        if not tenant:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tenant not found")

        recent_hashes = await PasswordHistoryRepository.get_recent_hashes(
            user_id, tenant.pw_histories_limit, session
        )
        for hashed in recent_hashes:
            if verify_password(new_password, hashed):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Password has been used before",
                )
