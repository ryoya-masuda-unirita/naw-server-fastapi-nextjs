from datetime import datetime

import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.password_history import PasswordHistory


class PasswordHistoryRepository:
    @staticmethod
    async def get_latest(
        user_id: uuid.UUID, session: AsyncSession
    ) -> PasswordHistory | None:
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
        new_history = PasswordHistory(
            tenant_id=tenant_id,
            user_id=user_id,
            password=hashed_password,
            expired_at=expired_at,
        )
        session.add(new_history)
        await session.flush()
        return new_history
