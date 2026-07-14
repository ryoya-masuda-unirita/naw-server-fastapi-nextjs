from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_model import AIModel, AIModelEndpointType


class AIModelRepository:
    @staticmethod
    async def find_all(session: AsyncSession) -> list[AIModel]:
        """AIモデルを全件取得する。

        Args:
            session: 非同期DBセッション。

        Returns:
            AIモデル一覧。
        """
        stmt = select(AIModel)
        result = await session.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def find_by_name(name: str, session: AsyncSession) -> AIModel | None:
        """モデル名(デプロイ名)でAIモデルを取得する。エンドポイント種別は問わない。

        Args:
            name: モデル名(デプロイ名)。
            session: 非同期DBセッション。

        Returns:
            該当するAIモデル。存在しない場合はNone。
        """
        stmt = select(AIModel).where(AIModel.name == name)
        result = await session.execute(stmt)
        return result.scalars().first()

    @staticmethod
    async def find_by_endpoint_type_and_name(
        endpoint_type: AIModelEndpointType, name: str, session: AsyncSession
    ) -> AIModel | None:
        """エンドポイントタイプとモデル名(デプロイ名)でAIモデルを取得する。

        Args:
            endpoint_type: エンドポイントタイプ。
            name: モデル名(デプロイ名)。
            session: 非同期DBセッション。

        Returns:
            該当するAIモデル。存在しない場合はNone。
        """
        stmt = select(AIModel).where(
            AIModel.endpoint_type == endpoint_type, AIModel.name == name
        )
        result = await session.execute(stmt)
        return result.scalars().first()
