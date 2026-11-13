from datetime import datetime

import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.password_history import PasswordHistory


class PasswordHistoryRepository:
    """パスワード履歴のDBアクセスをまとめたリポジトリ。"""

    @staticmethod
    async def get_latest(
        user_id: uuid.UUID, session: AsyncSession
    ) -> PasswordHistory | None:
        """ユーザーの最新のパスワード履歴を取得する。

        Parameters
        ----------
        user_id : uuid.UUID
            ユーザーID。
        session : AsyncSession
            データベースセッション。

        Returns
        -------
        PasswordHistory | None
            最新の履歴。なければ None。
        """
        stmt = (
            select(PasswordHistory)
            .where(PasswordHistory.user_id == user_id)
            .order_by(PasswordHistory.created_at.desc())
            .limit(1)
        )
        result = await session.execute(stmt)
        return result.scalars().first()

    @staticmethod
    async def get_recent_hashes(
        user_id: uuid.UUID, limit: int, session: AsyncSession
    ) -> list[str]:
        """ユーザーの直近のパスワードハッシュを新しい順に取得する。

        Parameters
        ----------
        user_id : uuid.UUID
            ユーザーID。
        limit : int
            取得する最大件数。
        session : AsyncSession
            データベースセッション。

        Returns
        -------
        list[str]
            ハッシュ化済みパスワードの一覧。
        """
        stmt = (
            select(PasswordHistory.password)
            .where(PasswordHistory.user_id == user_id)
            .order_by(PasswordHistory.created_at.desc())
            .limit(limit)
        )
        result = await session.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def save(
        user_id: uuid.UUID,
        tenant_id: str,
        hashed_password: str,
        session: AsyncSession,
        expired_at: datetime | None = None,
    ) -> PasswordHistory:
        """パスワード履歴を登録する。

        Parameters
        ----------
        user_id : uuid.UUID
            ユーザーID。
        tenant_id : str
            テナントID。
        hashed_password : str
            ハッシュ化済みのパスワード。
        session : AsyncSession
            データベースセッション。
        expired_at : datetime | None
            パスワードの有効期限。無期限の場合は None。

        Returns
        -------
        PasswordHistory
            登録した履歴。
        """
        new_history = PasswordHistory(
            tenant_id=tenant_id,
            user_id=user_id,
            password=hashed_password,
            expired_at=expired_at,
        )
        session.add(new_history)
        await session.flush()
        return new_history
