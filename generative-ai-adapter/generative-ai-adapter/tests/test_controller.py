"""GenerativeAiController の chat・RAG の実行と出力の書き込みを確かめる。

移植元: controller/GenerativeAiControllerTest。

- testTestConnect（HttpUtil での接続テスト）・testCheckException（HTTP の応答の
  エラー判定）は、HttpUtil を移植していないため移植しない
- 移植元の「runtime と mapper を注入するコンストラクタ」は、Python では
  `chat_runtime_factory` で runtime を差し替える（mapper は設定から作る）
- testWriteResponseToText は Files.write のモックの代わりに、実際のファイルに書いて確かめる
"""

from collections.abc import Callable
from pathlib import Path
from typing import cast

import pytest
from generative_ai_adapter.controller import (
    GenerativeAiController,
    make_exception_message,
)
from generative_ai_adapter.domain import (
    AccessCredential,
    ImageExplanation,
    Message,
    ProxySetting,
    RagInputDeficiency,
    RequestSchema,
    RetrievalContext,
)
from generative_ai_core.chat.models import (
    CoreChatRequest,
    CoreChatResult,
    CoreRagRequest,
    OutputModeHint,
)
from generative_ai_core.chat.runtime import CoreChatRuntime
from generative_ai_core.failure import CoreFailure
from generative_ai_core.provider.model import Capability
from generative_ai_core.provider.runtime import CoreProviderRuntime, ExecutionContext

PROVIDER_ID = "OpenAI"
NO_ANSWER_MESSAGE = (
    "提供された情報からは答えが分かりませんでした。別の情報媒体で調べてみてください。"
)
MAX_EXCEPTION_MESSAGE_LENGTH = 512
EMBEDDED_IMAGE_TYPE = 1


def _combined_runtime(
    chat_result: CoreChatResult,
    rag_result: CoreChatResult,
    rag_calls: list[CoreRagRequest],
) -> CoreChatRuntime:
    """chat・RAG の両方で決まった結果を返す runtime を作る（移植元 combinedRuntime）。

    Parameters
    ----------
    chat_result : CoreChatResult
        chat で返す結果。
    rag_result : CoreChatResult
        RAG で返す結果。
    rag_calls : list[CoreRagRequest]
        RAG のリクエストを追加するリスト（呼び出し回数を数える）。

    Returns
    -------
    CoreChatRuntime
        CHAT・RAG を登録した runtime。
    """

    def handle_chat(
        request: CoreChatRequest, context: ExecutionContext
    ) -> CoreChatResult:
        """chat の結果を返す。

        Parameters
        ----------
        request : CoreChatRequest
            chat のリクエスト（使わない）。
        context : ExecutionContext
            実行の文脈（使わない）。

        Returns
        -------
        CoreChatResult
            chat の結果。
        """
        return chat_result

    def handle_rag(
        request: CoreRagRequest, context: ExecutionContext
    ) -> CoreChatResult:
        """RAG のリクエストを記録して結果を返す。

        Parameters
        ----------
        request : CoreRagRequest
            RAG のリクエスト。
        context : ExecutionContext
            実行の文脈（使わない）。

        Returns
        -------
        CoreChatResult
            RAG の結果。
        """
        rag_calls.append(request)
        return rag_result

    return CoreChatRuntime(
        CoreProviderRuntime.builder()
        .register(PROVIDER_ID, Capability.CHAT, CoreChatRequest, handle_chat)
        .register(PROVIDER_ID, Capability.RAG, CoreRagRequest, handle_rag)
        .build()
    )


@pytest.fixture
def default_rag_calls() -> list[CoreRagRequest]:
    """既定の controller の RAG の呼び出しを記録するリストを返す。

    Returns
    -------
    list[CoreRagRequest]
        空のリスト。
    """
    return []


