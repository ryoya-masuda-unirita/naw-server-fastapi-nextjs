import random

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.assistant import Assistant, AssistantType
from app.models.assistant_category import AssistantCategory
from app.models.tenant_endpoint import EndpointType
from app.models.user import User, UserRole
from app.repositories.ai_model_repository import AIModelRepository
from app.repositories.assistant_category_mapping_repository import (
    AssistantCategoryMappingRepository,
)
from app.repositories.assistant_category_repository import AssistantCategoryRepository
from app.repositories.assistant_endpoint_repository import AssistantEndpointRepository
from app.repositories.assistant_repository import AssistantRepository
from app.repositories.group_assistant_repository import GroupAssistantRepository
from app.repositories.group_repository import GroupRepository
from app.repositories.group_user_repository import GroupUserRepository
from app.repositories.tenant_endpoint_repository import TenantEndpointRepository
from app.schemas.assistant import (
    AIModelResponse,
    AssistantCategoryItemResponse,
    AssistantCreateRequest,
    AssistantEndpointInput,
    AssistantEndpointItemResponse,
    AssistantEndpointResponse,
    AssistantGetResponse,
    AssistantUpdateRequest,
    PagedAssistantResponse,
)

# 移植元PageableSortUtil.remapSortのフロントエンド向けソートキーエイリアス。
# secuaigent-client（AssistantSortField）は実際に"assistantType"を送信するため、
# "type"（DBの実カラム名）に変換する。"serverType"・"server"は移植元Javaのマップに
# 存在した別名で、念のため同様に扱う。
# "category"はM2Mの多重度により単純な列ソートに落とし込めないため更新日時にフォールバックする。
_SORT_ALIASES: dict[str, str] = {
    "assistantType": "type",
    "serverType": "type",
    "server": "type",
    "category": "updatedAt",
}


