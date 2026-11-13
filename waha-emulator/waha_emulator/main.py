import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from generative_ai_adapter.core_mappers import ChatRuntimeFactory

from waha_emulator.config import Settings, get_settings
from waha_emulator.errors import register_exception_handlers
from waha_emulator.routers import servicerun
from waha_emulator.sessions import SessionStore
from waha_emulator.workflow_config import WorkflowConfig, load_workflow_config
from waha_emulator.workflows.generative_ai import GenerativeAiWorkflow
from waha_emulator.workflows.registry import WorkflowRegistry

# httpx（生成AIアダプタが LLM を呼ぶのに使う）は INFO でリクエストの URL を
# ログに出すため抑える
HTTPX_LOG_LEVEL = logging.WARNING


def build_registry(
    config: WorkflowConfig, chat_runtime_factory: ChatRuntimeFactory | None = None
) -> WorkflowRegistry:
    """ワークフローの設定から、サービス ID → ワークフローの対応を作る。

    Parameters
    ----------
    config : WorkflowConfig
        ワークフローの設定。
    chat_runtime_factory : ChatRuntimeFactory | None
        core の chat を作る処理（テストでプロバイダを差し替える）。

    Returns
    -------
    WorkflowRegistry
        サービス ID → ワークフロー。
    """
    return WorkflowRegistry(
        default=GenerativeAiWorkflow(config.default, chat_runtime_factory),
        by_service_id={
            service_id: GenerativeAiWorkflow(definition, chat_runtime_factory)
            for service_id, definition in config.services.items()
        },
    )


def create_app(
    settings: Settings | None = None,
    *,
    registry: WorkflowRegistry | None = None,
    chat_runtime_factory: ChatRuntimeFactory | None = None,
) -> FastAPI:
    """アプリを組み立てる。

    テストでは、ワークフロー、または生成AIアダプタが使うプロバイダを差し替えて使う。

    Parameters
    ----------
    settings : Settings | None
        設定。None なら環境変数から読む。
    registry : WorkflowRegistry | None
        サービス ID → ワークフロー。None なら設定（WAHA_WORKFLOWS_FILE）から作る。
    chat_runtime_factory : ChatRuntimeFactory | None
        core の chat を作る処理（テストでプロバイダを差し替える）。

    Returns
    -------
    FastAPI
        アプリ。
    """
    settings = settings or get_settings()
    logging.basicConfig(
        level=settings.log_level,
        format="%(asctime)s [%(name)s] %(levelname)s - %(message)s",
    )
    logging.getLogger("httpx").setLevel(HTTPX_LOG_LEVEL)

    if registry is None:
        config = load_workflow_config(settings)
        logging.getLogger(__name__).info(
            "Workflows: default={%s}, services=%s",
            config.default.describe(),
            {sid: d.describe() for sid, d in config.services.items()},
        )
        registry = build_registry(config, chat_runtime_factory)
    session_store = SessionStore(
        idle_timeout_seconds=settings.session_idle_timeout_seconds
    )

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        """終了時に実行中のジョブを止める。

        Parameters
        ----------
        app : FastAPI
            アプリ。

        Yields
        ------
        None
            起動中。
        """
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
    """uvicorn の `--factory` 用。import 時に設定を読まないようにするため関数にする。

    Returns
    -------
    FastAPI
        アプリ。
    """
    return create_app()