@pytest.fixture
def controller(
    make_controller: Callable[..., GenerativeAiController],
    json_answer: Callable[[str], CoreChatResult],
    default_rag_calls: list[CoreRagRequest],
) -> GenerativeAiController:
    """移植元 setUp と同じ既定の controller を作る。

    Parameters
    ----------
    make_controller : Callable[..., GenerativeAiController]
        controller を作る関数。
    json_answer : Callable[[str], CoreChatResult]
        JSON 向けの成功結果を作る関数。
    default_rag_calls : list[CoreRagRequest]
        RAG の呼び出しを記録するリスト。

    Returns
    -------
    GenerativeAiController
        chat は `content`、RAG は参照 ID 1 の `answer` を返す出力モード 0 の controller。
    """
    runtime = _combined_runtime(
        json_answer("content"),
        CoreChatResult.success("answer", [], OutputModeHint.RETRIEVAL_ANSWER_JSON, [1]),
        default_rag_calls,
    )
    return make_controller(runtime, 0)


@pytest.fixture
def controller_with_rag_result(
    make_controller: Callable[..., GenerativeAiController],
    json_answer: Callable[[str], CoreChatResult],
) -> Callable[..., GenerativeAiController]:
    """RAG の結果を指定した controller を作る関数を返す（移植元 controllerWithRagResult）。

    Parameters
    ----------
    make_controller : Callable[..., GenerativeAiController]
        controller を作る関数。
    json_answer : Callable[[str], CoreChatResult]
        JSON 向けの成功結果を作る関数。

    Returns
    -------
    Callable[..., GenerativeAiController]
        `(result, rag_calls, output_type)` から controller を作る関数。
    """

    def create(
        result: CoreChatResult, rag_calls: list[CoreRagRequest], output_type: int
    ) -> GenerativeAiController:
        """RAG の結果を指定した controller を作る。

        Parameters
        ----------
        result : CoreChatResult
            RAG で返す結果。
        rag_calls : list[CoreRagRequest]
            RAG の呼び出しを記録するリスト。
        output_type : int
            出力モード。

        Returns
        -------
        GenerativeAiController
            作った controller。
        """
        runtime = _combined_runtime(json_answer("unused"), result, rag_calls)
        return make_controller(runtime, output_type)

    return create


def _two_context_schema() -> RequestSchema:
    """コンテキストのメッセージ 2 件・コンテキスト 2 件・質問を持つリクエストを作る。

    Returns
    -------
    RequestSchema
        移植元 testExecuteLLMWithContext と同じリクエスト。
    """
    schema = RequestSchema()
    schema.add_message(Message.context(0, "testFile1", "testContext1", 1))
    schema.add_message(Message.context(0, "testFile2", "testContext2", 2))
    schema.retrieval_contexts = [
        RetrievalContext("file1", "context1", "path1"),
        RetrievalContext("file2", "context2", "path2"),
    ]
    schema.user_question = "userQuestion"
    return schema


def _system_schema(contexts: list[RetrievalContext] | None) -> RequestSchema:
    """system メッセージと質問を持つ RAG のリクエストを作る。

    Parameters
    ----------
    contexts : list[RetrievalContext] | None
        コンテキスト。

    Returns
    -------
    RequestSchema
        作ったリクエスト。
    """
    schema = RequestSchema()
    schema.add_message(Message.of_index(1, "system"))
    schema.retrieval_contexts = contexts
    schema.user_question = "userQuestion"
    return schema


def test_execute_llm_with_context(
    tmp_path: Path, controller_with_rag_result: Callable[..., GenerativeAiController]
) -> None:
    """RAG の結果をファイルに書くこと"""
    rag_controller = controller_with_rag_result(
        CoreChatResult.success(
            "answer",
            ["title1", "title2"],
            OutputModeHint.RETRIEVAL_ANSWER_JSON,
            [2, 3],
        ),
        [],
        0,
    )
    output = tmp_path / "testExecuteLLMWithContext.txt"

    rag_controller.execute_llm_with_context(_two_context_schema(), str(output))

    assert "answer" in output.read_text(encoding="utf-8")


def test_constructor_initializes_default_core_delegation_boundary(
    core_credential: AccessCredential,
) -> None:
    """runtime を渡さなければ既定の core の runtime と mapper を作ること"""
    default_controller = GenerativeAiController(core_credential, ProxySetting(), 0)

    assert default_controller._runtime is not None
    assert default_controller._mapper is not None


