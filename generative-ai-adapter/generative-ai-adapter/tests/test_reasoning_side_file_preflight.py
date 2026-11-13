"""途中経過ファイルを開けないときに、プロバイダを呼ぶ前に失敗することのテスト。

移植元: controller/ReasoningSideFilePreflightTest。

- 書き込み不可は `chmod 0o444` で作る（移植元の `setWritable(false, false)` に当たる）。
  root で動かすと書けてしまうため、その場合は skip する
- 開けないときの再試行（最大 2 秒）の待ちは `time.sleep` を差し替えてなくす
"""

import os
import stat
import time
from collections.abc import Callable
from pathlib import Path

import pytest
from generative_ai_adapter.controller import GenerativeAiController
from generative_ai_adapter.domain import Message, RequestSchema, RetrievalContext
from generative_ai_core.chat.models import (
    CoreChatRequest,
    CoreChatResult,
    CoreChatTool,
    CoreRagRequest,
    OutputModeHint,
)
from generative_ai_core.chat.runtime import CoreChatRuntime
from generative_ai_core.provider.model import Capability
from generative_ai_core.provider.runtime import CoreProviderRuntime, ExecutionContext

PROVIDER_ID = "OpenAI"
READ_ONLY_MODE = stat.S_IRUSR | stat.S_IRGRP | stat.S_IROTH
READ_WRITE_MODE = READ_ONLY_MODE | stat.S_IWUSR

requires_non_root = pytest.mark.skipif(
    hasattr(os, "geteuid") and os.geteuid() == 0,
    reason="root では書き込み不可のファイルにも書けるため",
)


@pytest.fixture(autouse=True)
def no_retry_wait(monkeypatch: pytest.MonkeyPatch) -> None:
    """途中経過ファイルを開くときの再試行の待ちをなくす。

    Parameters
    ----------
    monkeypatch : pytest.MonkeyPatch
        差し替えに使う。
    """
    monkeypatch.setattr(time, "sleep", lambda seconds: None)


