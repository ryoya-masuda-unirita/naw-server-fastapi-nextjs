"""Waha! のセッションを開始し、終了までを 1 つにまとめる（移植元 WahaSession）。"""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass

from app.clients.waha_client import WahaClient
from app.core.errors import WahaHttpStatusError

logger = logging.getLogger(__name__)

SERVER_ERROR_MIN = 500
SERVER_ERROR_MAX = 599


@dataclass
class WahaSession:
    """開いている Waha! のセッション。"""

    id: str
    operation: str
    # 登録の出力を確認できた（ファイル ID・パート ID が正しい）。以降の終了の失敗は警告にとどめる
    output_verified: bool = False
    # 終了を確認できなかった（サーバーエラー）。出力は確認済みなので、登録は成功として扱う
    end_unconfirmed: bool = False

    def mark_output_verified(self) -> None:
        """登録の出力を確認できたことを記録する。"""
        self.output_verified = True


@asynccontextmanager
async def waha_session(waha: WahaClient, operation: str) -> AsyncIterator[WahaSession]:
    """セッションを開始し、抜けるときに終了する。

    処理が失敗しているときに ``end_session`` も失敗しても、元のエラーを残す（上書きしない）。
    処理が成功したあとの ``end_session`` の失敗は、そのまま投げる（移植元 try-with-resources と同じ）。
    ただし、登録の出力を確認できたあとの Waha! のサーバーエラー（5xx）は、投げずに
    ``end_unconfirmed`` にして、警告で伝える。

    Parameters
    ----------
    waha : WahaClient
        Waha! のクライアント。
    operation : str
        ログに出す操作の名前（例: ``ファイル登録``）。

    Yields
    ------
    WahaSession
        開いたセッション。

    Raises
    ------
    ExternalServiceError
        処理が成功したあとに ``end_session`` が失敗した場合（出力を確認済みの 5xx を除く）。
    """
    session = WahaSession(id=await waha.start_session(), operation=operation)
    try:
        yield session
    except BaseException:
        try:
            await waha.end_session(session.id)
        except Exception:  # noqa: BLE001
            logger.warning("Waha! のセッション終了に失敗しました。操作=%s", operation)
        raise
    try:
        await waha.end_session(session.id)
    except WahaHttpStatusError as e:
        logger.warning(
            "Waha! のセッション終了を確認できません。操作=%s, 段階=セッション終了, HTTPステータス=%d",
            operation,
            e.http_status,
        )
        if not (
            session.output_verified
            and SERVER_ERROR_MIN <= e.http_status <= SERVER_ERROR_MAX
        ):
            raise
        session.end_unconfirmed = True
    except Exception:
        logger.warning("Waha! のセッション終了に失敗しました。操作=%s", operation)
        raise