def test_constructor_accepts_injected_core_delegation_boundary(
    make_controller: Callable[..., GenerativeAiController],
) -> None:
    """渡した工場が返す runtime を使うこと"""
    injected_runtime = CoreChatRuntime(CoreProviderRuntime.builder().build())

    injected = make_controller(injected_runtime, 0)

    assert injected._runtime is injected_runtime
    assert injected._mapper is not None


def test_execute_llm_with_context_null_answer(
    tmp_path: Path, controller_with_rag_result: Callable[..., GenerativeAiController]
) -> None:
    """回答がなければ固定のメッセージとすべてのパスを書くこと"""
    rag_controller = controller_with_rag_result(
        CoreChatResult.no_answer(OutputModeHint.RETRIEVAL_ANSWER_JSON), [], 0
    )
    output = tmp_path / "testExecuteLLMWithContext_NullAnswer.txt"

    rag_controller.execute_llm_with_context(_two_context_schema(), str(output))

    assert output.read_text(encoding="utf-8") == (
        '{"answer":"' + NO_ANSWER_MESSAGE + '","filepaths":["context1","context2"],'
        '"references":[]}'
    )


def test_execute_llm_with_context_maps_answer_id_to_context(
    tmp_path: Path, controller_with_rag_result: Callable[..., GenerativeAiController]
) -> None:
    """回答の参照 ID から対応するコンテキストのパスと本文を書くこと"""
    rag_controller = controller_with_rag_result(
        CoreChatResult.success(
            "answer", ["title1"], OutputModeHint.RETRIEVAL_ANSWER_JSON, [1]
        ),
        [],
        0,
    )
    schema = _system_schema(
        [
            RetrievalContext("context1", "path1", "file1"),
            RetrievalContext("context2", "path2", "file2"),
        ]
    )
    output = tmp_path / "testExecuteLLMWithContextMapsAnswerId.txt"

    rag_controller.execute_llm_with_context(schema, str(output))

    text = output.read_text(encoding="utf-8")
    assert '"answer":"answer"' in text
    assert '"filepaths":["path1"]' in text
    assert '"content":"context1"' in text
    assert "path2" not in text


def test_execute_llm(tmp_path: Path, controller: GenerativeAiController) -> None:
    """空のリクエストでも core の回答を JSON で書くこと"""
    output = tmp_path / "test.txt"

    controller.execute_llm(RequestSchema(), str(output))

    assert (
        output.read_text(encoding="utf-8")
        == '{"answer":"content","filepaths":[],"references":[]}'
    )


def test_execute_llm_output_type2_writes_plain_answer_with_image_explanations(
    tmp_path: Path, make_controller: Callable[..., GenerativeAiController]
) -> None:
    """出力モード 2 では画像説明があっても回答本文だけを書くこと"""
    plain_controller = make_controller(
        _combined_runtime(
            CoreChatResult.success(
                "plain content", [], OutputModeHint.PLAIN_ANSWER_TEXT
            ),
            CoreChatResult.no_answer(OutputModeHint.PLAIN_ANSWER_TEXT),
            [],
        ),
        2,
    )
    schema = RequestSchema(
        image_explanations=[ImageExplanation(EMBEDDED_IMAGE_TYPE, "diagram", "page-1")]
    )
    output = tmp_path / "testExecuteLLMPlain.txt"

    plain_controller.execute_llm(schema, str(output))

    assert output.read_text(encoding="utf-8") == "plain content"


def test_execute_llm_failure_keeps_pre_existing_output_unchanged(
    tmp_path: Path, make_controller: Callable[..., GenerativeAiController]
) -> None:
    """core が失敗したら例外にし、既存の出力ファイルを変えないこと"""
    failure = CoreChatResult.from_failure(
        CoreFailure.of("IMAGE_EXPLANATION_FAILURE", "sanitized failure"),
        OutputModeHint.PLAIN_ANSWER_TEXT,
    )
    plain_controller = make_controller(
        _combined_runtime(
            failure, CoreChatResult.no_answer(OutputModeHint.PLAIN_ANSWER_TEXT), []
        ),
        2,
    )
    output = tmp_path / "pre-existing-answer.txt"
    output.write_text("previous-success", encoding="utf-8")

    with pytest.raises(RuntimeError):
        plain_controller.execute_llm(RequestSchema(), str(output))

    assert output.read_text(encoding="utf-8") == "previous-success"


