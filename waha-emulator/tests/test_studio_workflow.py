"""保存したワークフロー（ノードと線）を、server-local と同じ execute の経路で動かすテスト。"""

import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

import httpx

from tests.conftest import (
    API,
    ScriptedProvider,
    make_settings,
    running_emulator,
    start_session,
    upload,
)
from tests.studio_support import flow_data, graph_data
from tests.test_retrieval_workflow import FakeSearchClient, _runtime_factory
from tests.test_studio_engine import SequenceProvider
from waha_emulator.main import create_app
from waha_emulator.studio.graph import compile_graph, parse_graph
from waha_emulator.studio.graph_workflow import GraphWorkflow
from waha_emulator.workflows.base import WorkflowError, WorkflowRequest
from waha_emulator.workflows.generative_ai import RETRIEVAL_OUTPUT_MISSING_MESSAGE
from waha_emulator.workflows.registry import WorkflowRegistry

ADMIN = "/admin/workflows"
QUESTION = "出張旅費の精算期限は？"


class _ConfigWorkflow:
    """設定ファイルの定義の代わりに置く、決まった文字列を返すワークフロー。"""

    async def run(self, request: object) -> str:
        """決まった文字列を返す。

        Parameters
        ----------
        request : object
            使わない。

        Returns
        -------
        str
            設定ファイルの定義が動いたことを示す文字列。
        """
        return "from-config"


async def _ask(client: httpx.AsyncClient, service_id: str) -> tuple[str, str]:
    """質問を入れて execute し、result と outputfile を返す。

    Parameters
    ----------
    client : httpx.AsyncClient
        エミュレーターのクライアント。
    service_id : str
        execute のサービス ID。

    Returns
    -------
    tuple[str, str]
        execute の応答（完了まで待つ）と、outputfile の中身。
    """
    session_id = await start_session(client)
    await upload(client, session_id, "question", QUESTION.encode())
    executed = await client.get(
        f"{API}/execute/{service_id}", params={"sessionid": session_id}
    )
    output = await client.get(
        f"{API}/download/outputfile", params={"sessionid": session_id}
    )
    return executed.text, output.text


async def test_execute_runs_saved_workflow(tmp_path: Path) -> None:
    """保存したワークフローのサービス ID で execute すると、その回答が outputfile で返ること"""
    provider = ScriptedProvider()
    settings = make_settings(WAHA_STUDIO_DIR=str(tmp_path))
    async with running_emulator(settings, provider=provider) as (_, client):
        await client.post(ADMIN, json=graph_data("wf-1", service_ids=["assistant-1"]))

        executed, output = await _ask(client, "assistant-1")

    assert executed == "SUCCESS"
    assert json.loads(output)["answer"] == provider.answer
    assert provider.received[0].last_user_text() == QUESTION


async def test_execute_reflects_update_and_delete_without_restart(
    tmp_path: Path,
) -> None:
    """更新・削除が、再起動なしで execute に反映され、削除後は既定のワークフローに戻ること"""
    registry = WorkflowRegistry(_ConfigWorkflow())
    provider = ScriptedProvider()
    settings = make_settings(WAHA_STUDIO_DIR=str(tmp_path))
    async with running_emulator(settings, provider=provider, registry=registry) as (
        _,
        client,
    ):
        await client.post(ADMIN, json=graph_data("wf-1", service_ids=["old"]))
        await client.put(f"{ADMIN}/wf-1", json=graph_data("wf-1", service_ids=["new"]))
        _, old_output = await _ask(client, "old")
        _, new_output = await _ask(client, "new")
        await client.delete(f"{ADMIN}/wf-1")
        _, deleted_output = await _ask(client, "new")

    assert old_output == "from-config"
    assert json.loads(new_output)["answer"] == provider.answer
    assert deleted_output == "from-config"


