import uuid
from datetime import datetime, timedelta, timezone
from typing import NoReturn

import redis.asyncio as redis
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import password_mismatch_store
from app.core.config import get_password_reset_settings
from app.core.password_policy import check_password_not_reused, verify_password_strength
from app.core.security import create_access_token, hash_password, verify_password_async
from app.models.user import User
from app.repositories.group_user_repository import GroupUserRepository
from app.repositories.password_history_repository import PasswordHistoryRepository
from app.repositories.tenant_repository import TenantRepository
from app.repositories.user_repository import UserRepository
from app.schemas.auth import AuthGroupResponse, AuthResponse

# 移植元`PasswordResetService.INVALID_CREDENTIALS_MESSAGE`。ユーザーの有無で応答を
# 変えるとログインIDの存在が分かってしまうため、ユーザー不在・旧パスワード誤りで共通にする。
INVALID_CREDENTIALS_MESSAGE = "ログインIDまたは旧パスワードが正しくありません。"
# 移植元`PasswordResetLockedException.MESSAGE`
PASSWORD_RESET_LOCKED_MESSAGE = (
    "連続でパスワード更新に失敗したため、一定期間更新はできません。"
    "しばらく時間を空けて再度お試しください"
)
# 移植元`AuthService.login`が認証失敗時に`AccessDeniedException`へ渡す文言（403）。
# ユーザーの有無で応答を変えるとログインIDの存在が分かってしまうため、ユーザー不在・
# パスワード誤り・パスワード履歴なしで共通にする。
LOGIN_FAILED_MESSAGE = "Authentication failed"
# 移植元`TooManyLoginAttemptsException`の文言（429）
LOGIN_LOCKED_MESSAGE = "Too many failed login attempts"


async def build_auth_response(
    user: User,
    token: str,
    tenant_id: str,
    session: AsyncSession,
    login_status: str | None = None,
) -> AuthResponse:
    """認証成功の応答を作る（移植元 `AuthController.buildAuthResponse`）。

    Parameters
    ----------
    user : User
        認証したユーザー。
    token : str
        発行した JWT。
    tenant_id : str
        テナントID。
    session : AsyncSession
        非同期DBセッション。
    login_status : str | None
        `loginStatus` の値。移植元は `/auth/login` の成功時だけ "SUCCESS" を返す。

    Returns
    -------
    AuthResponse
        所属グループ（`groupId`・`groupAdmin`）を含む認証応答。
    """
    memberships = await GroupUserRepository.find_memberships_for_user(
        tenant_id, user.id, session
    )
    return AuthResponse(
        id=user.login_id,
        name=user.name,
        role=user.role.value,
        token=token,
        groups=[
            AuthGroupResponse(groupId=group_id, groupAdmin=is_admin)
            for group_id, is_admin in memberships
        ],
        loginStatus=login_status,
    )


def _login_locked_error() -> HTTPException:
    """ログインがロック中であることを表す例外を返す。

    Returns
    -------
    HTTPException
        429 の HTTPException。
    """
    return HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=LOGIN_LOCKED_MESSAGE
    )


def _login_failed_error() -> HTTPException:
    """ログインの認証失敗を表す例外を返す。

    Returns
    -------
    HTTPException
        403 の HTTPException。
    """
    return HTTPException(
        status_code=status.HTTP_403_FORBIDDEN, detail=LOGIN_FAILED_MESSAGE
    )


async def _fail_login(
    user_id: uuid.UUID, tenant_id: str, redis_client: redis.Redis
) -> NoReturn:
    """ログインの失敗を記録し、認証失敗またはロックの例外を送出する。

    Parameters
    ----------
    user_id : uuid.UUID
        ユーザーID。
    tenant_id : str
        テナントID。
    redis_client : redis.Redis
        失敗記録を保存するRedis非同期クライアント。

    Raises
    ------
    HTTPException
        今回の失敗でロックの条件を満たしたら 429、満たさなければ 403。
    """
    if await password_mismatch_store.record_login_failure_and_check_lockout(
        user_id, tenant_id, redis_client
    ):
        raise _login_locked_error()
    raise _login_failed_error()


