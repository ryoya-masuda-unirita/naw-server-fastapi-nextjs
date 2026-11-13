"""RAG を core の runtime へ任せることを確かめる。

移植元: controller/GenerativeAiControllerRagDelegationTest。

- 移植元の AtomicInteger（呼び出し回数）は、記録したリクエストの件数で数える
"""

from collections.abc import Callable
from pathlib import Path

from generative_ai_adapter.controller import GenerativeAiController
from generative_ai_adapter.domain import Message, RequestSchema, RetrievalContext
from generative_ai_core.chat.models import (
    CoreChatResult,
    CoreRagRequest,
    OutputModeHint,
)
from generative_ai_core.chat.runtime import CoreChatRuntime

NO_ANSWER_MESSAGE = (
    "提供された情報からは答えが分かりませんでした。別の情報媒体で調べてみてください。"
)


def _valid_rag_schema() -> RequestSchema:
    """入力が足りている RAG のリクエストを作る（移植元 validRagSchema）。

    Returns
    -------
    RequestSchema
        system メッセージ・コンテキスト 1 件・質問を持つリクエスト。
    """
    schema = RequestSchema()
    schema.add_message(Message.of_index(1, "system"))
    schema.retrieval_contexts = [RetrievalContext("context1", "path1", "file1")]
    schema.user_question = "question"
    return schema


def test_execute_llm_with_context_writes_json_from_core_rag_runtime(
    tmp_path: Path,
    rag_runtime: Callable[..., CoreChatRuntime],
    make_controller: Callable[..., GenerativeAiController],
) -> None:
    """core の RAG の回答と参照したコンテキストを JSON で書くこと"""
    captured: list[CoreRagRequest] = []
    result = CoreChatResult.success(
        "rag answer", ["title"], OutputModeHint.RETRIEVAL_ANSWER_JSON, [1]
    )
    controller = make_controller(rag_runtime(captured, result), 1)
    output = tmp_path / "executeRagDelegatedJson.txt"

    controller.execute_llm_with_context(_valid_rag_schema(), str(output))

    text = output.read_text(encoding="utf-8")
    assert '"answer":"rag answer"' in text
    assert '"filepaths":["path1"]' in text
    assert '"content":"context1"' in text
    assert captured[0].contexts[0].path == "path1"


def test_execute_llm_with_context_uses_context_ordinal_reference_ids(
    tmp_path: Path,
    rag_runtime: Callable[..., CoreChatRuntime],
    make_controller: Callable[..., GenerativeAiController],
) -> None:
    """会話履歴があっても参照 ID はコンテキストの順番で引くこと"""
    captured: list[CoreRagRequest] = []
    result = CoreChatResult.success(
        "rag answer", ["title"], OutputModeHint.RETRIEVAL_ANSWER_JSON, [2]
    )
    controller = make_controller(rag_runtime(captured, result), 1)
    schema = _valid_rag_schema()
    schema.add_message(Message.of_index(0, "assistant history"))
    schema.retrieval_contexts = [
        RetrievalContext("context1", "path1", "file1"),
        RetrievalContext("context2", "path2", "file2"),
    ]
    output = tmp_path / "executeRagOrdinalReference.txt"

    controller.execute_llm_with_context(schema, str(output))

    assert '"filepaths":["path2"]' in output.read_text(encoding="utf-8")
    assert len(captured[0].contexts) == 2


def test_execute_llm_with_context_deficiency_does_not_call_core(
    tmp_path: Path,
    rag_runtime: Callable[..., CoreChatRuntime],
    make_controller: Callable[..., GenerativeAiController],
) -> None:
    """入力不足なら core を呼ばずに入力不足を書くこと"""
    captured: list[CoreRagRequest] = []
    result = CoreChatResult.success(
        "should not be used", [], OutputModeHint.RETRIEVAL_ANSWER_JSON, []
    )
    controller = make_controller(rag_runtime(captured, result), 1)
    schema = _valid_rag_schema()
    schema.user_question = " "
    output = tmp_path / "executeRagDelegatedDeficiency.txt"

    controller.execute_llm_with_context(schema, str(output))

    assert "RAG入力不足" in output.read_text(encoding="utf-8")
    assert len(captured) == 0


def test_execute_llm_with_context_reference_mismatch_writes_deficiency(
    tmp_path: Path,
    rag_runtime: Callable[..., CoreChatRuntime],
    make_controller: Callable[..., GenerativeAiController],
) -> None:
    """範囲外の参照 ID なら core を 1 回呼んだうえで不整合を書くこと"""
    captured: list[CoreRagRequest] = []
    result = CoreChatResult.success(
        "rag answer", [], OutputModeHint.RETRIEVAL_ANSWER_JSON, [99]
    )
    controller = make_controller(rag_runtime(captured, result), 1)
    output = tmp_path / "executeRagDelegatedMismatch.txt"

    controller.execute_llm_with_context(_valid_rag_schema(), str(output))

    text = output.read_text(encoding="utf-8")
    assert "RAG回答参照ID不整合" in text
    assert "99" in text
    assert len(captured) == 1


def test_execute_llm_with_context_no_answer_writes_fallback_and_all_paths(
    tmp_path: Path,
    rag_runtime: Callable[..., CoreChatRuntime],
    make_controller: Callable[..., GenerativeAiController],
) -> None:
    """回答がなければ固定のメッセージとすべてのコンテキストのパスを書くこと"""
    captured: list[CoreRagRequest] = []
    result = CoreChatResult.no_answer(OutputModeHint.RETRIEVAL_ANSWER_JSON)
    controller = make_controller(rag_runtime(captured, result), 1)
    schema = _valid_rag_schema()
    schema.retrieval_contexts = [
        RetrievalContext("context1", "path1", "file1"),
        RetrievalContext("context2", "path2", "file2"),
    ]
    output = tmp_path / "executeRagDelegatedNoAnswer.txt"

    controller.execute_llm_with_context(schema, str(output))

    text = output.read_text(encoding="utf-8")
    assert NO_ANSWER_MESSAGE in text
    assert '"filepaths":["path1","path2"]' in text
    assert len(captured) == 1


def test_execute_llm_with_context_output_type2_writes_plain_answer(
    tmp_path: Path,
    rag_runtime: Callable[..., CoreChatRuntime],
    make_controller: Callable[..., GenerativeAiController],
) -> None:
    """出力モード 2 では RAG の回答本文だけを書き、PLAIN_ANSWER_TEXT を渡すこと"""
    captured: list[CoreRagRequest] = []
    result = CoreChatResult.success(
        "plain rag answer", [], OutputModeHint.PLAIN_ANSWER_TEXT, [1]
    )
    controller = make_controller(rag_runtime(captured, result), 2)
    output = tmp_path / "executeRagDelegatedPlain.txt"

    controller.execute_llm_with_context(_valid_rag_schema(), str(output))

    assert output.read_text(encoding="utf-8") == "plain rag answer"
    assert captured[0].chat_request.output_mode_hint == OutputModeHint.PLAIN_ANSWER_TEXT
