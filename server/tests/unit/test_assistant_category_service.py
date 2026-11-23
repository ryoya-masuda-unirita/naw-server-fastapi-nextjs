from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.assistant_category import AssistantCategory
from app.models.user import User, UserRole
from app.schemas.assistant_category import (
    AssistantCategoryCreateRequest,
    AssistantCategoryUpdateRequest,
)
from app.services.assistant_category_service import AssistantCategoryService
from unittest.mock import MagicMock

_REPOSITORY = "app.services.assistant_category_service.AssistantCategoryRepository"


def _user() -> User:
    """テスト用のテナント管理者を作る。

    Returns
    -------
    User
        テナント管理者。
    """
    return User(
        id=uuid4(),
        tenant_id="tenant-1",
        login_id="admin",
        name="Admin",
        role=UserRole.ADMIN,
        is_required_password_reset=False,
    )


def _integrity_error() -> IntegrityError:
    """一意制約違反を模した例外を作る。

    Returns
    -------
    IntegrityError
        一意制約違反の例外。
    """
    return IntegrityError("INSERT", {}, Exception("UNIQUE constraint failed"))


def _category(tenant_id: str, updated_user_id: UUID) -> AssistantCategory:
    """テスト用の既存アシスタントカテゴリを作る。

    Parameters
    ----------
    tenant_id : str
        テナントID。
    updated_user_id : UUID
        更新者のユーザーID。

    Returns
    -------
    AssistantCategory
        名前 `orig`・説明 `desc` のアシスタントカテゴリ。
    """
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

    @patch(f"{_REPOSITORY}.create", new_callable=AsyncMock)
    async def test_create_assistant_category_sets_updated_user_id(
        self, mock_create: MagicMock
    ) -> None:
        """同名の事前チェックをせずに保存し、current_user.idがupdated_user_idに設定されること"""
        user = _user()

        def _save(
            category: AssistantCategory, session: AsyncSession | None
        ) -> AssistantCategory:
            """DBの採番を模倣して作成日時・更新日時を埋める。

            Parameters
            ----------
            category : AssistantCategory
                保存するアシスタントカテゴリ。
            session : AsyncSession | None
                非同期DBセッション（未使用）。

            Returns
            -------
            AssistantCategory
                作成日時・更新日時を埋めたアシスタントカテゴリ。
            """
            # 実際のRepositoryはcommit/refreshでDB生成のcreated_at/updated_atを埋めるため模倣する
            category.created_at = datetime.now(UTC)
            category.updated_at = datetime.now(UTC)
            return category

        mock_create.side_effect = _save

        result = await AssistantCategoryService.create_assistant_category(
            "tenant-1",
            user,
            AssistantCategoryCreateRequest(name="cat", description="d"),
            session=None,  # type: ignore[arg-type]
        )

        mock_create.assert_awaited_once()
        created_category = mock_create.call_args.args[0]
        assert created_category.updated_user_id == user.id
        assert result.name == "cat"

    @patch(f"{_REPOSITORY}.create", new_callable=AsyncMock)
    async def test_create_converts_integrity_error_to_500(
        self, mock_create: MagicMock
    ) -> None:
        """一意制約違反はロールバックして移植元と同じ500に変換されること"""
        mock_create.side_effect = _integrity_error()
        session = AsyncMock()

        with pytest.raises(HTTPException) as exc_info:
            await AssistantCategoryService.create_assistant_category(
                "tenant-1",
                _user(),
                AssistantCategoryCreateRequest(name="dup"),
                session=session,
            )

        assert exc_info.value.status_code == 500
        assert exc_info.value.detail == "Internal Server Error"
        session.rollback.assert_awaited_once()


@pytest.mark.asyncio
class TestGetAssistantCategory:
    """AssistantCategoryService.get_assistant_category のテスト"""

    @patch(f"{_REPOSITORY}.find_by_id_and_tenant_id", new_callable=AsyncMock)
    async def test_get_assistant_category_raises_404_when_not_found(
        self, mock_find: MagicMock
    ) -> None:
        """存在しないIDの場合404が送出されること"""
        mock_find.return_value = None

        with pytest.raises(HTTPException) as exc_info:
            await AssistantCategoryService.get_assistant_category(
                "not-exist",
                "tenant-1",
                session=None,  # type: ignore[arg-type]
            )

        assert exc_info.value.status_code == 404
        assert exc_info.value.detail == "AssistantCategory not found with id:not-exist"


