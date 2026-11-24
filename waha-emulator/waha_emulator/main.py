import asyncio
import logging
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from generative_ai_adapter.core_mappers import ChatRuntimeFactory
from generative_ai_core.media import shutdown_tika
from generative_ai_core.retrieval.runtime import CoreRetrievalRuntime

from waha_emulator.config import Settings, get_settings
from waha_emulator.errors import register_exception_handlers
from waha_emulator.routers import servicerun
from waha_emulator.sessions import SessionStore
from waha_emulator.workflow_config import (
    ADAPTER_EMBEDDING,
    WorkflowConfig,
    WorkflowDefinition,
    WorkflowTemplate,
    load_workflow_config,
)
from waha_emulator.workflows.base import Workflow
from waha_emulator.workflows.embedding import EmbeddingWorkflow
from waha_emulator.workflows.generative_ai import GenerativeAiWorkflow
from waha_emulator.workflows.registry import WorkflowRegistry

# httpx（生成AIアダプタが LLM を呼ぶのに使う）は INFO でリクエストの URL を
# ログに出すため抑える
HTTPX_LOG_LEVEL = logging.WARNING


def build_workflow(
    definition: WorkflowDefinition,
    chat_runtime_factory: ChatRuntimeFactory | None = None,
    retrieval_runtime_factory: Callable[[], CoreRetrievalRuntime] | None = None,
    source_allowed_dir: Path | None = None,
) -> Workflow:
    """定義のアダプタに合うワークフローを作る。

    Parameters
    ----------
    definition : WorkflowDefinition
        サービスの定義。
    chat_runtime_factory : ChatRuntimeFactory | None
        core の chat を作る処理（生成AIアダプタ。テストでプロバイダを差し替える）。
    retrieval_runtime_factory : Callable[[], CoreRetrievalRuntime] | None
        core の検索を作る処理（生成AIアダプタの RAG。テストで差し替える）。
    source_allowed_dir : Path | None
        埋め込みの学習で `filepath` を読んでよいディレクトリ。

    Returns
    -------
    Workflow
        生成AIアダプタまたは埋め込みアダプタのワークフロー。
    """
    if definition.adapter == ADAPTER_EMBEDDING:
        return EmbeddingWorkflow(definition, source_allowed_dir)
    return GenerativeAiWorkflow(
        definition, chat_runtime_factory, retrieval_runtime_factory
    )


def _template_workflow_factory(
    template: WorkflowTemplate,
    chat_runtime_factory: ChatRuntimeFactory | None,
    retrieval_runtime_factory: Callable[[], CoreRetrievalRuntime] | None,
    source_allowed_dir: Path | None,
) -> Callable[[str], Workflow]:
    """ひな形と接尾辞から、ワークフローを作る関数を返す。

    Parameters
    ----------
    template : WorkflowTemplate
        ひな形。
    chat_runtime_factory : ChatRuntimeFactory | None
        core の chat を作る処理。
    retrieval_runtime_factory : Callable[[], CoreRetrievalRuntime] | None
        core の検索を作る処理。
    source_allowed_dir : Path | None
        埋め込みの学習で `filepath` を読んでよいディレクトリ。

    Returns
    -------
    Callable[[str], Workflow]
        接尾辞を受け取り、その接尾辞を入れた定義のワークフローを作る関数。
    """

    def factory(name: str) -> Workflow:
        """接尾辞を入れた定義から、ワークフローを作る。"""
        return build_workflow(
            template.build_definition(name),
            chat_runtime_factory,
            retrieval_runtime_factory,
            source_allowed_dir,
        )

    return factory


def build_registry(
    config: WorkflowConfig,
    chat_runtime_factory: ChatRuntimeFactory | None = None,
    retrieval_runtime_factory: Callable[[], CoreRetrievalRuntime] | None = None,
    source_allowed_dir: Path | None = None,
) -> WorkflowRegistry:
    """ワークフローの設定から、サービス ID → ワークフローの対応を作る。

    Parameters
    ----------
    config : WorkflowConfig
        ワークフローの設定。
    chat_runtime_factory : ChatRuntimeFactory | None
        core の chat を作る処理（テストでプロバイダを差し替える）。
    retrieval_runtime_factory : Callable[[], CoreRetrievalRuntime] | None
        core の検索を作る処理（テストで DB・プロバイダを差し替える）。
    source_allowed_dir : Path | None
        埋め込みの学習で `filepath` を読んでよいディレクトリ。

    Returns
    -------
    WorkflowRegistry
        サービス ID → ワークフロー（ひな形に当てはまるサービス ID は呼ばれたときに作る）。
    """
    registry = WorkflowRegistry(
        default=build_workflow(
            config.default,
            chat_runtime_factory,
            retrieval_runtime_factory,
            source_allowed_dir,
        ),
        by_service_id={
            service_id: build_workflow(
                definition,
                chat_runtime_factory,
                retrieval_runtime_factory,
                source_allowed_dir,
            )
            for service_id, definition in config.services.items()
        },
    )
    for template in config.templates:
        registry.register_template(
            template.prefix,
            _template_workflow_factory(
                template,
                chat_runtime_factory,
                retrieval_runtime_factory,
                source_allowed_dir,
            ),
        )
    return registry


def create_app(
    settings: Settings | None = None,
    *,
    registry: WorkflowRegistry | None = None,
    chat_runtime_factory: ChatRuntimeFactory | None = None,
    retrieval_runtime_factory: Callable[[], CoreRetrievalRuntime] | None = None,
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
    retrieval_runtime_factory : Callable[[], CoreRetrievalRuntime] | None
        core の検索を作る処理（テストで DB・プロバイダを差し替える）。

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
        registry = build_registry(
            config,
            chat_runtime_factory,
            retrieval_runtime_factory,
            settings.source_allowed_dir,
        )
    session_store = SessionStore(
        idle_timeout_seconds=settings.session_idle_timeout_seconds
    )

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        """終了時に実行中のジョブと、起動した Tika を止める。

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
            try:
                await session_store.close()
            finally:
                # Tika は同じコンテナの子プロセスとして起動している。止めるのは同期の処理
                # （終了を待つ）なので、イベントループを止めないよう別スレッドで行う
                await asyncio.to_thread(shutdown_tika)

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
