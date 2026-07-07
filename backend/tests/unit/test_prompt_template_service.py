from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest

from app.models.user import User, UserRole
from app.services.prompt_template_service import PromptTemplateService


def _user(role: UserRole) -> User:
    return User(
        id=uuid4(),
        tenant_id="tenant-1",
        login_id="u",
        name="U",
        role=role,
        is_required_password_reset=False,
    )


class TestIsTenantAdmin:
    """PromptTemplateService._is_tenant_admin のテスト"""

    def test_admin_role_is_tenant_admin(self):
        """ADMINロールは全体管理者と判定されること"""
        assert PromptTemplateService._is_tenant_admin(_user(UserRole.ADMIN)) is True

    def test_system_role_is_tenant_admin(self):
        """SYSTEMロールは全体管理者と判定されること"""
        assert PromptTemplateService._is_tenant_admin(_user(UserRole.SYSTEM)) is True

    def test_user_role_is_not_tenant_admin(self):
        """USERロールは全体管理者と判定されないこと"""
        assert PromptTemplateService._is_tenant_admin(_user(UserRole.USER)) is False


@pytest.mark.asyncio
class TestGetAdminPromptTemplates:
    """PromptTemplateService.get_admin_prompt_templates のスコープ決定ロジックのテスト"""

    @patch(
        "app.services.prompt_template_service.GroupPromptTemplateRepository.find_groups_grouped_by_template_ids",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.prompt_template_service.PromptTemplateRepository.find_page_for_admin",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.prompt_template_service.GroupUserRepository.find_admin_group_ids_for_user",
        new_callable=AsyncMock,
    )
    async def test_tenant_admin_has_no_group_restriction(
        self, mock_find_admin_group_ids, mock_find_page, mock_find_groups
    ):
        """全体管理者は管理グループ一覧を問い合わせず絞り込みなしで検索すること"""
        mock_find_page.return_value = ([], 0)
        mock_find_groups.return_value = {}

        await PromptTemplateService.get_admin_prompt_templates(
            "tenant-1", _user(UserRole.ADMIN), None, None, None, 0, 20, session=None
        )

        mock_find_admin_group_ids.assert_not_called()
        _, kwargs = mock_find_page.call_args
        args = mock_find_page.call_args.args
        assert args[4] is True  # admin=True

    @patch(
        "app.services.prompt_template_service.GroupPromptTemplateRepository.find_groups_grouped_by_template_ids",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.prompt_template_service.PromptTemplateRepository.find_page_for_admin",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.prompt_template_service.GroupUserRepository.find_admin_group_ids_for_user",
        new_callable=AsyncMock,
    )
    async def test_group_admin_is_restricted_to_managed_groups(
        self, mock_find_admin_group_ids, mock_find_page, mock_find_groups
    ):
        """グループ管理者は管理グループID一覧に絞り込まれること"""
        mock_find_admin_group_ids.return_value = ["g1", "g2"]
        mock_find_page.return_value = ([], 0)
        mock_find_groups.return_value = {}

        await PromptTemplateService.get_admin_prompt_templates(
            "tenant-1", _user(UserRole.USER), None, None, None, 0, 20, session=None
        )

        mock_find_admin_group_ids.assert_called_once()
        args = mock_find_page.call_args.args
        assert args[4] is False  # admin=False
        assert args[5] == ["g1", "g2"]  # admin_group_ids

    @patch(
        "app.services.prompt_template_service.GroupPromptTemplateRepository.find_groups_grouped_by_template_ids",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.prompt_template_service.PromptTemplateRepository.find_page_for_admin",
        new_callable=AsyncMock,
    )
    @patch(
        "app.services.prompt_template_service.GroupUserRepository.find_admin_group_ids_for_user",
        new_callable=AsyncMock,
    )
    async def test_non_admin_with_no_managed_groups_gets_empty_scope(
        self, mock_find_admin_group_ids, mock_find_page, mock_find_groups
    ):
        """管理グループを持たない一般ユーザーは空のグループID一覧で検索されること（403にはしない）"""
        mock_find_admin_group_ids.return_value = []
        mock_find_page.return_value = ([], 0)
        mock_find_groups.return_value = {}

        result = await PromptTemplateService.get_admin_prompt_templates(
            "tenant-1", _user(UserRole.USER), None, None, None, 0, 20, session=None
        )

        args = mock_find_page.call_args.args
        assert args[5] == []  # admin_group_ids
        assert result.content == []
