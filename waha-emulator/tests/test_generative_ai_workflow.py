import json
from collections.abc import Mapping
from pathlib import Path
from typing import Any

import httpx
import pytest
import respx
from generative_ai_adapter.constants import PropertyIds
from generative_ai_adapter.waha import SKIPPED_FILE_PATH, ColumnData, ColumnType

from tests.conftest import (
    API,
    ScriptedProvider,
    make_settings,
    running_emulator,
    start_session,
    upload,
    wait_for_result,
)
from waha_emulator.sessions import (
    SLOT_ATTACHMENT,
    SLOT_HISTORY,
    SLOT_QUESTION,
    SLOT_TEXTDATA,
    SlotFile,
)
from waha_emulator.workflow_config import (
    ECHO_PROPERTIES,
    NORMAL_CHAT_OUTPUT_TYPE,
    PLAIN_ANSWER_OUTPUT_TYPE,
    RAG_OUTPUT_TYPE,
    WorkflowDefinition,
    parse_workflow_config,
)
from waha_emulator.workflows.base import WorkflowError, WorkflowRequest
from waha_emulator.workflows.generative_ai import (
    ADAPTER_FAILED_PREFIX,
    INDEX_HISTORY,
    INDEX_RAG_JSON,
    INDEX_USER,
    GenerativeAiWorkflow,
    build_adapter_job,
)

QUESTION = "出張旅費の申請方法は？"
AZURE_URL = "https://example.openai.azure.com"
AZURE_MODEL = "gpt-4o"
AZURE_PATH = f"/openai/deployments/{AZURE_MODEL}/chat/completions"
AZURE_API_VERSION = "2025-01-01-preview"
AZURE_API_KEY = "azure-secret"
AZURE_ANSWER = "Azure からの回答です"
ECHO_CHUNK_SIZE = 8
ECHO_PROPERTY_IDS = {
    PropertyIds.VENDOR: "99",
    PropertyIds.URL: ECHO_PROPERTIES["URL"],
    PropertyIds.API_KEY: ECHO_PROPERTIES["API_KEY"],
    PropertyIds.MODEL_NAME: ECHO_PROPERTIES["MODEL_NAME"],
}
RAG_SOURCE_FILE_PATH = "C:\\data\\policies\\travel-expense.md"


def _slot(data: bytes | str, filename: str = "slot.txt") -> SlotFile:
    """入力スロットのファイルを作る。

    Parameters
    ----------
    data : bytes | str
        中身（文字列なら UTF-8 にする）。
    filename : str
        アップロード時のファイル名。

    Returns
    -------
    SlotFile
        スロットのファイル。
    """
    content = data.encode() if isinstance(data, str) else data
    return SlotFile(filename, "text/plain", content)


def _request(
    inputs: Mapping[str, SlotFile],
    params: Mapping[str, str] | None = None,
    stream_allowed_dir: Path | None = None,
) -> WorkflowRequest:
    """ワークフローへの入力を作る。

    Parameters
    ----------
    inputs : Mapping[str, SlotFile]
        入力スロット。
    params : Mapping[str, str] | None
        execute のクエリパラメータ。
    stream_allowed_dir : Path | None
        ストリームファイルを書いてよいディレクトリ。

    Returns
    -------
    WorkflowRequest
        ワークフローへの入力。
    """
    return WorkflowRequest(
        service_id="svc",
        params=params or {},
        inputs=inputs,
        stream=None,
        stream_allowed_dir=stream_allowed_dir,
    )


def _echo_definition(
    output_type: int = NORMAL_CHAT_OUTPUT_TYPE,
    properties: Mapping[int, str] | None = None,
    rag_context_json: str | None = None,
) -> WorkflowDefinition:
    """echo プロバイダで動く定義を作る。

    Parameters
    ----------
    output_type : int
        アダプタの出力モード。
    properties : Mapping[int, str] | None
        echo のプロパティに足すプロパティ。
    rag_context_json : str | None
        RAG Context JSON のパス。

    Returns
    -------
    WorkflowDefinition
        定義。
    """
    merged = {**ECHO_PROPERTY_IDS, **(properties or {})}
    return WorkflowDefinition(output_type, merged, rag_context_json)


