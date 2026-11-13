"""core の失敗を、伏せたメッセージの例外にすることを確かめる。

移植元: controller/GenerativeAiControllerFailureDelegationTest。

- 移植元の IllegalStateException は RuntimeError で置き換える
"""

from collections.abc import Callable
from pathlib import Path

import pytest
from generative_ai_adapter.controller import GenerativeAiController
from generative_ai_adapter.domain import Message, RequestSchema, RetrievalContext
from generative_ai_core.chat.models import (
    CoreChatRequest,
    CoreChatResult,
)
from generative_ai_core.chat.runtime import CoreChatRuntime
from generative_ai_core.failure import CoreFailure
from generative_ai_core.provider.model import Capability
from generative_ai_core.provider.runtime import CoreProviderRuntime, ExecutionContext

PROVIDER_ID = "OpenAI"
SECRET_MESSAGE = "credential=marker-value proxy_pass=marker-value"
MARKER = "marker-value"
BEFORE = "before"


def test_normal_chat_core_failure_throws_sanitized_exception(
    tmp_path: Path,
    failing_runtime: Callable[..., CoreChatRuntime],
    make_controller: Callable[..., GenerativeAiController],
) -> None:
    """通常 chat の失敗は伏せたメッセージの例外にし、出力ファイルを変えないこと"""
    controller = make_controller(
        failing_runtime(Capability.CHAT, RuntimeError(SECRET_MESSAGE)), 0
    )
    schema = RequestSchema(messages=[Message.of_index(0, "hello")])
    output = tmp_path / "chatFailure.txt"
    output.write_text(BEFORE, encoding="utf-8")

    with pytest.raises(RuntimeError) as exc_info:
        controller.execute_llm(schema, str(output))

    assert "[REDACTED]" in str(exc_info.value)
    assert MARKER not in str(exc_info.value)
    assert output.read_text(encoding="utf-8") == BEFORE


def test_rag_core_failure_throws_sanitized_exception(
    tmp_path: Path,
    failing_runtime: Callable[..., CoreChatRuntime],
    make_controller: Callable[..., GenerativeAiController],
) -> None:
    """RAG の失敗は伏せたメッセージの例外にし、出力ファイルを変えないこと"""
    controller = make_controller(
        failing_runtime(Capability.RAG, RuntimeError(SECRET_MESSAGE)), 1
    )
    schema = RequestSchema()
    schema.add_message(Message.of_index(1, "system"))
    schema.retrieval_contexts = [RetrievalContext("context1", "path1", "file1")]
    schema.user_question = "question"
    output = tmp_path / "ragFailure.txt"
    output.write_text(BEFORE, encoding="utf-8")

    with pytest.raises(RuntimeError) as exc_info:
        controller.execute_llm_with_context(schema, str(output))

    assert "[REDACTED]" in str(exc_info.value)
    assert MARKER not in str(exc_info.value)
    assert output.read_text(encoding="utf-8") == BEFORE


def test_unsupported_core_failure_keeps_failure_path(
    tmp_path: Path,
    make_controller: Callable[..., GenerativeAiController],
) -> None:
    """未対応の失敗結果は失敗コードを含む例外にし、出力ファイルを変えないこと"""

    def handle(request: CoreChatRequest, context: ExecutionContext) -> CoreChatResult:
        """未対応の失敗結果を返す。

        Parameters
        ----------
        request : CoreChatRequest
            chat のリクエスト。
        context : ExecutionContext
            実行の文脈（使わない）。

        Returns
        -------
        CoreChatResult
            UNSUPPORTED_PROVIDER_CAPABILITY の失敗結果。
        """
        return CoreChatResult.from_failure(
            CoreFailure.of(
                "UNSUPPORTED_PROVIDER_CAPABILITY",
                "OpenAI CHAT unsupported credential=marker-value",
            ),
            request.output_mode_hint,
        )

    runtime = CoreChatRuntime(
        CoreProviderRuntime.builder()
        .register(PROVIDER_ID, Capability.CHAT, CoreChatRequest, handle)
        .build()
    )
    controller = make_controller(runtime, 0)
    schema = RequestSchema(messages=[Message.of_index(0, "hello")])
    output = tmp_path / "unsupportedFailure.txt"
    output.write_text(BEFORE, encoding="utf-8")

    with pytest.raises(RuntimeError) as exc_info:
        controller.execute_llm(schema, str(output))

    assert "UNSUPPORTED_PROVIDER_CAPABILITY" in str(exc_info.value)
    assert MARKER not in str(exc_info.value)
    assert output.read_text(encoding="utf-8") == BEFORE
