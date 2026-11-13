import asyncio

import pytest

from waha_emulator.errors import EmulatorError
from waha_emulator.jobs import start_job
from waha_emulator.sessions import JobStatus, SessionStore
from waha_emulator.workflows.base import WorkflowRequest

IDLE_TIMEOUT_SECONDS = 60.0


class _Clock:
    """時刻を手動で進められるテスト用の時計。"""

    def __init__(self) -> None:
        """時刻を 1000.0 秒で始める。"""
        self.now = 1000.0

    def __call__(self) -> float:
        """現在の（手動で進めた）時刻を返す。

        Returns
        -------
        float
            現在時刻（秒）。
        """
        return self.now


class _WaitingWorkflow:
    """release が呼ばれるまで終わらないテスト用ワークフロー。"""

    def __init__(self) -> None:
        """待ち合わせ用のイベントを作る。"""
        self.release = asyncio.Event()

    async def run(self, request: WorkflowRequest) -> str:
        """release がセットされるまで待ち、空の JSON を返す。

        Parameters
        ----------
        request : WorkflowRequest
            ワークフローへの入力（使わない）。

        Returns
        -------
        str
            空の JSON オブジェクトの文字列。
        """
        await self.release.wait()
        return "{}"


def _store(clock: _Clock) -> SessionStore:
    """指定した時計を使うセッションストアを作る。

    Parameters
    ----------
    clock : _Clock
        ストアが時刻の取得に使う時計。

    Returns
    -------
    SessionStore
        アイドル時間切れを IDLE_TIMEOUT_SECONDS にしたストア。
    """
    return SessionStore(idle_timeout_seconds=IDLE_TIMEOUT_SECONDS, clock=clock)


async def test_idle_sessions_are_discarded_on_create() -> None:
    """一定時間使われていないセッションは、次の startsession で破棄されること"""
    clock = _Clock()
    store = _store(clock)
    idle = store.create()
    clock.now += IDLE_TIMEOUT_SECONDS / 2
    recent = store.create()

    clock.now += IDLE_TIMEOUT_SECONDS / 2 + 1
    store.create()

    with pytest.raises(EmulatorError):
        store.get(idle.id)
    assert store.get(recent.id) is recent


async def test_access_keeps_session_alive() -> None:
    """使われたセッションは破棄の対象にならないこと"""
    clock = _Clock()
    store = _store(clock)
    session = store.create()
    clock.now += IDLE_TIMEOUT_SECONDS - 1
    store.get(session.id)

    clock.now += IDLE_TIMEOUT_SECONDS - 1
    store.create()

    assert store.get(session.id) is session


async def test_session_with_running_job_is_kept() -> None:
    """実行中のジョブがあるセッションは、使われていなくても破棄しないこと"""
    clock = _Clock()
    store = _store(clock)
    session = store.create()
    workflow = _WaitingWorkflow()
    job = start_job(
        session, workflow, service_id="svc", params={}, stream_allowed_dir=None
    )

    clock.now += IDLE_TIMEOUT_SECONDS * 2
    store.create()
    kept = store.get(session.id)
    workflow.release.set()
    await job.task

    assert kept is session
    assert job.status == JobStatus.SUCCESS


async def test_job_cancelled_before_start_is_failure() -> None:
    """タスクが動く前に止めたジョブも RUNNING のまま残らず失敗になること"""
    store = _store(_Clock())
    session = store.create()
    job = start_job(
        session,
        _WaitingWorkflow(),
        service_id="svc",
        params={},
        stream_allowed_dir=None,
    )

    store.end(session.id)
    await asyncio.gather(job.task, return_exceptions=True)

    assert job.task.cancelled()
    assert session.result_text() == "FAILURE: ジョブが中断されました"
