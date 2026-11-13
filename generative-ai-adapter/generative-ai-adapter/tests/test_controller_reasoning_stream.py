"""通常 chat の途中経過ファイルへの追記と回答の書き込みのテスト。

移植元: controller/GenerativeAiControllerReasoningStreamTest。

- 移植元の「別スレッドの reader から観測する」は、コールバックの中でファイルを読んで
  確かめる形に置き換える（書き込みは 1 行ごとに flush されるため同じことを確かめられる）
- `CoreStreamCallbacks.none()` は `NO_STREAM_CALLBACKS` に当たる
"""

from collections.abc import Callable, Sequence
from pathlib import Path

import pytest
from generative_ai_adapter.controller import GenerativeAiController
from generative_ai_adapter.domain import Message, RequestSchema
from generative_ai_core.chat.models import (
    NO_STREAM_CALLBACKS,
    CoreChatRequest,
    CoreChatResult,
)
from generative_ai_core.chat.runtime import CoreChatRuntime
from generative_ai_core.failure import CoreFailure
from generative_ai_core.provider.model import Capability
from generative_ai_core.provider.runtime import CoreProviderRuntime, ExecutionContext

PROVIDER_ID = "OpenAI"
ChatHandler = Callable[[CoreChatRequest, ExecutionContext], CoreChatResult]


def _runtime(handler: ChatHandler) -> CoreChatRuntime:
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


def _hello_schema() -> RequestSchema:
    """ユーザーの `hello` だけのリクエストを作る。

    Returns
    -------
    RequestSchema
        リクエスト。
    """
    return RequestSchema(messages=[Message.of_index(0, "hello")])


def _streaming_runtime(reasoning_deltas: Sequence[str], answer: str) -> CoreChatRuntime:
    """推論の差分を順に送ってから回答を返す runtime を作る。

    Parameters
    ----------
    reasoning_deltas : Sequence[str]
        送る推論の差分。
    answer : str
        回答。

    Returns
    -------
    CoreChatRuntime
        runtime。
    """

    def handle(request: CoreChatRequest, context: ExecutionContext) -> CoreChatResult:
        """差分を送って回答を返す。

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
        callbacks = request.stream_callbacks()
        for delta in reasoning_deltas:
            callbacks.on_reasoning_delta(delta)
        return CoreChatResult.success(answer, [], request.output_mode_hint)

    return _runtime(handle)


def _failing_after_reasoning_runtime(partial_reasoning: str | None) -> CoreChatRuntime:
    """推論の差分を（あれば）送ってから失敗を返す runtime を作る。

    Parameters
    ----------
    partial_reasoning : str | None
        失敗の前に送る差分。None なら送らない。

    Returns
    -------
    CoreChatRuntime
        runtime。
    """

    def handle(request: CoreChatRequest, context: ExecutionContext) -> CoreChatResult:
        """差分を送って失敗を返す。

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
        if partial_reasoning is not None:
            request.stream_callbacks().on_reasoning_delta(partial_reasoning)
        return CoreChatResult.from_failure(
            CoreFailure.of("STREAM_FAILURE", "stream interrupted"),
            request.output_mode_hint,
        )

    return _runtime(handle)


