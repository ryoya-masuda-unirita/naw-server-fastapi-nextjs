"""通常 chat の tools の受け渡しと、tools の失敗の書き出しを確かめる。

移植元: controller/GenerativeAiChatToolsRoutingTest。

- 移植元の「tool 1 件を受け取るコンストラクタ」は、Python では 1 件のリストを渡す
- 移植元の「null のリストを渡すコンストラクタ」は、Python では `chat_tools` の省略
  （既定の空）で置き換える
"""

from collections.abc import Callable
from pathlib import Path

import pytest
from generative_ai_adapter.controller import GenerativeAiController
from generative_ai_adapter.domain import Message, RequestSchema, RetrievalContext
from generative_ai_core import failure as failures
from generative_ai_core.chat.models import (
    CoreChatRequest,
    CoreChatResult,
    CoreChatTool,
    CoreRagRequest,
    OutputModeHint,
)
from generative_ai_core.chat.runtime import CoreChatRuntime
from generative_ai_core.failure import CoreFailure

TOOLS_FAILURE_CODES = (
    failures.INVALID_TOOLS_INPUT,
    failures.UNSUPPORTED_TOOLS_PROVIDER,
    failures.UNSUPPORTED_TOOLS_ROUTE,
    failures.UNSUPPORTED_APPROVAL_CONTINUATION,
    failures.UNAVAILABLE_TOOLS_MAPPING,
    failures.UNSUPPORTED_PROVIDER_TOOL_MATRIX,
)


def _schema() -> RequestSchema:
    """user のメッセージ 1 件のリクエストを作る（移植元 schema）。

    Returns
    -------
    RequestSchema
        `hello` のメッセージを持つリクエスト。
    """
    return RequestSchema(messages=[Message.of_index(0, "hello")])


def test_output_type0_normal_chat_passes_resolved_tools(
    tmp_path: Path,
    chat_runtime: Callable[..., CoreChatRuntime],
    make_controller: Callable[..., GenerativeAiController],
) -> None:
    """出力モード 0 の通常 chat で、解決した tools をそのまま core へ渡すこと"""
    captured: list[CoreChatRequest] = []
    tools = [
        CoreChatTool.web_search(),
        CoreChatTool.mcp("redacted-label", "redacted-url", None),
    ]
    controller = make_controller(
        chat_runtime(
            captured,
            CoreChatResult.success("answer", [], OutputModeHint.RETRIEVAL_ANSWER_JSON),
        ),
        0,
        tools,
    )
    output = tmp_path / "chatToolsRoutingJson.txt"

    controller.execute_llm(_schema(), str(output))

    assert captured[0].tools() == tools
    assert '"answer":"answer"' in output.read_text(encoding="utf-8")


def test_output_type2_normal_chat_passes_resolved_tools(
    tmp_path: Path,
    chat_runtime: Callable[..., CoreChatRuntime],
    make_controller: Callable[..., GenerativeAiController],
) -> None:
    """出力モード 2 の通常 chat で、解決した tools をそのまま core へ渡すこと"""
    captured: list[CoreChatRequest] = []
    tools = [CoreChatTool.web_search()]
    controller = make_controller(
        chat_runtime(
            captured,
            CoreChatResult.success(
                "plain answer", [], OutputModeHint.PLAIN_ANSWER_TEXT
            ),
        ),
        2,
        tools,
    )
    output = tmp_path / "chatToolsRoutingPlain.txt"

    controller.execute_llm(_schema(), str(output))

    assert captured[0].tools() == tools
    assert output.read_text(encoding="utf-8") == "plain answer"


def test_single_tool_and_omitted_tools_are_mapped_compatibly(
    tmp_path: Path,
    chat_runtime: Callable[..., CoreChatRuntime],
    make_controller: Callable[..., GenerativeAiController],
    json_answer: Callable[[str], CoreChatResult],
) -> None:
    """tool 1 件ならその 1 件を、tools の省略なら空を core へ渡すこと"""
    single_captured: list[CoreChatRequest] = []
    single_controller = make_controller(
        chat_runtime(single_captured, json_answer("single-tool-answer")),
        0,
        [CoreChatTool.web_search()],
    )

    single_controller.execute_llm(_schema(), str(tmp_path / "single.txt"))

    assert single_captured[0].tools() == [CoreChatTool.web_search()]

    omitted_captured: list[CoreChatRequest] = []
    omitted_controller = make_controller(
        chat_runtime(omitted_captured, json_answer("null-list-answer")), 0
    )

    omitted_controller.execute_llm(_schema(), str(tmp_path / "omitted.txt"))

    assert omitted_captured[0].tools() == []


def test_rag_route_with_tools_fails_closed_before_runtime(
    tmp_path: Path,
    rag_runtime: Callable[..., CoreChatRuntime],
    make_controller: Callable[..., GenerativeAiController],
) -> None:
    """RAG で tools があれば core を呼ばずに unsupported_tools_route を書くこと"""
    captured: list[CoreRagRequest] = []
    controller = make_controller(
        rag_runtime(
            captured,
            CoreChatResult.success(
                "should-not-call", [], OutputModeHint.RETRIEVAL_ANSWER_JSON, [1]
            ),
        ),
        1,
        [CoreChatTool.web_search()],
    )
    schema = _schema()
    schema.retrieval_contexts = [
        RetrievalContext("context", "/redacted/path", "redacted.txt")
    ]
    schema.user_question = "question"
    output = tmp_path / "chatToolsRagFailClosed.txt"

    controller.execute_llm_with_context(schema, str(output))

    assert captured == []
    assert "unsupported_tools_route" in output.read_text(encoding="utf-8")


def test_core_tools_failures_are_written_as_sanitized_output(
    tmp_path: Path,
    chat_runtime: Callable[..., CoreChatRuntime],
    make_controller: Callable[..., GenerativeAiController],
) -> None:
    """tools の失敗コードは例外にせず、伏せた回答として書くこと"""
    for code in TOOLS_FAILURE_CODES:
        captured: list[CoreChatRequest] = []
        controller = make_controller(
            chat_runtime(
                captured,
                CoreChatResult.from_failure(
                    CoreFailure.of(code, f"{code}: sanitized failure"),
                    OutputModeHint.RETRIEVAL_ANSWER_JSON,
                ),
            ),
            0,
            [CoreChatTool.web_search()],
        )
        output = tmp_path / f"chatToolsFailure-{code}.txt"

        controller.execute_llm(_schema(), str(output))

        assert captured[0].tools() == [CoreChatTool.web_search()]
        text = output.read_text(encoding="utf-8")
        assert code in text
        assert "sanitized failure" in text


def test_non_tools_failure_still_throws(
    tmp_path: Path,
    chat_runtime: Callable[..., CoreChatRuntime],
    make_controller: Callable[..., GenerativeAiController],
) -> None:
    """tools 以外の失敗は例外にすること"""
    controller = make_controller(
        chat_runtime(
            [],
            CoreChatResult.from_failure(
                CoreFailure.of("non_tools_failure", "sanitized failure"),
                OutputModeHint.RETRIEVAL_ANSWER_JSON,
            ),
        ),
        0,
        [CoreChatTool.web_search()],
    )

    with pytest.raises(RuntimeError, match="sanitized failure"):
        controller.execute_llm(_schema(), str(tmp_path / "chatNonToolsFailure.txt"))