def _rag_context_file(directory: Path) -> Path:
    """RAG Context JSON（契約 v1）のファイルを作る。

    Parameters
    ----------
    directory : Path
        置き場所。

    Returns
    -------
    Path
        作ったファイル。
    """
    body = {
        "schemaVersion": 1,
        "query": QUESTION,
        "contexts": [
            {
                "sourceFilePath": RAG_SOURCE_FILE_PATH,
                "sourceRef": "travel-expense-policy",
                "chunkId": "chunk-0003",
                "chunkSequence": 3,
                "content": "出張旅費の申請は、出張終了後5営業日以内に提出する。",
                "score": 0.82,
                "retrievalSignals": {"vector": True, "pgroonga": False, "graph": False},
            }
        ],
    }
    path = directory / "rag-context.json"
    path.write_text(json.dumps(body, ensure_ascii=False), encoding="utf-8")
    return path


def _value(column: ColumnData) -> str:
    """列の値（文字列・FILE のパス）を文字列で取り出す。

    Parameters
    ----------
    column : ColumnData
        列の値。

    Returns
    -------
    str
        文字列。FILE 列ならパス。
    """
    if column.s is not None:
        return column.s
    assert column.b_ary is not None
    return column.b_ary.decode("utf-8")


def _stream_events(path: Path) -> list[dict[str, Any]]:
    """ストリームファイルの `data:` の行を JSON として読む。

    Parameters
    ----------
    path : Path
        ストリームファイル。

    Returns
    -------
    list[dict[str, Any]]
        イベントの一覧。
    """
    events: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        assert line.startswith("data:")
        events.append(json.loads(line.removeprefix("data:")))
    return events


def _azure_definition() -> WorkflowDefinition:
    """Azure OpenAI に接続する定義を作る。

    Returns
    -------
    WorkflowDefinition
        定義。
    """
    config = parse_workflow_config(
        {
            "default": {
                "properties": {
                    "VENDOR": "AzureOpenAI",
                    "URL": AZURE_URL,
                    "API_KEY": AZURE_API_KEY,
                    "MODEL_NAME": AZURE_MODEL,
                }
            }
        }
    )
    return config.default


def test_build_adapter_job_maps_question_to_char_column(tmp_path: Path) -> None:
    """question が index 0 の文字列の列になり、添付と履歴は null になること"""
    job = build_adapter_job(
        _echo_definition(), _request({SLOT_QUESTION: _slot(QUESTION)}), tmp_path
    )

    assert [(c.index, c.col_type) for c in job.columns] == [
        (INDEX_USER, ColumnType.CHAR),
        (INDEX_USER, ColumnType.FILE),
        (INDEX_HISTORY, ColumnType.FILE),
    ]
    assert _value(job.record[0]) == QUESTION
    assert _value(job.record[1]) == SKIPPED_FILE_PATH
    assert _value(job.record[2]) == SKIPPED_FILE_PATH
    assert job.properties[PropertyIds.OUTPUT_DIR] == str(tmp_path)


def test_build_adapter_job_writes_attachment_for_normal_chat(tmp_path: Path) -> None:
    """通常 chat の添付が job_dir に書かれ、index 0 の FILE 列のパスになること"""
    inputs = {
        SLOT_QUESTION: _slot(QUESTION),
        SLOT_ATTACHMENT: _slot(b"attached", "../evil/memo.txt"),
    }

    job = build_adapter_job(_echo_definition(), _request(inputs), tmp_path)

    attachment = Path(str(_value(job.record[1])))
    assert attachment == tmp_path / "memo.txt"
    assert attachment.read_bytes() == b"attached"


def test_build_adapter_job_omits_attachment_column_for_rag(tmp_path: Path) -> None:
    """RAG は添付の列を持たず、ragContextJson が index 6 の FILE 列になること"""
    inputs = {
        SLOT_QUESTION: _slot(QUESTION),
        SLOT_ATTACHMENT: _slot(b"attached"),
    }
    definition = _echo_definition(RAG_OUTPUT_TYPE, rag_context_json="ctx.json")

    job = build_adapter_job(definition, _request(inputs), tmp_path)

    assert [(c.index, c.col_type) for c in job.columns] == [
        (INDEX_USER, ColumnType.CHAR),
        (INDEX_HISTORY, ColumnType.FILE),
        (INDEX_RAG_JSON, ColumnType.FILE),
    ]
    assert _value(job.record[1]) == SKIPPED_FILE_PATH
    assert _value(job.record[2]) == "ctx.json"
    assert list(tmp_path.iterdir()) == []


