"""ジョブ（ワークフローの 1 回の実行）。

HTTP リクエストとは別のタスクで動かし、execute を待つ呼び出し元が切断しても
最後まで動いて結果を残す。
"""

import asyncio
import logging
from collections.abc import Mapping
from pathlib import Path

from waha_emulator.sessions import SLOT_OUTPUT, Job, Session, SlotFile
from waha_emulator.stream_file import StreamFile
from waha_emulator.workflows.base import Workflow, WorkflowError, WorkflowRequest

logger = logging.getLogger(__name__)

STREAM_FILE_PARAM = "streamfilepath"
OUTPUT_FILENAME = "output.json"
OUTPUT_CONTENT_TYPE = "application/json"
CANCELLED_MESSAGE = "ジョブが中断されました"


def start_job(
    session: Session,
    workflow: Workflow,
    *,
    service_id: str,
    params: Mapping[str, str],
    stream_allowed_dir: Path | None,
) -> Job:
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
            )
        )
        # server-local は SUCCESS を見たら outputfile を取りに来るため、先に保存する
        session.slots[SLOT_OUTPUT] = SlotFile(
            OUTPUT_FILENAME, OUTPUT_CONTENT_TYPE, output.encode("utf-8")
        )
        if stream is not None:
            stream.write_event({"type": "completed"})
        job.succeed()
        logger.info("Job succeeded: sessionId=%s, serviceId=%s", session.id, service_id)
    except asyncio.CancelledError:
        job.fail(CANCELLED_MESSAGE)
        raise
    except WorkflowError as e:
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
            stream.close()


def _fail(session: Session, job: Job, stream: StreamFile | None, reason: str) -> None:
    logger.warning("Job failed: sessionId=%s, reason=%s", session.id, reason)
    if stream is not None:
        try:
            stream.write_event({"type": "error", "message": reason})
        except OSError:
            # 失敗は result で伝わるため、ストリームに書けなくても続ける
            logger.warning("Failed to write error event to stream file", exc_info=True)
    job.fail(reason)
