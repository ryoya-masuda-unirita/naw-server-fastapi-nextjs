import pytest

from app.models.ai_model import AIModel, AIModelEndpointType
from app.repositories.ai_model_repository import AIModelRepository


@pytest.mark.asyncio
class TestFindByName:
    async def test_finds_model_regardless_of_endpoint_type(self, session):
        """エンドポイント種別を問わずモデル名だけで検索できること"""
        model = AIModel(
            endpoint_type=AIModelEndpointType.BEDROCK_CHAT,
            name="anthropic.claude-sonnet-5",
            max_tokens=8192,
        )
        session.add(model)
        await session.flush()

        found = await AIModelRepository.find_by_name(
            "anthropic.claude-sonnet-5", session
        )

        assert found is not None
        assert found.endpoint_type == AIModelEndpointType.BEDROCK_CHAT

    async def test_returns_none_for_nonexistent_name(self, session):
        """存在しないモデル名の場合はNoneを返すこと"""
        found = await AIModelRepository.find_by_name("nonexistent-model", session)

        assert found is None
