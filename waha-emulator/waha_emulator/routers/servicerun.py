"""Waha! の servicerun API。

パス・パラメータ・応答は server-local の `app/clients/waha_client.py` に合わせる。
"""

import asyncio
import hmac
import logging
from http import HTTPStatus
from typing import Annotated

from fastapi import APIRouter, File, Query, Request, UploadFile
from fastapi.responses import PlainTextResponse

from waha_emulator.config import Settings
from waha_emulator.errors import EmulatorError
from waha_emulator.jobs import start_job
from waha_emulator.sessions import INPUT_SLOTS, SessionStore, SlotFile
from waha_emulator.workflows.registry import WorkflowRegistry

logger = logging.getLogger(__name__)

SERVICE_RUN_PATH = "/WahaServer/servicerun/api"
SESSION_ID_PARAM = "sessionid"
OK_TEXT = "OK"
UPLOAD_FALLBACK_FILENAME = "upload"

router = APIRouter(prefix=SERVICE_RUN_PATH, default_response_class=PlainTextResponse)

SessionIdQuery = Annotated[str, Query(alias=SESSION_ID_PARAM)]


def _settings(request: Request) -> Settings:
    settings: Settings = request.app.state.settings
    return settings


def _store(request: Request) -> SessionStore:
    store: SessionStore = request.app.state.session_store
    return store


def _registry(request: Request) -> WorkflowRegistry:
    registry: WorkflowRegistry = request.app.state.workflow_registry
    return registry


@router.get("/startsession")
async def start_session(
    request: Request, authkey: Annotated[str, Query()]
) -> PlainTextResponse:
    expected = _settings(request).authkey
    if not hmac.compare_digest(authkey.encode("utf-8"), expected.encode("utf-8")):
        # 本文・ログに受け取った authkey を出さない
        logger.warning("startsession rejected: invalid authkey")
        raise EmulatorError(HTTPStatus.UNAUTHORIZED, "authkey が正しくありません")
    session = _store(request).create()
    logger.info("Session started: sessionId=%s", session.id)
    return PlainTextResponse(session.id)


@router.get("/endsession")
async def end_session(
    request: Request, session_id: SessionIdQuery
) -> PlainTextResponse:
    _store(request).end(session_id)
    logger.info("Session ended: sessionId=%s", session_id)
    return PlainTextResponse(OK_TEXT)


@router.post("/upload/{slot}")
async def upload(
    request: Request,
    slot: str,
    session_id: SessionIdQuery,
    file: Annotated[UploadFile, File()],
) -> PlainTextResponse:
    session = _store(request).get(session_id)
    if slot not in INPUT_SLOTS:
        raise EmulatorError(
            HTTPStatus.BAD_REQUEST, f"入力スロットではありません: {slot}"
        )
    data = await file.read()
    session.slots[slot] = SlotFile(
        filename=file.filename or UPLOAD_FALLBACK_FILENAME,
        content_type=file.content_type,
        data=data,
    )
    logger.info(
        "File uploaded: sessionId=%s, slot=%s, filename=%s, size=%d",
        session_id,
        slot,
        file.filename,
        len(data),
    )
    return PlainTextResponse(OK_TEXT)


@router.get("/execute/{service_id}")
async def execute(
    request: Request, service_id: str, session_id: SessionIdQuery
) -> PlainTextResponse:
    return await _execute(request, service_id, session_id)


@router.get("/execute/")
async def execute_without_service_id(
    request: Request, session_id: SessionIdQuery
) -> PlainTextResponse:
    """サービス ID が空の execute。

    server-local はアシスタント ID・サービス名が未指定だと空文字列で呼ぶ
    （`/execute/`）。パスの引数には空文字列がマッチしないため、別に受ける。
    """
    return await _execute(request, "", session_id)


async def _execute(
    request: Request, service_id: str, session_id: str
) -> PlainTextResponse:
    session = _store(request).get(session_id)
    if session.job_running:
        raise EmulatorError(HTTPStatus.CONFLICT, "ジョブを実行中です")
    params = {k: v for k, v in request.query_params.items() if k != SESSION_ID_PARAM}
    workflow = _registry(request).resolve(service_id, params)
    settings = _settings(request)
    logger.info(
        "Execute: sessionId=%s, serviceId=%s, workflow=%s, params=%s",
        session_id,
        service_id,
        type(workflow).__name__,
        params,
    )
    job = start_job(
        session,
        workflow,
        service_id=service_id,
        params=params,
        stream_allowed_dir=settings.stream_allowed_dir,
    )
    if not settings.execute_wait_for_completion:
        return PlainTextResponse(OK_TEXT)
    try:
        # 呼び出し元が切断して、このリクエストがキャンセルされてもジョブは続ける
        await asyncio.shield(job.task)
    except asyncio.CancelledError:
        current = asyncio.current_task()
        if current is not None and current.cancelling():
            raise
        # endsession でジョブが止められた。失敗（中断）として結果を返す
    return PlainTextResponse(session.result_text())


@router.get("/result")
async def result(request: Request, session_id: SessionIdQuery) -> PlainTextResponse:
    return PlainTextResponse(_store(request).get(session_id).result_text())


@router.get("/download/{slot}")
async def download(
    request: Request, slot: str, session_id: SessionIdQuery
) -> PlainTextResponse:
    stored = _store(request).get(session_id).slots.get(slot)
    if stored is None:
        raise EmulatorError(
            HTTPStatus.NOT_FOUND, f"スロットにファイルがありません: {slot}"
        )
    return PlainTextResponse(stored.data.decode("utf-8", errors="replace"))
