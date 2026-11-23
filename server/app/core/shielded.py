"""キャンセルされても最後まで動くタスクの実行ヘルパー。"""

import asyncio
import logging
from collections.abc import Coroutine
from typing import Any, TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")

# 実行中のタスクへの強い参照。イベントループは弱参照しか持たないため、
# 保持しないと完了前にガベージコレクションで消えることがある。
_running_tasks: set[asyncio.Task[Any]] = set()


def _on_task_done(task: asyncio.Task[Any]) -> None:
    """タスク完了時に参照を外し、呼び出し元が受け取れなかった例外をログに残す。

    Parameters
    ----------
    task : asyncio.Task[Any]
        完了したタスク。
    """
    _running_tasks.discard(task)
    if not task.cancelled() and task.exception() is not None:
        logger.error("シールドされたタスクが失敗しました", exc_info=task.exception())


async def run_shielded(coro: Coroutine[Any, Any, T]) -> T:
    """コルーチンを、呼び出し元がキャンセルされても中断されない別タスクとして実行する。

    クライアント切断で SSE のストリームがキャンセルされると、`finally` 内の `await`
    もキャンセルされ、DB への保存（コミット）が途中で中断される。ストリーム配信後の
    保存はこの関数で実行し、切断されても最後まで完了させる。

    `asyncio.shield` だけでは、内側のタスクを誰も参照しなくなり完了前に回収されうるため、
    モジュール内で参照を保持する。呼び出し元がキャンセルされた場合は、内側のタスクを
    継続させたまま `CancelledError` をそのまま伝播させる。

    Parameters
    ----------
    coro : Coroutine[Any, Any, T]
        実行するコルーチン。

    Returns
    -------
    T
        コルーチンの戻り値。
    """
    task = asyncio.ensure_future(coro)
    _running_tasks.add(task)
    task.add_done_callback(_on_task_done)
    return await asyncio.shield(task)