class AuthService:
    """認証サービス"""

    @staticmethod
    async def login(
        username: str,
        password: str,
        tenant_id: str,
        session: AsyncSession,
        redis_client: redis.Redis,
    ) -> AuthResponse:
        """ログイン処理を行い認証レスポンスを返す。

        移植元`AuthService.login`・`LoginAttemptService`と同じく、認証の前にロック中かを
        判定し、認証に失敗したら失敗を記録してロックを判定する。成功したら失敗記録を
        すべて消す。失敗記録はパスワード再設定と共有する。

        Parameters
        ----------
        username : str
            ログインID。
        password : str
            平文パスワード。
        tenant_id : str
            テナントID。
        session : AsyncSession
            非同期DBセッション。
        redis_client : redis.Redis
            失敗記録を保存するRedis非同期クライアント。

        Returns
        -------
        AuthResponse
            認証結果を含む AuthResponse。

        Raises
        ------
        HTTPException
            ユーザーが存在しない・パスワード履歴がない・パスワード不一致の
            場合は 403、ロック中または今回の失敗でロックの条件を満たした場合は 429。
        """
        user = await UserRepository.find_by_login_id(username, tenant_id, session)
        if not user:
            # 移植元どおり、ユーザーが存在しない場合は失敗として数えずロックもしない
            raise _login_failed_error()

        # ロック中は、パスワードが正しくても認証しない
        if await password_mismatch_store.is_login_locked_out(
            user.id, tenant_id, redis_client
        ):
            raise _login_locked_error()

        latest = await PasswordHistoryRepository.get_latest(user.id, session)
        # 移植元はパスワード履歴がないユーザーも認証失敗としてユーザーの失敗を数える
        if not latest or not await verify_password_async(password, latest.password):
            await _fail_login(user.id, tenant_id, redis_client)

        # 移植元はパスワード再設定が必要かの判定より前に記録を消す
        await password_mismatch_store.clear_failures(user.id, tenant_id, redis_client)

        # 移植元のPasswordResetService.evaluateと同じ優先順位で判定する。
        # EXPIRED（有効期限切れ）はINITIAL（初回ログイン）より優先される。
        if latest.expired_at is not None and latest.expired_at < datetime.now(
            timezone.utc
        ):
            return AuthResponse(
                id=user.login_id,
                name=user.name,
                role=user.role.value,
                loginStatus="REQUIRES_PASSWORD_RESET",
                reason="EXPIRED",
            )

        if user.is_required_password_reset:
            return AuthResponse(
                id=user.login_id,
                name=user.name,
                role=user.role.value,
                loginStatus="REQUIRES_PASSWORD_RESET",
                reason="INITIAL",
            )

        token = create_access_token(user.login_id, tenant_id)

        return await build_auth_response(
            user, token, tenant_id, session, login_status="SUCCESS"
        )

    @staticmethod
    async def login_with_login_key(
        login_key: str | None, tenant_id: str, session: AsyncSession
    ) -> AuthResponse:
        """ログインキーで認証しJWTを含む認証レスポンスを返す。

        login_key と tenant_id の両方でユーザーを検索するため、存在しない
        ログインキーの場合と、別テナントのログインキーの場合は同じ401を返す
        （ログインキーの存在有無が外部から推測できないようにするため）。

        Parameters
        ----------
        login_key : str | None
            ログインキー。
        tenant_id : str
            テナントID。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        AuthResponse
            認証結果を含む AuthResponse。

        Raises
        ------
        HTTPException
            ログインキーが存在しない、または別テナントの場合は401を返す。
        """
        # 移植元は null・空白のキーも「ユーザーが見つからない」として扱う
        user = (
            await UserRepository.find_by_login_key(login_key, tenant_id, session)
            if login_key is not None and login_key.strip()
            else None
        )
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid login key"
            )

        token = create_access_token(user.login_id, tenant_id)

        return await build_auth_response(user, token, tenant_id, session)

    @staticmethod
    async def reset_password(
        login_id: str,
        old_password: str,
        new_password: str,
        tenant_id: str,
        session: AsyncSession,
        redis_client: redis.Redis,
    ) -> AuthResponse:
        """初回ログイン時のパスワードリセット処理を行い認証レスポンスを返す。

        移植元`PasswordResetService.resetPassword`と同じく、旧パスワードの誤りを
        失敗として記録し、ロック時間内の失敗が上限に達したら再設定をロックする。

        Parameters
        ----------
        login_id : str
            ログインID。
        old_password : str
            旧パスワード（初期パスワード）。
        new_password : str
            新パスワード。
        tenant_id : str
            テナントID。
        session : AsyncSession
            非同期DBセッション。
        redis_client : redis.Redis
            失敗記録を保存するRedis非同期クライアント。

        Returns
        -------
        AuthResponse
            認証成功レスポンス（新パスワードで発行したJWTを含む）。

        Raises
        ------
        HTTPException
            ユーザーが存在しない・パスワード履歴がない・旧パスワード
            不一致の場合は 403、ロック中または今回の失敗で上限に達した場合は 429、
            テナントが存在しない場合は 400、パスワードポリシー違反は 400 を返す。
        """
        user = await UserRepository.find_by_login_id(login_id, tenant_id, session)
        if not user:
            # 移植元どおり、ユーザーが存在しない場合は失敗として数えない
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=INVALID_CREDENTIALS_MESSAGE,
            )

        settings = get_password_reset_settings()
        if await password_mismatch_store.is_locked_out(
            user.id,
            tenant_id,
            settings.max_failure_attempts,
            settings.lockout_minutes,
            redis_client,
        ):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=PASSWORD_RESET_LOCKED_MESSAGE,
            )

        latest = await PasswordHistoryRepository.get_latest(user.id, session)
        if not latest:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=INVALID_CREDENTIALS_MESSAGE,
            )

        if not await verify_password_async(old_password, latest.password):
            if await password_mismatch_store.record_failure_and_check_lockout(
                user.id,
                tenant_id,
                settings.max_failure_attempts,
                settings.lockout_minutes,
                redis_client,
            ):
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=PASSWORD_RESET_LOCKED_MESSAGE,
                )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=INVALID_CREDENTIALS_MESSAGE,
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
        # 移植元は再設定と同じトランザクションの最後で失敗記録を消し、消せなければ
        # 再設定ごと取り消す。コミット後に消すと、Redisの障害時にパスワードは
        # 変わったのにエラー応答になるため、コミット前に消す（ここに来た時点で
        # 旧パスワードは正しいので、コミットが失敗して記録だけ消えても害はない）
        await password_mismatch_store.clear_failures(user.id, tenant_id, redis_client)
        await session.commit()

        token = create_access_token(user.login_id, tenant_id)

        return await build_auth_response(user, token, tenant_id, session)
