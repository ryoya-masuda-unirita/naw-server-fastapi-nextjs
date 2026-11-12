from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any

from pydantic import AliasChoices, BaseModel, ConfigDict, Field
from starlette.datastructures import UploadFile

from app.core.jsonutil import encode_bytes
from app.models import MessageContent, MessageContentFile


class HistoryMessageContentType(StrEnum):
    SYSTEM = "SYSTEM"
    ASSISTANT = "ASSISTANT"
    USER = "USER"


class HistoryMessageContent(BaseModel):
    model_config = ConfigDict(extra="ignore")

    # 移植元（Jackson の record）は省略を null として受け付ける
    type: HistoryMessageContentType | None = None
    content: str | None = None
    attachmentsCount: int = 0


class ToolConfig(BaseModel):
    """移植元 ToolConfigDTO（JSON のキーは snake_case）。"""

    model_config = ConfigDict(extra="ignore")

    name: str | None = None
    server_label: str | None = None
    server_url: str | None = None
    require_approval: str | None = None


class CreateMessageContentRequest(BaseModel):
    """移植元 CreateMessageContentRequestDTO（multipart の `textData` パート）。"""

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    # 旧クライアント互換のため `wahaServiceId` でも受け付ける（移植元の @JsonAlias）
    assistantId: str | None = Field(
        default=None, validation_alias=AliasChoices("assistantId", "wahaServiceId")
    )
    messageId: str | None = None
    messageContentId: str | None = None
    additionalPrompt: str | None = None
    userInput: str | None = None
    historyMessages: list[HistoryMessageContent] | None = None
    accessToken: str | None = None
    tools: list[ToolConfig] | None = None
    createLibrary: bool | None = None
    tenantId: str | None = None


@dataclass(frozen=True)
class UploadedFile:
    """multipart で受け取ったファイルを読み込んだもの（MultipartFile 相当）。"""

    filename: str | None
    content_type: str | None
    data: bytes

    @classmethod
    async def from_upload(cls, upload: UploadFile) -> "UploadedFile":
        return cls(
            filename=upload.filename,
            content_type=upload.content_type,
            data=await upload.read(),
        )

    def is_empty(self) -> bool:
        return len(self.data) == 0


@dataclass(frozen=True)
class FileSummary:
    """中身を使わないファイル（履歴の添付）のログ用情報。

    移植元でも履歴の添付ファイルは Waha! に送らず使われないため、
    大きなファイルをメモリに読み込まないよう名前とサイズだけを持つ。
    """

    filename: str | None
    size: int


@dataclass(frozen=True)
class CreateMessageContentCommand:
    """移植元 CreateMessageContentViewModel。"""

    assistant_id: str | None
    message_id: str | None
    message_content_id: str | None
    additional_prompt: str | None
    user_input: str | None
    attachment_files: list[UploadedFile] = field(default_factory=list)
    history_messages: list[HistoryMessageContent] = field(default_factory=list)
    history_attachment_files: list[FileSummary] = field(default_factory=list)
    access_token: str | None = None
    tools: list[ToolConfig] = field(default_factory=list)
    create_library: bool = False
    tenant_id: str | None = None

    @classmethod
    def from_request(
        cls,
        request: CreateMessageContentRequest,
        attachment_files: list[UploadedFile],
        history_attachment_files: list[FileSummary],
    ) -> "CreateMessageContentCommand":
        return cls(
            assistant_id=request.assistantId,
            message_id=request.messageId,
            message_content_id=request.messageContentId,
            additional_prompt=request.additionalPrompt,
            user_input=request.userInput,
            attachment_files=attachment_files,
            history_messages=request.historyMessages or [],
            history_attachment_files=history_attachment_files,
            access_token=request.accessToken,
            tools=request.tools or [],
            create_library=bool(request.createLibrary),
            tenant_id=request.tenantId,
        )

    def question_text(self) -> str:
        """Waha! に送る質問文（追加プロンプトを先頭に連結する）。"""
        user_input = self.user_input or ""
        if self.additional_prompt:
            return self.additional_prompt + user_input
        return user_input


class GetMessageContentsRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    messageIds: list[str] | None = None


def _attachment_dict(file: MessageContentFile) -> dict[str, Any]:
    return {"name": file.name, "type": file.type, "data": encode_bytes(file.data)}


def create_message_content_response(
    content: MessageContent, attachment_files: list[MessageContentFile]
) -> dict[str, Any]:
    """移植元 CreateMessageContentResponseDTO（`isRated` は常に false）。"""
    return {
        "id": content.id,
        "messageId": content.message_id,
        "status": content.status,
        "question": content.question,
        "answer": content.answer,
        "context": content.context,
        "attachmentFiles": [_attachment_dict(f) for f in attachment_files],
        "referencePaths": content.reference_file_paths,
        "isRated": False,
    }


def get_message_contents_response(
    content: MessageContent, attachment_files: list[MessageContentFile]
) -> dict[str, Any]:
    """移植元 GetMessageContentsResponseDTO（`isRated` は含まない）。"""
    return {
        "id": content.id,
        "messageId": content.message_id,
        "status": content.status,
        "question": content.question,
        "answer": content.answer,
        "context": content.context,
        "attachmentFiles": [_attachment_dict(f) for f in attachment_files],
        "referencePaths": content.reference_file_paths,
    }


class Reference(BaseModel):
    model_config = ConfigDict(extra="ignore")

    role: str | None = None
    content: str | None = None


class RetrievalAnswer(BaseModel):
    """Waha! の outputfile（JSON）。"""

    model_config = ConfigDict(extra="ignore")

    answer: str | None = None
    filepaths: list[str] | None = None
    references: list[Reference] | None = None

    def context_text(self) -> str | None:
        if not self.references:
            return None
        return "\n".join(r.content or "" for r in self.references)