def _observable_reasoning_runtime(
    reasoning_deltas: Sequence[str],
    answer: str,
    reasoning_file: Path,
    sse_lines: Callable[..., str],
    answer_file: Path | None = None,
) -> CoreChatRuntime:
    """差分を送るたびに、途中経過ファイルが書き出し済みかを確かめる runtime を作る。

    Parameters
    ----------
    reasoning_deltas : Sequence[str]
        送る推論の差分。
    answer : str
        回答。
    reasoning_file : Path
        途中経過ファイル。
    sse_lines : Callable[..., str]
        SSE の行を作る関数。
    answer_file : Path | None, optional
        指定すると、差分の間は回答ファイルが空のままであることも確かめる。

    Returns
    -------
    CoreChatRuntime
        runtime。
    """

    def handle(request: CoreChatRequest, context: ExecutionContext) -> CoreChatResult:
        """差分を送り、そのたびにファイルを読んで確かめる。

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
        callbacks = request.stream_callbacks()
        sent: list[str] = []
        for delta in reasoning_deltas:
            callbacks.on_reasoning_delta(delta)
            sent.append(delta)
            assert reasoning_file.read_text(encoding="utf-8") == sse_lines(*sent)
            if answer_file is not None:
                assert answer_file.exists()
                assert answer_file.read_text(encoding="utf-8") == ""
        return CoreChatResult.success(answer, [], request.output_mode_hint)

    return _runtime(handle)


def _execute_with_reasoning(
    controller: GenerativeAiController, reasoning_file: Path, answer_file: Path
) -> None:
    """途中経過ファイルを設定して `hello` の chat を実行する。

    Parameters
    ----------
    controller : GenerativeAiController
        controller。
    reasoning_file : Path
        途中経過ファイル。
    answer_file : Path
        回答ファイル。
    """
    controller.reasoning_output_path = str(reasoning_file)
    controller.execute_llm(_hello_schema(), str(answer_file))


def test_flushes_mixed_typed_callbacks_before_next_event_and_final_answer(
    tmp_path: Path, make_controller: Callable[..., GenerativeAiController]
) -> None:
    """種類の違う差分も 1 件ごとに書き出され、回答はすべての差分の後に書かれること"""
    reasoning_file = tmp_path / "reasoning.txt"
    reasoning_file.touch()
    answer_file = tmp_path / "answer.txt"
    answer_file.touch()
    stream_completed = [False]
    after_reasoning = 'data:{"type":"reasoning_delta","text":"reason-a"}\n'
    after_title = (
        after_reasoning + 'data:{"type":"library_title_delta","text":"title-a"}\n'
    )
    after_content = (
        after_title + 'data:{"type":"library_content_delta","text":"content-a"}\n'
    )
    complete = after_content + 'data:{"type":"reasoning_delta","text":"reason-b"}\n'

    def observe(expected_reasoning: str) -> None:
        """コールバックの直後のファイルの内容を確かめる。

        Parameters
        ----------
        expected_reasoning : str
            途中経過ファイルの期待値。
        """
        assert reasoning_file.read_text(encoding="utf-8") == expected_reasoning
        assert answer_file.read_text(encoding="utf-8") == ""
        assert stream_completed[0] is False

    def handle(request: CoreChatRequest, context: ExecutionContext) -> CoreChatResult:
        """種類の違う差分を送り、そのたびに観測する。

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
        callbacks = request.stream_callbacks()
        callbacks.on_reasoning_delta("reason-a")
        observe(after_reasoning)
        callbacks.on_library_title_delta("title-a")
        observe(after_title)
        callbacks.on_library_content_delta("content-a")
        observe(after_content)
        callbacks.on_reasoning_delta("reason-b")
        observe(complete)
        stream_completed[0] = True
        return CoreChatResult.success("final", [], request.output_mode_hint)

    controller = make_controller(_runtime(handle), 2)

    _execute_with_reasoning(controller, reasoning_file, answer_file)

    assert stream_completed[0] is True
    assert reasoning_file.read_text(encoding="utf-8") == complete
    assert answer_file.read_text(encoding="utf-8") == "final"


