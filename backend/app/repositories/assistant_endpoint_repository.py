from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.assistant import AssistantEndpoint
from app.models.tenant_endpoint import TenantEndpoint
from app.schemas.assistant import AssistantEndpointItemResponse


class AssistantEndpointRepository:
    @staticmethod
    async def find_endpoints_grouped_by_assistant_id(
        assistant_ids: list[str], tenant_id: str, session: AsyncSession
    ) -> dict[str, list[AssistantEndpointItemResponse]]:
        """アシスタントID一覧に対して、それぞれの紐づくエンドポイント情報を1クエリでまとめて取得する。

        アシスタントごとに個別クエリを発行するとN+1になるため、対象アシスタントID一覧に対する
        (AssistantEndpoint, TenantEndpoint) の結合結果を1クエリで取得しPython側で集約する。

        Args:
            assistant_ids: 対象のアシスタントID一覧。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            アシスタントIDをキーとしたエンドポイント情報一覧の辞書。
        """
        if not assistant_ids:
            return {}
        stmt = (
            select(AssistantEndpoint, TenantEndpoint)
            .join(TenantEndpoint, TenantEndpoint.id == AssistantEndpoint.endpoint_id)
            .where(
                AssistantEndpoint.assistant_id.in_(assistant_ids),
                AssistantEndpoint.tenant_id == tenant_id,
                TenantEndpoint.tenant_id == tenant_id,
            )
        )
        result = await session.execute(stmt)

        grouped: dict[str, list[AssistantEndpointItemResponse]] = {
            assistant_id: [] for assistant_id in assistant_ids
        }
        for assistant_endpoint, tenant_endpoint in result.all():
            grouped[assistant_endpoint.assistant_id].append(
                AssistantEndpointItemResponse(
                    id=tenant_endpoint.id,
                    model=assistant_endpoint.model,
                    type=tenant_endpoint.type,
                    url=tenant_endpoint.endpoint,
                )
            )
        return grouped
