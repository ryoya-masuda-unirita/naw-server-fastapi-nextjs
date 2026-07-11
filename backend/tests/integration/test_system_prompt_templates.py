from app.models.system_prompt_template import SystemPromptTemplate
from app.repositories.system_prompt_template_repository import (
    SystemPromptTemplateRepository,
)


class TestFindByType:
    """SystemPromptTemplateRepository.find_by_type のテスト"""

    async def test_returns_template_when_found(self, session):
        """存在するtypeで固定システムプロンプトを取得できること"""
        session.add(
            SystemPromptTemplate(type="LIBRARY", content="ライブラリ生成用プロンプト")
        )
        await session.commit()

        result = await SystemPromptTemplateRepository.find_by_type("LIBRARY", session)

        assert result is not None
        assert result.type == "LIBRARY"
        assert result.content == "ライブラリ生成用プロンプト"

    async def test_returns_none_when_not_found(self, session):
        """存在しないtypeではNoneを返すこと"""
        result = await SystemPromptTemplateRepository.find_by_type(
            "NONEXISTENT", session
        )

        assert result is None