@pytest.mark.asyncio
class TestUpdateAssistantCategory:
    """AssistantCategoryService.update_assistant_category のテスト"""

    @patch(f"{_REPOSITORY}.update", new_callable=AsyncMock)
    @patch(f"{_REPOSITORY}.find_by_id_and_tenant_id", new_callable=AsyncMock)
    async def test_update_assistant_category_raises_404_when_not_found(
        self, mock_find: MagicMock, mock_update: MagicMock
    ) -> None:
        """更新対象が存在しない場合404が送出されること"""
        mock_find.return_value = None

        with pytest.raises(HTTPException) as exc_info:
            await AssistantCategoryService.update_assistant_category(
                "not-exist",
                "tenant-1",
                _user(),
                AssistantCategoryUpdateRequest(name="new"),
                session=None,  # type: ignore[arg-type]
            )

        assert exc_info.value.status_code == 404
        # 移植元は更新だけコロンの後に空白が入る
        assert exc_info.value.detail == "AssistantCategory not found with id: not-exist"
        mock_update.assert_not_called()

    @patch(f"{_REPOSITORY}.update", new_callable=AsyncMock)
    @patch(f"{_REPOSITORY}.find_by_id_and_tenant_id", new_callable=AsyncMock)
    async def test_update_assistant_category_sets_updated_user_id(
        self, mock_find: MagicMock, mock_update: MagicMock
    ) -> None:
        """同名の事前チェックをせずに保存し、current_user.idがupdated_user_idに更新されること"""
        existing = _category("tenant-1", uuid4())
        mock_find.return_value = existing
        mock_update.side_effect = lambda category, session: category
        user = _user()

        result = await AssistantCategoryService.update_assistant_category(
            existing.id,
            "tenant-1",
            user,
            AssistantCategoryUpdateRequest(name="new", description="new-desc"),
            session=None,  # type: ignore[arg-type]
        )

        mock_update.assert_awaited_once()
        assert result.name == "new"
        assert existing.updated_user_id == user.id

    @pytest.mark.parametrize("description", [None, "", "   "])
    @patch(f"{_REPOSITORY}.update", new_callable=AsyncMock)
    @patch(f"{_REPOSITORY}.find_by_id_and_tenant_id", new_callable=AsyncMock)
    async def test_update_keeps_description_when_blank(
        self, mock_find: MagicMock, mock_update: MagicMock, description: None | str
    ) -> None:
        """説明がNone・空文字・空白だけの場合、元の説明が残ること"""
        existing = _category("tenant-1", uuid4())
        mock_find.return_value = existing
        mock_update.side_effect = lambda category, session: category

        result = await AssistantCategoryService.update_assistant_category(
            existing.id,
            "tenant-1",
            _user(),
            AssistantCategoryUpdateRequest(name="new", description=description),
            session=None,  # type: ignore[arg-type]
        )

        assert result.name == "new"
        assert result.description == "desc"

    @patch(f"{_REPOSITORY}.update", new_callable=AsyncMock)
    @patch(f"{_REPOSITORY}.find_by_id_and_tenant_id", new_callable=AsyncMock)
    async def test_update_overwrites_description_when_not_blank(
        self, mock_find: MagicMock, mock_update: MagicMock
    ) -> None:
        """説明が空白でない場合、前後の空白も含めてそのまま上書きされること"""
        existing = _category("tenant-1", uuid4())
        mock_find.return_value = existing
        mock_update.side_effect = lambda category, session: category

        result = await AssistantCategoryService.update_assistant_category(
            existing.id,
            "tenant-1",
            _user(),
            AssistantCategoryUpdateRequest(name="new", description=" new desc "),
            session=None,  # type: ignore[arg-type]
        )

        assert result.description == " new desc "

    @patch(f"{_REPOSITORY}.update", new_callable=AsyncMock)
    @patch(f"{_REPOSITORY}.find_by_id_and_tenant_id", new_callable=AsyncMock)
    async def test_update_converts_integrity_error_to_500(
        self, mock_find: MagicMock, mock_update: MagicMock
    ) -> None:
        """一意制約違反はロールバックして移植元と同じ500に変換されること"""
        mock_find.return_value = _category("tenant-1", uuid4())
        mock_update.side_effect = _integrity_error()
        session = AsyncMock()

        with pytest.raises(HTTPException) as exc_info:
            await AssistantCategoryService.update_assistant_category(
                "cat-1",
                "tenant-1",
                _user(),
                AssistantCategoryUpdateRequest(name="dup"),
                session=session,
            )

        assert exc_info.value.status_code == 500
        assert exc_info.value.detail == "Internal Server Error"
        session.rollback.assert_awaited_once()


@pytest.mark.asyncio
class TestDeleteAssistantCategory:
    """AssistantCategoryService.delete_assistant_category のテスト"""

    @patch(f"{_REPOSITORY}.delete", new_callable=AsyncMock)
    @patch(f"{_REPOSITORY}.find_by_id_and_tenant_id", new_callable=AsyncMock)
    async def test_delete_assistant_category_raises_404_when_not_found(
        self, mock_find: MagicMock, mock_delete: MagicMock
    ) -> None:
        """削除対象が存在しない場合404が送出されること"""
        mock_find.return_value = None

        with pytest.raises(HTTPException) as exc_info:
            await AssistantCategoryService.delete_assistant_category(
                "not-exist",
                "tenant-1",
                session=None,  # type: ignore[arg-type]
            )

        assert exc_info.value.status_code == 404
        assert exc_info.value.detail == "AssistantCategory not found with id:not-exist"
        mock_delete.assert_not_called()
