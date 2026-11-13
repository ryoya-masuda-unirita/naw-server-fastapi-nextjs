"""RAG で tools を指定したときの失敗の出力が、MCP の生の値を含まないことを確かめる。

移植元: controller/GenerativeAiChatToolsSanitizationTest。
"""

from collections.abc import Callable
from pathlib import Path

from generative_ai_adapter.controller import GenerativeAiController
from generative_ai_adapter.domain import Message, RequestSchema, RetrievalContext
from generative_ai_core.chat.models import (
    CoreChatResult,
    CoreChatTool,
    CoreRagRequest,
    OutputModeHint,
)
from generative_ai_core.chat.runtime import CoreChatRuntime


def test_rag_tools_failure_is_sanitized_and_hides_raw_mcp_values(
    tmp_path: Path,
    rag_runtime: Callable[..., CoreChatRuntime],
    make_controller: Callable[..., GenerativeAiController],
) -> None:
    """RAG の tools の失敗は core を呼ばず、MCP の値・パスを出力に含めないこと"""
    captured: list[CoreRagRequest] = []
    tool = CoreChatTool.mcp(
        "fixture-label-token", "fixture-url-token", None, "fixture-auth-token", {}
    )
    controller = make_controller(
        rag_runtime(
            captured,
            CoreChatResult.success(
                "should-not-call", [], OutputModeHint.RETRIEVAL_ANSWER_JSON, [1]
            ),
        ),
        1,
        [tool],
    )
    schema = RequestSchema(messages=[Message.of_index(0, "hello")])
    schema.retrieval_contexts = [
        RetrievalContext("context", "/redacted/path", "redacted.txt")
    ]
    schema.user_question = "question"
    output = tmp_path / "chatToolsSanitized.txt"

    controller.execute_llm_with_context(schema, str(output))

    text = output.read_text(encoding="utf-8")
    assert captured == []
    assert "unsupported_tools_route" in text
    assert "fixture-label-token" not in text
    assert "fixture-url-token" not in text
    assert "fixture-auth-token" not in text
    assert "/redacted/path" not in text
