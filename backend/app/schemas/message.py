from datetime import datetime

import base64
from typing import Annotated

from fastapi import File, Form, UploadFile
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_serializer,
    field_validator,
    model_validator,
)

from app.models.message import MessageContentStatus, MessageRating
from app.schemas.attachment import AttachmentFile
from app.schemas.multipart_form import parse_text_data_form
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


# 移植元`CreateMessageContentRequest.HistoryMessageContentType`(SYSTEM/ASSISTANT/USER)を
# LLM呼び出しの`ChatMessage.role`として使う小文字表記にしたもの。
_HISTORY_MESSAGE_ROLES = frozenset({"system", "assistant", "user"})


class MessageContentHistoryTurn(BaseModel):
    """メッセージ送信時にクライアントから渡す会話履歴の1発話。

    移植元`CreateMessageContentRequest.HistoryMessageContent`に対応し、発話種別は
    移植元と同じ`type`（`SYSTEM`/`ASSISTANT`/`USER`）で受け取る。サービス層では
    LLMへそのまま渡せるよう小文字に正規化した`role`として扱う。
    """

    # サービス層・テストは属性名`role`で生成するため、別名(`type`)に加えて属性名での
    # 生成も許可する。
    model_config = ConfigDict(populate_by_name=True)

    role: str = Field(validation_alias="type")
    content: str = Field(min_length=1)
    attachmentsCount: int = Field(default=0, ge=0)

    @field_validator("role")
    @classmethod
    def _normalize_role(cls, value: str) -> str:
        """発話種別を小文字へ正規化し、移植元の列挙値以外を拒否する。"""
        normalized = value.lower()
        if normalized not in _HISTORY_MESSAGE_ROLES:
            raise ValueError(
                "type は SYSTEM・ASSISTANT・USER のいずれかを指定してください"
            )
        return normalized


class MessageContentCreateRequest(BaseModel):
    """メッセージ送信（アシスタント応答生成）のリクエスト。

    移植元(Spring Boot)の`CreateMessageContentRequest`に対応する。`messageId`
    （新規生成・質問再生成用）と`messageContentId`（回答再生成用）はどちらか
    一方が必須で、`messageContentId`指定時は既存の`MessageContent`を上書き
    再生成する（issue-101）。添付ファイル(`attachmentFiles`/`historyAttachmentFiles`)は
    issue-97で、`tools`（web_search/mcp）はissue-98で、ライブラリ生成（createLibrary）は
    issue-99で、response_formatはissue-100で対応済み（`docs/issue-100/01_要件定義.md`
    参照）。

    API上は移植元と同じく`multipart/form-data`で受け取り、`textData`パート(JSON)と
    添付ファイルパートを`parse_message_content_create_form`で本モデルへ変換する
    （issue-182）。`textData`のフィールド名は移植元の`@JsonProperty`名
    （`createLibrary`・`response_format`）で受け取り、サービス層では既存の属性名で扱う。
    """

    # サービス層・テストは属性名(`isCreateLibrary`等)で生成するため、別名に加えて
    # 属性名での生成も許可する。
    model_config = ConfigDict(populate_by_name=True)

    messageId: str | None = Field(default=None, min_length=1)
    messageContentId: str | None = Field(default=None, min_length=1)
    # 移植元は`@NotNull`だけで空文字を許す（クライアントは本文が空でも添付ファイルが
    # あれば送信できる）。項目の必須だけを残し、長さは制約しない（issue-245）。
    userInput: str
    additionalPrompt: str | None = None
    historyMessages: list[MessageContentHistoryTurn] = []
    attachmentFiles: list[AttachmentFile] = []
    # 移植元`MessageController`も受け取るパートのため受け付けるが、移植元同様LLMには
    # 送らない。移植元`CreateMessageContentViewModel.isHistoryAttachmentCountCorrect`
    # （件数が`attachmentsCount`合計と一致すること）は`javax.validation`の`@AssertTrue`で、
    # 実行時のバリデータ（jakarta）が評価しないため移植しない。移植元のクライアントは
    # `attachmentsCount`を送るが本パートは送らないため、件数を検証すると添付のある
    # ルームで続けて送れなくなる（issue-245）。
    historyAttachmentFiles: list[AttachmentFile] = []
    tools: list[ToolConfig] | None = None
    # trueの場合、チャット回答の代わりにライブラリ（md形式のまとめ）を生成し、
    # タイトル・本文を専用のSSEイベント(library_title_delta/library_content_delta)で
    # ストリーミングする。
    isCreateLibrary: bool = Field(default=False, validation_alias="createLibrary")
    responseFormat: ResponseFormatRequest | None = Field(
        default=None, validation_alias="response_format"
    )

    @model_validator(mode="after")
    def _validate_target_specified(self) -> "MessageContentCreateRequest":
        if self.messageId is None and self.messageContentId is None:
            raise ValueError(
                "messageId または messageContentId のいずれかを指定してください"
            )
        return self


async def parse_message_content_create_form(
    textData: Annotated[UploadFile | str, Form()],
    attachmentFiles: Annotated[list[UploadFile] | None, File()] = None,
    historyAttachmentFiles: Annotated[list[UploadFile] | None, File()] = None,
) -> MessageContentCreateRequest:
    """メッセージ送信APIのmultipart/form-dataを`MessageContentCreateRequest`へ変換する。

    移植元`MessageController.createMessageContent`は`@RequestPart("textData")`で
    リクエスト本体(JSON)を、`attachmentFiles`・`historyAttachmentFiles`で添付
    ファイルを受け取る。

    Args:
        textData: リクエスト本体(JSON)。
        attachmentFiles: 今回の質問に添付するファイル。
        historyAttachmentFiles: 過去の会話に添付されていたファイル。

    Returns:
        検証済みのメッセージ送信リクエスト。

    Raises:
        RequestValidationError: `textData`がUTF-8のJSONオブジェクトとして解釈できない
            場合、または項目の検証に失敗した場合（いずれも400）。
    """
    return await parse_text_data_form(
        MessageContentCreateRequest,
        textData,
        {
            "attachmentFiles": attachmentFiles,
            "historyAttachmentFiles": historyAttachmentFiles,
        },
    )


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
