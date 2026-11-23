"""ルーターから使う依存（app.state に保持したものを取り出す）。

テストで偽の外部クライアントや一時 DB を差し込めるよう、グローバル変数ではなく
create_app() で app.state に設定したものを使う。
"""

from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.clients.waha_client import WahaClient
from app.services.message_content_stream_service import MessageContentStreamService


async def get_session(request: Request) -> AsyncIterator[AsyncSession]:
    """リクエストごとに DB セッションを開き、応答後に閉じる。

    Parameters
    ----------
    request : Request
        ``app.state.session_factory`` を持つアプリへのリクエスト。

    Yields
    ------
    AsyncSession
        このリクエストで使う DB セッション。
    """
    async with request.app.state.session_factory() as session:
        yield session


def get_waha_client(request: Request) -> WahaClient:
    """``create_app`` で ``app.state`` に設定した Waha! クライアントを返す。

    Parameters
    ----------
    request : Request
        処理中のリクエスト。

    Returns
    -------
    WahaClient
        アプリで共有する Waha! クライアント。
    """
    return request.app.state.waha_client


def get_stream_service(request: Request) -> MessageContentStreamService:
    """``create_app`` で ``app.state`` に設定したストリーミング回答のサービスを返す。

    実行中のストリームをアプリ全体で 1 つのサービスが管理するため、リクエストごとに
    作らず共有のものを使う。

    Parameters
    ----------
    request : Request
        処理中のリクエスト。

    Returns
    -------
    MessageContentStreamService
        アプリで共有するストリーミング回答のサービス。
    """
    return request.app.state.stream_service


SessionDep = Annotated[AsyncSession, Depends(get_session)]
WahaDep = Annotated[WahaClient, Depends(get_waha_client)]
StreamServiceDep = Annotated[MessageContentStreamService, Depends(get_stream_service)]
