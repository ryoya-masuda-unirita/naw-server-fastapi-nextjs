from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, verify_password
from app.models.user import User
from app.schemas.auth import AuthResponse
from app.services.password_service import PasswordService


class AuthService:
    """認証サービス"""

    @staticmethod
    async def login(username: str, password: str, tenant_id: str, session: AsyncSession) -> AuthResponse:
        """ログイン処理"""
        # ユーザー存在確認
        stmt = select(User).where(User.login_id == username, User.tenant_id == tenant_id)
        result = await session.execute(stmt)
        user = result.scalars().first()

        if not user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

        # 最新のパスワードを取得して検証
        current_password_hash = await PasswordService.get_current_password_hash(user.id, session)

        if not verify_password(password, current_password_hash):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

        # パスワードリセット要求チェック
        if user.is_required_password_reset:
            return AuthResponse(
                id=user.login_id,
                name=user.name,
                role=user.role.value,
                groups=[],
                loginStatus="REQUIRES_PASSWORD_RESET",
                reason="INITIAL",
            )

        # JWT トークンを生成
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
        # ユーザー存在確認
        stmt = select(User).where(User.login_id == login_id, User.tenant_id == tenant_id)
        result = await session.execute(stmt)
        user = result.scalars().first()

        if not user:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User not found")

        # 旧パスワード検証
        try:
            current_password_hash = await PasswordService.get_current_password_hash(user.id, session)
        except HTTPException:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid old password")

        if not verify_password(old_password, current_password_hash):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid old password")

        # 新パスワード強度チェック
        await PasswordService.verify_password_strength(new_password, tenant_id, session)

        # 過去パスワード重複チェック
        await PasswordService.check_password_history(user.id, new_password, tenant_id, session)

        # パスワード更新
        await PasswordService.reset_password(user.id, new_password, tenant_id, session)

        # ユーザーの is_required_password_reset フラグをクリア
        user.is_required_password_reset = False
        session.add(user)
        await session.flush()
        await session.commit()

        # 新 JWT トークンを生成
        token = create_access_token(user.login_id, tenant_id)

        return AuthResponse(
            id=user.login_id,
            name=user.name,
            role=user.role.value,
            token=token,
            groups=[],
            loginStatus="SUCCESS",
        )