async def test_saved_workflow_takes_precedence_over_config(tmp_path: Path) -> None:
    """設定ファイルの定義と同じサービス ID を保存すると、保存したワークフローが動き、削除すると設定ファイルの定義に戻ること"""
    registry = WorkflowRegistry(_ConfigWorkflow(), {"svc": _ConfigWorkflow()})
    provider = ScriptedProvider()
    settings = make_settings(WAHA_STUDIO_DIR=str(tmp_path))
    async with running_emulator(settings, provider=provider, registry=registry) as (
        _,
        client,
    ):
        before, _ = await _ask(client, "svc")
        await client.post(ADMIN, json=graph_data("wf-1", service_ids=["svc"]))
        saved, saved_output = await _ask(client, "svc")
        await client.delete(f"{ADMIN}/wf-1")
        after, after_output = await _ask(client, "svc")

    assert before == "SUCCESS"
    assert json.loads(saved_output)["answer"] == provider.answer
    assert saved == "SUCCESS"
    assert after_output == "from-config"
    assert after == "SUCCESS"


async def test_saved_workflows_survive_restart(tmp_path: Path) -> None:
    """再起動しても、保存したワークフローが execute で動くこと"""
    settings = make_settings(WAHA_STUDIO_DIR=str(tmp_path))
    async with running_emulator(settings) as (_, client):
        await client.post(ADMIN, json=graph_data("wf-1", service_ids=["svc"]))

    provider = ScriptedProvider()
    async with running_emulator(settings, provider=provider) as (_, client):
        executed, output = await _ask(client, "svc")

    assert executed == "SUCCESS"
    assert json.loads(output)["answer"] == provider.answer


@asynccontextmanager
async def _emulator_with_retrieval(
    tmp_path: Path, provider: ScriptedProvider, search: FakeSearchClient
) -> AsyncIterator[httpx.AsyncClient]:
    """偽の検索・偽のプロバイダで動くエミュレーターを起動する。

    Parameters
    ----------
    tmp_path : Path
        ワークフローの保存先。
    provider : ScriptedProvider
        偽のプロバイダ。
    search : FakeSearchClient
        偽のベクトル検索。

    Yields
    ------
    httpx.AsyncClient
        クライアント。
    """
    app = create_app(
        make_settings(WAHA_STUDIO_DIR=str(tmp_path)),
        chat_runtime_factory=provider.chat_runtime_factory,
        retrieval_runtime_factory=_runtime_factory(search),
    )
    try:
        async with app.router.lifespan_context(app):
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(
                transport=transport, base_url="http://waha.test"
            ) as client:
                yield client
    finally:
        provider.release()


async def test_execute_runs_retrieval_then_generative_ai(tmp_path: Path) -> None:
    """検索ノードのあるワークフローが、検索 → 生成AI の順に動き、引用資料が回答に付くこと"""
    provider = ScriptedProvider()
    search = FakeSearchClient()
    async with _emulator_with_retrieval(tmp_path, provider, search) as client:
        created = await client.post(
            ADMIN, json=graph_data("rag", retrieval=True, service_ids=["rag-svc"])
        )
        executed, output = await _ask(client, "rag-svc")

    assert created.status_code == 201
    assert executed == "SUCCESS"
    assert len(search.calls) == 1
    answer = json.loads(output)
    assert answer["answer"] == provider.answer
    assert answer["references"]


async def test_execute_failure_prefixes_generative_ai_node_name(
    tmp_path: Path,
) -> None:
    """生成AI の失敗理由に、ノードの名前が付くこと"""
    provider = ScriptedProvider(reasoning=[], error=RuntimeError("boom"))
    settings = make_settings(WAHA_STUDIO_DIR=str(tmp_path))
    async with running_emulator(settings, provider=provider) as (_, client):
        await client.post(ADMIN, json=graph_data("wf-1", service_ids=["svc"]))

        executed, _ = await _ask(client, "svc")

    assert executed.startswith(
        "FAILURE: ノード「生成AI」: 生成AIアダプタの実行に失敗しました"
    )


