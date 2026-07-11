from pydantic import BaseModel, Field, field_validator

from app.schemas.message import ToolConfig


class LlmChatTurn(BaseModel):
    """チャット会話履歴の1発話。"""

    role: str = Field(min_length=1)
    content: str = Field(min_length=1)


class LlmChatRequest(BaseModel):
    """LLMチャットAPIのリクエスト。

    移植元(Spring Boot)の`LlmChatTextDataRequest`に対応するが、本Issueのスコープでは
    添付ファイル・ライブラリ生成（createLibrary）・response_formatは対象外のため
    含めない。`tools`（web_search/mcp）はissue-98で対応した
    （`docs/issue-98/01_要件定義.md`参照）。
    """

    deployName: str = Field(min_length=1)
    messageId: str | None = None
    additionalPrompt: str | None = None
    temperature: float = Field(default=0.0, ge=0.0, le=1.0)
    maxTokens: int | None = Field(default=None, gt=0)
    messages: list[LlmChatTurn] = Field(min_length=1)
    tools: list[ToolConfig] | None = None


class LlmEmbeddingRequest(BaseModel):
    """LLM埋め込みAPIのリクエスト。"""

    deployName: str = Field(min_length=1)
    input: str = Field(min_length=1)
    dimensions: int | None = Field(default=None, ge=1, le=32767)

    @field_validator("input")
    @classmethod
    def _validate_input_not_blank(cls, value: str) -> str:
        """inputが空白のみでないことを検証する。"""
        if not value.strip():
            raise ValueError("inputは必須です")
        return value


class LlmEmbeddingResponse(BaseModel):
    """LLM埋め込みAPIのレスポンス。"""

    embedding: list[float]
