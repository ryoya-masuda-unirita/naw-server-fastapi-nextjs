from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.assistant import AssistantEndpoint
from app.models.tenant_endpoint import EndpointType, TenantEndpoint
from app.schemas.assistant import AssistantEndpointInput, AssistantEndpointItemResponse


class AssistantEndpointRepository:
    @staticmethod
    async def find_chat_endpoint(
        assistant_id: str, tenant_id: str, session: AsyncSession
    ) -> tuple[AssistantEndpoint, TenantEndpoint] | None:
        """アシスタントに紐づくAzure OpenAI Chatエンドポイントを解決する。

        メッセージ送信(SSEストリーミング)は単一アシスタントに対して呼び出されるため、
        一覧取得用の`find_tenant_endpoints_grouped_by_assistant_id`とは異なり、
        デプロイ名(`AssistantEndpoint.model`)とAPIキーを含む`TenantEndpoint`を
        あわせて1件解決する。

        Args:
            assistant_id: 対象のアシスタントID。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            (アシスタントとエンドポイントの紐付け, テナントエンドポイント) のタプル。
            紐づくAzure OpenAI Chatエンドポイントが存在しない場合はNone。複数存在する
            場合は`AssistantEndpoint.endpoint_id`が最小のものを採用する
            （`AssistantEndpoint`の主キーは`(assistant_id, endpoint_id)`の複合キーのため）。
        """
        stmt = (
            select(AssistantEndpoint, TenantEndpoint)
            .join(TenantEndpoint, TenantEndpoint.id == AssistantEndpoint.endpoint_id)
            .where(
                AssistantEndpoint.assistant_id == assistant_id,
                AssistantEndpoint.tenant_id == tenant_id,
                TenantEndpoint.tenant_id == tenant_id,
                TenantEndpoint.type == EndpointType.AZURE_OPENAI_CHAT,
            )
            .order_by(AssistantEndpoint.endpoint_id)
        )
        result = await session.execute(stmt)
        row = result.first()
        return (row[0], row[1]) if row else None

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
    async def find_tenant_endpoints_grouped_by_assistant_id(
        assistant_ids: list[str], tenant_id: str, session: AsyncSession
    ) -> dict[str, list[TenantEndpoint]]:
        """アシスタントID一覧に対して、それぞれの紐づくテナントエンドポイント実体を1クエリでまとめて取得する。

        `find_endpoints_grouped_by_assistant_id`と異なり`api_key`を含む`TenantEndpoint`を
        そのまま返す。呼び出し側でアシスタント種別に応じてAPIキーの露出可否を判断する用途向け。
        """
        if not assistant_ids:
            return {}
        stmt = (
            select(AssistantEndpoint.assistant_id, TenantEndpoint)
            .join(TenantEndpoint, TenantEndpoint.id == AssistantEndpoint.endpoint_id)
            .where(
                AssistantEndpoint.assistant_id.in_(assistant_ids),
                AssistantEndpoint.tenant_id == tenant_id,
                TenantEndpoint.tenant_id == tenant_id,
            )
        )
        result = await session.execute(stmt)

        grouped: dict[str, list[TenantEndpoint]] = {
            assistant_id: [] for assistant_id in assistant_ids
        }
        for assistant_id, tenant_endpoint in result.all():
            grouped[assistant_id].append(tenant_endpoint)
        return grouped

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
