from datetime import datetime, timedelta, timezone

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
    async def login(
        username: str, password: str, tenant_id: str, session: AsyncSession
    ) -> AuthResponse:
        """ログイン処理を行い認証レスポンスを返す。

        Args:
            username: ログインID。
            password: 平文パスワード。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            認証結果を含む AuthResponse。

        Raises:
            HTTPException: 認証失敗時は 401 を返す。
        """
        user = await UserRepository.find_by_login_id(username, tenant_id, session)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials"
            )

        latest = await PasswordHistoryRepository.get_latest(user.id, session)
        if not latest:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials"
            )

        if not await verify_password_async(password, latest.password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials"
            )

        # 移植元のPasswordResetService.evaluateと同じ優先順位で判定する。
        # EXPIRED（有効期限切れ）はINITIAL（初回ログイン）より優先される。
        if latest.expired_at is not None and latest.expired_at < datetime.now(
            timezone.utc
        ):
            return AuthResponse(
                id=user.login_id,
                name=user.name,
                role=user.role.value,
                groups=[],
                loginStatus="REQUIRES_PASSWORD_RESET",
                reason="EXPIRED",
            )

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
    async def login_with_login_key(
        login_key: str, tenant_id: str, session: AsyncSession
    ) -> AuthResponse:
        """ログインキーで認証しJWTを含む認証レスポンスを返す。

        login_key と tenant_id の両方でユーザーを検索するため、存在しない
        ログインキーの場合と、別テナントのログインキーの場合は同じ401を返す
        （ログインキーの存在有無が外部から推測できないようにするため）。

        Args:
            login_key: ログインキー。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            認証結果を含む AuthResponse。

        Raises:
            HTTPException: ログインキーが存在しない、または別テナントの場合は401を返す。
        """
        user = await UserRepository.find_by_login_key(login_key, tenant_id, session)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid login key"
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
        login_id: str,
        old_password: str,
        new_password: str,
        tenant_id: str,
        session: AsyncSession,
    ) -> AuthResponse:
        """初回ログイン時のパスワードリセット処理を行い認証レスポンスを返す。

        Args:
            login_id: ログインID。
            old_password: 旧パスワード（初期パスワード）。
            new_password: 新パスワード。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            認証成功レスポンス（新パスワードで発行したJWTを含む）。

        Raises:
            HTTPException: ユーザーが存在しない場合は 403、旧パスワード不一致は 403、
                テナントが存在しない場合は 400、パスワードポリシー違反は 400 を返す。
        """
        user = await UserRepository.find_by_login_id(login_id, tenant_id, session)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="User not found"
            )

        latest = await PasswordHistoryRepository.get_latest(user.id, session)
        if not latest or not await verify_password_async(old_password, latest.password):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Invalid old password"
            )

        tenant = await TenantRepository.find_by_id(tenant_id, session)
        if not tenant:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Tenant not found"
            )
        verify_password_strength(new_password, tenant)
        await check_password_not_reused(user.id, new_password, tenant, session)
        expired_at = datetime.now(timezone.utc) + timedelta(
            days=tenant.pw_validity_period_days
        )
        await PasswordHistoryRepository.save(
            user.id,
            tenant_id,
            hash_password(new_password),
            session,
            expired_at=expired_at,
        )

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
