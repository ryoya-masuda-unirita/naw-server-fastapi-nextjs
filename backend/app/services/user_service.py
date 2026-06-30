import math
import secrets
import string
from datetime import datetime, timezone, timedelta

from fastapi import HTTPException, status
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.tenant import Tenant
from app.models.user import User, UserRole
from app.repositories.password_history_repository import PasswordHistoryRepository
from app.schemas.user import (
    PagedUserResponse,
    UserCreateRequest,
    UserCreateResponse,
    UserProfileUpdateRequest,
    UserResponse,
    UserUpdateRequest,
    UserUpdateResponse,
)


class UserService:

    @staticmethod
    async def get_users(
        tenant_id: str,
        page: int,
        size: int,
        sort: str,
        search_text: str | None,
        role: str | None,
        exclude_group_id: str | None,
        session: AsyncSession,
    ) -> PagedUserResponse:
        """ユーザー一覧をページネーションで取得する。

        Args:
            tenant_id: テナントID。
            page: ページ番号（0始まり）。
            size: 1ページあたりの件数。
            sort: ソート指定（例: "created_at,desc"）。
            search_text: loginId・name の部分一致検索文字列。
            role: ロールフィルター。
            exclude_group_id: 除外グループID（グループ機能実装時に対応）。
            session: 非同期DBセッション。

        Returns:
            ページネーション済みのユーザー一覧。
        """
        stmt = select(User).where(User.tenant_id == tenant_id)

        if search_text:
            pattern = f"%{search_text.lower()}%"
            stmt = stmt.where(
                or_(
                    func.lower(User.login_id).like(pattern),
                    func.lower(User.name).like(pattern),
                )
            )

        if role:
            stmt = stmt.where(User.role == UserRole(role))

        # excludeGroupId はグループ機能実装時に対応する

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await session.execute(count_stmt)).scalar() or 0

        sort_parts = sort.split(",")
        sort_col_name = sort_parts[0] if sort_parts else "created_at"
        sort_dir = sort_parts[1] if len(sort_parts) > 1 else "asc"
        col = getattr(User, sort_col_name, User.created_at)
        stmt = stmt.order_by(col.desc() if sort_dir == "desc" else col.asc())
        stmt = stmt.offset(page * size).limit(size)

        users = (await session.execute(stmt)).scalars().all()
        total_pages = math.ceil(total / size) if size > 0 else 0

        return PagedUserResponse(
            content=[UserResponse.from_user(u) for u in users],
            totalElements=total,
            totalPages=total_pages,
            page=page,
            size=size,
        )

    @staticmethod
    async def create_user(
        req: UserCreateRequest,
        tenant_id: str,
        session: AsyncSession,
    ) -> UserCreateResponse:
        """ユーザーを新規作成し、初期パスワードを返す。

        Args:
            req: ユーザー作成リクエスト。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            作成したユーザー情報と初期パスワード。

        Raises:
            HTTPException: loginId が既に存在する場合 400 を返す。
        """
        existing = (
            await session.execute(
                select(User).where(User.login_id == req.loginId, User.tenant_id == tenant_id)
            )
        ).scalars().first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"User with login id {req.loginId} already exists",
            )

        tenant = await UserService._get_tenant(tenant_id, session)
        plain_password = UserService._generate_initial_password(tenant)
        expired_at = datetime.now(timezone.utc) + timedelta(days=tenant.pw_validity_period_days)

        user = User(
            login_id=req.loginId,
            name=req.name,
            role=req.role,
            login_key=req.loginKey,
            tenant_id=tenant_id,
            is_required_password_reset=True,
        )
        session.add(user)
        await session.flush()

        await PasswordHistoryRepository.save(
            user.id, tenant_id, hash_password(plain_password), session, expired_at=expired_at
        )
        await session.commit()
        await session.refresh(user)

        return UserCreateResponse(
            **UserResponse.from_user(user).model_dump(),
            initialPassword=plain_password,
            passwordExpiredAt=expired_at,
        )

    @staticmethod
    async def update_user(
        user_id: str,
        req: UserUpdateRequest,
        tenant_id: str,
        session: AsyncSession,
    ) -> UserUpdateResponse:
        """ユーザー情報を更新する。resetPassword=True の場合はパスワードを再生成する。

        Args:
            user_id: 更新対象ユーザーのloginId。
            req: ユーザー更新リクエスト。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            更新後のユーザー情報。パスワードリセット時は initialPassword を含む。

        Raises:
            HTTPException: ユーザーが存在しない場合 404 を返す。
        """
        user = await UserService._get_user(user_id, tenant_id, session)

        if req.name is not None:
            user.name = req.name
        if req.role is not None:
            user.role = req.role
        if req.loginKey is not None:
            user.login_key = req.loginKey

        plain_password = None
        expired_at = None

        if req.resetPassword:
            tenant = await UserService._get_tenant(tenant_id, session)
            plain_password = UserService._generate_initial_password(tenant)
            expired_at = datetime.now(timezone.utc) + timedelta(days=tenant.pw_validity_period_days)
            await PasswordHistoryRepository.save(
                user.id, tenant_id, hash_password(plain_password), session, expired_at=expired_at
            )
            user.is_required_password_reset = True

        session.add(user)
        await session.commit()
        await session.refresh(user)

        return UserUpdateResponse(
            **UserResponse.from_user(user).model_dump(),
            initialPassword=plain_password,
            passwordExpiredAt=expired_at,
        )

    @staticmethod
    async def delete_user(user_id: str, tenant_id: str, session: AsyncSession) -> None:
        """ユーザーを削除する。存在しない場合は何もしない。

        Args:
            user_id: 削除対象ユーザーのloginId。
            tenant_id: テナントID。
            session: 非同期DBセッション。
        """
        user = (
            await session.execute(
                select(User).where(User.login_id == user_id, User.tenant_id == tenant_id)
            )
        ).scalars().first()
        if user:
            await session.delete(user)
            await session.commit()

    @staticmethod
    async def get_profile(login_id: str, tenant_id: str, session: AsyncSession) -> UserResponse:
        """ログインユーザー自身のプロフィールを取得する。

        Args:
            login_id: ログインID。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            ユーザー情報。

        Raises:
            HTTPException: ユーザーが存在しない場合 404 を返す。
        """
        return UserResponse.from_user(await UserService._get_user(login_id, tenant_id, session))

    @staticmethod
    async def update_profile(
        login_id: str,
        req: UserProfileUpdateRequest,
        tenant_id: str,
        session: AsyncSession,
    ) -> UserResponse:
        """ログインユーザー自身のパスワードを更新する。

        Args:
            login_id: ログインID。
            req: プロフィール更新リクエスト。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            更新後のユーザー情報。

        Raises:
            HTTPException: ユーザーが存在しない場合 404 を返す。
        """
        user = await UserService._get_user(login_id, tenant_id, session)

        if req.password:
            await PasswordHistoryRepository.save(
                user.id, tenant_id, hash_password(req.password), session
            )
            user.is_required_password_reset = False
            session.add(user)
            await session.commit()
            await session.refresh(user)

        return UserResponse.from_user(user)

    @staticmethod
    async def _get_user(login_id: str, tenant_id: str, session: AsyncSession) -> User:
        """loginId でユーザーを取得する。存在しない場合は 404 を送出する。

        Args:
            login_id: ログインID。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            User オブジェクト。

        Raises:
            HTTPException: ユーザーが存在しない場合 404 を返す。
        """
        user = (
            await session.execute(
                select(User).where(User.login_id == login_id, User.tenant_id == tenant_id)
            )
        ).scalars().first()
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        return user

    @staticmethod
    async def _get_tenant(tenant_id: str, session: AsyncSession) -> Tenant:
        """テナントIDでテナントを取得する。存在しない場合は 400 を送出する。

        Args:
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            Tenant オブジェクト。

        Raises:
            HTTPException: テナントが存在しない場合 400 を返す。
        """
        tenant = (
            await session.execute(select(Tenant).where(Tenant.id == tenant_id))
        ).scalars().first()
        if not tenant:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tenant not found")
        return tenant

    @staticmethod
    def _generate_initial_password(tenant: Tenant) -> str:
        """テナントのパスワードポリシーに準拠した初期パスワードを生成する。

        Args:
            tenant: パスワードポリシーを持つテナント。

        Returns:
            ランダム生成された初期パスワード文字列。

        Raises:
            ValueError: パスワードポリシーで文字種が1つも有効でない場合。
        """
        pool = ""
        required: list[str] = []

        if tenant.pw_policy_use_uppercase:
            required.append(secrets.choice(string.ascii_uppercase))
            pool += string.ascii_uppercase
        if tenant.pw_policy_use_lowercase:
            required.append(secrets.choice(string.ascii_lowercase))
            pool += string.ascii_lowercase
        if tenant.pw_policy_use_digits:
            required.append(secrets.choice(string.digits))
            pool += string.digits
        if tenant.pw_policy_use_symbols and tenant.pw_policy_valid_symbols:
            required.append(secrets.choice(tenant.pw_policy_valid_symbols))
            pool += tenant.pw_policy_valid_symbols

        if not pool:
            raise ValueError("パスワードポリシーが無効です: 少なくとも1つの文字種を有効にする必要があります")

        length = max(tenant.pw_policy_min_length, len(required))
        chars = required + [secrets.choice(pool) for _ in range(length - len(required))]
        secrets.SystemRandom().shuffle(chars)
        return "".join(chars)
