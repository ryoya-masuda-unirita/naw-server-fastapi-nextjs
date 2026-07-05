from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.group import GroupUser
from app.models.user import User


class GroupUserRepository:

    @staticmethod
    async def is_group_admin(group_id: str, tenant_id: str, user_id: UUID, session: AsyncSession) -> bool:
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
    async def find_admin_group_ids_for_user(tenant_id: str, user_id: UUID, session: AsyncSession) -> list[str]:
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
    async def find_belonging_group_ids(tenant_id: str, user_id: UUID, session: AsyncSession) -> list[str]:
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
    async def find_by_group(group_id: str, tenant_id: str, session: AsyncSession) -> list[tuple[GroupUser, User]]:
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
            GroupUser.group_id == group_id, GroupUser.tenant_id == tenant_id, GroupUser.user_id == user_id
        )
        result = await session.execute(stmt)
        return result.scalars().first()

    @staticmethod
    async def find_page_by_group(
        group_id: str,
        tenant_id: str,
        search_text: str | None,
        role: str | None,
        sort_col_name: str,
        sort_dir: str,
        page: int,
        size: int,
        session: AsyncSession,
    ) -> tuple[list[tuple[GroupUser, User]], int]:
        """グループ所属ユーザーをページネーションで取得する（Userを結合）。

        Args:
            group_id: グループID。
            tenant_id: テナントID。
            search_text: ユーザー名・loginIdの部分一致検索文字列。
            role: グループ内ロール（"ADMIN"はis_admin=true、"USER"はis_admin=false）。
            sort_col_name: ソート対象列名（"name" または "role" または "updatedAt"）。
            sort_dir: ソート方向（"asc" または "desc"）。
            page: ページ番号（0始まり）。
            size: 1ページあたりの件数。
            session: 非同期DBセッション。

        Returns:
            ((GroupUser, User) のリスト, 総件数) のタプル。
        """
        stmt = (
            select(GroupUser, User)
            .join(User, User.id == GroupUser.user_id)
            .where(GroupUser.group_id == group_id, GroupUser.tenant_id == tenant_id)
        )

        if search_text:
            pattern = f"%{search_text.lower()}%"
            stmt = stmt.where(
                func.lower(User.name).like(pattern) | func.lower(User.login_id).like(pattern)
            )

        if role == "ADMIN":
            stmt = stmt.where(GroupUser.is_admin.is_(True))
        elif role == "USER":
            stmt = stmt.where(GroupUser.is_admin.is_(False))

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await session.execute(count_stmt)).scalar() or 0

        if sort_col_name == "role":
            sort_col = GroupUser.is_admin
        elif sort_col_name == "updatedAt":
            sort_col = GroupUser.updated_at
        else:
            sort_col = User.name
        stmt = stmt.order_by(sort_col.desc() if sort_dir == "desc" else sort_col.asc())
        stmt = stmt.offset(page * size).limit(size)

        rows = (await session.execute(stmt)).all()
        return [(row[0], row[1]) for row in rows], total

    @staticmethod
    def add(group_id: str, tenant_id: str, user_id: UUID, session: AsyncSession) -> None:
        """グループにユーザーを追加する（セッションに登録するのみ。コミットは呼び出し側で行う）。

        Args:
            group_id: グループID。
            tenant_id: テナントID。
            user_id: 追加するユーザーID。
            session: 非同期DBセッション。
        """
        session.add(GroupUser(group_id=group_id, tenant_id=tenant_id, user_id=user_id, is_admin=False))

    @staticmethod
    async def remove(group_user: GroupUser, session: AsyncSession) -> None:
        """グループからユーザーを除外する。

        Args:
            group_user: 削除対象の GroupUser。
            session: 非同期DBセッション。
        """
        await session.delete(group_user)
        await session.commit()
