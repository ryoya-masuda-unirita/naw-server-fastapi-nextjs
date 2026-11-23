"""クライアント切断を ASGI レベルで再現するテスト用ヘルパー。"""

import asyncio
from typing import Any

from starlette.responses import StreamingResponse

# uvicorn（h11・httptools）が実際に渡す ASGI の spec_version。2.4 未満のとき、
# StreamingResponse は切断を監視するタスクを動かし、切断でストリーム側をキャンセルする。
UVICORN_ASGI_SPEC_VERSION = "2.3"


class FakeSession:
    """`commit()` が実際にイベントループへ制御を渡す、テスト用の非同期セッション。

    モックの `AsyncMock` は待機点（チェックポイント）を持たないため、キャンセルの影響を
    再現できない。実物の DB ドライバと同じく、コミットで一度イベントループへ戻る。
    """

    def __init__(self, committed: list[Any]) -> None:
        """コミット済みのオブジェクトを溜めるリストを受け取る。

        Parameters
        ----------
        committed : list[Any]
            `commit()` が完了したオブジェクトを追加するリスト。
        """
        self._pending: list[Any] = []
        self._committed = committed

    async def __aenter__(self) -> "FakeSession":
        """コンテキストに入る。"""
        return self

    async def __aexit__(self, *args: Any) -> None:
        """コンテキストを抜ける。"""

    def add(self, obj: Any) -> None:
        """オブジェクトをコミット待ちに加える。

        Parameters
        ----------
        obj : Any
            追加するオブジェクト。
        """
        self._pending.append(obj)

    async def commit(self) -> None:
        """イベントループへ制御を渡してから、コミット待ちのオブジェクトを確定する。"""
        await asyncio.sleep(0)
        self._committed.extend(self._pending)
        self._pending.clear()


async def run_until_client_disconnects(
    response: StreamingResponse, disconnect_after: bytes
) -> list[bytes]:
    """レスポンスを ASGI として動かし、指定のイベントを送った直後にクライアントを切断させる。

    Parameters
    ----------
    response : StreamingResponse
        動かすレスポンス。
    disconnect_after : bytes
        送出されたボディにこのバイト列が含まれたら、`http.disconnect` を返す。

    Returns
    -------
    list[bytes]
        クライアントへ送ったボディの一覧。
    """
    disconnected = asyncio.Event()
    sent: list[bytes] = []

    async def receive() -> dict[str, Any]:
        """切断が起きるまで待ち、`http.disconnect` を返す。"""
        await disconnected.wait()
        return {"type": "http.disconnect"}

    async def send(message: dict[str, Any]) -> None:
        """ボディを記録し、指定のイベントを送ったら切断を知らせる。

        Parameters
        ----------
        message : dict[str, Any]
            ASGI の送信メッセージ。
        """
        body = message.get("body", b"")
        if body:
            sent.append(body)
        if disconnect_after in body:
            disconnected.set()

    scope = {"type": "http", "asgi": {"spec_version": UVICORN_ASGI_SPEC_VERSION}}
    await response(scope, receive, send)
    await _wait_for_background_tasks()
    return sent


async def _wait_for_background_tasks() -> None:
    """切断後も動き続ける別タスク（シールドされた保存処理）の完了を待つ。

    切断で呼び出し元のタスクはキャンセルされるが、保存は別タスクで最後まで動く。
    そのため、検証の前にそれらの完了を待つ。
    """
    others = asyncio.all_tasks() - {asyncio.current_task()}
    if others:
        await asyncio.wait_for(asyncio.gather(*others), timeout=5)
