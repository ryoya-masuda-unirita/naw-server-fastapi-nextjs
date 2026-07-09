import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


class UserRepository:
    @staticmethod
    async def find_by_login_id(
        login_id: str, tenant_id: str, session: AsyncSession
    ) -> User | None:
        """loginId と tenantId でユーザーを取得する。

        Args:
            login_id: ログインID。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            該当する User。存在しない場合は None。
        """
        stmt = select(User).where(
            User.login_id == login_id, User.tenant_id == tenant_id
        )
        result = await session.execute(stmt)
        return result.scalars().first()

    @staticmethod
    async def find_by_login_key(
        login_key: str, tenant_id: str, session: AsyncSession
    ) -> User | None:
        """ログインキーとtenantIdでユーザーを取得する。

        tenant_id もクエリ条件に含めることで、別テナントの同じログインキーを
        持つユーザーを取得できないようにし、テナント分離をクエリレベルで担保する。

        Args:
            login_key: ログインキー。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            該当する User。存在しない場合は None。
        """
        stmt = select(User).where(
            User.login_key == login_key, User.tenant_id == tenant_id
        )
        result = await session.execute(stmt)
        return result.scalars().first()

    @staticmethod
    async def find_by_login_ids(
        login_ids: set[str], tenant_id: str, session: AsyncSession
    ) -> dict[str, User]:
        """loginId一覧とtenantIdでユーザーをまとめて取得する。

        Args:
            login_ids: ログインIDの集合。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            loginId をキーとした User の辞書。
        """
        if not login_ids:
            return {}
        stmt = select(User).where(
            User.login_id.in_(login_ids), User.tenant_id == tenant_id
        )
        result = await session.execute(stmt)
        return {user.login_id: user for user in result.scalars().all()}

    @staticmethod
    async def find_by_id_and_tenant_id(
        user_id: uuid.UUID, tenant_id: str, session: AsyncSession
    ) -> User | None:
        """ユーザーIDとテナントIDでユーザーを取得する。

        Args:
            user_id: ユーザーID。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            該当する User。存在しない場合は None。
        """
        stmt = select(User).where(User.id == user_id, User.tenant_id == tenant_id)
        result = await session.execute(stmt)
        return result.scalars().first()
