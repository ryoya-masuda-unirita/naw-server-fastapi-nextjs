from datetime import datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.credit_quota import (
    resolve_active_billing_period,
    validate_total_credits_sort,
)
from app.models.group import Group
from app.models.assistant import AssistantType
from app.models.user import User, UserRole
from app.repositories.assistant_repository import AssistantRepository
from app.repositories.group_prompt_template_repository import (
    GroupPromptTemplateRepository,
)
from app.repositories.group_assistant_repository import GroupAssistantRepository
from app.repositories.group_repository import GroupRepository
from app.repositories.group_user_repository import GroupUserRepository
from app.repositories.prompt_template_repository import PromptTemplateRepository
from app.repositories.token_usage_repository import TokenUsageRepository
from app.repositories.user_repository import UserRepository
from app.schemas.assistant import PagedAssistantResponse
from app.schemas.group import (
    GroupCreateRequest,
    GroupDetailResponse,
    GroupListItemResponse,
    GroupListPageResponse,
    GroupMemberUserResponse,
    GroupUpdateRequest,
    PagedGroupMemberResponse,
)
from app.schemas.prompt_template import (
    PagedPromptTemplateResponse,
    PromptTemplateResponse,
)
from app.services.assistant_service import AssistantService


class GroupService:
    @staticmethod
    def _is_tenant_admin(current_user: User) -> bool:
        return current_user.role in (UserRole.ADMIN, UserRole.SYSTEM)

    @staticmethod
    async def _assert_can_manage_group(
        group_id: str, tenant_id: str, current_user: User, session: AsyncSession
    ) -> None:
        """テナント管理者、またはグループ内管理者であることを確認する。

        Args:
            group_id: グループID。
            tenant_id: テナントID。
            current_user: 認証済みユーザー。
            session: 非同期DBセッション。

        Raises:
            HTTPException: いずれの権限も持たない場合 403 を返す。
        """
        if GroupService._is_tenant_admin(current_user):
            return
        if not await GroupUserRepository.is_group_admin(
            group_id, tenant_id, current_user.id, session
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Access Denied"
            )

    @staticmethod
    async def _get_group_or_404(
        group_id: str, tenant_id: str, session: AsyncSession
    ) -> Group:
        """グループIDとテナントIDでグループを取得する。存在しない場合は404を送出する。

        Args:
            group_id: グループID。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            Group オブジェクト。

        Raises:
            HTTPException: グループが存在しない場合 404 を返す。
        """
        group = await GroupRepository.find_by_id_and_tenant_id(
            group_id, tenant_id, session
        )
        if not group:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Group not found"
            )
        return group

    @staticmethod
    def _parse_user_uuid(user_id: str) -> UUID:
        """ユーザーIDをUUIDにパースする。不正な形式の場合は404を送出する。

        Args:
            user_id: パース対象のユーザーID文字列。

        Returns:
            パースされたUUID。

        Raises:
            HTTPException: UUID形式でない場合 404 を返す。
        """
        try:
            return UUID(user_id)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
            )

    @staticmethod
    def _assert_not_self(target_user_id: UUID, current_user: User) -> None:
        """テナント管理者以外が自分自身を操作しようとしていないか確認する。

        Args:
            target_user_id: 操作対象のユーザーID。
            current_user: 認証済みユーザー。

        Raises:
            HTTPException: グループ管理者が自分自身を操作しようとした場合 403 を返す。
        """
        if (
            not GroupService._is_tenant_admin(current_user)
            and target_user_id == current_user.id
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Cannot modify self"
            )

    @staticmethod
    async def _to_list_item(
        group: Group,
        session: AsyncSession,
        assistant_map: dict[str, list[tuple[str, str]]],
        template_map: dict[str, list[tuple[str, str]]],
    ) -> GroupListItemResponse:
        """GroupをGroupListItemResponseに変換する（所属ユーザーを結合して取得する）。

        Args:
            group: 変換対象のGroup。
            session: 非同期DBセッション。
            assistant_map: グループIDをキーとした (アシスタントID, アシスタント名) 一覧の辞書
                （呼び出し側で対象グループID一覧を一括取得したもの）。
            template_map: グループIDをキーとした (プロンプトテンプレートID, プロンプトテンプレート名) 一覧の辞書
                （呼び出し側で対象グループID一覧を一括取得したもの）。

        Returns:
            グループ一覧の1件分のレスポンス。
        """
        rows = await GroupUserRepository.find_by_group(
            group.id, group.tenant_id, session
        )
        users = [user for _, user in rows]
        admins = [user for group_user, user in rows if group_user.is_admin]
        assistant_pairs = assistant_map.get(group.id, [])
        template_pairs = template_map.get(group.id, [])
        return GroupListItemResponse(
            id=group.id,
            tenantId=group.tenant_id,
            name=group.name,
            users=[str(u.id) for u in users],
            adminUserIds=[str(u.id) for u in admins],
            adminUserNames=[u.name for u in admins],
            userNames=[u.name for u in users],
            assistants=[name for _, name in assistant_pairs],
            assistantIds=[assistant_id for assistant_id, _ in assistant_pairs],
            promptTemplates=[name for _, name in template_pairs],
            promptTemplateIds=[template_id for template_id, _ in template_pairs],
            updatedAt=group.updated_at,
        )

    @staticmethod
    async def _build_link_maps(
        group_ids: list[str], tenant_id: str, session: AsyncSession
    ) -> tuple[dict[str, list[tuple[str, str]]], dict[str, list[tuple[str, str]]]]:
        """グループID一覧に紐づくアシスタント・プロンプトテンプレートのマップをまとめて取得する。

        Args:
            group_ids: 対象のグループID一覧。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            (アシスタントマップ, プロンプトテンプレートマップ) のタプル。
            それぞれグループIDをキーとした (ID, 名前) 一覧の辞書。
        """
        assistant_map = await GroupAssistantRepository.find_grouped_by_group_ids(
            group_ids, tenant_id, session
        )
        template_map = await GroupPromptTemplateRepository.find_grouped_by_group_ids(
            group_ids, tenant_id, session
        )
        return assistant_map, template_map

    @staticmethod
    async def get_groups(
        tenant_id: str, current_user: User, is_belonged: bool, session: AsyncSession
    ) -> list[GroupListItemResponse]:
        """グループ一覧を取得する（一般ユーザー向け）。

        Args:
            tenant_id: テナントID。
            current_user: 認証済みユーザー。
            is_belonged: Trueならログインユーザーが所属するグループのみ返す。
            session: 非同期DBセッション。

        Returns:
            グループ一覧。
        """
        groups = await GroupRepository.find_all_by_tenant_ordered_by_name(
            tenant_id, session
        )

        if is_belonged:
            belonging_ids = set(
                await GroupUserRepository.find_belonging_group_ids(
                    tenant_id, current_user.id, session
                )
            )
            groups = [g for g in groups if g.id in belonging_ids]

        assistant_map, template_map = await GroupService._build_link_maps(
            [g.id for g in groups], tenant_id, session
        )
        return [
            await GroupService._to_list_item(g, session, assistant_map, template_map)
            for g in groups
        ]

    @staticmethod
    async def list_groups(
        tenant_id: str,
        current_user: User,
        search: str | None,
        sort: str,
        page: int,
        size: int,
        session: AsyncSession,
        *,
        restrict_to_managed: bool,
    ) -> GroupListPageResponse:
        """管理者向けグループ一覧をページネーションで取得する。

        Args:
            tenant_id: テナントID。
            current_user: 認証済みユーザー。
            search: グループ名の部分一致検索文字列。
            sort: ソート指定（例: "updatedAt,desc"）。
            page: ページ番号（0始まり）。
            size: 1ページあたりの件数。
            session: 非同期DBセッション。
            restrict_to_managed: Trueの場合、テナント管理者以外は自分が管理するグループのみに絞り込む
                （`GET /api/admin/groups` 用）。Falseの場合は絞り込みなし
                （`GET /api/admin/all-groups` 用、呼び出し側でテナント管理者専用に制限すること）。

        Returns:
            ページネーション済みグループ一覧。
        """
        allowed_group_ids = None
        if restrict_to_managed and not GroupService._is_tenant_admin(current_user):
            allowed_group_ids = await GroupUserRepository.find_admin_group_ids_for_user(
                tenant_id, current_user.id, session
            )

        sort_parts = sort.split(",")
        sort_col_name = sort_parts[0]
        sort_dir = sort_parts[1] if len(sort_parts) > 1 else "asc"

        groups, total = await GroupRepository.find_page(
            tenant_id,
            search,
            allowed_group_ids,
            sort_col_name,
            sort_dir,
            page,
            size,
            session,
        )

        assistant_map, template_map = await GroupService._build_link_maps(
            [g.id for g in groups], tenant_id, session
        )
        return GroupListPageResponse(
            data=[
                await GroupService._to_list_item(
                    g, session, assistant_map, template_map
                )
                for g in groups
            ],
            total=total,
            page=page,
            size=size,
        )

    @staticmethod
    async def get_group_detail(
        group_id: str, tenant_id: str, current_user: User, session: AsyncSession
    ) -> GroupDetailResponse:
        """グループ詳細を取得する。

        Args:
            group_id: グループID。
            tenant_id: テナントID。
            current_user: 認証済みユーザー。
            session: 非同期DBセッション。

        Returns:
            グループ詳細。

        Raises:
            HTTPException: グループが存在しない場合 404、権限がない場合 403 を返す。
        """
        group = await GroupService._get_group_or_404(group_id, tenant_id, session)
        await GroupService._assert_can_manage_group(
            group_id, tenant_id, current_user, session
        )
        return GroupDetailResponse(
            id=group.id,
            name=group.name,
            tenantId=group.tenant_id,
            updatedAt=group.updated_at,
        )

    @staticmethod
    async def create_group(
        req: GroupCreateRequest, tenant_id: str, session: AsyncSession
    ) -> GroupDetailResponse:
        """グループを新規作成する（テナント管理者専用、呼び出し側でロールを検証すること）。

        Args:
            req: グループ作成リクエスト。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            作成したグループの詳細。

        Raises:
            HTTPException: グループ名が空の場合 400 を返す。
        """
        if not req.name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="name is required"
            )

        group = Group(tenant_id=tenant_id, name=req.name)
        session.add(group)
        await session.commit()
        await session.refresh(group)
        return GroupDetailResponse(
            id=group.id,
            name=group.name,
            tenantId=group.tenant_id,
            updatedAt=group.updated_at,
        )

    @staticmethod
    async def update_group(
        group_id: str,
        req: GroupUpdateRequest,
        tenant_id: str,
        current_user: User,
        session: AsyncSession,
    ) -> GroupDetailResponse:
        """グループ名を更新する。

        Args:
            group_id: グループID。
            req: グループ更新リクエスト。
            tenant_id: テナントID。
            current_user: 認証済みユーザー。
            session: 非同期DBセッション。

        Returns:
            更新後のグループ詳細。

        Raises:
            HTTPException: グループが存在しない場合 404、権限がない場合 403 を返す。
        """
        group = await GroupService._get_group_or_404(group_id, tenant_id, session)
        await GroupService._assert_can_manage_group(
            group_id, tenant_id, current_user, session
        )

        if req.name is not None:
            group.name = req.name
        session.add(group)
        await session.commit()
        await session.refresh(group)
        return GroupDetailResponse(
            id=group.id,
            name=group.name,
            tenantId=group.tenant_id,
            updatedAt=group.updated_at,
        )

    @staticmethod
    async def delete_group(
        group_id: str, tenant_id: str, session: AsyncSession
    ) -> None:
        """グループを削除する（テナント管理者専用、呼び出し側でロールを検証すること）。存在しない場合は何もしない。

        Args:
            group_id: グループID。
            tenant_id: テナントID。
            session: 非同期DBセッション。
        """
        group = await GroupRepository.find_by_id_and_tenant_id(
            group_id, tenant_id, session
        )
        if group:
            await GroupRepository.delete(group, session)

    @staticmethod
    async def list_group_users(
        group_id: str,
        tenant_id: str,
        current_user: User,
        search: str | None,
        role: str | None,
        sort: str,
        page: int,
        size: int,
        session: AsyncSession,
        *,
        include_usage: bool = False,
    ) -> PagedGroupMemberResponse:
        """グループ所属ユーザー一覧をページネーションで取得する。

        NAW-1172: `include_usage=True`の場合、有効な請求期間内の`totalCredits`
        （クレジット利用量合計）をレスポンスに付与する。`sort=totalCredits`は
        `include_usage=True`の場合のみ許可され、有効な請求期間が存在する場合に限り
        DBクエリでその合計値によりソートする。

        Args:
            group_id: グループID。
            tenant_id: テナントID。
            current_user: 認証済みユーザー。
            search: ユーザー名・loginIdの部分一致検索文字列。
            role: グループ内ロールでの絞り込み（"ADMIN"または"USER"）。
            sort: ソート指定（例: "updatedAt,desc"、"totalCredits,desc"）。
            page: ページ番号（0始まり）。
            size: 1ページあたりの件数。
            session: 非同期DBセッション。
            include_usage: Trueの場合、請求期間内のtotalCreditsをレスポンスに含める。

        Returns:
            ページネーション済み所属ユーザー一覧。

        Raises:
            HTTPException: グループが存在しない場合404、権限がない場合403、
                `sort=totalCredits`指定時に`include_usage=False`の場合400を返す。
        """
        validate_total_credits_sort(sort, include_usage)

        await GroupService._get_group_or_404(group_id, tenant_id, session)
        await GroupService._assert_can_manage_group(
            group_id, tenant_id, current_user, session
        )

        sort_parts = sort.split(",")
        sort_col_name = sort_parts[0]
        sort_dir = sort_parts[1] if len(sort_parts) > 1 else "asc"

        billing_period = (
            await resolve_active_billing_period(tenant_id, session)
            if include_usage
            else None
        )
        # period_from・period_toは常に両方Noneか両方datetimeのペアなので、
        # タプルとして一括で保持しmypy上もペアで narrow されるようにする。
        period: tuple[datetime, datetime] | None = (
            (billing_period[2], billing_period[3])
            if billing_period is not None
            else None
        )

        rows, total = await GroupUserRepository.find_page_by_group(
            group_id,
            tenant_id,
            search,
            role,
            sort_col_name,
            sort_dir,
            page,
            size,
            session,
            billing_period=period,
        )

        totals: dict[UUID, int] = {}
        if include_usage and period is not None:
            period_from, period_to = period
            totals = await TokenUsageRepository.sum_total_credits_by_user_ids(
                tenant_id, period_from, period_to, [u.id for _, u in rows], session
            )

        content = [
            GroupMemberUserResponse(
                userId=str(u.id),
                name=u.name,
                role=u.role.value,
                loginKey=u.login_key,
                groupAdmin=gu.is_admin,
                updatedAt=gu.updated_at,
                totalCredits=(
                    totals.get(u.id, 0)
                    if include_usage and period is not None
                    else None
                ),
            )
            for gu, u in rows
        ]
        return PagedGroupMemberResponse(
            content=content, totalElements=total, number=page, size=size
        )

    @staticmethod
    async def add_group_users(
        group_id: str,
        tenant_id: str,
        user_ids: list[str],
        current_user: User,
        session: AsyncSession,
    ) -> None:
        """グループにユーザーを一括追加する。既存所属はスキップする。

        Args:
            group_id: グループID。
            tenant_id: テナントID。
            user_ids: 追加対象のユーザーID一覧。
            current_user: 認証済みユーザー。
            session: 非同期DBセッション。

        Raises:
            HTTPException: user_idsが空の場合400、グループが存在しない場合404、
                権限がない場合403、対象ユーザーが存在しない場合404を返す。
        """
        if not user_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="userIds is required"
            )

        await GroupService._get_group_or_404(group_id, tenant_id, session)
        await GroupService._assert_can_manage_group(
            group_id, tenant_id, current_user, session
        )

        for raw_id in set(user_ids):
            target_uuid = GroupService._parse_user_uuid(raw_id)

            user = await UserRepository.find_by_id_and_tenant_id(
                target_uuid, tenant_id, session
            )
            if not user:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
                )

            existing = await GroupUserRepository.find_one(
                group_id, tenant_id, target_uuid, session
            )
            if existing:
                continue
            GroupUserRepository.add(group_id, tenant_id, target_uuid, session)

        await session.commit()

    @staticmethod
    async def remove_group_user(
        group_id: str,
        tenant_id: str,
        target_user_id: str,
        current_user: User,
        session: AsyncSession,
    ) -> None:
        """グループからユーザーを除外する。既に非所属なら何もしない。

        Args:
            group_id: グループID。
            tenant_id: テナントID。
            target_user_id: 除外対象のユーザーID。
            current_user: 認証済みユーザー。
            session: 非同期DBセッション。

        Raises:
            HTTPException: グループが存在しない場合404、権限がない場合403、
                グループ管理者が自分自身を除外しようとした場合403を返す。
        """
        await GroupService._get_group_or_404(group_id, tenant_id, session)
        await GroupService._assert_can_manage_group(
            group_id, tenant_id, current_user, session
        )

        target_uuid = GroupService._parse_user_uuid(target_user_id)
        GroupService._assert_not_self(target_uuid, current_user)

        group_user = await GroupUserRepository.find_one(
            group_id, tenant_id, target_uuid, session
        )
        if group_user:
            await GroupUserRepository.remove(group_user, session)

    @staticmethod
    async def update_group_user_role(
        group_id: str,
        tenant_id: str,
        target_user_id: str,
        group_admin: bool,
        current_user: User,
        session: AsyncSession,
    ) -> None:
        """グループ内管理者フラグを更新する。

        Args:
            group_id: グループID。
            tenant_id: テナントID。
            target_user_id: 対象ユーザーID。
            group_admin: 更新後のグループ内管理者フラグ。
            current_user: 認証済みユーザー。
            session: 非同期DBセッション。

        Raises:
            HTTPException: グループが存在しない場合404、対象ユーザーが非所属の場合404、
                権限がない場合403、グループ管理者が自分自身のロールを変更しようとした場合403を返す。
        """
        await GroupService._get_group_or_404(group_id, tenant_id, session)
        await GroupService._assert_can_manage_group(
            group_id, tenant_id, current_user, session
        )

        target_uuid = GroupService._parse_user_uuid(target_user_id)
        GroupService._assert_not_self(target_uuid, current_user)

        group_user = await GroupUserRepository.find_one(
            group_id, tenant_id, target_uuid, session
        )
        if not group_user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="User not found in group"
            )

        group_user.is_admin = group_admin
        session.add(group_user)
        await session.commit()

    @staticmethod
    async def add_group_assistants(
        group_id: str,
        tenant_id: str,
        assistant_ids: list[str],
        current_user: User,
        session: AsyncSession,
    ) -> None:
        """グループにアシスタントを一括追加する。既存紐付けはスキップする。

        Args:
            group_id: グループID。
            tenant_id: テナントID。
            assistant_ids: 追加対象のアシスタントID一覧。
            current_user: 認証済みユーザー。
            session: 非同期DBセッション。

        Raises:
            HTTPException: assistant_idsが空の場合400、グループが存在しない場合404、
                権限がない場合403、対象アシスタントが存在しない場合404を返す。
        """
        if not assistant_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="assistantIds is required",
            )

        await GroupService._get_group_or_404(group_id, tenant_id, session)
        await GroupService._assert_can_manage_group(
            group_id, tenant_id, current_user, session
        )

        target_ids = list(dict.fromkeys(assistant_ids))
        assistants = await AssistantRepository.find_by_ids_and_tenant_id(
            target_ids, tenant_id, session
        )
        if len(assistants) != len(target_ids):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Assistant not found"
            )

        for assistant_id in target_ids:
            existing = await GroupAssistantRepository.find_one(
                group_id, tenant_id, assistant_id, session
            )
            if existing:
                continue
            GroupAssistantRepository.add(group_id, tenant_id, assistant_id, session)

        await session.commit()

    @staticmethod
    async def remove_group_assistant(
        group_id: str,
        tenant_id: str,
        assistant_id: str,
        current_user: User,
        session: AsyncSession,
    ) -> None:
        """グループからアシスタントを除外する。既に非紐付けなら何もしない。

        Args:
            group_id: グループID。
            tenant_id: テナントID。
            assistant_id: 除外対象のアシスタントID。
            current_user: 認証済みユーザー。
            session: 非同期DBセッション。

        Raises:
            HTTPException: グループが存在しない場合404、権限がない場合403、
                対象アシスタントが存在しない場合404を返す。
        """
        await GroupService._get_group_or_404(group_id, tenant_id, session)
        await GroupService._assert_can_manage_group(
            group_id, tenant_id, current_user, session
        )

        assistant = await AssistantRepository.find_by_id_and_tenant_id(
            assistant_id, tenant_id, session
        )
        if not assistant:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Assistant not found"
            )

        group_assistant = await GroupAssistantRepository.find_one(
            group_id, tenant_id, assistant_id, session
        )
        if group_assistant:
            await GroupAssistantRepository.remove(group_assistant, session)

    @staticmethod
    async def list_group_assistants(
        group_id: str,
        tenant_id: str,
        current_user: User,
        assistant_type: AssistantType | None,
        category_id: str | None,
        search: str | None,
        sort: str,
        page: int,
        size: int,
        session: AsyncSession,
    ) -> PagedAssistantResponse:
        """グループに紐づくアシスタント一覧をページネーションで取得する。

        Args:
            group_id: グループID。
            tenant_id: テナントID。
            current_user: 認証済みユーザー。
            assistant_type: アシスタント種別での絞り込み。
            category_id: カテゴリでの絞り込み（`"NONE"`はカテゴリ未設定）。
            search: アシスタント名・説明の部分一致検索文字列。
            sort: ソート指定（例: "addedAt,desc"）。
            page: ページ番号（0始まり）。
            size: 1ページあたりの件数。
            session: 非同期DBセッション。

        Returns:
            ページネーション済みアシスタント一覧（各要素にaddedAtを含む）。

        Raises:
            HTTPException: グループが存在しない場合404、権限がない場合403を返す。
        """
        await GroupService._get_group_or_404(group_id, tenant_id, session)
        await GroupService._assert_can_manage_group(
            group_id, tenant_id, current_user, session
        )

        sort_parts = sort.split(",")
        sort_col_name = sort_parts[0]
        sort_dir = sort_parts[1] if len(sort_parts) > 1 else "asc"

        rows, total = await GroupAssistantRepository.find_page_by_group(
            group_id,
            tenant_id,
            assistant_type,
            category_id,
            search,
            sort_col_name,
            sort_dir,
            page,
            size,
            session,
        )

        assistants = [assistant for _, assistant in rows]
        content = await AssistantService._build_responses(
            assistants, tenant_id, session
        )
        for response, (group_assistant, _) in zip(content, rows, strict=True):
            response.addedAt = group_assistant.updated_at

        return PagedAssistantResponse(
            content=content, totalElements=total, number=page, size=size
        )

    @staticmethod
    async def add_group_prompt_templates(
        group_id: str,
        tenant_id: str,
        template_ids: list[str],
        current_user: User,
        session: AsyncSession,
    ) -> None:
        """グループにプロンプトテンプレートを一括追加する。既存所属はスキップする。

        Args:
            group_id: グループID。
            tenant_id: テナントID。
            template_ids: 追加対象のプロンプトテンプレートID一覧。
            current_user: 認証済みユーザー。
            session: 非同期DBセッション。

        Raises:
            HTTPException: template_idsが空の場合400、グループが存在しない場合404、
                権限がない場合403、対象テンプレートが存在しない場合404を返す。
        """
        if not template_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="templateIds is required",
            )

        await GroupService._get_group_or_404(group_id, tenant_id, session)
        await GroupService._assert_can_manage_group(
            group_id, tenant_id, current_user, session
        )

        target_ids = list(dict.fromkeys(template_ids))
        templates = await PromptTemplateRepository.find_by_ids_and_tenant_id(
            target_ids, tenant_id, session
        )
        if len(templates) != len(target_ids):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Prompt template not found",
            )

        for template_id in target_ids:
            existing = await GroupPromptTemplateRepository.find_one(
                group_id, tenant_id, template_id, session
            )
            if existing:
                continue
            GroupPromptTemplateRepository.add(group_id, tenant_id, template_id, session)

        await session.commit()

    @staticmethod
    async def remove_group_prompt_template(
        group_id: str,
        tenant_id: str,
        template_id: str,
        current_user: User,
        session: AsyncSession,
    ) -> None:
        """グループからプロンプトテンプレートを除外する。既に非所属なら何もしない。

        Args:
            group_id: グループID。
            tenant_id: テナントID。
            template_id: 除外対象のプロンプトテンプレートID。
            current_user: 認証済みユーザー。
            session: 非同期DBセッション。

        Raises:
            HTTPException: グループが存在しない場合404、権限がない場合403、
                対象テンプレートが存在しない場合404を返す。
        """
        await GroupService._get_group_or_404(group_id, tenant_id, session)
        await GroupService._assert_can_manage_group(
            group_id, tenant_id, current_user, session
        )

        template = await PromptTemplateRepository.find_by_id_and_tenant_id(
            template_id, tenant_id, session
        )
        if not template:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Prompt template not found",
            )

        group_prompt_template = await GroupPromptTemplateRepository.find_one(
            group_id, tenant_id, template_id, session
        )
        if group_prompt_template:
            await GroupPromptTemplateRepository.remove(group_prompt_template, session)

    @staticmethod
    async def list_group_prompt_templates(
        group_id: str,
        tenant_id: str,
        current_user: User,
        search: str | None,
        sort: str,
        page: int,
        size: int,
        session: AsyncSession,
    ) -> PagedPromptTemplateResponse:
        """グループに紐づくプロンプトテンプレート一覧をページネーションで取得する。

        Args:
            group_id: グループID。
            tenant_id: テナントID。
            current_user: 認証済みユーザー。
            search: テンプレート名・説明の部分一致検索文字列。
            sort: ソート指定（例: "addedAt,desc"）。
            page: ページ番号（0始まり）。
            size: 1ページあたりの件数。
            session: 非同期DBセッション。

        Returns:
            ページネーション済みプロンプトテンプレート一覧（各要素にaddedAtを含む）。

        Raises:
            HTTPException: グループが存在しない場合404、権限がない場合403を返す。
        """
        await GroupService._get_group_or_404(group_id, tenant_id, session)
        await GroupService._assert_can_manage_group(
            group_id, tenant_id, current_user, session
        )

        sort_parts = sort.split(",")
        sort_col_name = sort_parts[0]
        sort_dir = sort_parts[1] if len(sort_parts) > 1 else "asc"

        rows, total = await GroupPromptTemplateRepository.find_page_by_group(
            group_id, tenant_id, search, sort_col_name, sort_dir, page, size, session
        )

        template_ids = [template.id for _, template in rows]
        groups_by_template_id = (
            await GroupPromptTemplateRepository.find_groups_grouped_by_template_ids(
                template_ids, tenant_id, session
            )
        )

        content = [
            PromptTemplateResponse(
                id=template.id,
                tenantId=template.tenant_id,
                name=template.name,
                description=template.description,
                systemPrompt=template.system_prompt,
                groups={name for _, name in groups_by_template_id.get(template.id, [])},
                updatedAt=template.updated_at,
                addedAt=group_prompt_template.updated_at,
            )
            for group_prompt_template, template in rows
        ]
        return PagedPromptTemplateResponse(
            content=content, totalElements=total, number=page, size=size
        )