def test_build_adapter_job_rag_without_context_json_is_skipped(
    tmp_path: Path,
) -> None:
    """RAG で ragContextJson がなければ index 6 が null になること"""
    job = build_adapter_job(
        _echo_definition(RAG_OUTPUT_TYPE),
        _request({SLOT_QUESTION: _slot(QUESTION)}),
        tmp_path,
    )

    assert _value(job.record[-1]) == SKIPPED_FILE_PATH


def test_build_adapter_job_ignores_rag_context_json_for_normal_chat(
    tmp_path: Path,
) -> None:
    """通常 chat では ragContextJson があっても index 6 の列を作らないこと"""
    definition = _echo_definition(NORMAL_CHAT_OUTPUT_TYPE, rag_context_json="ctx.json")

    job = build_adapter_job(
        definition, _request({SLOT_QUESTION: _slot(QUESTION)}), tmp_path
    )

    assert INDEX_RAG_JSON not in [c.index for c in job.columns]


def test_build_adapter_job_writes_history_file(tmp_path: Path) -> None:
    """history が job_dir に書かれ、index 4 の FILE 列のパスになること"""
    inputs = {SLOT_QUESTION: _slot(QUESTION), SLOT_HISTORY: _slot(b"[]")}

    job = build_adapter_job(_echo_definition(), _request(inputs), tmp_path)

    history = Path(str(_value(job.record[-1])))
    assert job.columns[-1].index == INDEX_HISTORY
    assert history.parent == tmp_path
    assert history.read_bytes() == b"[]"


def test_build_adapter_job_maps_textdata_and_stream_path(tmp_path: Path) -> None:
    """textdata がプロパティ 43 のファイル、streamfilepath がプロパティ 42 になること"""
    inputs = {
        SLOT_QUESTION: _slot(QUESTION),
        SLOT_TEXTDATA: _slot(b'{"k":"v"}'),
    }
    request = _request(inputs, {"streamfilepath": "/shared/stream.txt"})

    job = build_adapter_job(_echo_definition(), request, tmp_path)

    text_data_path = Path(job.properties[PropertyIds.TEXT_DATA_JSON_FILE_PATH])
    assert text_data_path.parent == tmp_path
    assert text_data_path.read_bytes() == b'{"k":"v"}'
    assert job.properties[PropertyIds.REASONING_OUTPUT_PATH] == "/shared/stream.txt"


def test_build_adapter_job_without_stream_path_leaves_property_unset(
    tmp_path: Path,
) -> None:
    """streamfilepath がなければプロパティ 42 が設定されないこと"""
    job = build_adapter_job(
        _echo_definition(), _request({SLOT_QUESTION: _slot(QUESTION)}), tmp_path
    )

    assert PropertyIds.REASONING_OUTPUT_PATH not in job.properties
    assert PropertyIds.TEXT_DATA_JSON_FILE_PATH not in job.properties


def test_build_adapter_job_rejects_text_data_stream_outside_allowed_dir(
    tmp_path: Path,
) -> None:
    """textData の streamfilepath が許可ディレクトリの外なら WorkflowError になること"""
    allowed = tmp_path / "allowed"
    allowed.mkdir()
    outside = tmp_path / "outside.txt"
    text_data = json.dumps({"streamfilepath": str(outside)})
    inputs = {SLOT_QUESTION: _slot(QUESTION), SLOT_TEXTDATA: _slot(text_data)}
    job_dir = tmp_path / "job"
    job_dir.mkdir()

    with pytest.raises(WorkflowError, match="許可されたディレクトリの外"):
        build_adapter_job(
            _echo_definition(), _request(inputs, stream_allowed_dir=allowed), job_dir
        )


def test_build_adapter_job_accepts_text_data_stream_inside_allowed_dir(
    tmp_path: Path,
) -> None:
    """textData の streamfilepath が許可ディレクトリの中ならエラーにならないこと"""
    allowed = tmp_path / "allowed"
    allowed.mkdir()
    text_data = json.dumps({"streamfilepath": str(allowed / "stream.txt")})
    inputs = {SLOT_QUESTION: _slot(QUESTION), SLOT_TEXTDATA: _slot(text_data)}
    job_dir = tmp_path / "job"
    job_dir.mkdir()

    job = build_adapter_job(
        _echo_definition(), _request(inputs, stream_allowed_dir=allowed), job_dir
    )

    assert PropertyIds.TEXT_DATA_JSON_FILE_PATH in job.properties