def test_execute_llm_with_context_output_type2_with_image_explanations(
    tmp_path: Path, controller_with_rag_result: Callable[..., GenerativeAiController]
) -> None:
    """出力モード 2 の RAG では画像説明があっても回答本文だけを書くこと"""
    plain_controller = controller_with_rag_result(
        CoreChatResult.success(
            "context answer", ["title1"], OutputModeHint.PLAIN_ANSWER_TEXT, [1]
        ),
        [],
        2,
    )
    schema = RequestSchema()
    schema.add_message(Message.context(0, "testFile1", "testContext1", 1))
    schema.retrieval_contexts = [RetrievalContext("context1", "path1", "file1")]
    schema.image_explanations = [
        ImageExplanation(EMBEDDED_IMAGE_TYPE, "caption", "context")
    ]
    schema.user_question = "userQuestion"
    output = tmp_path / "testExecuteLLMWithContextPlain.txt"

    plain_controller.execute_llm_with_context(schema, str(output))

    assert output.read_text(encoding="utf-8") == "context answer"


def test_execute_llm_with_context_null_messages_writes_deficiency(
    tmp_path: Path,
    controller: GenerativeAiController,
    default_rag_calls: list[CoreRagRequest],
) -> None:
    """メッセージがなければ core を呼ばずに入力不足を書くこと"""
    schema = RequestSchema()
    schema.user_question = "userQuestion"
    schema.retrieval_contexts = [RetrievalContext("context1", "path1", "file1")]
    output = tmp_path / "testExecuteLLMWithContextNullMessages.txt"

    controller.execute_llm_with_context(schema, str(output))

    text = output.read_text(encoding="utf-8")
    assert "RAG入力不足" in text
    assert "メッセージ" in text
    assert len(default_rag_calls) == 0


def test_execute_llm_with_context_null_request_schema_writes_deficiency(
    tmp_path: Path,
    controller: GenerativeAiController,
    default_rag_calls: list[CoreRagRequest],
) -> None:
    """リクエストがなければ core を呼ばずに入力不足を書くこと"""
    output = tmp_path / "testExecuteLLMWithContextNullRequest.txt"

    controller.execute_llm_with_context(cast(RequestSchema, None), str(output))

    text = output.read_text(encoding="utf-8")
    assert "RAG入力不足" in text
    assert "request schema" in text
    assert len(default_rag_calls) == 0


def test_execute_llm_with_context_existing_deficiency_writes_deficiency(
    tmp_path: Path,
    controller: GenerativeAiController,
    default_rag_calls: list[CoreRagRequest],
) -> None:
    """リクエストに入力不足があれば core を呼ばずにそれを書くこと"""
    schema = RequestSchema(rag_input_deficiency=RagInputDeficiency("custom deficiency"))
    output = tmp_path / "testExecuteLLMWithContextExistingDeficiency.txt"

    controller.execute_llm_with_context(schema, str(output))

    assert "custom deficiency" in output.read_text(encoding="utf-8")
    assert len(default_rag_calls) == 0


def test_execute_llm_with_context_null_retrieval_contexts_writes_deficiency(
    tmp_path: Path,
    controller: GenerativeAiController,
    default_rag_calls: list[CoreRagRequest],
) -> None:
    """コンテキストがなければ core を呼ばずに入力不足を書くこと"""
    output = tmp_path / "testExecuteLLMWithContextNullContexts.txt"

    controller.execute_llm_with_context(_system_schema(None), str(output))

    text = output.read_text(encoding="utf-8")
    assert "RAG入力不足" in text
    assert "コンテキスト" in text
    assert len(default_rag_calls) == 0


def test_execute_llm_with_context_null_retrieval_context_entry_writes_deficiency(
    tmp_path: Path,
    controller: GenerativeAiController,
    default_rag_calls: list[CoreRagRequest],
) -> None:
    """コンテキストの要素が None なら本文とパスの入力不足を書くこと"""
    schema = _system_schema(cast(list[RetrievalContext], [None]))
    output = tmp_path / "testExecuteLLMWithContextNullContextEntry.txt"

    controller.execute_llm_with_context(schema, str(output))

    text = output.read_text(encoding="utf-8")
    assert "RAG入力不足" in text
    assert "コンテキスト本文(index=5)" in text
    assert "コンテキストパス(index=3)" in text
    assert len(default_rag_calls) == 0


