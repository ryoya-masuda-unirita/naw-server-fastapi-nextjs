"""App の RAG Context JSON パスの列（index 6）のテスト。

移植元: RagContextJsonAppColumnInputTest。

- 移植元は RequestSchemaFactory・GenerativeAiController を Mockito で差し替える。Python では
  プロバイダを `chat_runtime_factory` で差し替え（実際の LLM に接続しない）、
  `RequestSchemaFactory.create_request_schema_with_context` と
  `GenerativeAiController.execute_llm_with_context` を monkeypatch で記録に置き換える
- Waha! のバイト列のレコード（ByteArrayUtil）は ColumnData の列で渡す
"""

from collections.abc import Callable, Sequence
from pathlib import Path
from typing import Any

import pytest
from generative_ai_adapter.app import App
from generative_ai_adapter.constants import PropertyIds
from generative_ai_adapter.controller import GenerativeAiController
from generative_ai_adapter.domain import ChatGPTParameter, RequestSchema
from generative_ai_adapter.request_schema_factory import RequestSchemaFactory
from generative_ai_adapter.waha import ColumnData, ColumnInformation, ColumnType
from generative_ai_core.chat.models import CoreChatResult, CoreRagRequest
from generative_ai_core.chat.runtime import CoreChatRuntime

RAG_OUTPUT_MODE = 1
OUTPUT_DIR = "outputDir"
VIEW_NAME = "testViewName"
OUTPUT_PATH = f"{OUTPUT_DIR}/{VIEW_NAME}"


def _valid_json(content: str) -> str:
    """sourceFilePath 付きのコンテキスト 1 件の JSON を作る。

    Parameters
    ----------
    content : str
        content の値。

    Returns
    -------
    str
        RAG Context JSON。
    """
    return (
        '{"schemaVersion":1,"contexts":[{"sourceFilePath":"/safe/source-a.txt",\n'
        f'"sourceRef":"source-a","chunkId":"chunk-a","content":"{content}",'
        '"score":0.9,\n'
        '"retrievalSignals":{"vector":true,"pgroonga":false,"graph":false}}]}\n'
    )


