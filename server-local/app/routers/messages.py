import logging
from http import HTTPStatus
from typing import Any

from fastapi import APIRouter, Request, Response, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import ValidationError
from starlette.datastructures import FormData, UploadFile
from starlette.exceptions import HTTPException

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
    """textData の不備を表す、400 にする入力チェックの例外を作る。

    移植元は JSON パートの解析エラーを Spring の既定の 400 で返すため、例外ハンドラーで
    同じ形の 400 になる ``RequestValidationError`` を使う。

    Parameters
    ----------
    detail : str
        ログに出す不備の内容。

    Returns
    -------
    RequestValidationError
        送出する例外。
    """
    return RequestValidationError([{"type": "value_error", "msg": detail, "loc": ()}])


def _uploads(form: FormData, name: str) -> list[UploadFile]:
    """フォームから指定した名前のファイルを取り出し、1 ファイルのサイズ上限を確かめる。

    同じ名前の文字列項目はファイルではないため除く。

    Parameters
    ----------
    form : FormData
        解析済みの multipart フォーム。
    name : str
        ファイルの項目名。

    Returns
    -------
    list[UploadFile]
        項目のファイル。なければ空のリスト。

    Raises
    ------
    PayloadTooLargeError
        いずれかのファイルのサイズが上限を超えている場合（413）。
    """
    uploads = [v for v in form.getlist(name) if isinstance(v, UploadFile)]
    for upload in uploads:
        if upload.size is not None and upload.size > MAX_FILE_SIZE_BYTES:
            raise PayloadTooLargeError(name)
    return uploads


async def _read_files(form: FormData, name: str) -> list[UploadedFile]:
    """フォームのファイルを中身まで読み込む（Waha! に送る添付ファイル用）。

    Parameters
    ----------
    form : FormData
        解析済みの multipart フォーム。
    name : str
        ファイルの項目名。

    Returns
    -------
    list[UploadedFile]
        ファイル名・Content-Type・中身を読み込んだもの。

    Raises
    ------
    PayloadTooLargeError
        いずれかのファイルのサイズが上限を超えている場合（413）。
    """
    return [await UploadedFile.from_upload(u) for u in _uploads(form, name)]


def _summarize_files(form: FormData, name: str) -> list[FileSummary]:
    """フォームのファイルをファイル名とサイズだけにまとめる（履歴の添付ファイル用）。

    履歴の添付ファイルは中身を使わず名前とサイズだけ記録するため、読み込まない。

    Parameters
    ----------
    form : FormData
        解析済みの multipart フォーム。
    name : str
        ファイルの項目名。

    Returns
    -------
    list[FileSummary]
        ファイル名とサイズ。

    Raises
    ------
    PayloadTooLargeError
        いずれかのファイルのサイズが上限を超えている場合（413）。
    """
    return [FileSummary(u.filename, u.size or 0) for u in _uploads(form, name)]


