from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.assistant_category import AssistantCategory
from app.models.user import User
from app.repositories.assistant_category_repository import (
    AssistantCategoryRepository,
)
from app.schemas.assistant_category import (
    AssistantCategoryCreateRequest,
    AssistantCategoryResponse,
    AssistantCategoryUpdateRequest,
)


class AssistantCategoryService:
    @staticmethod
    def _to_response(category: AssistantCategory) -> AssistantCategoryResponse:
        return AssistantCategoryResponse(
            id=category.id,
            name=category.name,
            description=category.description,
            updatedAt=category.updated_at,
        )

    @staticmethod
    async def _get_category_or_404(
        category_id: str, tenant_id: str, session: AsyncSession
    ) -> AssistantCategory:
        """IDとテナントIDでアシスタントカテゴリを取得し、存在しなければ404を送出する。

        Args:
            category_id: アシスタントカテゴリID。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            該当するアシスタントカテゴリ。

        Raises:
            HTTPException: 存在しない場合404を返す。
        """
        category = await AssistantCategoryRepository.find_by_id_and_tenant_id(
            category_id, tenant_id, session
        )
        if not category:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Assistant category not found",
            )
        return category

    @staticmethod
    async def create_assistant_category(
        tenant_id: str,
        current_user: User,
        req: AssistantCategoryCreateRequest,
        session: AsyncSession,
    ) -> AssistantCategoryResponse:
        """アシスタントカテゴリを新規作成する。

        Args:
            tenant_id: テナントID。
            current_user: 認証済みユーザー。
            req: 作成リクエスト。
            session: 非同期DBセッション。

        Returns:
            作成したアシスタントカテゴリ。

        Raises:
            HTTPException: 同一テナント内に同名のカテゴリが既に存在する場合400を返す。
        """
        if await AssistantCategoryRepository.exists_by_tenant_id_and_name(
            tenant_id, req.name, session
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Assistant category with name {req.name} already exists",
            )

        category = AssistantCategory(
            tenant_id=tenant_id,
            name=req.name,
            description=req.description,
            updated_user_id=current_user.id,
        )
        created = await AssistantCategoryRepository.create(category, session)
        return AssistantCategoryService._to_response(created)

    @staticmethod
    async def get_assistant_categories(
        tenant_id: str, session: AsyncSession
    ) -> list[AssistantCategoryResponse]:
        """テナント内の全アシスタントカテゴリを取得する。

        Args:
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            アシスタントカテゴリ一覧。
        """
        categories = await AssistantCategoryRepository.find_by_tenant_id(
            tenant_id, session
        )
        return [AssistantCategoryService._to_response(c) for c in categories]

    @staticmethod
    async def get_assistant_category(
        category_id: str, tenant_id: str, session: AsyncSession
    ) -> AssistantCategoryResponse:
        """IDを指定してアシスタントカテゴリを取得する。

        Args:
            category_id: アシスタントカテゴリID。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            該当するアシスタントカテゴリ。

        Raises:
            HTTPException: 存在しない場合404を返す。
        """
        category = await AssistantCategoryService._get_category_or_404(
            category_id, tenant_id, session
        )
        return AssistantCategoryService._to_response(category)

    @staticmethod
    async def update_assistant_category(
        category_id: str,
        tenant_id: str,
        current_user: User,
        req: AssistantCategoryUpdateRequest,
        session: AsyncSession,
    ) -> AssistantCategoryResponse:
        """アシスタントカテゴリを更新する。

        Args:
            category_id: 更新対象のアシスタントカテゴリID。
            tenant_id: テナントID。
            current_user: 認証済みユーザー。
            req: 更新リクエスト。
            session: 非同期DBセッション。

        Returns:
            更新後のアシスタントカテゴリ。

        Raises:
            HTTPException: 存在しない場合404、同一テナント内に同名の別カテゴリが
                既に存在する場合400を返す。
        """
        category = await AssistantCategoryService._get_category_or_404(
            category_id, tenant_id, session
        )
        if await AssistantCategoryRepository.exists_by_tenant_id_and_name(
            tenant_id, req.name, session, exclude_id=category_id
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Assistant category with name {req.name} already exists",
            )

        category.name = req.name
        category.description = req.description
        category.updated_user_id = current_user.id
        updated = await AssistantCategoryRepository.update(category, session)
        return AssistantCategoryService._to_response(updated)

    @staticmethod
    async def delete_assistant_category(
        category_id: str, tenant_id: str, session: AsyncSession
    ) -> None:
        """アシスタントカテゴリを削除する。

        Args:
            category_id: 削除対象のアシスタントカテゴリID。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Raises:
            HTTPException: 存在しない場合404を返す。
        """
        category = await AssistantCategoryService._get_category_or_404(
            category_id, tenant_id, session
        )
        await AssistantCategoryRepository.delete(category, session)
