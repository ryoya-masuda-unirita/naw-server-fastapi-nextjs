from pydantic import BaseModel, Field, field_validator

from app.schemas.attachment import AttachmentFile
from app.schemas.message import ToolConfig
from app.schemas.response_format import ResponseFormatRequest


class LlmChatTurn(BaseModel):
    """チャット会話履歴の1発話。"""

    role: str = Field(min_length=1)
    content: str = Field(min_length=1)


class LlmChatRequest(BaseModel):
    """LLMチャットAPIのリクエスト。

    移植元(Spring Boot)の`LlmChatTextDataRequest`に対応するが、添付ファイル
    (`attachmentFiles`)はissue-97で、`tools`（web_search/mcp）はissue-98で、
    ライブラリ生成（createLibrary）はissue-99で、response_formatはissue-100で
    対応済み（`docs/issue-100/01_要件定義.md`参照）。
    """

    deployName: str = Field(min_length=1)
    messageId: str | None = None
    additionalPrompt: str | None = None
    temperature: float = Field(default=0.0, ge=0.0, le=1.0)
    maxTokens: int | None = Field(default=None, gt=0)
    messages: list[LlmChatTurn] = Field(min_length=1)
    attachmentFiles: list[AttachmentFile] = []
    tools: list[ToolConfig] | None = None
    # trueの場合、チャット回答の代わりにライブラリ（md形式のまとめ）を生成し、
    # タイトル・本文を専用のSSEイベント(library_title_delta/library_content_delta)で
    # ストリーミングする。trueの場合はmessageIdの指定が必須(生成したライブラリの
    # 紐付け先が必要なため)。
    createLibrary: bool = False
    responseFormat: ResponseFormatRequest | None = None


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