class _Recorder:
    """factory・controller の呼び出しを記録する（移植元の Mockito の verify の代わり）。"""

    def __init__(self, legacy_schema: RequestSchema | None = None) -> None:
        """記録を空にする。

        Parameters
        ----------
        legacy_schema : RequestSchema | None, optional
            旧経路の factory が返すリクエスト。None なら本物の factory を呼ぶ。
        """
        self.legacy_schema = legacy_schema
        self.factory_calls: list[tuple[Any, ...]] = []
        self.executions: list[tuple[RequestSchema, str]] = []

    def install(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """factory の旧経路と controller の RAG 実行を記録に置き換える。

        Parameters
        ----------
        monkeypatch : pytest.MonkeyPatch
            置き換えに使う monkeypatch。
        """
        recorder = self

        def create_with_context(
            factory: RequestSchemaFactory,
            model: str | None,
            column_data: Sequence[ColumnData],
            column_information: Sequence[ColumnInformation],
            parameter: ChatGPTParameter,
        ) -> RequestSchema:
            """呼び出しを記録し、決まったリクエストを返す。

            Parameters
            ----------
            factory : RequestSchemaFactory
                factory（使わない）。
            model : str | None
                モデル名。
            column_data : Sequence[ColumnData]
                列の値。
            column_information : Sequence[ColumnInformation]
                列の定義。
            parameter : ChatGPTParameter
                生成パラメータ。

            Returns
            -------
            RequestSchema
                旧経路のリクエスト。
            """
            recorder.factory_calls.append(
                (model, column_data, column_information, parameter)
            )
            return recorder.legacy_schema or RequestSchema()

        def execute_with_context(
            controller: GenerativeAiController, schema: RequestSchema, output_path: str
        ) -> None:
            """RAG の実行を記録する（移植元の doNothing）。

            Parameters
            ----------
            controller : GenerativeAiController
                controller（使わない）。
            schema : RequestSchema
                リクエスト。
            output_path : str
                出力ファイルのパス。
            """
            recorder.executions.append((schema, output_path))

        monkeypatch.setattr(
            RequestSchemaFactory,
            "create_request_schema_with_context",
            create_with_context,
        )
        monkeypatch.setattr(
            GenerativeAiController, "execute_llm_with_context", execute_with_context
        )


@pytest.fixture
def app(
    make_runtime_factory: Callable[..., Any],
    rag_runtime: Callable[..., CoreChatRuntime],
    json_answer: Callable[[str], CoreChatResult],
) -> App:
    """プロバイダを差し替えた App を作る（OpenAI の資格情報を入れる）。

    Parameters
    ----------
    make_runtime_factory : Callable[..., Any]
        runtime から工場を作る関数。
    rag_runtime : Callable[..., CoreChatRuntime]
        RAG の runtime を作る関数。
    json_answer : Callable[[str], CoreChatResult]
        成功結果を作る関数。

    Returns
    -------
    App
        作った App。
    """
    captured: list[CoreRagRequest] = []
    runtime = rag_runtime(captured, json_answer("unused"))
    created = App(chat_runtime_factory=make_runtime_factory(runtime))
    # controller を作るのに必要な資格情報（移植元は controller をモックにするため不要）
    created.set_property(PropertyIds.URL, "https://provider.example.invalid")
    created.set_property(PropertyIds.API_KEY, "controlled-credential")
    created.set_property(PropertyIds.VENDOR, "0")
    return created


def test_file_role_builds_rag_context_json_schema_without_legacy_factory(
    app: App, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """index 6 のファイルから RAG Context JSON のリクエストを作り、旧経路を使わないこと"""
    allowed = tmp_path / "allowed"
    allowed.mkdir()
    json_file = allowed / "ctx.json"
    json_file.write_text(_valid_json("path body"), encoding="utf-8")
    recorder = _Recorder()
    recorder.install(monkeypatch)

    app.set_property(PropertyIds.MODEL_NAME, "test-model")
    app.set_property(PropertyIds.OUTPUT_DIR, OUTPUT_DIR)
    app.set_property(PropertyIds.RAG_CONTEXT_JSON_ALLOW_ROOT, str(allowed))
    app.set_view_name(VIEW_NAME)
    app.set_column_information(
        [
            ColumnInformation("ユーザー", ColumnType.CHAR, 0),
            ColumnInformation("RAG Context JSONパス", ColumnType.FILE, 6),
        ]
    )
    app.connect(RAG_OUTPUT_MODE)
    app.before_execute()

    app.write([ColumnData.char("question"), ColumnData.file(str(json_file))])

    assert len(recorder.executions) == 1
    schema, output_path = recorder.executions[0]
    assert output_path == OUTPUT_PATH
    assert recorder.factory_calls == []
    assert schema.user_question == "question"
    assert schema.retrieval_contexts is not None
    assert len(schema.retrieval_contexts) == 1
    context = schema.retrieval_contexts[0].context
    assert context is not None
    assert "CONTENT: path body" in context


def test_legacy_context_columns_still_use_request_schema_factory(
    app: App, monkeypatch: pytest.MonkeyPatch
) -> None:
    """index 6 の列がなければ旧経路（index 3・5）の factory を使うこと"""
    legacy_schema = RequestSchema()
    recorder = _Recorder(legacy_schema)
    recorder.install(monkeypatch)

    app.set_property(PropertyIds.MODEL_NAME, "test-model")
    app.set_property(PropertyIds.OUTPUT_DIR, OUTPUT_DIR)
    app.set_view_name(VIEW_NAME)
    app.set_column_information(
        [
            ColumnInformation("ユーザー", ColumnType.CHAR, 0),
            ColumnInformation("ファイルパス", ColumnType.CHAR, 3),
            ColumnInformation("コンテクスト", ColumnType.CHAR, 5),
        ]
    )
    app.connect(RAG_OUTPUT_MODE)
    app.before_execute()

    app.write(
        [
            ColumnData.char("question"),
            ColumnData.char("/legacy/source.txt"),
            ColumnData.char("plain legacy context"),
        ]
    )

    assert len(recorder.factory_calls) == 1
    assert len(recorder.executions) == 1
    assert recorder.executions[0][0] is legacy_schema
    assert recorder.executions[0][1] == OUTPUT_PATH


def test_null_file_path_sentinel_uses_legacy_request_schema_factory(
    app: App, monkeypatch: pytest.MonkeyPatch
) -> None:
    """index 6 の値が `null` なら旧経路の factory を使うこと"""
    legacy_schema = RequestSchema()
    recorder = _Recorder(legacy_schema)
    recorder.install(monkeypatch)

    app.set_property(PropertyIds.MODEL_NAME, "test-model")
    app.set_property(PropertyIds.OUTPUT_DIR, OUTPUT_DIR)
    app.set_view_name(VIEW_NAME)
    app.set_column_information(
        [
            ColumnInformation("ユーザー", ColumnType.CHAR, 0),
            ColumnInformation("RAG Context JSONパス", ColumnType.FILE, 6),
        ]
    )
    app.connect(RAG_OUTPUT_MODE)
    app.before_execute()

    app.write([ColumnData.char("question"), ColumnData.file("null")])

    assert len(recorder.factory_calls) == 1
    assert len(recorder.executions) == 1
    assert recorder.executions[0][0] is legacy_schema
    assert recorder.executions[0][1] == OUTPUT_PATH


def test_rag_context_json_path_role_must_be_file_column() -> None:
    """index 6 の列は FILE でなければならないこと"""
    invalid = ColumnInformation("RAG Context JSONパス", ColumnType.CHAR, 6)

    with pytest.raises(RuntimeError) as error:
        App().validate_column_information(invalid)

    assert "RAG Context JSONパス" in str(error.value)
    assert "[FILE]" in str(error.value)
