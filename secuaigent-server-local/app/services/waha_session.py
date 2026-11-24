"""Waha! のセッションを開始し、終了までを 1 つにまとめる（移植元 WahaSession）。"""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from app.clients.waha_client import WahaClient

logger = logging.getLogger(__name__)


@asynccontextmanager
async def waha_session(waha: WahaClient, operation: str) -> AsyncIterator[str]:
    """セッションを開始し、抜けるときに終了する。

    処理が失敗しているときに ``end_session`` も失敗しても、元のエラーを残す（上書きしない）。
    処理が成功したあとの ``end_session`` の失敗は、そのまま投げる（移植元 try-with-resources と同じ）。

    Parameters
    ----------
    waha : WahaClient
        Waha! のクライアント。
    operation : str
        ログに出す操作の名前（例: ``ファイル登録``）。

    Yields
    ------
    str
        セッション ID。

    Raises
    ------
    ExternalServiceError
        処理が成功したあとに ``end_session`` が失敗した場合。
    """
    session_id = await waha.start_session()
    try:
        yield session_id
    except BaseException:
        try:
            await waha.end_session(session_id)
        except Exception:  # noqa: BLE001
            logger.warning("Waha! のセッション終了に失敗しました。操作=%s", operation)
        raise
    try:
        await waha.end_session(session_id)
    except Exception:
        logger.warning("Waha! のセッション終了に失敗しました。操作=%s", operation)
        raise
