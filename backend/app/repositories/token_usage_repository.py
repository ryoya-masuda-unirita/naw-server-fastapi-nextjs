from datetime import datetime
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import InstrumentedAttribute

from app.models.token_usage import TokenUsage

# orderByで受け付ける値とDBカラムの対応（許可リスト方式で任意カラムのソートを防ぐ）。
_ORDER_BY_COLUMNS: dict[str, InstrumentedAttribute] = {
    "createdAt": TokenUsage.created_at,
    "totalTokens": TokenUsage.total_tokens,
}


class TokenUsageRepository:
    @staticmethod
    def _base_conditions(
        tenant_id: str, from_: datetime, to: datetime, user_id: UUID | None
    ) -> list:
        conditions = [
            TokenUsage.tenant_id == tenant_id,
            TokenUsage.created_at >= from_,
            TokenUsage.created_at <= to,
        ]
        if user_id is not None:
            conditions.append(TokenUsage.user_id == user_id)
        return conditions

    @staticmethod
    async def find_page(
        tenant_id: str,
        from_: datetime,
        to: datetime,
        user_id: UUID | None,
        page: int,
        size: int,
        order_by: str,
        reverse: bool,
        session: AsyncSession,
    ) -> tuple[list[TokenUsage], int]:
        """期間・ユーザーで絞り込んだトークン消費量を1ページ分取得する。

        Args:
            tenant_id: テナントID。
            from_: 期間開始（この値以上）。
            to: 期間終了（この値以下）。
            user_id: 絞り込み対象のユーザーID。Noneなら絞り込まない。
            page: 0始まりのページ番号。
            size: 1ページあたりの件数。
            order_by: ソート対象（`createdAt`または`totalTokens`）。
            reverse: Trueなら降順。
            session: 非同期DBセッション。

        Returns:
            該当ページのレコード一覧と、絞り込み条件全体の総件数のタプル。
        """
        conditions = TokenUsageRepository._base_conditions(
            tenant_id, from_, to, user_id
        )

        count_stmt = select(func.count()).select_from(TokenUsage).where(*conditions)
        total_count = (await session.execute(count_stmt)).scalar_one()

        sort_column = _ORDER_BY_COLUMNS.get(order_by, TokenUsage.created_at)
        order_clause = sort_column.desc() if reverse else sort_column.asc()

        stmt = (
            select(TokenUsage)
            .where(*conditions)
            .order_by(order_clause)
            .offset(page * size)
            .limit(size)
        )
        result = await session.execute(stmt)
        return list(result.scalars().all()), total_count

    @staticmethod
    async def summarize(
        tenant_id: str,
        from_: datetime,
        to: datetime,
        user_id: UUID | None,
        session: AsyncSession,
    ) -> sa.Row:
        """期間・ユーザーで絞り込んだトークン消費量を集計する。

        Args:
            tenant_id: テナントID。
            from_: 期間開始（この値以上）。
            to: 期間終了（この値以下）。
            user_id: 絞り込み対象のユーザーID。Noneなら絞り込まない。
            session: 非同期DBセッション。

        Returns:
            各トークン数・クレジット数の合計値を持つRow(該当データがなければ全て0)。
        """
        conditions = TokenUsageRepository._base_conditions(
            tenant_id, from_, to, user_id
        )
        stmt = select(
            func.coalesce(func.sum(TokenUsage.input_tokens), 0).label("input_tokens"),
            func.coalesce(func.sum(TokenUsage.output_tokens), 0).label("output_tokens"),
            func.coalesce(func.sum(TokenUsage.embedding_tokens), 0).label(
                "embedding_tokens"
            ),
            func.coalesce(func.sum(TokenUsage.total_tokens), 0).label("total_tokens"),
            func.coalesce(func.sum(TokenUsage.input_credits), 0).label("input_credits"),
            func.coalesce(func.sum(TokenUsage.output_credits), 0).label(
                "output_credits"
            ),
            func.coalesce(func.sum(TokenUsage.embedding_credits), 0).label(
                "embedding_credits"
            ),
        ).where(*conditions)
        result = await session.execute(stmt)
        return result.one()
