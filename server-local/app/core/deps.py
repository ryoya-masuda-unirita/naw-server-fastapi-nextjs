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
    async with request.app.state.session_factory() as session:
        yield session


def get_waha_client(request: Request) -> WahaClient:
    return request.app.state.waha_client


def get_stream_service(request: Request) -> MessageContentStreamService:
    return request.app.state.stream_service


SessionDep = Annotated[AsyncSession, Depends(get_session)]
WahaDep = Annotated[WahaClient, Depends(get_waha_client)]
StreamServiceDep = Annotated[MessageContentStreamService, Depends(get_stream_service)]
