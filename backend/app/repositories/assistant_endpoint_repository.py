from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.assistant import AssistantEndpoint
from app.models.tenant_endpoint import TenantEndpoint
from app.schemas.assistant import AssistantEndpointInput, AssistantEndpointItemResponse


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

    @staticmethod
    async def find_by_assistant_id_and_tenant_id(
        assistant_id: str, tenant_id: str, session: AsyncSession
    ) -> list[AssistantEndpoint]:
        """アシスタントIDとテナントIDに紐づくエンドポイント紐付け一覧を取得する。

        Args:
            assistant_id: 対象のアシスタントID。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            エンドポイント紐付け一覧。
        """
        stmt = select(AssistantEndpoint).where(
            AssistantEndpoint.assistant_id == assistant_id,
            AssistantEndpoint.tenant_id == tenant_id,
        )
        result = await session.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def replace_endpoints_for_assistant(
        assistant_id: str,
        tenant_id: str,
        endpoints: list[AssistantEndpointInput],
        session: AsyncSession,
    ) -> None:
        """対象アシスタントの既存エンドポイント紐付けを全削除し、指定内容で置き換える。

        コミットは呼び出し側で行う。

        Args:
            assistant_id: 対象のアシスタントID。
            tenant_id: テナントID。
            endpoints: 紐付け先のテナントエンドポイントIDとモデルの一覧（実在確認済みのものを渡すこと）。
            session: 非同期DBセッション。
        """
        await session.execute(
            delete(AssistantEndpoint).where(
                AssistantEndpoint.assistant_id == assistant_id,
                AssistantEndpoint.tenant_id == tenant_id,
            )
        )

        for endpoint in endpoints:
            session.add(
                AssistantEndpoint(
                    assistant_id=assistant_id,
                    endpoint_id=endpoint.id,
                    tenant_id=tenant_id,
                    model=endpoint.model,
                )
            )
