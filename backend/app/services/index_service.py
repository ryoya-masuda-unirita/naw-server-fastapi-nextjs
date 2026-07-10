from fastapi import HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import credit_quota, file_creation
from app.core.file_storage import FileStorage
from app.models.index import Index, IndexType
from app.models.user import User, UserRole
from app.repositories.assistant_repository import AssistantRepository
from app.repositories.group_assistant_repository import GroupAssistantRepository
from app.repositories.group_repository import GroupRepository
from app.repositories.group_user_repository import GroupUserRepository
from app.repositories.index_repository import IndexRepository
from app.repositories.message_feedback_repository import MessageFeedbackRepository
from app.repositories.tenant_endpoint_repository import TenantEndpointRepository
from app.schemas.index import (
    IndexRequest,
    IndexResponse,
    PagedIndexResponse,
    TenantEndpointItemResponse,
)

SAAS_INDEX_LIMIT = 15


class IndexService:
    @staticmethod
    def _is_tenant_admin(current_user: User) -> bool:
        return current_user.role in (UserRole.ADMIN, UserRole.SYSTEM)

    @staticmethod
    async def _resolve_visibility_scope(
        tenant_id: str, current_user: User, session: AsyncSession
    ) -> tuple[list[str] | None, list[str] | None]:
        """一覧・詳細取得の可視性スコープを解決する。

        移植元（Spring Boot）の`IndexService.getIndexes`相当。テナント管理者、または
        いずれの管理グループも持たない一般ユーザーの場合は絞り込みなし（`None, None`）を返す
        （移植元の「グループ管理者でなければ全件」という挙動をそのまま踏襲する）。
        グループ管理者（テナント管理者でない）の場合は、自分の管理グループのアシスタントが
        使用しているインデックスID一覧と、管理グループID一覧を返す。

        Args:
            tenant_id: テナントID。
            current_user: 認証済みユーザー。
            session: 非同期DBセッション。

        Returns:
            (許可インデックスID一覧, 許可グループID一覧) のタプル。絞り込み不要な場合は両方None。
        """
        if IndexService._is_tenant_admin(current_user):
            return None, None

        admin_group_ids = await GroupUserRepository.find_admin_group_ids_for_user(
            tenant_id, current_user.id, session
        )
        if not admin_group_ids:
            return None, None

        assistant_ids = await GroupAssistantRepository.find_assistant_ids_by_group_ids(
            admin_group_ids, tenant_id, session
        )
        allowed_index_ids = await AssistantRepository.find_distinct_index_ids_by_ids(
            assistant_ids, tenant_id, session
        )
        return allowed_index_ids, admin_group_ids

    @staticmethod
    async def _to_response(
        index: Index,
        tenant_endpoints_by_index_id: dict[str, list],
        group_ids_by_index_id: dict[str, list[str]],
    ) -> IndexResponse:
        endpoints = tenant_endpoints_by_index_id.get(index.id, [])
        return IndexResponse(
            id=index.id,
            tenantId=index.tenant_id,
            type=index.type,
            name=index.name,
            description=index.description,
            tenantEndpoints=[
                TenantEndpointItemResponse(
                    id=endpoint.id,
                    tenantId=endpoint.tenant_id,
                    type=endpoint.type.value,
                    endpointName=endpoint.endpoint_name,
                    endpoint=endpoint.endpoint,
                )
                for endpoint in endpoints
            ],
            groupIds=group_ids_by_index_id.get(index.id, []),
            add=index.add,
            delete=index.delete,
            get=index.get,
            createdAt=index.created_at,
            updatedAt=index.updated_at,
        )

    @staticmethod
    async def _to_paged_response(
        indexes: list[Index],
        total: int,
        tenant_id: str,
        page: int,
        size: int,
        session: AsyncSession,
    ) -> PagedIndexResponse:
        index_ids = [i.id for i in indexes]
        tenant_endpoints_by_index_id = (
            await IndexRepository.find_tenant_endpoints_grouped_by_index_ids(
                index_ids, tenant_id, session
            )
        )
        group_ids_by_index_id = (
            await IndexRepository.find_group_ids_grouped_by_index_ids(
                index_ids, tenant_id, session
            )
        )
        content = [
            await IndexService._to_response(
                index, tenant_endpoints_by_index_id, group_ids_by_index_id
            )
            for index in indexes
        ]
        return PagedIndexResponse(
            content=content, totalElements=total, number=page, size=size
        )

    @staticmethod
    async def list_indexes(
        tenant_id: str,
        current_user: User,
        group_id: str | None,
        search: str | None,
        sort_col_name: str,
        sort_dir: str,
        page: int,
        size: int,
        session: AsyncSession,
    ) -> PagedIndexResponse:
        """インデックス一覧をページネーションで取得する。

        Args:
            tenant_id: テナントID。
            current_user: 認証済みユーザー。
            group_id: グループでの絞り込み。
            search: 名前・説明の部分一致検索文字列。
            sort_col_name: ソート対象列名。
            sort_dir: ソート方向。
            page: ページ番号（0始まり）。
            size: 1ページあたりの件数。
            session: 非同期DBセッション。

        Returns:
            ページネーション済みインデックス一覧。
        """
        if group_id:
            if not IndexService._is_tenant_admin(current_user):
                admin_group_ids = (
                    await GroupUserRepository.find_admin_group_ids_for_user(
                        tenant_id, current_user.id, session
                    )
                )
                if group_id not in admin_group_ids:
                    return PagedIndexResponse(
                        content=[], totalElements=0, number=page, size=size
                    )
            indexes, total = await IndexRepository.find_page(
                tenant_id,
                search,
                group_id,
                None,
                None,
                sort_col_name,
                sort_dir,
                page,
                size,
                session,
            )
        else:
            (
                allowed_index_ids,
                allowed_group_ids,
            ) = await IndexService._resolve_visibility_scope(
                tenant_id, current_user, session
            )
            indexes, total = await IndexRepository.find_page(
                tenant_id,
                search,
                None,
                allowed_index_ids,
                allowed_group_ids,
                sort_col_name,
                sort_dir,
                page,
                size,
                session,
            )

        return await IndexService._to_paged_response(
            indexes, total, tenant_id, page, size, session
        )

    @staticmethod
    async def _ensure_visible(
        index: Index, tenant_id: str, current_user: User, session: AsyncSession
    ) -> None:
        """インデックスがログインユーザーの可視範囲内かを検証する。

        一覧取得と同じ可視性ロジック（`_resolve_visibility_scope`）を再利用し、
        取得・更新・削除のいずれについても、グループ管理者が自分の管理範囲外の
        インデックスを操作できないようにする（見えないインデックスは存在しないものとして404）。

        Args:
            index: 検証対象のインデックス。
            tenant_id: テナントID。
            current_user: 認証済みユーザー。
            session: 非同期DBセッション。

        Raises:
            HTTPException: 可視範囲外の場合404を返す。
        """
        if IndexService._is_tenant_admin(current_user):
            return

        (
            allowed_index_ids,
            allowed_group_ids,
        ) = await IndexService._resolve_visibility_scope(
            tenant_id, current_user, session
        )
        if allowed_index_ids is None and allowed_group_ids is None:
            return

        group_ids_by_index_id = (
            await IndexRepository.find_group_ids_grouped_by_index_ids(
                [index.id], tenant_id, session
            )
        )
        visible = index.id in (allowed_index_ids or []) or bool(
            set(group_ids_by_index_id.get(index.id, [])) & set(allowed_group_ids or [])
        )
        if not visible:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="インデックスが存在しません。",
            )

    @staticmethod
    async def get_index(
        index_id: str, tenant_id: str, current_user: User, session: AsyncSession
    ) -> IndexResponse:
        """インデックス詳細を取得する。

        移植元同様、一覧と同じ可視性ロジックで再チェックし、見えない場合は404を返す。

        Args:
            index_id: インデックスID。
            tenant_id: テナントID。
            current_user: 認証済みユーザー。
            session: 非同期DBセッション。

        Returns:
            インデックス詳細。

        Raises:
            HTTPException: インデックスが存在しない、または可視範囲外の場合404を返す。
        """
        index = await IndexRepository.find_by_id_and_tenant_id(
            index_id, tenant_id, session
        )
        if not index:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="インデックスが存在しません。",
            )

        await IndexService._ensure_visible(index, tenant_id, current_user, session)

        tenant_endpoints_by_index_id = (
            await IndexRepository.find_tenant_endpoints_grouped_by_index_ids(
                [index.id], tenant_id, session
            )
        )
        group_ids_by_index_id = (
            await IndexRepository.find_group_ids_grouped_by_index_ids(
                [index.id], tenant_id, session
            )
        )
        return await IndexService._to_response(
            index, tenant_endpoints_by_index_id, group_ids_by_index_id
        )

    @staticmethod
    async def _resolve_endpoint_ids(
        tenant_id: str, endpoint_ids: list[str], session: AsyncSession
    ) -> list[str]:
        endpoints = await TenantEndpointRepository.find_by_ids_and_tenant_id(
            endpoint_ids, tenant_id, session
        )
        if len(endpoints) != len(set(endpoint_ids)):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="指定されたテナントエンドポイントが見つかりません。",
            )
        return [e.id for e in endpoints]

    @staticmethod
    async def _resolve_group_ids(
        tenant_id: str, group_ids: list[str] | None, session: AsyncSession
    ) -> list[str]:
        if not group_ids:
            return []
        groups = await GroupRepository.find_by_tenant_id_and_ids(
            tenant_id, group_ids, session
        )
        if len(groups) != len(set(group_ids)):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="指定されたグループの一部が見つかりません。",
            )
        return [g.id for g in groups]

    @staticmethod
    async def create_index(
        tenant_id: str, req: IndexRequest, session: AsyncSession
    ) -> IndexResponse:
        """インデックスを新規作成する。

        Args:
            tenant_id: テナントID。
            req: 作成リクエスト。
            session: 非同期DBセッション。

        Returns:
            作成したインデックス。

        Raises:
            HTTPException: SAAS_GLOBALインデックスが既に15件ある場合400を返す。
                指定されたエンドポイント・グループが存在しない場合404を返す。
        """
        if req.type == IndexType.SAAS_GLOBAL:
            existing_count = await IndexRepository.count_saas_indexes(
                tenant_id, session
            )
            if existing_count >= SAAS_INDEX_LIMIT:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="SaaS側のインデックスは15個までしか作成できません。",
                )

        endpoint_ids = await IndexService._resolve_endpoint_ids(
            tenant_id, req.endpointIds, session
        )
        group_ids = await IndexService._resolve_group_ids(
            tenant_id, req.groupIds, session
        )

        index = Index(
            tenant_id=tenant_id,
            name=req.name,
            description=req.description,
            type=req.type,
            add=req.add,
            delete=req.delete,
            get=req.get,
        )
        session.add(index)
        await session.flush()

        await IndexRepository.replace_endpoints_for_index(
            index.id, tenant_id, endpoint_ids, session
        )
        await IndexRepository.replace_groups_for_index(
            index.id, tenant_id, group_ids, session
        )
        await session.commit()
        await session.refresh(index)

        tenant_endpoints_by_index_id = (
            await IndexRepository.find_tenant_endpoints_grouped_by_index_ids(
                [index.id], tenant_id, session
            )
        )
        group_ids_by_index_id = (
            await IndexRepository.find_group_ids_grouped_by_index_ids(
                [index.id], tenant_id, session
            )
        )
        return await IndexService._to_response(
            index, tenant_endpoints_by_index_id, group_ids_by_index_id
        )

    @staticmethod
    async def update_index(
        index_id: str,
        tenant_id: str,
        req: IndexRequest,
        current_user: User,
        session: AsyncSession,
    ) -> IndexResponse:
        """インデックスを更新する（移植元同様、部分更新ではなく全フィールド置換）。

        グループ管理者が自分の管理範囲外のインデックスを更新できないよう、
        一覧・詳細取得と同じ可視性ロジックで検証する（移植元Javaにはこのチェックは
        存在しないが、本APIの他エンドポイント・他ドメインAPIとは異なりインデックスは
        `groupId`によるアクセス制御が特に重要なため、FastAPI版では一貫性を優先して追加する）。

        Args:
            index_id: 更新対象のインデックスID。
            tenant_id: テナントID。
            req: 更新リクエスト。
            current_user: 認証済みユーザー。
            session: 非同期DBセッション。

        Returns:
            更新後のインデックス。

        Raises:
            HTTPException: インデックスが存在しない、または可視範囲外の場合404を返す。
                指定されたエンドポイント・グループが存在しない場合404を返す
                （SAAS_GLOBALの15件上限チェックは移植元同様、更新時はスキップする）。
        """
        index = await IndexRepository.find_by_id_and_tenant_id(
            index_id, tenant_id, session
        )
        if not index:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="インデックスが存在しません。",
            )

        await IndexService._ensure_visible(index, tenant_id, current_user, session)

        endpoint_ids = await IndexService._resolve_endpoint_ids(
            tenant_id, req.endpointIds, session
        )
        group_ids = await IndexService._resolve_group_ids(
            tenant_id, req.groupIds, session
        )

        index.name = req.name
        index.description = req.description
        index.type = req.type
        index.add = req.add
        index.delete = req.delete
        index.get = req.get
        session.add(index)

        await IndexRepository.replace_endpoints_for_index(
            index.id, tenant_id, endpoint_ids, session
        )
        await IndexRepository.replace_groups_for_index(
            index.id, tenant_id, group_ids, session
        )
        await session.commit()
        await session.refresh(index)

        tenant_endpoints_by_index_id = (
            await IndexRepository.find_tenant_endpoints_grouped_by_index_ids(
                [index.id], tenant_id, session
            )
        )
        group_ids_by_index_id = (
            await IndexRepository.find_group_ids_grouped_by_index_ids(
                [index.id], tenant_id, session
            )
        )
        return await IndexService._to_response(
            index, tenant_endpoints_by_index_id, group_ids_by_index_id
        )

    @staticmethod
    async def delete_index(
        index_id: str, tenant_id: str, current_user: User, session: AsyncSession
    ) -> None:
        """インデックスを削除する。存在しない場合は何もしない（冪等）。

        `indexes_endpoints`・`indexes_groups`はDBのON DELETE CASCADEにより連動削除される。
        グループ管理者が自分の管理範囲外のインデックスを削除できないよう、
        `update_index`と同様に可視性チェックを行う。

        Args:
            index_id: 削除対象のインデックスID。
            tenant_id: テナントID。
            current_user: 認証済みユーザー。
            session: 非同期DBセッション。

        Raises:
            HTTPException: グループ管理者が可視範囲外のインデックスを指定した場合404を返す
                （存在しないインデックスの指定自体は冪等に扱い、何もしない）。
        """
        index = await IndexRepository.find_by_id_and_tenant_id(
            index_id, tenant_id, session
        )
        if not index:
            return

        await IndexService._ensure_visible(index, tenant_id, current_user, session)

        await IndexRepository.delete(index, session)

    @staticmethod
    def sync_index() -> None:
        """インデックスを同期する。

        移植元`FileService.syncFiles`相当。SAAS環境ではファイル一括同期機能自体が
        未実装であり、移植元は常にエラーを返すスタブ実装のため、その挙動をそのまま踏襲する。

        Raises:
            HTTPException: 常に400を返す。
        """
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="ファイル一括同期機能はローカルAPIサーバしか対応していません。",
        )

    @staticmethod
    async def additional_learning(
        index_id: str,
        tenant_id: str,
        current_user: User,
        feedback_id: str | None,
        room_id: str | None,
        upload: UploadFile,
        storage: FileStorage,
        session: AsyncSession,
    ) -> None:
        """インデックスへ追加学習用のファイルを登録する。

        移植元`FileService.additionalLearning`相当。`feedbackId`指定時は特定の質問回答
        ペアを、`roomId`指定時はルーム内の全メッセージを学習データソースとして扱う。

        ファイルのストレージ保存・DB作成処理は、`FileService.create_file`と共通する
        ロジックのため`core.file_creation`に切り出したものを再利用する（`xxx_service.py`
        が別の`yyy_service.py`を呼ぶ構造を避けるため）。

        Args:
            index_id: インデックスID。
            tenant_id: テナントID。
            current_user: 追加学習を実行するユーザー。
            feedback_id: 学習データソースとするフィードバックID。`room_id`と排他。
            room_id: 学習データソースとするルームID。`feedback_id`と排他。
            upload: 追加学習用のアップロードファイル。
            storage: ファイルストレージ。
            session: 非同期DBセッション。

        Raises:
            HTTPException: `feedback_id`・`room_id`のどちらも未指定、または両方指定の場合400。
                インデックスが存在しない場合404、`LOCAL`インデックスの場合400、
                当月クレジット上限超過の場合429を返す。
        """
        learning_source_not_specified = feedback_id is None and room_id is None
        confused_learning_source = feedback_id is not None and room_id is not None
        if learning_source_not_specified or confused_learning_source:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="追加学習のデータソースが正しく指定されていません。",
            )

        index = await IndexRepository.find_by_id_and_tenant_id(
            index_id, tenant_id, session
        )
        if index is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="インデックスが存在しません。",
            )
        file_creation.ensure_not_local(index)
        await credit_quota.enforce_within_quota(tenant_id, session)

        if feedback_id is not None:
            name = f"追加学習_{feedback_id}.md"
            reference = f"フィードバック_{feedback_id}"
        else:
            # 移植元同様、roomId指定時もreferenceの接頭辞は「フィードバック_」のまま
            # （意図的なバグ修正は本Issueのスコープ外とし、移植元の挙動をそのまま踏襲する）。
            name = f"追加学習_ルーム_{room_id}.md"
            reference = f"フィードバック_{room_id}"

        await file_creation.create_file_record(
            index,
            name,
            "フィードバック学習",
            reference,
            current_user,
            upload,
            tenant_id,
            storage,
            session,
            feedback_id,
            room_id,
        )

        if feedback_id is not None:
            feedback = await MessageFeedbackRepository.find_by_id_and_tenant_id(
                feedback_id, tenant_id, session
            )
            if feedback is not None:
                feedback.index_id = index_id
                await MessageFeedbackRepository.save(feedback, session)
