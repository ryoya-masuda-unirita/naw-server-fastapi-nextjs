"""途中経過ファイル（サイドファイル）と回答ファイルの契約のテスト。

移植元: controller/ReasoningSideFileContractTest。

出力モード 0（JSON）・1（RAG）・2（本文だけ）ごとに、途中経過ファイルの有無・差分の有無・
失敗の有無で、途中経過ファイルと回答ファイルがどうなるかを確かめる。
`CoreStreamCallbacks.none()` は `NO_STREAM_CALLBACKS` に当たる。
"""

from collections.abc import Callable
from pathlib import Path

import pytest
from generative_ai_adapter.controller import GenerativeAiController
from generative_ai_adapter.domain import Message, RequestSchema, RetrievalContext
from generative_ai_core.chat.models import (
    NO_STREAM_CALLBACKS,
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
ChatHandler = Callable[[CoreChatRequest, ExecutionContext], CoreChatResult]
RagHandler = Callable[[CoreRagRequest, ExecutionContext], CoreChatResult]


def _chat_runtime(handler: ChatHandler) -> CoreChatRuntime:
    """chat の処理を登録した runtime を作る。

    Parameters
    ----------
    handler : ChatHandler
        chat の処理。

    Returns
    -------
    CoreChatRuntime
        CHAT だけを登録した runtime。
    """
    return CoreChatRuntime(
        CoreProviderRuntime.builder()
        .register(PROVIDER_ID, Capability.CHAT, CoreChatRequest, handler)
        .build()
    )


def _rag_runtime(handler: RagHandler) -> CoreChatRuntime:
    """RAG の処理を登録した runtime を作る。

    Parameters
    ----------
    handler : RagHandler
        RAG の処理。

    Returns
    -------
    CoreChatRuntime
        RAG だけを登録した runtime。
    """
    return CoreChatRuntime(
        CoreProviderRuntime.builder()
        .register(PROVIDER_ID, Capability.RAG, CoreRagRequest, handler)
        .build()
    )


def _chat_runtime_returning(answer: str) -> CoreChatRuntime:
    """差分を送らずに回答を返す chat の runtime を作る。

    Parameters
    ----------
    answer : str
        回答。

    Returns
    -------
    CoreChatRuntime
        runtime。
    """

    def handle(request: CoreChatRequest, context: ExecutionContext) -> CoreChatResult:
        """回答を返す。

        Parameters
        ----------
        request : CoreChatRequest
            chat のリクエスト。
        context : ExecutionContext
            実行の文脈（使わない）。

        Returns
        -------
        CoreChatResult
            成功の結果。
        """
        return CoreChatResult.success(answer, [], request.output_mode_hint)

    return _chat_runtime(handle)


def _rag_success(answer: str) -> CoreChatResult:
    """参照 ID 1 の RAG の成功結果を作る。

    Parameters
    ----------
    answer : str
        回答。

    Returns
    -------
    CoreChatResult
        成功の結果。
    """
    return CoreChatResult.success(
        answer, [], OutputModeHint.RETRIEVAL_ANSWER_JSON, reference_ids=[1]
    )


def _hello_schema() -> RequestSchema:
    """ユーザーの `hello` だけのリクエストを作る。

    Returns
    -------
    RequestSchema
        リクエスト。
    """
    return RequestSchema(messages=[Message.of_index(0, "hello")])


def _context_schema() -> RequestSchema:
    """コンテキスト 1 件と質問を持つ RAG のリクエストを作る。

    Returns
    -------
    RequestSchema
        リクエスト。
    """
    return RequestSchema(
        retrieval_contexts=[
            RetrievalContext("context body", "/safe/file.txt", "file.txt")
        ],
        user_question="question",
        messages=[Message.of_index(0, "question")],
    )


@pytest.mark.parametrize(
    ("output_type", "deltas", "answer"),
    [
        (0, ["r1", "r2"], "answer-for-chat-json"),
        (2, ["plain-r1", "plain-r2"], "plain-answer"),
    ],
)
def test_normal_chat_appends_reasoning_and_keeps_main_output_format(
    tmp_path: Path,
    make_controller: Callable[..., GenerativeAiController],
    sse_lines: Callable[..., str],
    output_type: int,
    deltas: list[str],
    answer: str,
) -> None:
    """通常 chat では差分を途中経過ファイルに追記し、回答は出力モードの形式で書くこと"""
    reasoning_file = tmp_path / "reasoning.txt"
    reasoning_file.touch()
    answer_file = tmp_path / "answer.txt"
    captured: list[CoreChatRequest] = []

    def handle(request: CoreChatRequest, context: ExecutionContext) -> CoreChatResult:
        """リクエストを記録し、差分を送って回答を返す。

        Parameters
        ----------
        request : CoreChatRequest
            chat のリクエスト。
        context : ExecutionContext
            実行の文脈（使わない）。

        Returns
        -------
        CoreChatResult
            成功の結果。
        """
        captured.append(request)
        for delta in deltas:
            request.stream_callbacks().on_reasoning_delta(delta)
        return CoreChatResult.success(answer, [], request.output_mode_hint)

    controller = make_controller(_chat_runtime(handle), output_type)
    controller.reasoning_output_path = str(reasoning_file)

    controller.execute_llm(_hello_schema(), str(answer_file))

    assert captured[0].stream_callbacks() is not NO_STREAM_CALLBACKS
    if output_type == 0:
        assert answer in answer_file.read_text(encoding="utf-8")
    else:
        assert answer_file.read_text(encoding="utf-8") == answer
    assert reasoning_file.read_text(encoding="utf-8") == sse_lines(*deltas)


def test_text_and_message_stop_without_stream_deltas_keep_pre_created_side_file(
    tmp_path: Path, make_controller: Callable[..., GenerativeAiController]
) -> None:
    """出力モード 2 で差分がなければ、既存の途中経過ファイルは変えずに本文を書くこと"""
    reasoning_file = tmp_path / "reasoning.txt"
    reasoning_file.write_text("existing", encoding="utf-8")
    answer_file = tmp_path / "answer.txt"
    controller = make_controller(_chat_runtime_returning("plain-no-delta"), 2)
    controller.reasoning_output_path = str(reasoning_file)

    controller.execute_llm(_hello_schema(), str(answer_file))

    assert answer_file.read_text(encoding="utf-8") == "plain-no-delta"
    assert reasoning_file.read_text(encoding="utf-8") == "existing"


def test_error_without_stream_deltas_keeps_pre_created_side_file_and_main_output(
    tmp_path: Path, make_controller: Callable[..., GenerativeAiController]
) -> None:
    """差分なしで失敗したら、途中経過ファイルも回答ファイルも変えないこと"""
    reasoning_file = tmp_path / "reasoning.txt"
    reasoning_file.write_text("existing", encoding="utf-8")
    answer_file = tmp_path / "answer.txt"
    answer_file.write_text("before", encoding="utf-8")

    def handle(request: CoreChatRequest, context: ExecutionContext) -> CoreChatResult:
        """失敗を返す。

        Parameters
        ----------
        request : CoreChatRequest
            chat のリクエスト。
        context : ExecutionContext
            実行の文脈（使わない）。

        Returns
        -------
        CoreChatResult
            失敗の結果。
        """
        return CoreChatResult.from_failure(
            CoreFailure.of("STREAM_FAILURE", "sanitized failure"),
            request.output_mode_hint,
        )

    controller = make_controller(_chat_runtime(handle), 2)
    controller.reasoning_output_path = str(reasoning_file)

    with pytest.raises(RuntimeError):
        controller.execute_llm(_hello_schema(), str(answer_file))

    assert reasoning_file.read_text(encoding="utf-8") == "existing"
    assert answer_file.read_text(encoding="utf-8") == "before"


def test_out_mode_zero_no_reasoning_delta_keeps_pre_created_side_file(
    tmp_path: Path, make_controller: Callable[..., GenerativeAiController]
) -> None:
    """出力モード 0 で差分がなければ、既存の途中経過ファイルは変えずに JSON を書くこと"""
    reasoning_file = tmp_path / "reasoning.txt"
    reasoning_file.write_text("existing", encoding="utf-8")
    answer_file = tmp_path / "answer.json"
    controller = make_controller(_chat_runtime_returning("json-no-delta"), 0)
    controller.reasoning_output_path = str(reasoning_file)

    controller.execute_llm(_hello_schema(), str(answer_file))

    assert "json-no-delta" in answer_file.read_text(encoding="utf-8")
    assert reasoning_file.read_text(encoding="utf-8") == "existing"


@pytest.mark.parametrize(
    ("output_type", "answer"),
    [(0, "json-without-sidefile"), (2, "plain-without-sidefile")],
)
def test_missing_reasoning_path_uses_no_callbacks_and_keeps_main_output(
    tmp_path: Path,
    make_controller: Callable[..., GenerativeAiController],
    output_type: int,
    answer: str,
) -> None:
    """途中経過ファイルの設定がなければコールバックを渡さず、回答は形式どおり書くこと"""
    answer_file = tmp_path / "answer.txt"
    captured: list[CoreChatRequest] = []

    def handle(request: CoreChatRequest, context: ExecutionContext) -> CoreChatResult:
        """リクエストを記録して回答を返す。

        Parameters
        ----------
        request : CoreChatRequest
            chat のリクエスト。
        context : ExecutionContext
            実行の文脈（使わない）。

        Returns
        -------
        CoreChatResult
            成功の結果。
        """
        captured.append(request)
        return CoreChatResult.success(answer, [], request.output_mode_hint)

    controller = make_controller(_chat_runtime(handle), output_type)

    controller.execute_llm(_hello_schema(), str(answer_file))

    assert captured[0].stream_callbacks() is NO_STREAM_CALLBACKS
    if output_type == 0:
        assert answer in answer_file.read_text(encoding="utf-8")
    else:
        assert answer_file.read_text(encoding="utf-8") == answer


def test_missing_reasoning_path_ignores_library_deltas_and_keeps_plain_text(
    tmp_path: Path, make_controller: Callable[..., GenerativeAiController]
) -> None:
    """途中経過ファイルの設定がなければライブラリの差分を無視し、本文だけを書くこと"""
    answer_file = tmp_path / "answer.txt"
    captured: list[CoreChatRequest] = []

    def handle(request: CoreChatRequest, context: ExecutionContext) -> CoreChatResult:
        """ライブラリの差分を送って回答を返す。

        Parameters
        ----------
        request : CoreChatRequest
            chat のリクエスト。
        context : ExecutionContext
            実行の文脈（使わない）。

        Returns
        -------
        CoreChatResult
            成功の結果。
        """
        captured.append(request)
        request.stream_callbacks().on_library_title_delta("ignored-title")
        request.stream_callbacks().on_library_content_delta("ignored-content")
        return CoreChatResult.success(
            "plain-library-without-sidefile", [], request.output_mode_hint
        )

    controller = make_controller(_chat_runtime(handle), 2)

    controller.execute_llm(_hello_schema(), str(answer_file))

    assert captured[0].stream_callbacks() is NO_STREAM_CALLBACKS
    assert answer_file.read_text(encoding="utf-8") == "plain-library-without-sidefile"


def test_out_mode_one_missing_reasoning_path_uses_no_callbacks(
    tmp_path: Path,
    make_controller: Callable[..., GenerativeAiController],
    rag_runtime: Callable[..., CoreChatRuntime],
) -> None:
    """RAG で途中経過ファイルの設定がなければコールバックを渡さず、JSON を書くこと"""
    answer_file = tmp_path / "answer.json"
    captured: list[CoreRagRequest] = []
    runtime = rag_runtime(captured, _rag_success("context-without-sidefile"))
    controller = make_controller(runtime, 1)

    controller.execute_llm_with_context(_context_schema(), str(answer_file))

    assert captured[0].chat_request.stream_callbacks() is NO_STREAM_CALLBACKS
    assert "context-without-sidefile" in answer_file.read_text(encoding="utf-8")


def test_out_mode_one_context_path_appends_reasoning_and_keeps_main_output_json(
    tmp_path: Path,
    make_controller: Callable[..., GenerativeAiController],
    sse_lines: Callable[..., str],
) -> None:
    """RAG でも差分を途中経過ファイルに追記し、回答は JSON で書くこと"""
    reasoning_file = tmp_path / "reasoning.txt"
    reasoning_file.touch()
    answer_file = tmp_path / "answer.json"
    captured: list[CoreRagRequest] = []

    def handle(request: CoreRagRequest, context: ExecutionContext) -> CoreChatResult:
        """リクエストを記録し、差分を送って回答を返す。

        Parameters
        ----------
        request : CoreRagRequest
            RAG のリクエスト。
        context : ExecutionContext
            実行の文脈（使わない）。

        Returns
        -------
        CoreChatResult
            成功の結果。
        """
        captured.append(request)
        request.chat_request.stream_callbacks().on_reasoning_delta("reasoning chunk")
        return _rag_success("answer-from-context")

    controller = make_controller(_rag_runtime(handle), 1)
    controller.reasoning_output_path = str(reasoning_file)

    controller.execute_llm_with_context(_context_schema(), str(answer_file))

    assert len(captured) == 1
    assert captured[0].chat_request.stream_callbacks() is not NO_STREAM_CALLBACKS
    assert "answer-from-context" in answer_file.read_text(encoding="utf-8")
    assert reasoning_file.read_text(encoding="utf-8") == sse_lines("reasoning chunk")


def test_out_mode_one_no_reasoning_delta_keeps_pre_created_side_file(
    tmp_path: Path,
    make_controller: Callable[..., GenerativeAiController],
    rag_runtime: Callable[..., CoreChatRuntime],
) -> None:
    """RAG で差分がなければ、既存の途中経過ファイルは変えずに JSON を書くこと"""
    reasoning_file = tmp_path / "reasoning.txt"
    reasoning_file.write_text("existing", encoding="utf-8")
    answer_file = tmp_path / "answer.json"
    captured: list[CoreRagRequest] = []
    controller = make_controller(
        rag_runtime(captured, _rag_success("answer-no-delta")), 1
    )
    controller.reasoning_output_path = str(reasoning_file)

    controller.execute_llm_with_context(_context_schema(), str(answer_file))

    assert "answer-no-delta" in answer_file.read_text(encoding="utf-8")
    assert reasoning_file.read_text(encoding="utf-8") == "existing"


def test_out_mode_one_provider_failure_keeps_partial_reasoning(
    tmp_path: Path,
    make_controller: Callable[..., GenerativeAiController],
    sse_lines: Callable[..., str],
) -> None:
    """RAG が失敗しても書いた差分は残り、回答ファイルは作らないこと"""
    reasoning_file = tmp_path / "reasoning.txt"
    reasoning_file.touch()
    answer_file = tmp_path / "answer.json"

    def handle(request: CoreRagRequest, context: ExecutionContext) -> CoreChatResult:
        """差分を送って失敗を返す。

        Parameters
        ----------
        request : CoreRagRequest
            RAG のリクエスト。
        context : ExecutionContext
            実行の文脈（使わない）。

        Returns
        -------
        CoreChatResult
            失敗の結果。
        """
        request.chat_request.stream_callbacks().on_reasoning_delta("partial")
        return CoreChatResult.from_failure(
            CoreFailure.of("SECUAIGENT_NETWORK_FAILURE", "sanitized failure"),
            request.chat_request.output_mode_hint,
        )

    controller = make_controller(_rag_runtime(handle), 1)
    controller.reasoning_output_path = str(reasoning_file)

    with pytest.raises(RuntimeError):
        controller.execute_llm_with_context(_context_schema(), str(answer_file))

    assert reasoning_file.read_text(encoding="utf-8") == sse_lines("partial")
    assert not answer_file.exists()
