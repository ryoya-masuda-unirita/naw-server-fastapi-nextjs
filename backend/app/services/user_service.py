import math
import secrets
import string
from collections.abc import Sequence
from datetime import datetime, timezone, timedelta

from fastapi import HTTPException, status
from typing import Any, cast

from sqlalchemy import exists, select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.credit_quota import (
    TOTAL_CREDITS_SORT_PROPERTY,
    resolve_active_billing_period,
    total_credits_correlated_subquery,
    validate_total_credits_sort,
)
from app.core.sort import SortOrder, build_order_by, enum_as_string, find_order
from app.core.password_policy import check_password_not_reused, verify_password_strength
from app.core.security import hash_password
from app.models.group import GroupUser
from app.models.tenant import Tenant
from app.models.user import User, UserRole
from app.repositories.password_history_repository import PasswordHistoryRepository
from app.repositories.tenant_repository import TenantRepository
from app.repositories.token_usage_repository import TokenUsageRepository
from app.repositories.user_repository import UserRepository
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
    """ユーザー管理（一覧・作成・更新・削除・プロフィール）の業務ロジック。"""

    # SQLModelはMapped[]注釈を使わないため、クラス属性アクセス（User.created_at等）は
    # mypy上InstrumentedAttributeではなくPydanticフィールド型として解釈される。
    # 実行時の型（InstrumentedAttribute）とは一致しないためAnyとする。
    _SORTABLE_COLUMNS: dict[str, Any] = {
        "created_at": User.created_at,
        "createdAt": User.created_at,
        "login_id": User.login_id,
        "loginId": User.login_id,
        "name": User.name,
        # 移植元は users.role を varchar(32) で保持するため権限順は文字列順
        # (ADMIN < SYSTEM < USER) になる。こちらはネイティブ enum の宣言順
        # (USER < ADMIN < SYSTEM) に並んでしまうため、文字列にして揃える。
        "role": enum_as_string(User.role),
        "updated_at": User.updated_at,
        "updatedAt": User.updated_at,
    }

    @staticmethod
    async def get_users(
        tenant_id: str,
        page: int,
        size: int,
        sort: Sequence[SortOrder],
        search_text: str | None,
        role: str | None,
        exclude_group_id: str | None,
        session: AsyncSession,
        *,
        include_usage: bool = False,
    ) -> PagedUserResponse:
        """ユーザー一覧をページネーションで取得する。

        NAW-1172: `include_usage=True`の場合、有効な請求期間内の`totalCredits`
        （クレジット利用量合計）をレスポンスに付与する。`sort=totalCredits`は
        `include_usage=True`の場合のみ許可され、有効な請求期間が存在する場合に限り
        DBクエリでその合計値によりソートする。

        Parameters
        ----------
        tenant_id : str
            テナントID。
        page : int
            ページ番号（0始まり）。
        size : int
            1ページあたりの件数。
        sort : Sequence[SortOrder]
            並べ替え指定の並び。
        search_text : str | None
            loginId・name の部分一致検索文字列。
        role : str | None
            ロールフィルター（"USER"・"ADMIN"・"SYSTEM"）。
        exclude_group_id : str | None
            除外グループID。指定したグループに所属するユーザーを除外する。
        session : AsyncSession
            非同期DBセッション。
        include_usage : bool
            Trueの場合、請求期間内のtotalCreditsをレスポンスに含める。

        Returns
        -------
        PagedUserResponse
            ページネーション済みのユーザー一覧。

        Raises
        ------
        HTTPException
            `sort=totalCredits`が指定されているのに
            `include_usage=False`の場合、または`role`が不正な値の場合400を返す。
        """
        validate_total_credits_sort(sort, include_usage)
        role_filter = UserService._parse_role(role)

        # SYSTEM ロール（Waha等の内部連携用ユーザー）は管理画面の一覧に表示しない。
        # role=SYSTEM が明示的に指定された場合もこの条件は外さず、結果は0件になる
        # （NAW-1096: naw-server側の UserSpecifications.visibleToAdmin() と同一の挙動）。
        stmt = select(User).where(
            User.tenant_id == tenant_id, User.role != UserRole.SYSTEM
        )

        if search_text:
            pattern = UserService._escape_like_pattern(search_text.lower())
            stmt = stmt.where(
                or_(
                    func.lower(User.login_id).like(pattern, escape="\\"),
                    func.lower(User.name).like(pattern, escape="\\"),
                )
            )

        if role_filter is not None:
            stmt = stmt.where(User.role == role_filter)

        # 移植元の`isBlank`と同じく、空白だけの値は指定なしとして扱う。
        if exclude_group_id and exclude_group_id.strip():
            # グループのメンバー追加ダイアログで、所属済みのユーザーを候補から外すための条件。
            # 移植元と同じくグループの存在は確かめず、存在しない・他テナントのIDでは
            # 何も除外しない。所属行はこのテナントのものだけを見て、他テナントの
            # グループの所属行で結果が変わらないようにする（アシスタント・プロンプト
            # テンプレートの除外と同じ）。
            stmt = stmt.where(
                ~exists().where(
                    GroupUser.user_id == User.id,
                    GroupUser.group_id == exclude_group_id,
                    GroupUser.tenant_id == tenant_id,
                )
            )

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await session.execute(count_stmt)).scalar() or 0

        billing_period = (
            await resolve_active_billing_period(tenant_id, session)
            if include_usage
            else None
        )
        # period_from・period_toは常に両方Noneか両方datetimeのペアなので、
        # タプルとして一括で保持しmypy上もペアで narrow されるようにする。
        period: tuple[datetime, datetime] | None = (
            (billing_period[2], billing_period[3])
            if billing_period is not None
            else None
        )

        total_credits_order = find_order(sort, TOTAL_CREDITS_SORT_PROPERTY)
        if total_credits_order is not None and period is not None:
            period_from, period_to = period
            credits_subq = total_credits_correlated_subquery(
                tenant_id, period_from, period_to, User.id
            )
            is_desc = total_credits_order.descending
            # 利用クレジットが同値のケースを名前順で安定化させる（移植元同様の副次ソート）。
            # 利用クレジット順の判定は移植元と同じく指定のいずれかに含まれるかで行い、
            # 並びは従来どおり利用クレジット順＋表示名順とする（他の並べ替え指定は使わない）。
            # 最後に一意な id を主キーと同じ方向で加え、並びを決定的にする。
            id_col = cast(Any, User.id)
            stmt = stmt.order_by(
                credits_subq.desc() if is_desc else credits_subq.asc(),
                cast(Any, User.name).asc(),
                id_col.desc() if is_desc else id_col.asc(),
            )
        else:
            # ソートキーが同値の行（シード投入で同時刻になる更新日時、大半が同じ権限など）は
            # ORDER BY だけでは順序が定まらないため、一意な id を最終キーに加える。
            stmt = stmt.order_by(
                *build_order_by(
                    sort,
                    UserService._SORTABLE_COLUMNS,
                    fallback=User.created_at,
                    tie_breaker=User.id,
                )
            )

        stmt = stmt.offset(page * size).limit(size)

        users = (await session.execute(stmt)).scalars().all()
        total_pages = math.ceil(total / size) if size > 0 else 0

        if include_usage and period is not None:
            period_from, period_to = period
            totals = await TokenUsageRepository.sum_total_credits_by_user_ids(
                tenant_id, period_from, period_to, [u.id for u in users], session
            )
            content = [UserResponse.from_user(u, totals.get(u.id, 0)) for u in users]
        elif include_usage:
            # 有効な請求期間が存在しない（契約なし等）場合はtotalCreditsをNoneのまま返す
            # （移植元同様、クレジット利用量の集計自体を行わない）。
            content = [UserResponse.from_user(u, None) for u in users]
        else:
            content = [UserResponse.from_user(u) for u in users]

        return PagedUserResponse(
            content=content,
            totalElements=total,
            totalPages=total_pages,
            number=page,
            numberOfElements=len(content),
            first=page == 0,
            last=page + 1 >= total_pages,
            empty=not content,
            size=size,
        )

    @staticmethod
    def _escape_like_pattern(value: str) -> str:
        """LIKE検索のワイルドカード文字（% _ \\）をエスケープし前後に%を付与する。

        Parameters
        ----------
        value : str
            エスケープ対象の検索文字列。

        Returns
        -------
        str
            LIKE検索にそのまま使用できるエスケープ済みパターン文字列。
        """
        escaped = value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        return f"%{escaped}%"

    @staticmethod
    def _parse_role(role: str | None) -> UserRole | None:
        """ロールフィルターの文字列を UserRole に変換する。

        移植元(Spring Boot)`UserService`は`User.ROLE.valueOf(role)`で変換し、変換できない
        値は`IllegalArgumentException`として400を返す。大文字小文字を区別し、空・空白のみは
        絞り込みなしとして扱う点も移植元と同じ。

        Parameters
        ----------
        role : str | None
            リクエストで指定されたロールフィルター。

        Returns
        -------
        UserRole | None
            変換した UserRole。未指定・空白のみの場合は None。

        Raises
        ------
        HTTPException
            UserRole に存在しない値の場合400を返す。
        """
        if role is None or not role.strip():
            return None
        try:
            return UserRole(role)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"不正なroleです: {role}",
            ) from None

    @staticmethod
    async def _issue_initial_password(
        user: User, tenant: Tenant, session: AsyncSession
    ) -> tuple[str, datetime]:
        """初期パスワードを生成し、パスワード履歴へ保存する。

        Parameters
        ----------
        user : User
            対象ユーザー。
        tenant : Tenant
            パスワードポリシーを持つテナント。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        tuple[str, datetime]
            生成した平文パスワードと有効期限のタプル。
        """
        plain_password = UserService._generate_initial_password(tenant)
        expired_at = datetime.now(timezone.utc) + timedelta(
            days=tenant.pw_validity_period_days
        )
        await PasswordHistoryRepository.save(
            user.id,
            tenant.id,
            hash_password(plain_password),
            session,
            expired_at=expired_at,
        )
        return plain_password, expired_at

    @staticmethod
    async def create_user(
        req: UserCreateRequest,
        tenant_id: str,
        session: AsyncSession,
    ) -> UserCreateResponse:
        """ユーザーを新規作成し、初期パスワードを返す。

        Parameters
        ----------
        req : UserCreateRequest
            ユーザー作成リクエスト。
        tenant_id : str
            テナントID。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        UserCreateResponse
            作成したユーザー情報と初期パスワード。

        Raises
        ------
        HTTPException
            loginId が既に存在する場合 400 を返す。
        """
        existing = await UserRepository.find_by_login_id(
            req.loginId, tenant_id, session
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"User with login id {req.loginId} already exists",
            )

        tenant = await UserService._get_tenant(tenant_id, session)

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

        plain_password, expired_at = await UserService._issue_initial_password(
            user, tenant, session
        )
        await session.commit()
        await session.refresh(user)

        return UserCreateResponse.from_user(
            user, plain_password, expired_at, req.loginKey
        )

    @staticmethod
    async def update_user(
        user_id: str,
        req: UserUpdateRequest,
        tenant_id: str,
        session: AsyncSession,
    ) -> UserUpdateResponse:
        """ユーザー情報を更新する。resetPassword=True の場合はパスワードを再生成する。

        Parameters
        ----------
        user_id : str
            更新対象ユーザーのloginId。
        req : UserUpdateRequest
            ユーザー更新リクエスト。
        tenant_id : str
            テナントID。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        UserUpdateResponse
            更新後のユーザー情報。パスワードリセット時は initialPassword を含む。

        Raises
        ------
        HTTPException
            ユーザーが存在しない場合 404 を返す。
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
            plain_password, expired_at = await UserService._issue_initial_password(
                user, tenant, session
            )
            user.is_required_password_reset = True

        session.add(user)
        await session.commit()
        await session.refresh(user)

        return UserUpdateResponse.from_user(
            user, plain_password, expired_at, req.loginKey
        )

    @staticmethod
    async def delete_user(user_id: str, tenant_id: str, session: AsyncSession) -> None:
        """ユーザーを削除する。存在しない場合は何もしない。

        Parameters
        ----------
        user_id : str
            削除対象ユーザーのloginId。
        tenant_id : str
            テナントID。
        session : AsyncSession
            非同期DBセッション。
        """
        user = await UserRepository.find_by_login_id(user_id, tenant_id, session)
        if user:
            await session.delete(user)
            await session.commit()

    @staticmethod
    async def get_profile(
        login_id: str, tenant_id: str, session: AsyncSession
    ) -> UserResponse:
        """ログインユーザー自身のプロフィールを取得する。

        Parameters
        ----------
        login_id : str
            ログインID。
        tenant_id : str
            テナントID。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        UserResponse
            ユーザー情報。

        Raises
        ------
        HTTPException
            ユーザーが存在しない場合 404 を返す。
        """
        return UserResponse.from_user(
            await UserService._get_user(login_id, tenant_id, session)
        )

    @staticmethod
    async def update_profile(
        login_id: str,
        req: UserProfileUpdateRequest,
        tenant_id: str,
        session: AsyncSession,
    ) -> UserResponse:
        """ログインユーザー自身のパスワードを更新する。

        Parameters
        ----------
        login_id : str
            ログインID。
        req : UserProfileUpdateRequest
            プロフィール更新リクエスト。
        tenant_id : str
            テナントID。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        UserResponse
            更新後のユーザー情報。

        Raises
        ------
        HTTPException
            ユーザーが存在しない場合 404 を返す。
        HTTPException
            新パスワードがポリシーを満たさない場合 400 を返す。
        """
        user = await UserService._get_user(login_id, tenant_id, session)

        if req.password:
            tenant = await UserService._get_tenant(tenant_id, session)
            verify_password_strength(req.password, tenant)
            await check_password_not_reused(user.id, req.password, tenant, session)
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

        Parameters
        ----------
        login_id : str
            ログインID。
        tenant_id : str
            テナントID。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        User
            User オブジェクト。

        Raises
        ------
        HTTPException
            ユーザーが存在しない場合 404 を返す。
        """
        user = await UserRepository.find_by_login_id(login_id, tenant_id, session)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
            )
        return user

    @staticmethod
    async def _get_tenant(tenant_id: str, session: AsyncSession) -> Tenant:
        """テナントIDでテナントを取得する。存在しない場合は 400 を送出する。

        Parameters
        ----------
        tenant_id : str
            テナントID。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        Tenant
            Tenant オブジェクト。

        Raises
        ------
        HTTPException
            テナントが存在しない場合 400 を返す。
        """
        tenant = await TenantRepository.find_by_id(tenant_id, session)
        if not tenant:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Tenant not found"
            )
        return tenant

    @staticmethod
    def _generate_initial_password(tenant: Tenant) -> str:
        """テナントのパスワードポリシーに準拠した初期パスワードを生成する。

        Parameters
        ----------
        tenant : Tenant
            パスワードポリシーを持つテナント。

        Returns
        -------
        str
            ランダム生成された初期パスワード文字列。

        Raises
        ------
        ValueError
            パスワードポリシーで文字種が1つも有効でない場合。
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
            raise ValueError(
                "パスワードポリシーが無効です: 少なくとも1つの文字種を有効にする必要があります"
            )

        length = max(tenant.pw_policy_min_length, len(required))
        chars = required + [secrets.choice(pool) for _ in range(length - len(required))]
        secrets.SystemRandom().shuffle(chars)
        return "".join(chars)
