from datetime import datetime

import base64

from pydantic import (
    BaseModel,
    Field,
    field_serializer,
    field_validator,
    model_validator,
)

from app.models.message import MessageContentStatus, MessageRating
from app.schemas.attachment import AttachmentFile


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
    """メッセージ内容に紐づく添付ファイル1件のレスポンス。

    `data`はDBから取得した生のバイト列(`MessageFile.data`)をそのまま保持する
    （リクエスト側の`AttachmentFile`のような`Base64Bytes`型は使わない。
    `Base64Bytes`は代入時に値がBase64エンコード済みであることを前提に
    デコードするため、DBの生バイト列をそのまま渡すレスポンス構築には使えない）。
    JSON出力時のみ`@field_serializer`で明示的にBase64エンコードする
    （画像等の任意バイナリは、素の`bytes`のデフォルトJSONシリアライズ(UTF-8
    デコード)ではシリアライズ時に例外になりうるため。issue-97で判明）。
    """

    name: str
    type: str
    data: bytes

    @field_serializer("data", when_used="json")
    def _serialize_data(self, value: bytes) -> str:
        """バイナリデータをBase64エンコードしたJSON文字列として出力する。"""
        return base64.b64encode(value).decode("ascii")


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
    attachmentsCount: int = Field(default=0, ge=0)


class MessageContentCreateRequest(BaseModel):
    """メッセージ送信（アシスタント応答生成）のリクエスト。

    移植元(Spring Boot)の`CreateMessageContentRequest`に対応するが、本Issueのスコープでは
    response_format・メッセージ再生成（messageContentId指定）は対象外のため含めない
    （`docs/issue-93/01_要件定義.md`参照）。添付ファイル(`attachmentFiles`/
    `historyAttachmentFiles`)はissue-97で、`tools`（web_search/mcp）はissue-98で、
    ライブラリ生成（createLibrary）はissue-99で対応済み（`docs/issue-99/01_要件定義.md`参照）。
    """

    messageId: str = Field(min_length=1)
    userInput: str = Field(min_length=1)
    additionalPrompt: str | None = None
    historyMessages: list[MessageContentHistoryTurn] = []
    attachmentFiles: list[AttachmentFile] = []
    historyAttachmentFiles: list[AttachmentFile] = []
    tools: list[ToolConfig] | None = None
    # trueの場合、チャット回答の代わりにライブラリ（md形式のまとめ）を生成し、
    # タイトル・本文を専用のSSEイベント(library_title_delta/library_content_delta)で
    # ストリーミングする。
    isCreateLibrary: bool = False

    @model_validator(mode="after")
    def _validate_history_attachment_count(self) -> "MessageContentCreateRequest":
        """historyAttachmentFilesの件数がhistoryMessagesのattachmentsCount合計と一致することを検証する。

        移植元(Spring Boot)の`CreateMessageContentViewModel.isHistoryAttachmentCountCorrect`
        に対応する。過去ターンの添付ファイル内容自体はLLMに再送しない設計
        （`docs/issue-97/01_要件定義.md`参照）のため、ここでは件数の整合性のみを検証する。
        """
        expected = sum(turn.attachmentsCount for turn in self.historyMessages)
        if len(self.historyAttachmentFiles) != expected:
            raise ValueError(
                "historyAttachmentFilesの件数がhistoryMessagesのattachmentsCount合計と一致しません"
            )
        return self


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
