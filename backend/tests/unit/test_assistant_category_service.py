from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.models.assistant_category import AssistantCategory
from app.models.user import User, UserRole
from app.schemas.assistant_category import (
    AssistantCategoryCreateRequest,
    AssistantCategoryUpdateRequest,
)
from app.services.assistant_category_service import AssistantCategoryService


def _user() -> User:
    return User(
        id=uuid4(),
        tenant_id="tenant-1",
        login_id="admin",
        name="Admin",
        role=UserRole.ADMIN,
        is_required_password_reset=False,
    )


def _category(tenant_id: str, updated_user_id) -> AssistantCategory:
    return AssistantCategory(
        id="cat-1",
        tenant_id=tenant_id,
        name="orig",
        description="desc",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
        updated_user_id=updated_user_id,
    )


@pytest.mark.asyncio
class TestCreateAssistantCategory:
    """AssistantCategoryService.create_assistant_category のテスト"""

    @patch(
        "app.services.assistant_category_service.AssistantCategoryRepository.create",
        new_callable=AsyncMock,
    )
    async def test_create_assistant_category_sets_updated_user_id(self, mock_create):
        """作成時にcurrent_user.idがupdated_user_idに設定されること"""
        user = _user()

        def _save(category, session):
            # 実際のRepositoryはcommit/refreshでDB生成のcreated_at/updated_atを埋めるため模倣する
            category.created_at = datetime.now(UTC)
            category.updated_at = datetime.now(UTC)
            return category

        mock_create.side_effect = _save

        result = await AssistantCategoryService.create_assistant_category(
            "tenant-1",
            user,
            AssistantCategoryCreateRequest(name="cat", description="d"),
            session=None,
        )

        created_category = mock_create.call_args.args[0]
        assert created_category.updated_user_id == user.id
        assert result.name == "cat"


@pytest.mark.asyncio
class TestGetAssistantCategory:
    """AssistantCategoryService.get_assistant_category のテスト"""

    @patch(
        "app.services.assistant_category_service.AssistantCategoryRepository.find_by_id_and_tenant_id",
        new_callable=AsyncMock,
    )
    async def test_get_assistant_category_raises_404_when_not_found(self, mock_find):
        """存在しないIDの場合404が送出されること"""
        mock_find.return_value = None

        with pytest.raises(HTTPException) as exc_info:
            await AssistantCategoryService.get_assistant_category(
                "not-exist", "tenant-1", session=None
            )

        assert exc_info.value.status_code == 404


@pytest.mark.asyncio
class TestUpdateAssistantCategory:
    """AssistantCategoryService.update_assistant_category のテスト"""

    @patch(
        "app.services.assistant_category_service.AssistantCategoryRepository.update",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.assistant_category_service.AssistantCategoryRepository.find_by_id_and_tenant_id",
        new_callable=AsyncMock,
    )
    async def test_update_assistant_category_raises_404_when_not_found(
        self, mock_find, mock_update
    ):
        """更新対象が存在しない場合404が送出されること"""
        mock_find.return_value = None

        with pytest.raises(HTTPException) as exc_info:
            await AssistantCategoryService.update_assistant_category(
                "not-exist",
                "tenant-1",
                _user(),
                AssistantCategoryUpdateRequest(name="new"),
                session=None,
            )

        assert exc_info.value.status_code == 404
        mock_update.assert_not_called()

    @patch(
        "app.services.assistant_category_service.AssistantCategoryRepository.update",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.assistant_category_service.AssistantCategoryRepository.find_by_id_and_tenant_id",
        new_callable=AsyncMock,
    )
    async def test_update_assistant_category_sets_updated_user_id(
        self, mock_find, mock_update
    ):
        """更新時にcurrent_user.idがupdated_user_idに更新されること"""
        existing = _category("tenant-1", uuid4())
        mock_find.return_value = existing
        mock_update.side_effect = lambda category, session: category
        user = _user()

        result = await AssistantCategoryService.update_assistant_category(
            existing.id,
            "tenant-1",
            user,
            AssistantCategoryUpdateRequest(name="new", description="new-desc"),
            session=None,
        )

        assert result.name == "new"
        assert existing.updated_user_id == user.id


@pytest.mark.asyncio
class TestDeleteAssistantCategory:
    """AssistantCategoryService.delete_assistant_category のテスト"""

    @patch(
        "app.services.assistant_category_service.AssistantCategoryRepository.delete",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.assistant_category_service.AssistantCategoryRepository.find_by_id_and_tenant_id",
        new_callable=AsyncMock,
    )
    async def test_delete_assistant_category_raises_404_when_not_found(
        self, mock_find, mock_delete
    ):
        """削除対象が存在しない場合404が送出されること"""
        mock_find.return_value = None

        with pytest.raises(HTTPException) as exc_info:
            await AssistantCategoryService.delete_assistant_category(
                "not-exist", "tenant-1", session=None
            )

        assert exc_info.value.status_code == 404
        mock_delete.assert_not_called()
