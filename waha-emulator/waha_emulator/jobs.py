"""ジョブ（ワークフローの 1 回の実行）。

HTTP リクエストとは別のタスクで動かし、execute を待つ呼び出し元が切断しても
最後まで動いて結果を残す。
"""

import asyncio
import logging
from collections.abc import Mapping
from pathlib import Path
from typing import Any

from waha_emulator.sessions import (
    CANCELLED_MESSAGE,
    SLOT_OUTPUT,
    Job,
    Session,
    SlotFile,
)
from waha_emulator.stream_file import StreamFile, StreamFileError
from waha_emulator.workflows.base import Workflow, WorkflowError, WorkflowRequest

logger = logging.getLogger(__name__)

STREAM_FILE_PARAM = "streamfilepath"
OUTPUT_FILENAME = "output.json"
OUTPUT_CONTENT_TYPE = "application/json"


def start_job(
    session: Session,
    workflow: Workflow,
    *,
    service_id: str,
    params: Mapping[str, str],
    stream_allowed_dir: Path | None,
) -> Job:
    """ジョブを作り、別のタスクで動かし始める。

    Parameters
    ----------
    session : Session
        セッション。
    workflow : Workflow
        動かすワークフロー。
    service_id : str
        execute のサービス ID。
    params : Mapping[str, str]
        execute のクエリパラメータ（sessionid を除く）。
    stream_allowed_dir : Path | None
        ストリームファイルを書いてよいディレクトリ。

    Returns
    -------
    Job
        作ったジョブ。
    """
    job = Job()
    session.job = job
    session.slots.pop(SLOT_OUTPUT, None)
    job.task = asyncio.create_task(
        _run(session, job, workflow, service_id, dict(params), stream_allowed_dir)
    )
    return job


async def _run(
    session: Session,
    job: Job,
    workflow: Workflow,
    service_id: str,
    params: dict[str, str],
    stream_allowed_dir: Path | None,
) -> None:
    """ワークフローを動かし、結果を outputfile とジョブの状態に残す。

    Parameters
    ----------
    session : Session
        セッション。
    job : Job
        ジョブ。
    workflow : Workflow
        動かすワークフロー。
    service_id : str
        execute のサービス ID。
    params : dict[str, str]
        execute のクエリパラメータ。
    stream_allowed_dir : Path | None
        ストリームファイルを書いてよいディレクトリ。

    Raises
    ------
    asyncio.CancelledError
        ジョブが止められたとき（失敗にしてから送り直す）。
    """
    stream: StreamFile | None = None
    try:
        stream_path = params.get(STREAM_FILE_PARAM)
        if stream_path:
            stream = StreamFile.open(stream_path, stream_allowed_dir)
        output = await workflow.run(
            WorkflowRequest(
                service_id=service_id,
                params=params,
                inputs=dict(session.slots),
                stream=stream,
                stream_allowed_dir=stream_allowed_dir,
            )
        )
        # server-local は SUCCESS を見たら outputfile を取りに来るため、先に保存する
        session.slots[SLOT_OUTPUT] = SlotFile(
            OUTPUT_FILENAME, OUTPUT_CONTENT_TYPE, output.encode("utf-8")
        )
        # 終端は途中経過の区切りにすぎず、回答は outputfile で返せるため、
        # 書けなくても成功にする
        _write_event_quietly(stream, {"type": "completed"})
        job.succeed()
        logger.info("Job succeeded: sessionId=%s, serviceId=%s", session.id, service_id)
    except asyncio.CancelledError:
        job.fail(CANCELLED_MESSAGE)
        _write_event_quietly(stream, {"type": "error", "message": CANCELLED_MESSAGE})
        raise
    except (WorkflowError, StreamFileError) as e:
        _fail(session, job, stream, str(e))
    except Exception as e:
        logger.exception(
            "Job failed unexpectedly: sessionId=%s, serviceId=%s",
            session.id,
            service_id,
        )
        _fail(session, job, stream, f"{type(e).__name__}: {e}")
    finally:
        if stream is not None:
            try:
                stream.close()
            except OSError:
                logger.warning("Failed to close stream file", exc_info=True)


def _fail(session: Session, job: Job, stream: StreamFile | None, reason: str) -> None:
    """ジョブを失敗にし、ストリームに error を書く。

    Parameters
    ----------
    session : Session
        セッション。
    job : Job
        ジョブ。
    stream : StreamFile | None
        ストリームファイル。
    reason : str
        失敗の理由。
    """
    logger.warning("Job failed: sessionId=%s, reason=%s", session.id, reason)
    _write_event_quietly(stream, {"type": "error", "message": reason})
    job.fail(reason)


def _write_event_quietly(stream: StreamFile | None, event: dict[str, Any]) -> None:
    """ストリームに終端を書く。結果は result で伝わるため、書けなくても続ける。

    Parameters
    ----------
    stream : StreamFile | None
        ストリームファイル。None なら何もしない。
    event : dict[str, Any]
        書くイベント。
    """
    if stream is None:
        return
    try:
        stream.write_event(event)
    except OSError:
        logger.warning(
            "Failed to write %s event to stream file", event["type"], exc_info=True
        )
