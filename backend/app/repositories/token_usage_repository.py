from datetime import datetime
from typing import cast
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

    @staticmethod
    async def sum_total_credits_by_user_ids(
        tenant_id: str,
        from_: datetime,
        to: datetime,
        user_ids: list[UUID],
        session: AsyncSession,
    ) -> dict[UUID, int]:
        """複数ユーザーの請求期間内クレジット合計を1クエリで一括取得する。

        NAW-1172: ユーザー一覧・グループメンバー一覧の`includeUsage=true`応答を
        組み立てる際、ページ内のユーザーごとに個別クエリを発行しない（N+1回避）ために使う。
        移植元(Spring Boot)`TokenUsageRepository.sumTotalCreditsByUserIdsInPeriod`に対応する。

        Args:
            tenant_id: テナントID。
            from_: 請求期間の開始（この値以上）。
            to: 請求期間の終了（この値以下）。
            user_ids: 集計対象のユーザーID一覧。
            session: 非同期DBセッション。

        Returns:
            ユーザーIDをキーとしたクレジット合計の辞書。`user_ids`が空の場合はクエリを
            発行せず空辞書を返す。
        """
        if not user_ids:
            return {}

        stmt = (
            select(
                TokenUsage.user_id,
                func.coalesce(
                    func.sum(
                        TokenUsage.input_credits
                        + TokenUsage.output_credits
                        + TokenUsage.embedding_credits
                    ),
                    0,
                ).label("total_credits"),
            )
            .where(
                TokenUsage.tenant_id == tenant_id,
                TokenUsage.created_at >= from_,
                TokenUsage.created_at <= to,
                # user_idはUUID | None型注釈のため、mypy上は.in_()を持つ
                # InstrumentedAttributeと認識されない（SQLModelの制約）。castで明示する。
                cast(InstrumentedAttribute, TokenUsage.user_id).in_(user_ids),
            )
            .group_by(TokenUsage.user_id)
        )
        result = await session.execute(stmt)
        return {row.user_id: int(row.total_credits) for row in result.all()}
