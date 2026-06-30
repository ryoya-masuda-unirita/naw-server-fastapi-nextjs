from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.password_policy import check_password_not_reused, verify_password_strength
from app.core.security import create_access_token, hash_password, verify_password_async
from app.repositories.password_history_repository import PasswordHistoryRepository
from app.repositories.tenant_repository import TenantRepository
from app.repositories.user_repository import UserRepository
from app.schemas.auth import AuthResponse


class AuthService:
    """認証サービス"""

    @staticmethod
    async def login(username: str, password: str, tenant_id: str, session: AsyncSession) -> AuthResponse:
        """ログイン処理"""
        user = await UserRepository.find_by_login_id(username, tenant_id, session)
        if not user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

        latest = await PasswordHistoryRepository.get_latest(user.id, session)
        if not latest:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

        if not await verify_password_async(password, latest.password):
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
        user = await UserRepository.find_by_login_id(login_id, tenant_id, session)
        if not user:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User not found")

        latest = await PasswordHistoryRepository.get_latest(user.id, session)
        if not latest or not await verify_password_async(old_password, latest.password):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid old password")

        tenant = await TenantRepository.find_by_id(tenant_id, session)
        if not tenant:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tenant not found")
        verify_password_strength(new_password, tenant)
        await check_password_not_reused(user.id, new_password, tenant, session)
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