async def test_execute_failure_prefixes_retrieval_node_name(tmp_path: Path) -> None:
    """検索の失敗理由に、検索ノードの名前が付くこと"""
    provider = ScriptedProvider()

    class _Broken(FakeSearchClient):
        """検索で失敗する偽の DB。"""

        def search(self, *args: object, **kwargs: object) -> list:  # type: ignore[type-arg]
            """必ず失敗する。

            Parameters
            ----------
            *args : object
                使わない。
            **kwargs : object
                使わない。

            Raises
            ------
            RuntimeError
                常に。
            """
            raise RuntimeError("db down")

    async with _emulator_with_retrieval(tmp_path, provider, _Broken()) as client:
        await client.post(
            ADMIN, json=graph_data("rag", retrieval=True, service_ids=["rag-svc"])
        )
        executed, _ = await _ask(client, "rag-svc")

    assert executed.startswith(
        "FAILURE: ノード「検索」: 検索アダプタの実行に失敗しました"
    )


async def test_retrieval_output_missing_is_attributed_to_retrieval_node() -> None:
    """検索アダプターが出力を書かなかった失敗は、検索ノードの名前が付くこと"""

    class _Failing:
        """検索の出力がないという失敗を投げる。"""

        async def run(self, request: WorkflowRequest) -> str:
            """必ず失敗する。

            Parameters
            ----------
            request : WorkflowRequest
                使わない。

            Raises
            ------
            WorkflowError
                常に。
            """
            raise WorkflowError(RETRIEVAL_OUTPUT_MISSING_MESSAGE)

    graph = parse_graph(graph_data("rag", retrieval=True))
    workflow = GraphWorkflow(graph, compile_graph(graph, {}))
    workflow._workflow = _Failing()  # type: ignore[assignment]

    try:
        await workflow.run(
            WorkflowRequest(service_id="rag", params={}, inputs={}, stream=None)
        )
    except WorkflowError as e:
        assert str(e) == f"ノード「検索」: {RETRIEVAL_OUTPUT_MISSING_MESSAGE}"
    else:
        raise AssertionError("WorkflowError が起きませんでした")


async def test_execute_runs_saved_flow_workflow_with_two_llm_calls(
    tmp_path: Path,
) -> None:
    """保存した版 2（推敲）を、server-local と同じ execute で動かすと、2 回目のプロンプトに 1 回目の回答が入り、最終回答が返ること"""
    provider = SequenceProvider(answers=["下書きの本文", "推敲した回答"])
    settings = make_settings(WAHA_STUDIO_DIR=str(tmp_path))
    async with running_emulator(settings, provider=provider) as (_, client):
        created = await client.post(
            ADMIN, json=flow_data("polish", service_ids=["polish-svc"])
        )
        executed, output = await _ask(client, "polish-svc")

    assert created.status_code == 201
    assert executed == "SUCCESS"
    assert json.loads(output)["answer"] == "推敲した回答"
    first, second = provider.received
    assert first.last_user_text() == f"{QUESTION} に回答してください"
    assert "下書きの本文" in second.last_user_text()


async def test_execute_flow_failure_names_the_failed_node(tmp_path: Path) -> None:
    """版 2 の生成AI が失敗したとき、失敗理由に、ノードの名前が付くこと"""
    provider = ScriptedProvider(reasoning=[], error=RuntimeError("boom"))
    settings = make_settings(WAHA_STUDIO_DIR=str(tmp_path))
    async with running_emulator(settings, provider=provider) as (_, client):
        await client.post(ADMIN, json=flow_data("polish", service_ids=["polish-svc"]))

        executed, _ = await _ask(client, "polish-svc")

    assert executed.startswith(
        "FAILURE: ノード「下書き」: 生成AIアダプタの実行に失敗しました"
    )