def test_build_adapter_job_requires_question(tmp_path: Path) -> None:
    """question がなければ WorkflowError になること"""
    with pytest.raises(WorkflowError, match="question がありません"):
        build_adapter_job(_echo_definition(), _request({}), tmp_path)


def test_build_adapter_job_rejects_non_utf8_question(tmp_path: Path) -> None:
    """question が UTF-8 でなければ WorkflowError になること"""
    inputs = {SLOT_QUESTION: _slot(b"\xff\xfe\x00")}

    with pytest.raises(WorkflowError, match="UTF-8 ではありません"):
        build_adapter_job(_echo_definition(), _request(inputs), tmp_path)


async def test_run_echo_chat_outputs_answer_json() -> None:
    """echo の通常 chat が質問をそのまま回答にした出力 JSON を返すこと"""
    workflow = GenerativeAiWorkflow(_echo_definition())

    output = await workflow.run(_request({SLOT_QUESTION: _slot(QUESTION)}))

    assert json.loads(output) == {
        "answer": QUESTION,
        "filepaths": [],
        "references": [],
        "imageExplanations": [],
    }


async def test_run_passes_history_to_provider() -> None:
    """history の会話履歴が質問より前のメッセージとしてプロバイダに渡ること"""
    provider = ScriptedProvider()
    history = [
        {"role": "user", "content": "前の質問"},
        {"role": "assistant", "content": "前の回答"},
    ]
    inputs = {
        SLOT_QUESTION: _slot(QUESTION),
        SLOT_HISTORY: _slot(json.dumps(history, ensure_ascii=False)),
    }
    workflow = GenerativeAiWorkflow(_echo_definition(), provider.chat_runtime_factory)

    output = await workflow.run(_request(inputs))

    assert json.loads(output)["answer"] == provider.answer
    [received] = provider.received
    texts = [str(message) for message in received.messages]
    assert len(texts) >= len(history) + 1
    assert "前の質問" in texts[0]
    assert "前の回答" in texts[1]
    assert QUESTION in texts[-1]


async def test_run_plain_answer_output_type_returns_text() -> None:
    """出力モード 2 は JSON ではなく回答の本文だけを返すこと"""
    workflow = GenerativeAiWorkflow(_echo_definition(PLAIN_ANSWER_OUTPUT_TYPE))

    output = await workflow.run(_request({SLOT_QUESTION: _slot(QUESTION)}))

    assert output == QUESTION


async def test_run_rag_references_all_contexts(tmp_path: Path) -> None:
    """RAG Context JSON の contexts がすべて参照になり、出力に references が入ること"""
    context_file = _rag_context_file(tmp_path)
    definition = _echo_definition(
        RAG_OUTPUT_TYPE,
        {PropertyIds.RAG_CONTEXT_JSON_ALLOW_ROOT: str(tmp_path)},
        rag_context_json=str(context_file),
    )
    workflow = GenerativeAiWorkflow(definition)

    output = await workflow.run(_request({SLOT_QUESTION: _slot(QUESTION)}))

    body = json.loads(output)
    assert body["answer"].endswith(QUESTION)
    assert body["filepaths"] == [RAG_SOURCE_FILE_PATH]
    [reference] = body["references"]
    assert "RAG_CONTEXT_BEGIN id=chunk-0003" in reference["content"]
    assert "出張旅費の申請は" in reference["content"]


async def test_run_rag_with_context_outside_allow_root_fails(
    tmp_path: Path,
) -> None:
    """許可ルートの外の RAG Context JSON はアダプタの失敗として WorkflowError になること"""
    allowed = tmp_path / "allowed"
    allowed.mkdir()
    context_file = _rag_context_file(tmp_path)
    definition = _echo_definition(
        RAG_OUTPUT_TYPE,
        {PropertyIds.RAG_CONTEXT_JSON_ALLOW_ROOT: str(allowed)},
        rag_context_json=str(context_file),
    )
    workflow = GenerativeAiWorkflow(definition)

    with pytest.raises(WorkflowError, match=ADAPTER_FAILED_PREFIX):
        await workflow.run(_request({SLOT_QUESTION: _slot(QUESTION)}))


