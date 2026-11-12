from typing import Annotated

from fastapi import File, Form, UploadFile
from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator

from app.schemas.attachment import AttachmentFile
from app.schemas.message import ToolConfig
from app.schemas.multipart_form import parse_text_data_form
from app.schemas.response_format import ResponseFormatRequest


class LlmChatTurn(BaseModel):
    """チャット会話履歴の1発話。

    移植元(Spring Boot)の`LlmChatTurnRequest`に対応する。
    """

    role: str = Field(min_length=1)
    content: str = Field(min_length=1)
    # この発話に添付するファイルのファイル名。multipartの`attachmentFiles`パートの
    # ファイル名と突き合わせる。移植元`@JsonAlias("attatchments")`に合わせ、綴り違いの
    # 項目名でも受け付ける。
    attachments: list[str] = Field(
        default_factory=list,
        validation_alias=AliasChoices("attachments", "attatchments"),
    )


class LlmChatRequest(BaseModel):
    """LLMチャットAPIのリクエスト。

    移植元(Spring Boot)の`LlmChatTextDataRequest`（`textData`パート）と
    `attachmentFiles`パートに対応する。API上は移植元と同じく`multipart/form-data`で
    受け取り、`parse_llm_chat_form`で本モデルへ変換する（issue-224）。
    `textData`のフィールド名は移植元の`@JsonProperty`名（`response_format`）で受け取り、
    サービス層では既存の属性名で扱う。

    移植元の`reasoning_effort`・`verbosity`は、本ポートのLLMクライアントが推論設定に
    未対応のため項目として定義せず、受け取っても無視する（`docs/issue-224/01_要件定義.md`
    参照）。
    """

    # サービス層・テストは属性名(`responseFormat`)で生成するため、別名に加えて
    # 属性名での生成も許可する。
    model_config = ConfigDict(populate_by_name=True)

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
    responseFormat: ResponseFormatRequest | None = Field(
        default=None, validation_alias="response_format"
    )

    @field_validator("attachmentFiles")
    @classmethod
    def _validate_unique_file_names(
        cls, value: list[AttachmentFile]
    ) -> list[AttachmentFile]:
        """添付ファイルのファイル名が重複していないことを検証する。

        発話の`attachments`はファイル名でファイルを指すため、同名のファイルがあると
        どれを指すか決まらない。移植元`@UniqueFileNames`に対応する。
        """
        names = [file.name for file in value]
        if len(set(names)) != len(names):
            raise ValueError("添付ファイルのリストに同名のファイルが含まれています")
        return value


async def parse_llm_chat_form(
    textData: Annotated[UploadFile | str, Form()],
    attachmentFiles: Annotated[list[UploadFile] | None, File()] = None,
) -> LlmChatRequest:
    """LLMチャットAPIのmultipart/form-dataを`LlmChatRequest`へ変換する。

    移植元`LlmController.chat`は`@RequestPart("textData")`でリクエスト本体(JSON)を、
    `attachmentFiles`で添付ファイルを受け取る。

    Args:
        textData: リクエスト本体(JSON)。
        attachmentFiles: 会話履歴の発話に添付するファイル。

    Returns:
        検証済みのLLMチャットリクエスト。

    Raises:
        RequestValidationError: `textData`がUTF-8のJSONオブジェクトとして解釈できない
            場合、または項目の検証に失敗した場合（いずれも422）。
    """
    return await parse_text_data_form(
        LlmChatRequest, textData, {"attachmentFiles": attachmentFiles}
    )


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