def test_execute_llm_with_context_blank_context_file_name_writes_deficiency(
    tmp_path: Path,
    controller: GenerativeAiController,
    default_rag_calls: list[CoreRagRequest],
) -> None:
    """コンテキストのファイル名が空白なら入力不足を書くこと"""
    schema = _system_schema([RetrievalContext("context1", "path1", " ")])
    output = tmp_path / "testExecuteLLMWithContextBlankFileName.txt"

    controller.execute_llm_with_context(schema, str(output))

    text = output.read_text(encoding="utf-8")
    assert "RAG入力不足" in text
    assert "コンテキストファイル名(index=3)" in text
    assert len(default_rag_calls) == 0


def test_execute_llm_with_context_out_of_range_answer_id_writes_deficiency(
    tmp_path: Path, controller_with_rag_result: Callable[..., GenerativeAiController]
) -> None:
    """範囲外の参照 ID なら参照 ID の不整合を書くこと"""
    rag_controller = controller_with_rag_result(
        CoreChatResult.success(
            "answer", ["title1"], OutputModeHint.RETRIEVAL_ANSWER_JSON, [99]
        ),
        [],
        0,
    )
    schema = _system_schema([RetrievalContext("context1", "path1", "file1")])
    output = tmp_path / "testExecuteLLMWithContextOutOfRange.txt"

    rag_controller.execute_llm_with_context(schema, str(output))

    text = output.read_text(encoding="utf-8")
    assert "RAG回答参照ID不整合" in text
    assert "99" in text


def test_execute_llm_with_context_no_answer_ids_keeps_answer_without_references(
    tmp_path: Path, controller_with_rag_result: Callable[..., GenerativeAiController]
) -> None:
    """参照 ID がなければ回答だけを書き、パス・参照を空にすること"""
    rag_controller = controller_with_rag_result(
        CoreChatResult.success(
            "answer", ["title1"], OutputModeHint.RETRIEVAL_ANSWER_JSON
        ),
        [],
        0,
    )
    schema = _system_schema([RetrievalContext("context1", "path1", "file1")])
    output = tmp_path / "testExecuteLLMWithContextNullAnswerIds.txt"

    rag_controller.execute_llm_with_context(schema, str(output))

    text = output.read_text(encoding="utf-8")
    assert '"answer":"answer"' in text
    assert '"filepaths":[]' in text
    assert '"references":[]' in text


def test_execute_llm_with_context_deficiency_output_type2_writes_plain_message(
    tmp_path: Path, controller_with_rag_result: Callable[..., GenerativeAiController]
) -> None:
    """出力モード 2 の入力不足は JSON ではなくメッセージだけを書くこと"""
    rag_calls: list[CoreRagRequest] = []
    plain_controller = controller_with_rag_result(
        CoreChatResult.no_answer(OutputModeHint.PLAIN_ANSWER_TEXT), rag_calls, 2
    )
    schema = _system_schema([RetrievalContext("context1", "path1", "file1")])
    schema.user_question = " "
    output = tmp_path / "testExecuteLLMWithContextDeficiencyPlain.txt"

    plain_controller.execute_llm_with_context(schema, str(output))

    text = output.read_text(encoding="utf-8")
    assert text.startswith("RAG入力不足")
    assert not text.startswith("{")
    assert len(rag_calls) == 0


def test_write_response_to_text(
    tmp_path: Path, controller: GenerativeAiController
) -> None:
    """応答を出力ファイルへ UTF-8 で書くこと"""
    output = tmp_path / "outputPath"

    controller.write_response_to_text("response", str(output))

    assert output.read_bytes() == b"response"


def test_make_exception_message() -> None:
    """例外のメッセージを含むこと"""
    message = make_exception_message(Exception("test exception"))

    assert message is not None
    assert "test exception" in message


def test_make_exception_message_long_log() -> None:
    """長いメッセージは 512 文字以下に切ること"""
    message = make_exception_message(Exception("a" * 513))

    assert message is not None
    assert len(message) <= MAX_EXCEPTION_MESSAGE_LENGTH
