from typing import Annotated

from fastapi import File, Form, UploadFile
from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator

from app.core.validation_messages import RequestModel, ValidationMessages
from app.schemas.attachment import AttachmentFile
from app.schemas.message import ToolConfig
from app.schemas.multipart_form import parse_text_data_form
from app.schemas.response_format import ResponseFormatRequest


_DEPLOY_NAME_REQUIRED_MESSAGE = "deployName は必須です"
_INPUT_REQUIRED_MESSAGE = "input は必須です"


class LlmChatTurn(RequestModel):
    """チャット会話履歴の1発話。

    移植元(Spring Boot)の`LlmChatTurnRequest`に対応する。
    """

    role: Annotated[
        str, Field(min_length=1), ValidationMessages(not_blank="role は必須です")
    ]
    # 移植元は`@NotNull`のため、欠落・nullだけを移植元の文言にする。空文字の拒否
    # （`min_length=1`）はbackend独自の制約のため文言を置き換えない。
    content: Annotated[
        str, Field(min_length=1), ValidationMessages(not_null="content は必須です")
    ]
    # この発話に添付するファイルのファイル名。multipartの`attachmentFiles`パートの
    # ファイル名と突き合わせる。移植元`@JsonAlias("attatchments")`に合わせ、綴り違いの
    # 項目名でも受け付ける。
    attachments: list[str] = Field(
        default_factory=list,
        validation_alias=AliasChoices("attachments", "attatchments"),
    )

    @field_validator("attachments", mode="before")
    @classmethod
    def _treat_null_attachments_as_empty(cls, value: object) -> object:
        """`attachments: null`を添付なしとして扱う（移植元は`null`を添付なしとみなすため）。"""
        return [] if value is None else value


class LlmChatRequest(RequestModel):
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

    deployName: Annotated[
        str,
        Field(min_length=1),
        ValidationMessages(not_blank=_DEPLOY_NAME_REQUIRED_MESSAGE),
    ]
    messageId: str | None = None
    additionalPrompt: str | None = None
    temperature: Annotated[
        float,
        Field(ge=0.0, le=1.0),
        ValidationMessages(
            min_value="temperature は 0.0 以上である必要があります",
            max_value="temperature は 1.0 以下である必要があります",
        ),
    ] = 0.0
    maxTokens: int | None = Field(default=None, gt=0)
    # 移植元は`@NotNull @NotEmpty(message=...)`で、nullのときはどちらの違反が先に
    # なるか決まらない。指定のある`@NotEmpty`の文言を返す。
    messages: Annotated[
        list[LlmChatTurn],
        Field(min_length=1),
        ValidationMessages(not_empty="messages は1件以上必要です"),
    ]
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
            場合、または項目の検証に失敗した場合（いずれも400）。
    """
    return await parse_text_data_form(
        LlmChatRequest, textData, {"attachmentFiles": attachmentFiles}
    )


class LlmEmbeddingRequest(RequestModel):
    """LLM埋め込みAPIのリクエスト。"""

    deployName: Annotated[
        str,
        Field(min_length=1),
        ValidationMessages(not_blank=_DEPLOY_NAME_REQUIRED_MESSAGE),
    ]
    input: Annotated[
        str,
        Field(min_length=1),
        ValidationMessages(not_blank=_INPUT_REQUIRED_MESSAGE),
    ]
    dimensions: Annotated[
        int | None,
        Field(ge=1, le=32767),
        ValidationMessages(
            min_value="dimensions は 1 以上である必要があります",
            max_value="dimensions は 32767 以下である必要があります",
        ),
    ] = None

    @field_validator("input")
    @classmethod
    def _validate_input_not_blank(cls, value: str) -> str:
        """inputが空白のみでないことを検証する。"""
        if not value.strip():
            raise ValueError(_INPUT_REQUIRED_MESSAGE)
        return value


class LlmEmbeddingResponse(BaseModel):
    """LLM埋め込みAPIのレスポンス。"""

    embedding: list[float]
