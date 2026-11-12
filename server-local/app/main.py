import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.clients.naw_api_client import NawApiClient
from app.clients.waha_client import WahaClient
from app.core.config import (
    MAX_REQUEST_SIZE_BYTES,
    MS_PER_SECOND,
    Settings,
    get_settings,
)
from app.core.database import create_engine, create_session_factory
from app.core.errors import register_exception_handlers
from app.core.middleware import MultipartSizeLimitMiddleware, UnhandledErrorMiddleware
from app.core.security import ServerAuthKeyMiddleware
from app.routers import hello, indexes, libraries, messages
from app.services.message_content_stream_service import MessageContentStreamService
from app.services.stream.cleanup import run_cleanup_loop

# 移植元 RestTemplate は既定でタイムアウトなし。Waha! の execute はジョブ完了まで
# 応答しないことがあるため、同じく無制限にする。
EXTERNAL_HTTP_TIMEOUT = httpx.Timeout(None)
HTTPX_LOG_LEVEL = logging.WARNING


def create_app(
    settings: Settings | None = None,
    *,
    session_factory: async_sessionmaker[AsyncSession] | None = None,
    waha_client: WahaClient | None = None,
    naw_client: NawApiClient | None = None,
    enable_cleanup: bool = True,
) -> FastAPI:
    """アプリを組み立てる。テストでは DB・外部クライアントを差し替えて使う。"""
    settings = settings or get_settings()
    logging.basicConfig(
        level=settings.log_level.upper(),
        format="%(asctime)s [%(name)s] %(levelname)s - %(message)s",
    )
    # httpx は INFO でリクエストの URL をログに出し、Waha! の authkey（クエリ）が
    # 毎回ログに残る。移植元（RestTemplate）はリクエストをログに出さないため止める
    logging.getLogger("httpx").setLevel(HTTPX_LOG_LEVEL)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        engine = None
        http_client = None
        if session_factory is None:
            engine = create_engine(settings.database_url)
            app.state.session_factory = create_session_factory(engine)
        else:
            app.state.session_factory = session_factory
        if waha_client is None or naw_client is None:
            http_client = httpx.AsyncClient(timeout=EXTERNAL_HTTP_TIMEOUT)
        app.state.waha_client = waha_client or WahaClient(
            base_url=settings.waha_url,
            auth_key=settings.waha_authkey,
            http_client=http_client,
            result_retry_interval_seconds=(
                settings.waha_result_retry_interval_ms / MS_PER_SECOND
            ),
            result_max_retries=settings.waha_result_max_retries,
        )
        app.state.naw_client = naw_client or NawApiClient(
            base_url=settings.naw_base_url,
            http_client=http_client,
        )
        app.state.stream_service = MessageContentStreamService(
            settings=settings,
            session_factory=app.state.session_factory,
            waha=app.state.waha_client,
            naw=app.state.naw_client,
        )
        cleanup_task = None
        if enable_cleanup:
            cleanup_task = asyncio.create_task(
                run_cleanup_loop(
                    settings.stream_output_dir,
                    settings.stream_orphan_cleanup_max_age_hours,
                )
            )
        try:
            yield
        finally:
            if cleanup_task is not None:
                cleanup_task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await cleanup_task
            await app.state.stream_service.shutdown()
            if http_client is not None:
                await http_client.aclose()
            if engine is not None:
                await engine.dispose()

    app = FastAPI(title="naw-server-local", lifespan=lifespan)
    register_exception_handlers(app)

    for router in (hello.router, messages.router, libraries.router, indexes.router):
        app.include_router(router, prefix=settings.context_path)

    # add_middleware は後に追加したものが外側になる。CORS を外側にして、
    # 認証エラー（401）・サイズ超過（413）・想定外のエラー（500）にも CORS ヘッダーを
    # 付け、ブラウザから内容を読めるようにする（移植元も CORS をフィルターで付ける）。
    # サイズ上限は移植元と同じく認証の後（マルチパートの解析時）に確かめる。
    app.add_middleware(UnhandledErrorMiddleware)
    app.add_middleware(MultipartSizeLimitMiddleware, max_bytes=MAX_REQUEST_SIZE_BYTES)
    app.add_middleware(
        ServerAuthKeyMiddleware,
        expected_key=settings.server_auth_key,
        context_path=settings.context_path,
    )
    # 移植元は全オリジン（パターン `*`）を資格情報付きで許可している。
    # `*` と credentials は併用できないため、正規表現で全オリジンを反射させる。
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=".*",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    return app


def app_factory() -> FastAPI:
    """uvicorn の `--factory` 用。import 時に設定を読まないようにするため関数にする。"""
    return create_app()
