"""Waha! のセッション（スロットのファイルとジョブの状態）。

server-local は 1 回の処理の中で startsession から endsession までを呼ぶため、
メモリに持つだけにする（再起動で消える）。
"""

import asyncio
import uuid
from dataclasses import dataclass, field
from enum import StrEnum
from http import HTTPStatus

from waha_emulator.errors import EmulatorError

# server-local の waha_client.py のスロット名
SLOT_FILE = "file"
SLOT_QUESTION = "question"
SLOT_ATTACHMENT = "attachmentfile"
SLOT_HISTORY = "history"
SLOT_TEXTDATA = "textdata"
SLOT_OUTPUT = "outputfile"
INPUT_SLOTS = frozenset(
    {SLOT_FILE, SLOT_QUESTION, SLOT_ATTACHMENT, SLOT_HISTORY, SLOT_TEXTDATA}
)


class JobStatus(StrEnum):
    RUNNING = "RUNNING"
    SUCCESS = "SUCCESS"
    FAILURE = "FAILURE"


@dataclass(frozen=True)
class SlotFile:
    filename: str
    content_type: str | None
    data: bytes


@dataclass
class Job:
    task: "asyncio.Task[None] | None" = None
    status: JobStatus = JobStatus.RUNNING
    error: str | None = None

    def succeed(self) -> None:
        self.status = JobStatus.SUCCESS
        self.error = None

    def fail(self, reason: str) -> None:
        self.status = JobStatus.FAILURE
        self.error = reason


@dataclass
class Session:
    id: str
    slots: dict[str, SlotFile] = field(default_factory=dict)
    job: Job | None = None

    @property
    def job_running(self) -> bool:
        return self.job is not None and self.job.status == JobStatus.RUNNING

    def result_text(self) -> str:
        """`/result` の応答。server-local は `SUCCESS` で始まる・`RUNNING`・それ以外で判定する。

        server-local の SSE は execute の前に結果のポーリングを始めるため、
        まだジョブがないセッションは失敗ではなく `RUNNING` を返す。
        """
        if self.job is None or self.job.status == JobStatus.RUNNING:
            return JobStatus.RUNNING.value
        if self.job.status == JobStatus.SUCCESS:
            return JobStatus.SUCCESS.value
        return f"{JobStatus.FAILURE.value}: {self.job.error or ''}"


class SessionStore:
    def __init__(self) -> None:
        self._sessions: dict[str, Session] = {}

    def create(self) -> Session:
        session = Session(id=uuid.uuid4().hex)
        self._sessions[session.id] = session
        return session

    def get(self, session_id: str) -> Session:
        session = self._sessions.get(session_id)
        if session is None:
            raise EmulatorError(HTTPStatus.NOT_FOUND, "セッションがありません")
        return session

    def end(self, session_id: str) -> None:
        session = self.get(session_id)
        del self._sessions[session_id]
        _cancel_job(session)

    async def close(self) -> None:
        """アプリの終了時に、実行中のジョブを止めて終わるのを待つ。"""
        tasks = [
            s.job.task
            for s in self._sessions.values()
            if s.job is not None and s.job.task is not None
        ]
        for session in self._sessions.values():
            _cancel_job(session)
        self._sessions.clear()
        await asyncio.gather(*tasks, return_exceptions=True)

    def __len__(self) -> int:
        return len(self._sessions)


def _cancel_job(session: Session) -> None:
    if session.job is not None and session.job.task is not None:
        session.job.task.cancel()
