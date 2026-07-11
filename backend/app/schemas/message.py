from datetime import datetime

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.message import MessageContentStatus, MessageRating
from app.schemas.response_format import ResponseFormatRequest


class ToolConfig(BaseModel):
    """チャット送信時に指定するツール設定（web_search / mcp）。

    `authorization` / `headers` は秘密情報のため、永続化・レスポンス出力しない（受信のみ）。
    """

    name: str
    server_label: str | None = None
    server_url: str | None = None
    require_approval: str | None = None
    authorization: str | None = Field(default=None, exclude=True)
    headers: dict[str, str] | None = Field(default=None, exclude=True)
    allowed_tools: list[str] | None = None

    @field_validator("name")
    @classmethod
    def _validate_name(cls, value: str) -> str:
        """ツール名がweb_search/mcpのいずれかであることを検証する。"""
        if value not in ("web_search", "mcp"):
            raise ValueError("未対応のツール名です")
        return value

    @field_validator("require_approval")
    @classmethod
    def _validate_require_approval(cls, value: str | None) -> str | None:
        """require_approvalがnever/alwaysのいずれかであることを検証する。"""
        if value is not None and value not in ("never", "always"):
            raise ValueError("require_approval は never または always です")
        return value

    @model_validator(mode="after")
    def _validate_mcp_fields(self) -> "ToolConfig":
        """mcpツールでserver_label/server_urlが必須であることを検証する。"""
        if self.name == "mcp" and (not self.server_label or not self.server_url):
            raise ValueError("mcp ツールでは server_label と server_url が必須です")
        return self


class MessageCreateRequest(BaseModel):
    roomId: str | None = None
    assistantId: str = Field(min_length=1)
    parentMessageId: str | None = None
    messageText: str | None = None
    tools: list[ToolConfig] | None = None
    promptTemplateContent: str | None = None
    isCreateLibrary: bool | None = None


class MessageCreateResponse(BaseModel):
    id: str


class EndpointResponse(BaseModel):
    type: str
    destination: str
    apiKey: str


class AssistantResponse(BaseModel):
    id: str
    type: str
    endpoints: list[EndpointResponse]


class MessageItemResponse(BaseModel):
    id: str
    roomId: str
    assistantId: str | None
    parentId: str | None
    isRated: bool
    tools: list[ToolConfig] | None
    promptTemplateContent: str | None
    isCreateLibrary: bool
    rating: MessageRating | None


class GetMessagesResponse(BaseModel):
    assistants: list[AssistantResponse]
    messages: list[MessageItemResponse]


class MessageContentListRequest(BaseModel):
    messageIds: list[str] = []


class MessageContentAttachmentFileResponse(BaseModel):
    name: str
    type: str
    data: bytes


class MessageContentResponse(BaseModel):
    id: str
    messageId: str
    status: MessageContentStatus
    question: str
    answer: str
    context: str | None
    attachmentFiles: list[MessageContentAttachmentFileResponse]
    referencePaths: list[str]
    isRated: bool


class MessageContentHistoryTurn(BaseModel):
    """メッセージ送信時にクライアントから渡す会話履歴の1発話。"""

    role: str = Field(min_length=1)
    content: str = Field(min_length=1)


class MessageContentCreateRequest(BaseModel):
    """メッセージ送信（アシスタント応答生成）のリクエスト。

    移植元(Spring Boot)の`CreateMessageContentRequest`に対応するが、本Issueのスコープでは
    RAG・添付ファイル・tools・ライブラリ生成（createLibrary）・
    メッセージ再生成（messageContentId指定）は対象外のため含めない
    （`docs/issue-93/01_要件定義.md`参照。response_formatはissue-100で対応済み）。
    """

    messageId: str = Field(min_length=1)
    userInput: str = Field(min_length=1)
    additionalPrompt: str | None = None
    historyMessages: list[MessageContentHistoryTurn] = []
    responseFormat: ResponseFormatRequest | None = None


class MessageFeedbackCreateRequest(BaseModel):
    rating: MessageRating


class MessageFeedbackResponse(BaseModel):
    id: str
    tenantId: str
    userId: str
    messageId: str
    rating: MessageRating
    indexId: str | None
    createdAt: datetime
    updatedAt: datetime
