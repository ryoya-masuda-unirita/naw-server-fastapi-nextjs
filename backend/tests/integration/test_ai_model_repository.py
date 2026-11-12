import pytest

from app.models.ai_model import AIModel, AIModelEndpointType
from app.repositories.ai_model_repository import AIModelRepository

_CHAT_TYPES = (AIModelEndpointType.AZURE_OPENAI_CHAT, AIModelEndpointType.BEDROCK_CHAT)


async def _add_model(session, name: str, endpoint_type: AIModelEndpointType) -> AIModel:
    model = AIModel(endpoint_type=endpoint_type, name=name, max_tokens=8192)
    session.add(model)
    await session.flush()
    return model


@pytest.mark.asyncio
class TestFindByNameAndEndpointTypes:
    async def test_finds_model_of_target_endpoint_type(self, session):
        """指定した種別のいずれかで登録されたモデルを名前で検索できること"""
        await _add_model(
            session, "anthropic.claude-haiku-4-5", AIModelEndpointType.BEDROCK_CHAT
        )

        found = await AIModelRepository.find_by_name_and_endpoint_types(
            "anthropic.claude-haiku-4-5", _CHAT_TYPES, session
        )

        assert found is not None
        assert found.endpoint_type == AIModelEndpointType.BEDROCK_CHAT

    async def test_ignores_model_of_other_endpoint_type(self, session):
        """同名でも指定外の種別で登録されたモデルは返さないこと"""
        await _add_model(session, "gpt-4o", AIModelEndpointType.OPENAI_CHAT)
        target = await _add_model(
            session, "gpt-4o", AIModelEndpointType.AZURE_OPENAI_CHAT
        )

        found = await AIModelRepository.find_by_name_and_endpoint_types(
            "gpt-4o", _CHAT_TYPES, session
        )

        assert found is not None
        assert found.id == target.id

    async def test_returns_smallest_id_when_duplicated(self, session):
        """指定種別内で同名のモデルが複数ある場合はidが最小のものを返すこと"""
        first = await _add_model(session, "dup-model", AIModelEndpointType.BEDROCK_CHAT)
        await _add_model(session, "dup-model", AIModelEndpointType.AZURE_OPENAI_CHAT)

        found = await AIModelRepository.find_by_name_and_endpoint_types(
            "dup-model", _CHAT_TYPES, session
        )

        assert found is not None
        assert found.id == first.id

    async def test_returns_none_for_nonexistent_name(self, session):
        """存在しないモデル名の場合はNoneを返すこと"""
        found = await AIModelRepository.find_by_name_and_endpoint_types(
            "nonexistent-model", _CHAT_TYPES, session
        )

        assert found is None
