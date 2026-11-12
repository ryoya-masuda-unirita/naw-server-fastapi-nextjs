import logging
from typing import Any

from fastapi import APIRouter, Request, Response, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import ValidationError
from starlette.datastructures import FormData, UploadFile

from app.core.config import MAX_FILE_SIZE_BYTES, MAX_REQUEST_SIZE_BYTES
from app.core.deps import SessionDep, StreamServiceDep, WahaDep
from app.core.errors import PayloadTooLargeError
from app.core.jsonutil import to_compact_json
from app.schemas.message import (
    CreateMessageContentCommand,
    CreateMessageContentRequest,
    FileSummary,
    GetMessageContentsRequest,
    UploadedFile,
)
from app.services import message_content_service
from app.services.message_content_stream_service import StreamMode

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/messages", tags=["messages"])

TEXT_DATA_PART = "textData"
ATTACHMENT_FILES_PART = "attachmentFiles"
HISTORY_ATTACHMENT_FILES_PART = "historyAttachmentFiles"
MULTIPART_FORM_DATA = "multipart/form-data"
EVENT_STREAM = "text/event-stream"
MESSAGE_CONTENT_ID_HEADER = "X-Message-Content-Id"
MESSAGE_ID_HEADER = "X-Message-Id"
# 中継プロキシ（nginx 等）でバッファされると SSE が逐次届かないため無効化を指示する
SSE_HEADERS = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}


def _bad_request(detail: str) -> RequestValidationError:
    return RequestValidationError([{"type": "value_error", "msg": detail, "loc": ()}])


def _uploads(form: FormData, name: str) -> list[UploadFile]:
    uploads = [v for v in form.getlist(name) if isinstance(v, UploadFile)]
    for upload in uploads:
        if upload.size is not None and upload.size > MAX_FILE_SIZE_BYTES:
            raise PayloadTooLargeError(name)
    return uploads


async def _read_files(form: FormData, name: str) -> list[UploadedFile]:
    return [await UploadedFile.from_upload(u) for u in _uploads(form, name)]


def _summarize_files(form: FormData, name: str) -> list[FileSummary]:
    return [FileSummary(u.filename, u.size or 0) for u in _uploads(form, name)]


async def _parse_message_request(
    request: Request,
) -> tuple[CreateMessageContentCommand, CreateMessageContentRequest]:
    """移植元の @RequestPart（textData は JSON パート）を読み取る。

    ブラウザは textData を `application/json` の Blob として送るが、テストツール等で
    通常のフォーム文字列として送られても読めるよう、どちらも受け付ける。
    """
    content_type = request.headers.get("content-type", "")
    if not content_type.startswith(MULTIPART_FORM_DATA):
        raise _bad_request("multipart/form-data が必要です")
    form = await request.form(max_part_size=MAX_REQUEST_SIZE_BYTES)
    # 自前で解析したフォームは FastAPI が閉じないため、一時ファイルを明示的に閉じる
    try:
        raw = form.get(TEXT_DATA_PART)
        if raw is None:
            raise _bad_request("textData がありません")
        text = (
            (await raw.read()).decode("utf-8") if isinstance(raw, UploadFile) else raw
        )
        try:
            dto = CreateMessageContentRequest.model_validate_json(text)
        except ValidationError as e:
            raise _bad_request(f"textData が不正です: {e}") from e
        attachment_files = await _read_files(form, ATTACHMENT_FILES_PART)
        history_files = _summarize_files(form, HISTORY_ATTACHMENT_FILES_PART)
    finally:
        await form.close()
    command = CreateMessageContentCommand.from_request(
        dto, attachment_files, history_files
    )
    return command, dto


def _log_received_request(
    endpoint: str,
    dto: CreateMessageContentRequest,
    command: CreateMessageContentCommand,
) -> None:
    def describe(files: list[UploadedFile] | list[FileSummary]) -> str:
        items = [
            f"{f.filename}({len(f.data) if isinstance(f, UploadedFile) else f.size}"
            "bytes)"
            for f in files
        ]
        return "[" + ", ".join(items) + "]"

    logger.info(
        "Received message content request: endpoint=%s, textData=%s, "
        "attachmentFiles=%s, historyAttachmentFiles=%s",
        endpoint,
        to_compact_json(dto.model_dump(mode="json", exclude={"accessToken"})),
        describe(command.attachment_files),
        describe(command.history_attachment_files),
    )


@router.post("/content")
async def create_message_content(
    request: Request, session: SessionDep, stream_service: StreamServiceDep
) -> StreamingResponse:
    """NAW 互換 SSE で回答を返す。"""
    command, dto = await _parse_message_request(request)
    _log_received_request("POST /api/messages/content", dto, command)
    stream_session = await stream_service.prepare_stream(session, command)
    runtime = stream_service.start_streaming(
        command, stream_session, StreamMode.NAW_COMPATIBLE
    )
    return StreamingResponse(
        stream_service.sse_events(runtime), media_type=EVENT_STREAM, headers=SSE_HEADERS
    )


@router.post("/content/sync", deprecated=True)
async def create_message_content_sync(
    request: Request, session: SessionDep, waha: WahaDep
) -> dict[str, Any]:
    """旧形式。Waha! の完了を待って JSON で返す（移植元で非推奨）。"""
    command, dto = await _parse_message_request(request)
    _log_received_request("POST /api/messages/content/sync", dto, command)
    return await message_content_service.post_message_content(session, waha, command)


@router.post("/content/stream", deprecated=True)
async def create_message_content_stream_legacy(
    request: Request, session: SessionDep, stream_service: StreamServiceDep
) -> StreamingResponse:
    """旧形式。ストリームファイルの内容をそのまま中継する（移植元で非推奨）。"""
    command, dto = await _parse_message_request(request)
    _log_received_request("POST /api/messages/content/stream", dto, command)
    stream_session = await stream_service.prepare_stream(session, command)
    runtime = stream_service.start_streaming(
        command, stream_session, StreamMode.LEGACY_PASSTHROUGH
    )
    headers = {
        **SSE_HEADERS,
        MESSAGE_CONTENT_ID_HEADER: stream_session.message_content_id,
        MESSAGE_ID_HEADER: stream_session.message_id,
    }
    return StreamingResponse(
        stream_service.sse_events(runtime), media_type=EVENT_STREAM, headers=headers
    )


@router.post("/contents")
async def get_message_contents(
    body: GetMessageContentsRequest, session: SessionDep
) -> JSONResponse:
    contents = await message_content_service.get_message_contents_by_message_ids(
        session, body.messageIds or []
    )
    return JSONResponse(contents)


@router.delete("/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_message(message_id: str, session: SessionDep) -> Response:
    await message_content_service.delete_message_content(session, message_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
