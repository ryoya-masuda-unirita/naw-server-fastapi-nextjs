import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.login_key import hash_login_key
from app.models.user import User


class UserRepository:
    """ユーザー（`users`）のDBアクセス。"""

    @staticmethod
    async def find_by_login_id(
        login_id: str, tenant_id: str, session: AsyncSession
    ) -> User | None:
        """loginId と tenantId でユーザーを取得する。

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
        User | None
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

        DB にはハッシュ値だけがあるため、ログインキーをハッシュ化して照合する。
        tenant_id もクエリ条件に含めることで、別テナントの同じログインキーを
        持つユーザーを取得できないようにし、テナント分離をクエリレベルで担保する。

        Parameters
        ----------
        login_key : str
            ログインキー（平文）。
        tenant_id : str
            テナントID。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        User | None
            該当する User。存在しない場合は None。
        """
        stmt = select(User).where(
            User.login_key_hash == hash_login_key(login_key),
            User.tenant_id == tenant_id,
        )
        result = await session.execute(stmt)
        return result.scalars().first()

    @staticmethod
    async def find_by_login_ids(
        login_ids: set[str], tenant_id: str, session: AsyncSession
    ) -> dict[str, User]:
        """loginId一覧とtenantIdでユーザーをまとめて取得する。

        Parameters
        ----------
        login_ids : set[str]
            ログインIDの集合。
        tenant_id : str
            テナントID。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        dict[str, User]
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
    async def find_by_ids(
        user_ids: set[uuid.UUID], tenant_id: str, session: AsyncSession
    ) -> dict[uuid.UUID, User]:
        """ユーザーID一覧とtenantIdでユーザーをまとめて取得する。

        一覧取得結果の各行に紐づくユーザー名（`updatedBy`等）を解決する際、行数分の
        個別クエリを発行するN+1を避けるために使う。

        Parameters
        ----------
        user_ids : set[uuid.UUID]
            ユーザーIDの集合。
        tenant_id : str
            テナントID。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        dict[uuid.UUID, User]
            ユーザーIDをキーとした User の辞書。
        """
        if not user_ids:
            return {}
        stmt = select(User).where(User.id.in_(user_ids), User.tenant_id == tenant_id)
        result = await session.execute(stmt)
        return {user.id: user for user in result.scalars().all()}

    @staticmethod
    async def find_by_id_and_tenant_id(
        user_id: uuid.UUID, tenant_id: str, session: AsyncSession
    ) -> User | None:
        """ユーザーIDとテナントIDでユーザーを取得する。

        Parameters
        ----------
        user_id : uuid.UUID
            ユーザーID。
        tenant_id : str
            テナントID。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        User | None
            該当する User。存在しない場合は None。
        """
        stmt = select(User).where(User.id == user_id, User.tenant_id == tenant_id)
        result = await session.execute(stmt)
        return result.scalars().first()
