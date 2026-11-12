"""Waha! のセッション（スロットのファイルとジョブの状態）。

server-local は 1 回の処理の中で startsession から endsession までを呼ぶため、
メモリに持つだけにする（再起動で消える）。
"""

import asyncio
import logging
import time
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from enum import StrEnum
from http import HTTPStatus

from waha_emulator.errors import EmulatorError

logger = logging.getLogger(__name__)

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
CANCELLED_MESSAGE = "ジョブが中断されました"


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
    status: JobStatus = JobStatus.RUNNING
    error: str | None = None
    # ジョブの中身（コルーチン）が Job を参照するため、作成後に設定する
    task: "asyncio.Task[None]" = field(init=False, repr=False)

    def succeed(self) -> None:
        self.status = JobStatus.SUCCESS
        self.error = None

    def fail(self, reason: str) -> None:
        self.status = JobStatus.FAILURE
        self.error = reason

    def cancel(self) -> None:
        """ジョブを止め、失敗（中断）にする。

        タスクが一度も動かないうちに止めた場合はジョブの中身の例外処理を
        通らないため、ここで状態を変える（RUNNING のまま残さない）。
        """
        self.task.cancel()
        if self.status == JobStatus.RUNNING:
            self.fail(CANCELLED_MESSAGE)


@dataclass
class Session:
    id: str
    last_used: float
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
    """セッションの置き場。

    server-local は失敗時に endsession を呼ばない経路がある（学習データの同期など）
    ため、一定時間使われていないセッションは startsession のたびに破棄する。
    """

    def __init__(
        self,
        *,
        idle_timeout_seconds: float,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._sessions: dict[str, Session] = {}
        self._idle_timeout = idle_timeout_seconds
        self._clock = clock

    def create(self) -> Session:
        self._discard_idle_sessions()
        session = Session(id=uuid.uuid4().hex, last_used=self._clock())
        self._sessions[session.id] = session
        return session

    def get(self, session_id: str) -> Session:
        session = self._sessions.get(session_id)
        if session is None:
            raise EmulatorError(HTTPStatus.NOT_FOUND, "セッションがありません")
        session.last_used = self._clock()
        return session

    def end(self, session_id: str) -> None:
        session = self.get(session_id)
        del self._sessions[session_id]
        if session.job is not None:
            session.job.cancel()

    async def close(self) -> None:
        """アプリの終了時に、実行中のジョブを止めて終わるのを待つ。"""
        jobs = [s.job for s in self._sessions.values() if s.job is not None]
        self._sessions.clear()
        for job in jobs:
            job.cancel()
        await asyncio.gather(*(job.task for job in jobs), return_exceptions=True)

    def _discard_idle_sessions(self) -> None:
        # 実行中のジョブは、使われていなくても終わるまで残す
        deadline = self._clock() - self._idle_timeout
        idle = [
            s.id
            for s in self._sessions.values()
            if s.last_used < deadline and not s.job_running
        ]
        for session_id in idle:
            del self._sessions[session_id]
            logger.info("Idle session discarded: sessionId=%s", session_id)

    def __len__(self) -> int:
        return len(self._sessions)