def _chat_controller(
    calls: list[CoreChatRequest],
    output_type: int,
    make_controller: Callable[..., GenerativeAiController],
) -> GenerativeAiController:
    """呼ばれた chat を記録する controller を作る。

    Parameters
    ----------
    calls : list[CoreChatRequest]
        受け取ったリクエストを追加するリスト（呼び出し回数を数える）。
    output_type : int
        出力モード。
    make_controller : Callable[..., GenerativeAiController]
        controller を作る関数。

    Returns
    -------
    GenerativeAiController
        controller。
    """

    def handle(request: CoreChatRequest, context: ExecutionContext) -> CoreChatResult:
        """呼び出しを記録して回答を返す。

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
        calls.append(request)
        return CoreChatResult.success("answer", [], request.output_mode_hint)

    runtime = CoreChatRuntime(
        CoreProviderRuntime.builder()
        .register(PROVIDER_ID, Capability.CHAT, CoreChatRequest, handle)
        .build()
    )
    return make_controller(runtime, output_type)


def _rag_result() -> CoreChatResult:
    """参照 ID 1 の RAG の成功結果を作る。

    Returns
    -------
    CoreChatResult
        成功の結果。
    """
    return CoreChatResult.success(
        "answer", [], OutputModeHint.RETRIEVAL_ANSWER_JSON, reference_ids=[1]
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


def _read_only_file(path: Path) -> Path:
    """書き込み不可の空ファイルを作る。

    Parameters
    ----------
    path : Path
        作るファイル。

    Returns
    -------
    Path
        作ったファイル。
    """
    path.touch()
    path.chmod(READ_ONLY_MODE)
    return path


@requires_non_root
@pytest.mark.parametrize(
    ("output_type", "answer_name"), [(2, "answer.txt"), (0, "answer.json")]
)
def test_unwritable_reasoning_file_fails_before_provider_call(
    tmp_path: Path,
    make_controller: Callable[..., GenerativeAiController],
    output_type: int,
    answer_name: str,
) -> None:
    """通常 chat で途中経過ファイルに書けなければ、プロバイダを呼ばずに失敗すること"""
    reasoning_file = _read_only_file(tmp_path / "reasoning.txt")
    answer_file = tmp_path / answer_name
    calls: list[CoreChatRequest] = []
    controller = _chat_controller(calls, output_type, make_controller)
    controller.reasoning_output_path = str(reasoning_file)

    try:
        with pytest.raises(RuntimeError):
            controller.execute_llm(_hello_schema(), str(answer_file))

        assert calls == []
        assert not answer_file.exists()
    finally:
        reasoning_file.chmod(READ_WRITE_MODE)


@pytest.mark.parametrize(
    ("output_type", "answer_name"), [(0, "answer.json"), (2, "answer.txt")]
)
def test_missing_reasoning_file_fails_before_provider_call_and_creates_no_files(
    tmp_path: Path,
    make_controller: Callable[..., GenerativeAiController],
    output_type: int,
    answer_name: str,
) -> None:
    """通常 chat で途中経過ファイルがなければ、プロバイダを呼ばずファイルも作らないこと"""
    reasoning_file = tmp_path / "missing-reasoning.txt"
    answer_file = tmp_path / answer_name
    calls: list[CoreChatRequest] = []
    controller = _chat_controller(calls, output_type, make_controller)
    controller.reasoning_output_path = str(reasoning_file)

    with pytest.raises(RuntimeError):
        controller.execute_llm(_hello_schema(), str(answer_file))

    assert calls == []
    assert not reasoning_file.exists()
    assert not answer_file.exists()


def test_out_mode_one_missing_reasoning_file_fails_before_provider_call(
    tmp_path: Path,
    make_controller: Callable[..., GenerativeAiController],
    rag_runtime: Callable[..., CoreChatRuntime],
) -> None:
    """RAG で途中経過ファイルがなければ、プロバイダを呼ばずファイルも作らないこと"""
    reasoning_file = tmp_path / "missing-reasoning.txt"
    answer_file = tmp_path / "answer.json"
    calls: list[CoreRagRequest] = []
    controller = make_controller(rag_runtime(calls, _rag_result()), 1)
    controller.reasoning_output_path = str(reasoning_file)

    with pytest.raises(RuntimeError):
        controller.execute_llm_with_context(_context_schema(), str(answer_file))

    assert calls == []
    assert not reasoning_file.exists()
    assert not answer_file.exists()


@requires_non_root
def test_out_mode_one_unwritable_reasoning_file_fails_before_provider_call(
    tmp_path: Path,
    make_controller: Callable[..., GenerativeAiController],
    rag_runtime: Callable[..., CoreChatRuntime],
) -> None:
    """RAG で途中経過ファイルに書けなければ、プロバイダを呼ばずに失敗すること"""
    reasoning_file = _read_only_file(tmp_path / "reasoning.txt")
    answer_file = tmp_path / "answer.json"
    calls: list[CoreRagRequest] = []
    controller = make_controller(rag_runtime(calls, _rag_result()), 1)
    controller.reasoning_output_path = str(reasoning_file)

    try:
        with pytest.raises(RuntimeError):
            controller.execute_llm_with_context(_context_schema(), str(answer_file))

        assert calls == []
        assert not answer_file.exists()
    finally:
        reasoning_file.chmod(READ_WRITE_MODE)


def test_input_deficient_rag_skips_missing_reasoning_file_and_keeps_deficiency(
    tmp_path: Path,
    make_controller: Callable[..., GenerativeAiController],
    rag_runtime: Callable[..., CoreChatRuntime],
) -> None:
    """RAG の入力不足では途中経過ファイルを開かず、入力不足の回答を書くこと"""
    reasoning_file = tmp_path / "missing-reasoning.txt"
    answer_file = tmp_path / "answer.json"
    calls: list[CoreRagRequest] = []
    controller = make_controller(rag_runtime(calls, _rag_result()), 1)
    controller.reasoning_output_path = str(reasoning_file)

    controller.execute_llm_with_context(RequestSchema(), str(answer_file))

    assert "RAG入力不足" in answer_file.read_text(encoding="utf-8")
    assert calls == []
    assert not reasoning_file.exists()


def test_tools_unsupported_rag_skips_missing_reasoning_file_and_keeps_sanitized_output(
    tmp_path: Path,
    make_controller: Callable[..., GenerativeAiController],
    rag_runtime: Callable[..., CoreChatRuntime],
) -> None:
    """RAG に tools があれば途中経過ファイルを開かず、未対応の経路の失敗を書くこと"""
    reasoning_file = tmp_path / "missing-reasoning.txt"
    answer_file = tmp_path / "answer.json"
    calls: list[CoreRagRequest] = []
    controller = make_controller(
        rag_runtime(calls, _rag_result()), 1, [CoreChatTool.web_search()]
    )
    controller.reasoning_output_path = str(reasoning_file)

    controller.execute_llm_with_context(_context_schema(), str(answer_file))

    assert "unsupported_tools_route" in answer_file.read_text(encoding="utf-8")
    assert calls == []
    assert not reasoning_file.exists()