def test_keeps_flushed_mixed_lines_and_main_answer_on_sanitized_stream_failure(
    tmp_path: Path, make_controller: Callable[..., GenerativeAiController]
) -> None:
    """失敗しても書いた差分は残り、回答ファイルは変わらず、例外に秘密情報が出ないこと"""
    reasoning_file = tmp_path / "reasoning.txt"
    reasoning_file.touch()
    answer_file = tmp_path / "answer.txt"
    answer_file.write_text("before", encoding="utf-8")
    credential_sentinel = "credential-sentinel.invalid"
    internal_url_sentinel = "internal.example.invalid"

    def handle(request: CoreChatRequest, context: ExecutionContext) -> CoreChatResult:
        """差分を送ってから秘密情報を含む失敗を返す。

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
        request.stream_callbacks().on_reasoning_delta("partial-reason")
        request.stream_callbacks().on_library_title_delta("partial-title")
        return CoreChatResult.from_failure(
            CoreFailure.of(
                "STREAM_FAILURE",
                f"api_key={credential_sentinel} endpoint=https://"
                f"{internal_url_sentinel}",
            ),
            request.output_mode_hint,
        )

    controller = make_controller(_runtime(handle), 2)

    with pytest.raises(RuntimeError) as raised:
        _execute_with_reasoning(controller, reasoning_file, answer_file)

    assert credential_sentinel not in str(raised.value)
    assert internal_url_sentinel not in str(raised.value)
    assert reasoning_file.read_text(encoding="utf-8") == (
        'data:{"type":"reasoning_delta","text":"partial-reason"}\n'
        'data:{"type":"library_title_delta","text":"partial-title"}\n'
    )
    assert answer_file.read_text(encoding="utf-8") == "before"


def test_appends_reasoning_deltas_and_writes_answer_only_on_success(
    tmp_path: Path,
    make_controller: Callable[..., GenerativeAiController],
    sse_lines: Callable[..., str],
) -> None:
    """推論の差分を追記し、成功したときだけ回答を書くこと"""
    reasoning_file = tmp_path / "reasoning.txt"
    reasoning_file.touch()
    answer_file = tmp_path / "answer.txt"
    controller = make_controller(_streaming_runtime(["r1", "r2"], "final"), 2)

    _execute_with_reasoning(controller, reasoning_file, answer_file)

    assert reasoning_file.read_text(encoding="utf-8") == sse_lines("r1", "r2")
    assert answer_file.read_text(encoding="utf-8") == "final"


def test_succeeds_with_empty_reasoning_file_when_no_deltas_arrive(
    tmp_path: Path, make_controller: Callable[..., GenerativeAiController]
) -> None:
    """差分が届かなくても成功し、途中経過ファイルは空のままであること"""
    reasoning_file = tmp_path / "reasoning.txt"
    reasoning_file.touch()
    answer_file = tmp_path / "answer.txt"
    controller = make_controller(_streaming_runtime([], "plain-answer"), 2)

    _execute_with_reasoning(controller, reasoning_file, answer_file)

    assert reasoning_file.read_text(encoding="utf-8") == ""
    assert answer_file.read_text(encoding="utf-8") == "plain-answer"


def test_skips_reasoning_side_effects_when_property_path_is_unset(
    tmp_path: Path,
    make_controller: Callable[..., GenerativeAiController],
    chat_runtime: Callable[..., CoreChatRuntime],
    json_answer: Callable[[str], CoreChatResult],
) -> None:
    """途中経過ファイルの設定がなければコールバックを渡さないこと"""
    answer_file = tmp_path / "answer.txt"
    captured: list[CoreChatRequest] = []
    controller = make_controller(chat_runtime(captured, json_answer("ok")), 0)

    controller.execute_llm(_hello_schema(), str(answer_file))

    assert captured[0].stream_callbacks() is NO_STREAM_CALLBACKS
    assert "ok" in answer_file.read_text(encoding="utf-8")


@pytest.mark.parametrize("partial", ["partial", "kept"])
def test_keeps_partial_reasoning_and_skips_answer_on_mid_stream_failure(
    tmp_path: Path,
    make_controller: Callable[..., GenerativeAiController],
    sse_lines: Callable[..., str],
    partial: str,
) -> None:
    """途中で失敗しても書いた差分は残り、回答ファイルは書き換えないこと"""
    reasoning_file = tmp_path / "reasoning.txt"
    reasoning_file.touch()
    answer_file = tmp_path / "answer.txt"
    answer_file.write_text("before", encoding="utf-8")
    controller = make_controller(_failing_after_reasoning_runtime(partial), 2)

    with pytest.raises(RuntimeError):
        _execute_with_reasoning(controller, reasoning_file, answer_file)

    assert reasoning_file.read_text(encoding="utf-8") == sse_lines(partial)
    assert answer_file.read_text(encoding="utf-8") == "before"


def test_answer_only_stream_leaves_side_file_empty_without_sse_lines(
    tmp_path: Path, make_controller: Callable[..., GenerativeAiController]
) -> None:
    """回答だけのストリームでは途中経過ファイルに何も書かないこと"""
    reasoning_file = tmp_path / "reasoning.txt"
    reasoning_file.touch()
    answer_file = tmp_path / "answer.txt"
    controller = make_controller(_streaming_runtime([], "answer-only"), 2)

    _execute_with_reasoning(controller, reasoning_file, answer_file)

    assert reasoning_file.read_text(encoding="utf-8") == ""
    assert answer_file.read_text(encoding="utf-8") == "answer-only"


def test_preserves_existing_failure_semantics_when_reasoning_path_unset(
    tmp_path: Path,
    make_controller: Callable[..., GenerativeAiController],
    failing_runtime: Callable[..., CoreChatRuntime],
) -> None:
    """途中経過ファイルの設定がなくても、失敗時は例外になり回答ファイルを書かないこと"""
    answer_file = tmp_path / "answer.txt"
    answer_file.write_text("before", encoding="utf-8")
    controller = make_controller(
        failing_runtime(Capability.CHAT, RuntimeError("marker-value")), 0
    )

    with pytest.raises(RuntimeError):
        controller.execute_llm(_hello_schema(), str(answer_file))

    assert answer_file.read_text(encoding="utf-8") == "before"


def test_flushes_each_reasoning_delta_before_next_delta_arrives(
    tmp_path: Path,
    make_controller: Callable[..., GenerativeAiController],
    sse_lines: Callable[..., str],
) -> None:
    """差分は次の差分が届く前に 1 件ずつ書き出されること"""
    reasoning_file = tmp_path / "reasoning.txt"
    reasoning_file.touch()
    answer_file = tmp_path / "answer.txt"
    runtime = _observable_reasoning_runtime(
        ["A", "B", "C"], "final", reasoning_file, sse_lines
    )
    controller = make_controller(runtime, 2)

    _execute_with_reasoning(controller, reasoning_file, answer_file)

    assert reasoning_file.read_text(encoding="utf-8") == sse_lines("A", "B", "C")
    assert answer_file.read_text(encoding="utf-8") == "final"


def test_flushes_reasoning_before_final_answer_write(
    tmp_path: Path,
    make_controller: Callable[..., GenerativeAiController],
    sse_lines: Callable[..., str],
) -> None:
    """差分は回答の書き込みより前に書き出され、その間回答ファイルは空のままであること"""
    reasoning_file = tmp_path / "reasoning.txt"
    reasoning_file.touch()
    answer_file = tmp_path / "answer.txt"
    answer_file.touch()
    runtime = _observable_reasoning_runtime(
        ["r1", "r2"], "done", reasoning_file, sse_lines, answer_file
    )
    controller = make_controller(runtime, 2)

    _execute_with_reasoning(controller, reasoning_file, answer_file)

    assert reasoning_file.read_text(encoding="utf-8") == sse_lines("r1", "r2")
    assert answer_file.read_text(encoding="utf-8") == "done"


def test_preserves_output_type_zero_json_answer_with_reasoning_flush(
    tmp_path: Path,
    make_controller: Callable[..., GenerativeAiController],
    sse_lines: Callable[..., str],
) -> None:
    """出力モード 0 では途中経過を書きつつ、回答は JSON で書くこと"""
    reasoning_file = tmp_path / "reasoning.txt"
    reasoning_file.touch()
    answer_file = tmp_path / "answer.txt"
    controller = make_controller(_streaming_runtime(["trace"], "json-answer"), 0)

    _execute_with_reasoning(controller, reasoning_file, answer_file)

    assert reasoning_file.read_text(encoding="utf-8") == sse_lines("trace")
    answer = answer_file.read_text(encoding="utf-8")
    assert "json-answer" in answer
    assert '"answer"' in answer


def test_preserves_output_type_two_plain_answer_with_reasoning_flush(
    tmp_path: Path,
    make_controller: Callable[..., GenerativeAiController],
    sse_lines: Callable[..., str],
) -> None:
    """出力モード 2 では途中経過を書きつつ、回答は本文だけを書くこと"""
    reasoning_file = tmp_path / "reasoning.txt"
    reasoning_file.touch()
    answer_file = tmp_path / "answer.txt"
    controller = make_controller(_streaming_runtime(["trace"], "plain-answer"), 2)

    _execute_with_reasoning(controller, reasoning_file, answer_file)

    assert reasoning_file.read_text(encoding="utf-8") == sse_lines("trace")
    assert answer_file.read_text(encoding="utf-8") == "plain-answer"


def test_omits_empty_reasoning_deltas_and_preserves_whitespace_in_side_file(
    tmp_path: Path,
    make_controller: Callable[..., GenerativeAiController],
    sse_lines: Callable[..., str],
) -> None:
    """空の差分は書かず、空白だけの差分はそのまま書くこと"""
    reasoning_file = tmp_path / "reasoning.txt"
    reasoning_file.touch()
    answer_file = tmp_path / "answer.txt"
    controller = make_controller(
        _streaming_runtime(["", "valid", "   "], "answer-only"), 2
    )

    _execute_with_reasoning(controller, reasoning_file, answer_file)

    assert reasoning_file.read_text(encoding="utf-8") == sse_lines("valid", "   ")
    assert answer_file.read_text(encoding="utf-8") == "answer-only"


def test_fails_when_stream_fails_before_any_reasoning_delta(
    tmp_path: Path, make_controller: Callable[..., GenerativeAiController]
) -> None:
    """差分の前に失敗したら例外になり、途中経過ファイルは空・回答ファイルは変わらないこと"""
    reasoning_file = tmp_path / "reasoning.txt"
    reasoning_file.touch()
    answer_file = tmp_path / "answer.txt"
    answer_file.write_text("before", encoding="utf-8")
    controller = make_controller(_failing_after_reasoning_runtime(None), 2)

    with pytest.raises(RuntimeError):
        _execute_with_reasoning(controller, reasoning_file, answer_file)

    assert reasoning_file.read_text(encoding="utf-8") == ""
    assert answer_file.read_text(encoding="utf-8") == "before"
