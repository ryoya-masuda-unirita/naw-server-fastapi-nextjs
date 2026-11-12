import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from waha_emulator.config import Settings, get_settings
from waha_emulator.errors import register_exception_handlers
from waha_emulator.llm.base import LlmClient
from waha_emulator.llm.factory import create_llm_client
from waha_emulator.routers import servicerun
from waha_emulator.sessions import SessionStore
from waha_emulator.workflows.chat import ChatWorkflow
from waha_emulator.workflows.registry import WorkflowRegistry

# httpx（openai SDK が使う）は INFO でリクエストの URL をログに出すため抑える
HTTPX_LOG_LEVEL = logging.WARNING


def create_app(
    settings: Settings | None = None,
    *,
    llm_client: LlmClient | None = None,
    registry: WorkflowRegistry | None = None,
) -> FastAPI:
    """アプリを組み立てる。テストでは LLM・ワークフローを差し替えて使う。"""
    settings = settings or get_settings()
    logging.basicConfig(
        level=settings.log_level,
        format="%(asctime)s [%(name)s] %(levelname)s - %(message)s",
    )
    logging.getLogger("httpx").setLevel(HTTPX_LOG_LEVEL)

    if registry is None:
        llm = llm_client or create_llm_client(settings)
        registry = WorkflowRegistry(default=ChatWorkflow(llm))
    session_store = SessionStore(
        idle_timeout_seconds=settings.session_idle_timeout_seconds
    )

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        try:
            yield
        finally:
            await session_store.close()

    app = FastAPI(title="naw-waha-emulator", lifespan=lifespan)
    app.state.settings = settings
    app.state.session_store = session_store
    app.state.workflow_registry = registry
    register_exception_handlers(app)
    app.include_router(servicerun.router)
    return app


def app_factory() -> FastAPI:
    """uvicorn の `--factory` 用。import 時に設定を読まないようにするため関数にする。"""
    return create_app()
