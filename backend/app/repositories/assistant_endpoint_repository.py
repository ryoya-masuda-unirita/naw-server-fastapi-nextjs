from sqlalchemy import case, delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_model import CHAT_AI_MODEL_ENDPOINT_TYPES
from app.models.assistant import AssistantEndpoint
from app.models.tenant_endpoint import EndpointType, TenantEndpoint
from app.schemas.assistant import AssistantEndpointInput, AssistantEndpointItemResponse


class AssistantEndpointRepository:
    """アシスタントとテナントエンドポイントの紐付け（`assistants_endpoints`）のDBアクセス。"""

    @staticmethod
    async def find_chat_endpoint(
        assistant_id: str, tenant_id: str, session: AsyncSession
    ) -> tuple[AssistantEndpoint, TenantEndpoint] | None:
        """アシスタントに紐づくチャット用エンドポイント（Azure OpenAI/Bedrock）を解決する。

        メッセージ送信(SSEストリーミング)は単一アシスタントに対して呼び出されるため、
        一覧取得用の`find_tenant_endpoints_grouped_by_assistant_id`とは異なり、
        デプロイ名(`AssistantEndpoint.model`)とAPIキーを含む`TenantEndpoint`を
        あわせて1件解決する。対象の種別は`CHAT_AI_MODEL_ENDPOINT_TYPES`で管理する。

        Parameters
        ----------
        assistant_id : str
            対象のアシスタントID。
        tenant_id : str
            テナントID。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        tuple[AssistantEndpoint, TenantEndpoint] | None
            (アシスタントとエンドポイントの紐付け, テナントエンドポイント) のタプル。
            紐づくチャット用エンドポイントが存在しない場合はNone。複数存在する
            場合はAzure OpenAIを優先し、同じ種別の中では`AssistantEndpoint.endpoint_id`が
            最小のものを採用する（`AssistantEndpoint`の主キーは`(assistant_id, endpoint_id)`
            の複合キーのため）。
        """
        # Bedrock対応(#249)前はAzure OpenAIのエンドポイントだけを解決していたため、
        # 両方を紐づけたアシスタントで送信先がUUIDの並びによって変わらないよう、
        # Azure OpenAIを優先して従来の送信先を保つ。
        azure_first = case(
            (TenantEndpoint.type == EndpointType.AZURE_OPENAI_CHAT, 0), else_=1
        )
        stmt = (
            select(AssistantEndpoint, TenantEndpoint)
            .join(TenantEndpoint, TenantEndpoint.id == AssistantEndpoint.endpoint_id)
            .where(
                AssistantEndpoint.assistant_id == assistant_id,
                AssistantEndpoint.tenant_id == tenant_id,
                TenantEndpoint.tenant_id == tenant_id,
                TenantEndpoint.type.in_(CHAT_AI_MODEL_ENDPOINT_TYPES.keys()),
            )
            .order_by(azure_first, AssistantEndpoint.endpoint_id)
        )
        result = await session.execute(stmt)
        row = result.first()
        return (row[0], row[1]) if row else None

    @staticmethod
    async def find_endpoints_grouped_by_assistant_id(
        assistant_ids: list[str],
        tenant_id: str,
        session: AsyncSession,
        include_label: bool = False,
    ) -> dict[str, list[AssistantEndpointItemResponse]]:
        """アシスタントID一覧に対して、それぞれの紐づくエンドポイント情報を1クエリでまとめて取得する。

        アシスタントごとに個別クエリを発行するとN+1になるため、対象アシスタントID一覧に対する
        (AssistantEndpoint, TenantEndpoint) の結合結果を1クエリで取得しPython側で集約する。

        Parameters
        ----------
        assistant_ids : list[str]
            対象のアシスタントID一覧。
        tenant_id : str
            テナントID。
        session : AsyncSession
            非同期DBセッション。
        include_label : bool
            True のとき `label` にテナントエンドポイント名を入れる（管理者向け一覧用）。

        Returns
        -------
        dict[str, list[AssistantEndpointItemResponse]]
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
                    label=tenant_endpoint.endpoint_name if include_label else None,
                    model=assistant_endpoint.model,
                    type=tenant_endpoint.type,
                    url=tenant_endpoint.endpoint,
                )
            )
        return grouped

    @staticmethod
    async def find_models_by_assistant_id(
        assistant_ids: list[str], tenant_id: str, session: AsyncSession
    ) -> dict[str, str]:
        """アシスタントごとの `model`（最初に紐づくエンドポイントの値）を1クエリで取得する。

        移植元 `GetMessagesResponse` は `assistant.getEndpoints().get(0).getModel()` を
        `model` として返す（SECURE のアシスタントではブラウザがこれを Waha! のサービスIDとして
        送る）。移植元は並び順を決めていないため、ここでは `endpoint_id` が最小の行を採用する。

        Parameters
        ----------
        assistant_ids : list[str]
            対象のアシスタントID一覧。
        tenant_id : str
            テナントID。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        dict[str, str]
            アシスタントID -> model。エンドポイントが紐づかないアシスタントは含まれない。
        """
        if not assistant_ids:
            return {}
        stmt = (
            select(AssistantEndpoint.assistant_id, AssistantEndpoint.model)
            .where(
                AssistantEndpoint.assistant_id.in_(assistant_ids),
                AssistantEndpoint.tenant_id == tenant_id,
            )
            .order_by(AssistantEndpoint.assistant_id, AssistantEndpoint.endpoint_id)
        )
        result = await session.execute(stmt)
        models: dict[str, str] = {}
        for assistant_id, model in result.all():
            models.setdefault(assistant_id, model)
        return models

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

        Parameters
        ----------
        assistant_id : str
            対象のアシスタントID。
        tenant_id : str
            テナントID。
        endpoints : list[AssistantEndpointInput]
            紐付け先のテナントエンドポイントIDとモデルの一覧（実在確認済みのものを渡すこと）。
        session : AsyncSession
            非同期DBセッション。
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
