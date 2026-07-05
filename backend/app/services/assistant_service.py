from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.repositories.assistant_repository import AssistantRepository
from app.repositories.group_assistant_repository import GroupAssistantRepository
from app.repositories.group_user_repository import GroupUserRepository
from app.schemas.assistant import AssistantGetResponse


class AssistantService:

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
        group_ids = await GroupUserRepository.find_belonging_group_ids(tenant_id, current_user.id, session)
        assistant_ids = await GroupAssistantRepository.find_assistant_ids_by_group_ids(
            group_ids, tenant_id, session
        )
        assistants = await AssistantRepository.find_by_ids_and_tenant_id(assistant_ids, tenant_id, session)

        groups_by_assistant_id = await GroupAssistantRepository.find_group_ids_grouped_by_assistant_id(
            [a.id for a in assistants], tenant_id, session
        )

        return [
            AssistantGetResponse(
                id=a.id,
                tenantId=a.tenant_id,
                type=a.type,
                endpoints=[],
                name=a.name,
                indexId=a.index_id,
                groups=groups_by_assistant_id.get(a.id, []),
                category=None,
                categories=[],
                description=a.description,
                includeHistory=a.include_history,
                iconColor=a.icon_color,
            )
            for a in assistants
        ]
