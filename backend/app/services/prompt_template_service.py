from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.group import Group
from app.models.prompt_template import PromptTemplate
from app.models.user import User, UserRole
from app.repositories.group_prompt_template_repository import (
    GroupPromptTemplateRepository,
)
from app.repositories.group_repository import GroupRepository
from app.repositories.group_user_repository import GroupUserRepository
from app.repositories.prompt_template_repository import PromptTemplateRepository
from app.schemas.prompt_template import (
    PagedPromptTemplateResponse,
    PromptTemplateCreateRequest,
    PromptTemplateCreateResponse,
    PromptTemplateResponse,
)


class PromptTemplateService:
    @staticmethod
    def _is_tenant_admin(current_user: User) -> bool:
        return current_user.role in (UserRole.ADMIN, UserRole.SYSTEM)

    @staticmethod
    async def _to_response(
        template: PromptTemplate,
        groups_by_template_id: dict[str, list[tuple[str, str]]],
    ) -> PromptTemplateResponse:
        """PromptTemplateをPromptTemplateResponseに変換する（groupsはグループ名集合）。"""
        groups = groups_by_template_id.get(template.id, [])
        return PromptTemplateResponse(
            id=template.id,
            tenantId=template.tenant_id,
            name=template.name,
            description=template.description,
            systemPrompt=template.system_prompt,
            groups={name for _, name in groups},
            updatedAt=template.updated_at,
        )

    @staticmethod
    async def _to_paged_response(
        templates: list[PromptTemplate],
        total: int,
        tenant_id: str,
        page: int,
        size: int,
        session: AsyncSession,
    ) -> PagedPromptTemplateResponse:
        template_ids = [t.id for t in templates]
        groups_by_template_id = (
            await GroupPromptTemplateRepository.find_groups_grouped_by_template_ids(
                template_ids, tenant_id, session
            )
        )
        content = [
            await PromptTemplateService._to_response(t, groups_by_template_id)
            for t in templates
        ]
        return PagedPromptTemplateResponse(
            content=content, totalElements=total, number=page, size=size
        )

    @staticmethod
    async def get_prompt_templates(
        tenant_id: str,
        current_user: User,
        search: str | None,
        page: int,
        size: int,
        session: AsyncSession,
    ) -> PagedPromptTemplateResponse:
        """一般ユーザー向け: ログインユーザーの所属グループに紐づくテンプレート一覧を取得する。

        Args:
            tenant_id: テナントID。
            current_user: 認証済みユーザー。
            search: 名前・説明の部分一致検索文字列。
            page: ページ番号（0始まり）。
            size: 1ページあたりの件数。
            session: 非同期DBセッション。

        Returns:
            ページネーション済みプロンプトテンプレート一覧。
        """
        group_ids = await GroupUserRepository.find_belonging_group_ids(
            tenant_id, current_user.id, session
        )
        templates, total = await PromptTemplateRepository.find_page_by_group_ids(
            group_ids, tenant_id, search, page, size, session
        )
        return await PromptTemplateService._to_paged_response(
            templates, total, tenant_id, page, size, session
        )

    @staticmethod
    async def get_admin_prompt_templates(
        tenant_id: str,
        current_user: User,
        search: str | None,
        team: str | None,
        exclude_group_id: str | None,
        page: int,
        size: int,
        session: AsyncSession,
    ) -> PagedPromptTemplateResponse:
        """管理者向け: 権限とフィルター条件に応じてテンプレート一覧を取得する。

        全体管理者以外（グループ管理者、または管理グループを持たない一般ユーザー）は、
        自分が管理するグループに紐づくテンプレートのみに自動的に絞り込まれる
        （既存の `GET /api/admin/groups` と同じ方針で403にはしない）。

        Args:
            tenant_id: テナントID。
            current_user: 認証済みユーザー。
            search: 名前・説明の部分一致検索文字列。
            team: チームフィルタ（グループID）。
            exclude_group_id: 除外グループフィルタ（グループID）。
            page: ページ番号（0始まり）。
            size: 1ページあたりの件数。
            session: 非同期DBセッション。

        Returns:
            ページネーション済みプロンプトテンプレート一覧。
        """
        admin = PromptTemplateService._is_tenant_admin(current_user)
        admin_group_ids: list[str] = []
        if not admin:
            admin_group_ids = await GroupUserRepository.find_admin_group_ids_for_user(
                tenant_id, current_user.id, session
            )

        templates, total = await PromptTemplateRepository.find_page_for_admin(
            tenant_id,
            search,
            team,
            exclude_group_id,
            admin,
            admin_group_ids,
            page,
            size,
            session,
        )
        return await PromptTemplateService._to_paged_response(
            templates, total, tenant_id, page, size, session
        )

    @staticmethod
    async def _resolve_groups(
        tenant_id: str, group_ids: set[str] | None, session: AsyncSession
    ) -> list[Group] | None:
        """指定グループID集合を実在するグループに解決する。Noneの場合はNoneを返す。"""
        if group_ids is None:
            return None
        if not group_ids:
            return []
        return await GroupRepository.find_by_tenant_id_and_ids(
            tenant_id, list(group_ids), session
        )

    @staticmethod
    async def create_prompt_template(
        tenant_id: str,
        req: PromptTemplateCreateRequest,
        session: AsyncSession,
    ) -> PromptTemplateCreateResponse:
        """プロンプトテンプレートを新規作成する。

        Args:
            tenant_id: テナントID。
            req: 作成リクエスト。
            session: 非同期DBセッション。

        Returns:
            作成したテンプレート（groupsはグループID集合）。
        """
        groups = await PromptTemplateService._resolve_groups(
            tenant_id, req.groups, session
        )
        group_ids = {g.id for g in groups} if groups is not None else set()

        template = PromptTemplate(
            tenant_id=tenant_id,
            name=req.name,
            description=req.description,
            system_prompt=req.systemPrompt,
        )
        session.add(template)
        if group_ids:
            await GroupPromptTemplateRepository.replace_groups_for_template(
                template.id, tenant_id, group_ids, session
            )
        await session.commit()
        await session.refresh(template)

        return PromptTemplateCreateResponse(
            id=template.id,
            tenantId=template.tenant_id,
            name=template.name,
            description=template.description,
            systemPrompt=template.system_prompt,
            groups=group_ids,
        )

    @staticmethod
    async def update_prompt_template(
        template_id: str,
        tenant_id: str,
        req: PromptTemplateCreateRequest,
        session: AsyncSession,
    ) -> PromptTemplateCreateResponse:
        """プロンプトテンプレートを更新する。グループ集合が指定されない場合は既存の紐付けを維持する。

        Args:
            template_id: 更新対象のプロンプトテンプレートID。
            tenant_id: テナントID。
            req: 更新リクエスト。
            session: 非同期DBセッション。

        Returns:
            更新後のテンプレート（groupsはグループID集合）。

        Raises:
            HTTPException: テンプレートが存在しない場合 404 を返す。
        """
        template = await PromptTemplateRepository.find_by_id_and_tenant_id(
            template_id, tenant_id, session
        )
        if not template:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Prompt template not found",
            )

        template.name = req.name
        template.description = req.description
        template.system_prompt = req.systemPrompt
        session.add(template)

        groups = await PromptTemplateService._resolve_groups(
            tenant_id, req.groups, session
        )
        if groups is not None:
            group_ids = {g.id for g in groups}
            await GroupPromptTemplateRepository.replace_groups_for_template(
                template.id, tenant_id, group_ids, session
            )
        else:
            existing = (
                await GroupPromptTemplateRepository.find_groups_grouped_by_template_ids(
                    [template.id], tenant_id, session
                )
            )
            group_ids = {group_id for group_id, _ in existing.get(template.id, [])}

        await session.commit()
        await session.refresh(template)

        return PromptTemplateCreateResponse(
            id=template.id,
            tenantId=template.tenant_id,
            name=template.name,
            description=template.description,
            systemPrompt=template.system_prompt,
            groups=group_ids,
        )

    @staticmethod
    async def delete_prompt_template(
        template_id: str, tenant_id: str, session: AsyncSession
    ) -> None:
        """プロンプトテンプレートを削除する。存在しない場合は何もしない。

        Args:
            template_id: 削除対象のプロンプトテンプレートID。
            tenant_id: テナントID。
            session: 非同期DBセッション。
        """
        await PromptTemplateRepository.delete_by_id_and_tenant_id(
            template_id, tenant_id, session
        )