async def test_run_adapter_failure_raises_workflow_error() -> None:
    """プロバイダが失敗すると「生成AIアダプタの実行に失敗しました」で始まる WorkflowError になること"""
    provider = ScriptedProvider(error=RuntimeError("boom"))
    workflow = GenerativeAiWorkflow(_echo_definition(), provider.chat_runtime_factory)

    with pytest.raises(WorkflowError) as exc_info:
        await workflow.run(_request({SLOT_QUESTION: _slot(QUESTION)}))

    assert str(exc_info.value).startswith("生成AIアダプタの実行に失敗しました")


async def test_run_writes_reasoning_deltas_to_stream_file(tmp_path: Path) -> None:
    """アダプタが推論の差分を `reasoning_delta` の行としてストリームファイルに追記すること"""
    stream_file = tmp_path / "stream.txt"
    stream_file.touch()
    workflow = GenerativeAiWorkflow(_echo_definition())

    await workflow.run(
        _request({SLOT_QUESTION: _slot(QUESTION)}, {"streamfilepath": str(stream_file)})
    )

    events = _stream_events(stream_file)
    assert events
    assert {event["type"] for event in events} == {"reasoning_delta"}
    assert "".join(event["text"] for event in events) == QUESTION
    assert all(len(event["text"]) <= ECHO_CHUNK_SIZE for event in events)


async def test_run_azure_openai_calls_deployment_endpoint() -> None:
    """Azure OpenAI の deployments エンドポイントを api-key 付きで呼び、回答が出力に入ること"""
    workflow = GenerativeAiWorkflow(_azure_definition())
    completion = {
        "id": "chatcmpl-1",
        "object": "chat.completion",
        "choices": [
            {
                "index": 0,
                "finish_reason": "stop",
                "message": {"role": "assistant", "content": AZURE_ANSWER},
            }
        ],
    }
    with respx.mock(assert_all_called=True) as router:
        route = router.post(f"{AZURE_URL}{AZURE_PATH}").mock(
            return_value=httpx.Response(200, json=completion)
        )

        output = await workflow.run(_request({SLOT_QUESTION: _slot(QUESTION)}))

    [call] = route.calls
    assert call.request.url.path == AZURE_PATH
    assert call.request.url.params["api-version"] == AZURE_API_VERSION
    assert call.request.headers["api-key"] == AZURE_API_KEY
    assert json.loads(output)["answer"] == AZURE_ANSWER


async def test_execute_streams_reasoning_deltas_then_completed(
    tmp_path: Path,
) -> None:
    """execute 経由で、ストリームファイルに reasoning_delta の行の後に completed が書かれること"""
    stream_file = tmp_path / "stream.txt"
    stream_file.touch()
    async with running_emulator() as (_, client):
        session_id = await start_session(client)
        await upload(client, session_id, "question", QUESTION.encode())

        response = await client.get(
            f"{API}/execute/svc",
            params={"sessionid": session_id, "streamfilepath": str(stream_file)},
        )

    assert response.text == "SUCCESS"
    events = _stream_events(stream_file)
    types = [event["type"] for event in events]
    assert types[-1] == "completed"
    assert set(types[:-1]) == {"reasoning_delta"}
    assert "".join(e["text"] for e in events[:-1]) == QUESTION


async def test_execute_routes_service_ids_to_their_definitions(
    tmp_path: Path,
) -> None:
    """登録したサービス ID は専用の定義、それ以外は default の定義で動くこと"""
    workflows_file = tmp_path / "workflows.json"
    workflows_file.write_text(
        json.dumps(
            {
                "default": {"properties": dict(ECHO_PROPERTIES)},
                "services": {
                    "plain": {
                        "outputType": PLAIN_ANSWER_OUTPUT_TYPE,
                        "properties": dict(ECHO_PROPERTIES),
                    }
                },
            }
        ),
        encoding="utf-8",
    )
    settings = make_settings(WAHA_WORKFLOWS_FILE=str(workflows_file))
    outputs: dict[str, str] = {}
    async with running_emulator(settings) as (_, client):
        for service_id in ("plain", "other"):
            session_id = await start_session(client)
            await upload(client, session_id, "question", QUESTION.encode())
            response = await client.get(
                f"{API}/execute/{service_id}", params={"sessionid": session_id}
            )
            assert response.text == "SUCCESS"
            assert await wait_for_result(client, session_id) == "SUCCESS"
            download = await client.get(
                f"{API}/download/outputfile", params={"sessionid": session_id}
            )
            outputs[service_id] = download.text

    assert outputs["plain"] == QUESTION
    assert json.loads(outputs["other"])["answer"] == QUESTION
