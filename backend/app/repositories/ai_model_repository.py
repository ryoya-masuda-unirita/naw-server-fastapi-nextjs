from collections.abc import Collection

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_model import AIModel, AIModelEndpointType


class AIModelRepository:
    """AIモデルのDBアクセスをまとめたリポジトリ。"""

    @staticmethod
    async def find_all(session: AsyncSession) -> list[AIModel]:
        """AIモデルを全件取得する。

        Parameters
        ----------
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        list[AIModel]
            AIモデル一覧。
        """
        stmt = select(AIModel)
        result = await session.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def find_by_name_and_endpoint_types(
        name: str,
        endpoint_types: Collection[AIModelEndpointType],
        session: AsyncSession,
    ) -> AIModel | None:
        """モデル名(デプロイ名)と、候補のエンドポイント種別でAIモデルを取得する。

        `ai_models.name`は一意制約がなく、同名のモデルが別のエンドポイント種別で
        登録されうるため、呼び出し元が扱える種別に絞り、idの昇順で先頭を返す
        （どの行が選ばれるかを決定的にするため）。

        Parameters
        ----------
        name : str
            モデル名(デプロイ名)。
        endpoint_types : Collection[AIModelEndpointType]
            対象とするエンドポイント種別。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        AIModel | None
            該当するAIモデル。存在しない場合はNone。
        """
        stmt = (
            select(AIModel)
            .where(AIModel.name == name, AIModel.endpoint_type.in_(endpoint_types))
            .order_by(AIModel.id)
            .limit(1)
        )
        result = await session.execute(stmt)
        return result.scalars().first()

    @staticmethod
    async def find_by_endpoint_type_and_name(
        endpoint_type: AIModelEndpointType, name: str, session: AsyncSession
    ) -> AIModel | None:
        """エンドポイントタイプとモデル名(デプロイ名)でAIモデルを取得する。

        Parameters
        ----------
        endpoint_type : AIModelEndpointType
            エンドポイントタイプ。
        name : str
            モデル名(デプロイ名)。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        AIModel | None
            該当するAIモデル。存在しない場合はNone。
        """
        stmt = select(AIModel).where(
            AIModel.endpoint_type == endpoint_type, AIModel.name == name
        )
        result = await session.execute(stmt)
        return result.scalars().first()
