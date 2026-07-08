from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.token_usage_repository import TokenUsageRepository
from app.repositories.user_repository import UserRepository
from app.schemas.token_usage import (
    TokenUsageItemResponse,
    TokenUsageListQuery,
    TokenUsageListResponse,
    TokenUsagePeriodQuery,
    TokenUsageSummaryResponse,
)


class TokenUsageService:
    @staticmethod
    async def _ensure_user_exists_if_specified(
        tenant_id: str, query: TokenUsagePeriodQuery, session: AsyncSession
    ) -> None:
        """`userId`指定時に、そのユーザーがテナント内に実在することを確認する。

        Args:
            tenant_id: テナントID。
            query: 期間・ユーザー絞り込み条件。
            session: 非同期DBセッション。

        Raises:
            HTTPException: 指定された`userId`がテナント内に存在しない場合404を返す。
        """
        if query.user_id is None:
            return
        user = await UserRepository.find_by_id_and_tenant_id(
            query.user_id, tenant_id, session
        )
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
            )

    @staticmethod
    async def list_token_usages(
        tenant_id: str, query: TokenUsageListQuery, session: AsyncSession
    ) -> TokenUsageListResponse:
        """条件に合致するトークン消費量を1ページ分取得する。

        Args:
            tenant_id: テナントID。
            query: 一覧取得条件（期間・ユーザー・ページング・ソート）。
            session: 非同期DBセッション。

        Returns:
            トークン消費量一覧レスポンス。

        Raises:
            HTTPException: `userId`指定時に該当ユーザーがテナント内に存在しない場合404を返す。
        """
        await TokenUsageService._ensure_user_exists_if_specified(
            tenant_id, query, session
        )

        token_usages, total_count = await TokenUsageRepository.find_page(
            tenant_id,
            query.from_,
            query.to,
            query.user_id,
            query.page,
            query.size,
            query.order_by,
            query.reverse,
            session,
        )

        return TokenUsageListResponse(
            contents=[
                TokenUsageItemResponse.from_token_usage(token_usage)
                for token_usage in token_usages
            ],
            totalCount=total_count,
            hasNext=(query.page + 1) * query.size < total_count,
        )

    @staticmethod
    async def get_summary(
        tenant_id: str, query: TokenUsagePeriodQuery, session: AsyncSession
    ) -> TokenUsageSummaryResponse:
        """条件に合致するトークン消費量のサマリ（合計値）を取得する。

        Args:
            tenant_id: テナントID。
            query: サマリ取得条件（期間・ユーザー）。
            session: 非同期DBセッション。

        Returns:
            トークン消費量サマリレスポンス。

        Raises:
            HTTPException: `userId`指定時に該当ユーザーがテナント内に存在しない場合404を返す。
        """
        await TokenUsageService._ensure_user_exists_if_specified(
            tenant_id, query, session
        )

        row = await TokenUsageRepository.summarize(
            tenant_id, query.from_, query.to, query.user_id, session
        )

        return TokenUsageSummaryResponse(
            inputTokens=row.input_tokens,
            outputTokens=row.output_tokens,
            embeddingTokens=row.embedding_tokens,
            totalTokens=row.total_tokens,
            inputCredits=row.input_credits,
            outputCredits=row.output_credits,
            embeddingCredits=row.embedding_credits,
            totalCredits=row.input_credits + row.output_credits + row.embedding_credits,
        )
