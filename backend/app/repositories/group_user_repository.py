from collections.abc import Sequence
from datetime import datetime
from typing import Any, cast
from uuid import UUID

from sqlalchemy import false, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.credit_quota import (
    TOTAL_CREDITS_SORT_PROPERTY,
    total_credits_correlated_subquery,
)
from app.core.search import escape_like_pattern
from app.core.sort import SortOrder, build_order_by, find_order
from app.models.group import GroupUser
from app.models.user import User, UserRole

# 所属ユーザー一覧の role 絞り込みで受け付けるグループ内ロール（大文字で比較する）
_GROUP_ROLE_ADMIN = "ADMIN"
_GROUP_ROLE_USER = "USER"

# 移植元(GroupService.remapGroupMemberUserSort)は name を ignoreCase 指定で user.name に
# 読み替え、lower(user.name) で並べる。role はチーム管理者フラグに読み替える。
# 対応表にないキーは従来どおり表示名順にする。
_MEMBER_NAME_SORT_COLUMN: Any = func.lower(User.name)
_MEMBER_SORT_COLUMNS: dict[str, Any] = {
    "name": _MEMBER_NAME_SORT_COLUMN,
    "role": GroupUser.is_admin,
    "updatedAt": GroupUser.updated_at,
}


class GroupUserRepository:
    @staticmethod
    async def is_group_admin(
        group_id: str, tenant_id: str, user_id: UUID, session: AsyncSession
    ) -> bool:
        """指定ユーザーが指定グループのグループ内管理者かどうかを判定する。

        Args:
            group_id: グループID。
            tenant_id: テナントID。
            user_id: ユーザーID。
            session: 非同期DBセッション。

        Returns:
            グループ内管理者であれば True。
        """
        stmt = select(GroupUser).where(
            GroupUser.group_id == group_id,
            GroupUser.tenant_id == tenant_id,
            GroupUser.user_id == user_id,
            GroupUser.is_admin.is_(True),
        )
        result = await session.execute(stmt)
        return result.scalars().first() is not None

    @staticmethod
    async def find_admin_group_ids_for_user(
        tenant_id: str, user_id: UUID, session: AsyncSession
    ) -> list[str]:
        """指定ユーザーがグループ内管理者になっているグループID一覧を取得する。

        Args:
            tenant_id: テナントID。
            user_id: ユーザーID。
            session: 非同期DBセッション。

        Returns:
            グループID一覧。
        """
        stmt = select(GroupUser.group_id).where(
            GroupUser.tenant_id == tenant_id,
            GroupUser.user_id == user_id,
            GroupUser.is_admin.is_(True),
        )
        result = await session.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def find_belonging_group_ids(
        tenant_id: str, user_id: UUID, session: AsyncSession
    ) -> list[str]:
        """指定ユーザーが所属する全グループID一覧を取得する（isBelonged=true用）。

        Args:
            tenant_id: テナントID。
            user_id: ユーザーID。
            session: 非同期DBセッション。

        Returns:
            グループID一覧。
        """
        stmt = select(GroupUser.group_id).where(
            GroupUser.tenant_id == tenant_id, GroupUser.user_id == user_id
        )
        result = await session.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def find_by_group(
        group_id: str, tenant_id: str, session: AsyncSession
    ) -> list[tuple[GroupUser, User]]:
        """グループ所属ユーザー一覧を取得する（Userを結合して1クエリで取得しN+1を避ける）。

        Args:
            group_id: グループID。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            (GroupUser, User) のリスト。
        """
        stmt = (
            select(GroupUser, User)
            .join(User, User.id == GroupUser.user_id)
            .where(GroupUser.group_id == group_id, GroupUser.tenant_id == tenant_id)
        )
        result = await session.execute(stmt)
        return [(row[0], row[1]) for row in result.all()]

    @staticmethod
    async def find_one(
        group_id: str, tenant_id: str, user_id: UUID, session: AsyncSession
    ) -> GroupUser | None:
        """グループ・ユーザーの組み合わせでGroupUserを取得する。

        Args:
            group_id: グループID。
            tenant_id: テナントID。
            user_id: ユーザーID。
            session: 非同期DBセッション。

        Returns:
            該当する GroupUser。存在しない場合は None。
        """
        stmt = select(GroupUser).where(
            GroupUser.group_id == group_id,
            GroupUser.tenant_id == tenant_id,
            GroupUser.user_id == user_id,
        )
        result = await session.execute(stmt)
        return result.scalars().first()

    @staticmethod
    async def find_page_by_group(
        group_id: str,
        tenant_id: str,
        search_text: str | None,
        role: str | None,
        sort: Sequence[SortOrder],
        page: int,
        size: int,
        session: AsyncSession,
        *,
        billing_period: tuple[datetime, datetime] | None = None,
    ) -> tuple[list[tuple[GroupUser, User]], int]:
        """グループ所属ユーザーをページネーションで取得する（Userを結合）。

        Args:
            group_id: グループID。
            tenant_id: テナントID。
            search_text: ユーザー名・loginIdの部分一致検索文字列。
            role: グループ内ロール（大文字小文字を区別せず、"ADMIN"はis_admin=true、
                "USER"はis_admin=false）。None・空白のみなら絞り込まず、未知の値なら0件にする。
            sort: 並べ替え指定の並び（キーは"name"、"role"、"updatedAt"、"totalCredits"）。
                それ以外のキーはユーザー表示名順として扱う。
            page: ページ番号（0始まり）。
            size: 1ページあたりの件数。
            session: 非同期DBセッション。
            billing_period: `(period_from, period_to)`のタプル。NAW-1172:
                `sort`に"totalCredits"が含まれ、かつこの値が与えられた場合のみ、
                請求期間内クレジット合計でDBソートする（Noneの場合は既定のソートに
                フォールバックする。呼び出し側で有効な請求期間がない旨をtotalCredits=None
                として扱うのと整合させるため）。

        Returns:
            ((GroupUser, User) のリスト, 総件数) のタプル。
        """
        stmt = (
            select(GroupUser, User)
            .join(User, User.id == GroupUser.user_id)
            .where(
                GroupUser.group_id == group_id,
                GroupUser.tenant_id == tenant_id,
                # SYSTEM ロール（Waha等の内部連携用ユーザー）は一覧・件数とも含めない
                # （移植元 NAW-1096 の GroupUserSpecification.excludeSystemUsers と同じ）。
                User.role != UserRole.SYSTEM,
            )
        )

        if search_text:
            pattern = escape_like_pattern(search_text.lower())
            stmt = stmt.where(
                func.lower(User.name).like(pattern, escape="\\")
                | func.lower(User.login_id).like(pattern, escape="\\")
            )

        # 移植元 GroupUserSpecification.matchesGroupRole と同じく、空白のみは絞り込まず、
        # 大文字小文字を区別せずに判定し、未知の値は常に偽の条件で0件にする。
        # 移植元は前後の空白を取り除かずに比較するため、ここでも取り除かない。
        if role is not None and role.strip():
            normalized_role = role.upper()
            if normalized_role == _GROUP_ROLE_ADMIN:
                stmt = stmt.where(GroupUser.is_admin.is_(True))
            elif normalized_role == _GROUP_ROLE_USER:
                stmt = stmt.where(GroupUser.is_admin.is_(False))
            else:
                stmt = stmt.where(false())

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await session.execute(count_stmt)).scalar() or 0

        total_credits_order = find_order(sort, TOTAL_CREDITS_SORT_PROPERTY)
        if total_credits_order is not None and billing_period is not None:
            period_from, period_to = billing_period
            credits_subq = total_credits_correlated_subquery(
                tenant_id, period_from, period_to, GroupUser.user_id
            )
            is_desc = total_credits_order.descending
            # 利用クレジットが同値のケースを名前順で安定化させる（移植元同様の副次ソート）。
            # 最後に一意な user_id を主キーと同じ方向で加え、並びを決定的にする。
            user_id_col = cast(Any, GroupUser.user_id)
            stmt = stmt.order_by(
                credits_subq.desc() if is_desc else credits_subq.asc(),
                cast(Any, User.name).asc(),
                user_id_col.desc() if is_desc else user_id_col.asc(),
            )
        else:
            # ソートキーが同値の行（シード投入で同時刻になる追加日時、大半が同じ権限、
            # 同名ユーザーなど）は ORDER BY だけでは順序が定まらないため、
            # 一意な user_id を最終キーに加える。
            stmt = stmt.order_by(
                *build_order_by(
                    sort,
                    _MEMBER_SORT_COLUMNS,
                    fallback=_MEMBER_NAME_SORT_COLUMN,
                    tie_breaker=GroupUser.user_id,
                )
            )
        stmt = stmt.offset(page * size).limit(size)

        rows = (await session.execute(stmt)).all()
        return [(row[0], row[1]) for row in rows], total

    @staticmethod
    def add(
        group_id: str, tenant_id: str, user_id: UUID, session: AsyncSession
    ) -> None:
        """グループにユーザーを追加する（セッションに登録するのみ。コミットは呼び出し側で行う）。

        Args:
            group_id: グループID。
            tenant_id: テナントID。
            user_id: 追加するユーザーID。
            session: 非同期DBセッション。
        """
        session.add(
            GroupUser(
                group_id=group_id, tenant_id=tenant_id, user_id=user_id, is_admin=False
            )
        )

    @staticmethod
    async def remove(group_user: GroupUser, session: AsyncSession) -> None:
        """グループからユーザーを除外する。

        Args:
            group_user: 削除対象の GroupUser。
            session: 非同期DBセッション。
        """
        await session.delete(group_user)
        await session.commit()