async def _parse_message_request(
    request: Request,
) -> tuple[CreateMessageContentCommand, CreateMessageContentRequest]:
    """移植元の @RequestPart（textData は JSON パート）を読み取る。

    ブラウザは textData を `application/json` の Blob として送るが、テストツール等で
    通常のフォーム文字列として送られても読めるよう、どちらも受け付ける。

    Parameters
    ----------
    request : Request
        multipart/form-data のリクエスト。

    Returns
    -------
    tuple[CreateMessageContentCommand, CreateMessageContentRequest]
        サービスに渡すコマンドと、ログに出すための textData の内容。

    Raises
    ------
    HTTPException
        multipart/form-data でない場合（415）。
    RequestValidationError
        textData が不正な場合（400）。
    PayloadTooLargeError
        添付ファイルのサイズが上限を超えている場合（413）。
    """
    # メディアタイプは大文字小文字を区別しない（Spring の MediaType と同じ）
    content_type = request.headers.get("content-type", "").lower()
    if not content_type.startswith(MULTIPART_FORM_DATA):
        # 移植元は consumes = multipart/form-data のため、Spring が 415 を返す
        raise HTTPException(status_code=HTTPStatus.UNSUPPORTED_MEDIA_TYPE)
    form = await request.form(max_part_size=MAX_REQUEST_SIZE_BYTES)
    # 自前で解析したフォームは FastAPI が閉じないため、一時ファイルを明示的に閉じる
    try:
        raw = form.get(TEXT_DATA_PART)
        if raw is None:
            raise _bad_request("textData がありません")
        try:
            text = (
                (await raw.read()).decode("utf-8")
                if isinstance(raw, UploadFile)
                else raw
            )
        except UnicodeDecodeError as e:
            # 移植元（Jackson）は JSON の解析エラー（HttpMessageNotReadable）で 400
            raise _bad_request(f"textData が UTF-8 ではありません: {e}") from e
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
    """受け取った回答作成のリクエストの内容をログに出す。

    アクセストークンはログに残さないよう除き、ファイルは名前とサイズだけを出す。

    Parameters
    ----------
    endpoint : str
        ログに出すエンドポイント名（メソッドとパス）。
    dto : CreateMessageContentRequest
        textData の内容。
    command : CreateMessageContentCommand
        添付ファイルを含むサービス用のコマンド。
    """

    def describe(files: list[UploadedFile] | list[FileSummary]) -> str:
        """ファイルの一覧を ``[名前(サイズbytes), ...]`` の文字列にする。

        Parameters
        ----------
        files : list[UploadedFile] | list[FileSummary]
            ファイルの一覧。

        Returns
        -------
        str
            ログ用の文字列。
        """
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
    """NAW 互換 SSE で回答を返す。

    回答の保存先を用意してから Waha! のジョブを始め、生成途中の回答を SSE で順に送る。

    Parameters
    ----------
    request : Request
        textData と添付ファイルを持つ multipart/form-data のリクエスト。
    session : AsyncSession
        DB セッション。
    stream_service : MessageContentStreamService
        ストリーミング回答のサービス。

    Returns
    -------
    StreamingResponse
        ``text/event-stream`` の応答。

    Raises
    ------
    HTTPException
        multipart/form-data でない場合（415）。
    RequestValidationError
        textData が不正な場合（400）。
    PayloadTooLargeError
        添付ファイルのサイズが上限を超えている場合（413）。
    """
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
    """旧形式。Waha! の完了を待って JSON で返す（移植元で非推奨）。

    Parameters
    ----------
    request : Request
        textData と添付ファイルを持つ multipart/form-data のリクエスト。
    session : AsyncSession
        DB セッション。
    waha : WahaClient
        Waha! クライアント。

    Returns
    -------
    dict[str, Any]
        保存したメッセージ内容（添付ファイル付き）。

    Raises
    ------
    HTTPException
        multipart/form-data でない場合（415）。
    RequestValidationError
        textData が不正な場合（400）。
    PayloadTooLargeError
        添付ファイルのサイズが上限を超えている場合（413）。
    """
    command, dto = await _parse_message_request(request)
    _log_received_request("POST /api/messages/content/sync", dto, command)
    return await message_content_service.post_message_content(session, waha, command)


@router.post("/content/stream", deprecated=True)
async def create_message_content_stream_legacy(
    request: Request, session: SessionDep, stream_service: StreamServiceDep
) -> StreamingResponse:
    """旧形式。ストリームファイルの内容をそのまま中継する（移植元で非推奨）。

    呼び出し側が回答を後から取得できるよう、メッセージ内容 ID とメッセージ ID を
    応答ヘッダーで返す。

    Parameters
    ----------
    request : Request
        textData と添付ファイルを持つ multipart/form-data のリクエスト。
    session : AsyncSession
        DB セッション。
    stream_service : MessageContentStreamService
        ストリーミング回答のサービス。

    Returns
    -------
    StreamingResponse
        ``text/event-stream`` の応答。

    Raises
    ------
    HTTPException
        multipart/form-data でない場合（415）。
    RequestValidationError
        textData が不正な場合（400）。
    PayloadTooLargeError
        添付ファイルのサイズが上限を超えている場合（413）。
    """
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
    """複数のメッセージ ID に対応するメッセージ内容を、添付ファイル付きで返す。

    Parameters
    ----------
    body : GetMessageContentsRequest
        取得するメッセージ ID の一覧。未指定なら空として扱う。
    session : AsyncSession
        DB セッション。

    Returns
    -------
    JSONResponse
        メッセージ内容の一覧。
    """
    contents = await message_content_service.get_message_contents_by_message_ids(
        session, body.messageIds or []
    )
    return JSONResponse(contents)


@router.delete("/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_message(message_id: str, session: SessionDep) -> Response:
    """メッセージ ID に対応するメッセージ内容と添付ファイルを削除する。

    対応するレコードがなくてもエラーにせず 204 を返す。

    Parameters
    ----------
    message_id : str
        削除するメッセージの ID。
    session : AsyncSession
        DB セッション。

    Returns
    -------
    Response
        本文なしの 204 応答。
    """
    await message_content_service.delete_message_content(session, message_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