class AssistantService:
    @staticmethod
    def _is_chat_type(endpoint_type: EndpointType) -> bool:
        return endpoint_type.name.endswith("CHAT")

    @staticmethod
    def _generate_random_icon_color() -> str:
        return f"#{random.randint(0, 0xFFFFFF):06X}"

    @staticmethod
    async def _get_assistant_or_404(
        assistant_id: str, tenant_id: str, session: AsyncSession
    ) -> Assistant:
        """IDとテナントIDでアシスタントを取得し、存在しなければ404を送出する。

        Args:
            assistant_id: アシスタントID。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            該当するアシスタント。

        Raises:
            HTTPException: 存在しない場合404を返す。
        """
        assistant = await AssistantRepository.find_by_id_and_tenant_id(
            assistant_id, tenant_id, session
        )
        if not assistant:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Assistant not found"
            )
        return assistant

    @staticmethod
    async def _resolve_endpoint_types(
        endpoints: list[AssistantEndpointInput], tenant_id: str, session: AsyncSession
    ) -> list[EndpointType]:
        ids = [e.id for e in endpoints]
        if len(ids) != len(set(ids)):
            # 重複IDのまま`assistants_endpoints`（PK: assistant_id, endpoint_id）へ
            # INSERTするとIntegrityErrorになるため、ここで明示的に400として弾く。
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Duplicate tenant endpoint id",
            )
        tenant_endpoints = await TenantEndpointRepository.find_by_ids_and_tenant_id(
            ids, tenant_id, session
        )
        endpoint_type_map = {te.id: te.type for te in tenant_endpoints}
        if len(endpoint_type_map) != len(set(ids)):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid tenant endpoint id",
            )
        return [endpoint_type_map[i] for i in ids]

    @staticmethod
    async def _validate_endpoint_types(
        assistant_type: AssistantType,
        endpoints: list[AssistantEndpointInput],
        tenant_id: str,
        session: AsyncSession,
    ) -> None:
        """アシスタント種別とエンドポイント種別の組み合わせを検証する。

        移植元`AssistantCreateRequestValidator`相当。

        Args:
            assistant_type: アシスタント種別。
            endpoints: 作成・更新リクエストのエンドポイント一覧。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Raises:
            HTTPException: エンドポイント種別がアシスタント種別と整合しない場合400を返す。
        """
        types = await AssistantService._resolve_endpoint_types(
            endpoints, tenant_id, session
        )

        if assistant_type == AssistantType.SECURE:
            if any(t != EndpointType.LOCAL_SERVER for t in types):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="SECUREアシスタントはLOCAL_SERVERエンドポイントのみ使用できます。",
                )
        elif assistant_type == AssistantType.SAAS_CHAT:
            if any(not AssistantService._is_chat_type(t) for t in types):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="SAAS_CHATアシスタントはチャット用エンドポイントのみ使用できます。",
                )
        elif assistant_type == AssistantType.SAAS_RAG:
            if any(not AssistantService._is_chat_type(t) for t in types):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="SAAS_RAGアシスタントはチャット用エンドポイントのみ使用できます。",
                )
            chat_count = sum(1 for t in types if AssistantService._is_chat_type(t))
            if chat_count != 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="SAAS_RAGアシスタントは、チャット用エンドポイントを1つだけ持つ必要があります。",
                )

    @staticmethod
    def _to_get_response(
        assistant: Assistant,
        endpoints_map: dict[str, list[AssistantEndpointItemResponse]],
        groups_map: dict[str, list[str]],
        categories_map: dict[str, list[AssistantCategory]],
    ) -> AssistantGetResponse:
        categories = [
            AssistantCategoryItemResponse(
                id=c.id, name=c.name, description=c.description
            )
            for c in sorted(categories_map.get(assistant.id, []), key=lambda c: c.id)
        ]
        return AssistantGetResponse(
            id=assistant.id,
            tenantId=assistant.tenant_id,
            type=assistant.type,
            endpoints=endpoints_map.get(assistant.id, []),
            name=assistant.name,
            indexId=assistant.index_id,
            groups=groups_map.get(assistant.id, []),
            category=categories[0] if categories else None,
            categories=categories,
            description=assistant.description,
            includeHistory=assistant.include_history,
            iconColor=assistant.icon_color,
        )

    @staticmethod
    async def _build_responses(
        assistants: list[Assistant], tenant_id: str, session: AsyncSession
    ) -> list[AssistantGetResponse]:
        """アシスタント一覧に紐づくエンドポイント・グループ・カテゴリを1クエリずつ一括取得し、レスポンスを組み立てる。

        Args:
            assistants: 変換対象のアシスタント一覧。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            アシスタントレスポンス一覧。
        """
        assistant_ids = [a.id for a in assistants]
        endpoints_map = (
            await AssistantEndpointRepository.find_endpoints_grouped_by_assistant_id(
                assistant_ids, tenant_id, session
            )
        )
        groups_map = (
            await GroupAssistantRepository.find_group_ids_grouped_by_assistant_id(
                assistant_ids, tenant_id, session
            )
        )
        categories_map = await AssistantCategoryMappingRepository.find_categories_grouped_by_assistant_ids(
            assistant_ids, tenant_id, session
        )
        return [
            AssistantService._to_get_response(
                a, endpoints_map, groups_map, categories_map
            )
            for a in assistants
        ]

    @staticmethod
    async def get_assistants(
        tenant_id: str, current_user: User, session: AsyncSession
    ) -> list[AssistantGetResponse]:
        """ログインユーザーが所属するGroupに紐づくアシスタント一覧を取得する。

        Args:
            tenant_id: テナントID。
            current_user: 認証済みユーザー。
            session: 非同期DBセッション。

        Returns:
            アシスタント一覧（重複排除済み）。
        """
        group_ids = await GroupUserRepository.find_belonging_group_ids(
            tenant_id, current_user.id, session
        )
        assistant_ids = await GroupAssistantRepository.find_assistant_ids_by_group_ids(
            group_ids, tenant_id, session
        )
        assistants = await AssistantRepository.find_by_ids_and_tenant_id(
            assistant_ids, tenant_id, session
        )
        return await AssistantService._build_responses(assistants, tenant_id, session)

    @staticmethod
    async def create_assistant(
        tenant_id: str, req: AssistantCreateRequest, session: AsyncSession
    ) -> AssistantGetResponse:
        """アシスタントを新規作成する。

        Args:
            tenant_id: テナントID。
            req: 作成リクエスト。
            session: 非同期DBセッション。

        Returns:
            作成したアシスタント。

        Raises:
            HTTPException: エンドポイント種別が不正な場合400を返す。
        """
        await AssistantService._validate_endpoint_types(
            req.type, req.endpoints, tenant_id, session
        )

        assistant = Assistant(
            tenant_id=tenant_id,
            type=req.type,
            index_id=req.indexId or None,
            name=req.name,
            description=req.description,
            include_history=req.includeHistory,
            icon_color=req.iconColor or AssistantService._generate_random_icon_color(),
        )
        session.add(assistant)

        await AssistantService._replace_relations(assistant.id, tenant_id, req, session)

        await session.commit()
        await session.refresh(assistant)

        responses = await AssistantService._build_responses(
            [assistant], tenant_id, session
        )
        return responses[0]

    @staticmethod
    async def update_assistant(
        assistant_id: str,
        tenant_id: str,
        req: AssistantUpdateRequest,
        session: AsyncSession,
    ) -> AssistantGetResponse:
        """アシスタントを更新する（部分更新）。

        Args:
            assistant_id: 更新対象のアシスタントID。
            tenant_id: テナントID。
            req: 更新リクエスト。
            session: 非同期DBセッション。

        Returns:
            更新後のアシスタント。

        Raises:
            HTTPException: 存在しない場合404、エンドポイント種別が不正な場合400を返す。
        """
        assistant = await AssistantService._get_assistant_or_404(
            assistant_id, tenant_id, session
        )
        await AssistantService._validate_endpoint_types(
            req.type, req.endpoints, tenant_id, session
        )

        # 移植元の`StringUtils.isNotBlank`と同様、null・空文字・空白のみの場合は
        # 変更しない（"未送信"と"空文字を送って解除"を区別しないフィールド）。
        if req.name:
            assistant.name = req.name
        assistant.type = req.type
        if req.indexId is not None:
            assistant.index_id = req.indexId or None
        if req.description and req.description.strip():
            assistant.description = req.description
        assistant.include_history = req.includeHistory
        if req.iconColor and req.iconColor.strip():
            assistant.icon_color = req.iconColor
        session.add(assistant)

        await AssistantService._replace_relations(assistant.id, tenant_id, req, session)

        await session.commit()
        await session.refresh(assistant)

        responses = await AssistantService._build_responses(
            [assistant], tenant_id, session
        )
        return responses[0]

    @staticmethod
    async def _replace_relations(
        assistant_id: str,
        tenant_id: str,
        req: AssistantCreateRequest | AssistantUpdateRequest,
        session: AsyncSession,
    ) -> None:
        """カテゴリ・グループ・エンドポイントの紐付けを、リクエスト内容で置き換える。

        存在しないID（他テナントのものや誤ったIDを含む）は移植元同様に黙って無視する。
        カテゴリ・グループは「未送信/null」と「空配列」を区別せず常に置き換える。
        コミットは呼び出し側で行う。
        """
        category_ids: set[str] = set()
        if req.categoryIds:
            categories = await AssistantCategoryRepository.find_by_tenant_id_and_ids(
                tenant_id, req.categoryIds, session
            )
            category_ids = {c.id for c in categories}
        await AssistantCategoryMappingRepository.replace_categories_for_assistant(
            assistant_id, tenant_id, category_ids, session
        )

        group_ids: set[str] = set()
        if req.groups:
            groups = await GroupRepository.find_by_tenant_id_and_ids(
                tenant_id, req.groups, session
            )
            group_ids = {g.id for g in groups}
        await GroupAssistantRepository.replace_groups_for_assistant(
            assistant_id, tenant_id, group_ids, session
        )

        await AssistantEndpointRepository.replace_endpoints_for_assistant(
            assistant_id, tenant_id, req.endpoints, session
        )

    @staticmethod
    async def delete_assistant(
        assistant_id: str, tenant_id: str, session: AsyncSession
    ) -> None:
        """アシスタントを削除する。

        room（チャット本体）ドメインが未移植のため、移植元にあるデフォルトアシスタント
        使用中判定（409）はここでは行わない。

        Args:
            assistant_id: 削除対象のアシスタントID。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Raises:
            HTTPException: 存在しない場合404を返す。
        """
        assistant = await AssistantService._get_assistant_or_404(
            assistant_id, tenant_id, session
        )
        await AssistantRepository.delete(assistant, session)

    @staticmethod
    async def list_admin_assistants(
        tenant_id: str,
        current_user: User,
        search: str | None,
        assistant_type: AssistantType | None,
        category_id: str | None,
        group_id: str | None,
        exclude_group_id: str | None,
        sort: str,
        page: int,
        size: int,
        session: AsyncSession,
    ) -> PagedAssistantResponse:
        """管理者向けアシスタント一覧をページネーションで取得する。

        テナント管理者でなく、`excludeGroupId`も指定されていない場合は、
        自身がグループ内管理者になっているグループに所属するアシスタントのみに絞り込む。

        Args:
            tenant_id: テナントID。
            current_user: 認証済みユーザー。
            search: 名前・説明の部分一致検索文字列。
            assistant_type: 種別での絞り込み。
            category_id: カテゴリでの絞り込み（`"NONE"`はカテゴリ未設定）。
            group_id: グループでの絞り込み（`"NONE"`は未所属）。
            exclude_group_id: 指定グループに所属していないものに絞り込む。
            sort: ソート指定（例: "updatedAt,desc"）。
            page: ページ番号（0始まり）。
            size: 1ページあたりの件数。
            session: 非同期DBセッション。

        Returns:
            ページネーション済みアシスタント一覧。
        """
        allowed_group_ids: list[str] | None = None
        is_tenant_admin = current_user.role in (UserRole.ADMIN, UserRole.SYSTEM)
        if not is_tenant_admin and not exclude_group_id:
            allowed_group_ids = await GroupUserRepository.find_admin_group_ids_for_user(
                tenant_id, current_user.id, session
            )

        sort_parts = sort.split(",")
        sort_col_name = _SORT_ALIASES.get(sort_parts[0], sort_parts[0])
        sort_dir = sort_parts[1] if len(sort_parts) > 1 else "asc"

        assistants, total = await AssistantRepository.find_page(
            tenant_id,
            search,
            assistant_type,
            category_id,
            group_id,
            exclude_group_id,
            allowed_group_ids,
            sort_col_name,
            sort_dir,
            page,
            size,
            session,
        )

        content = await AssistantService._build_responses(
            assistants, tenant_id, session
        )
        return PagedAssistantResponse(
            content=content, totalElements=total, number=page, size=size
        )

    @staticmethod
    def _required_endpoint_types(assistant_type: AssistantType) -> set[EndpointType]:
        # RAGが必要なEmbeddingエンドポイントはインデックス側で指定するため、
        # VDBエンドポイントを除いたチャット用エンドポイントのみを候補として返す。
        if assistant_type == AssistantType.SECURE:
            return {EndpointType.LOCAL_SERVER}
        return {t for t in EndpointType if AssistantService._is_chat_type(t)}

    @staticmethod
    async def get_assistant_endpoints(
        assistant_type: AssistantType, tenant_id: str, session: AsyncSession
    ) -> list[AssistantEndpointResponse]:
        """アシスタント種別に応じて選択可能なテナントエンドポイント一覧を取得する。

        Args:
            assistant_type: アシスタント種別。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            選択可能なテナントエンドポイント一覧。
        """
        required_types = AssistantService._required_endpoint_types(assistant_type)
        endpoints = await TenantEndpointRepository.find_by_tenant_id(tenant_id, session)
        return [
            AssistantEndpointResponse(
                id=e.id, endpoint=e.endpoint, endpointName=e.endpoint_name, type=e.type
            )
            for e in endpoints
            if e.type in required_types
        ]

    @staticmethod
    async def get_ai_models(session: AsyncSession) -> list[AIModelResponse]:
        """AIモデル一覧を取得する。

        Args:
            session: 非同期DBセッション。

        Returns:
            AIモデル一覧。
        """
        models = await AIModelRepository.find_all(session)
        return [
            AIModelResponse(
                id=m.id,
                endpointType=m.endpoint_type,
                name=m.name,
                maxTokens=m.max_tokens,
                active=m.active,
                tokenWeight=m.token_weight,
            )
            for m in models
        ]
