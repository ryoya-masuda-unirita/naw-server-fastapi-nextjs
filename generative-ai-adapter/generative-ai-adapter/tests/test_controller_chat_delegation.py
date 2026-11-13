"""通常 chat を core の runtime へ任せることを確かめる。

移植元: controller/GenerativeAiControllerChatDelegationTest。

- 移植元の画像（Spring の ByteArrayResource）は Python ではバイト列で持つ。
  core の media の payload が同じオブジェクトであることを確かめる
"""

from collections.abc import Callable
from pathlib import Path

from generative_ai_adapter.controller import GenerativeAiController
from generative_ai_adapter.domain import Message, RequestSchema
from generative_ai_core.chat.models import (
    CoreChatRequest,
    CoreChatResult,
    OutputModeHint,
)
from generative_ai_core.chat.runtime import CoreChatRuntime

IMAGE_PNG = "image/png"


def test_execute_llm_writes_retrieval_answer_json_and_preserves_media(
    tmp_path: Path,
    chat_runtime: Callable[..., CoreChatRuntime],
    make_controller: Callable[..., GenerativeAiController],
) -> None:
    """core の回答を RetrievalAnswer JSON で書き、画像を media として渡すこと"""
    captured: list[CoreChatRequest] = []
    runtime = chat_runtime(
        captured,
        CoreChatResult.success(
            "delegated answer", [], OutputModeHint.RETRIEVAL_ANSWER_JSON
        ),
    )
    controller = make_controller(runtime, 0)
    image = bytes([1, 2])
    schema = RequestSchema(messages=[Message.of_index(0, "describe", image, IMAGE_PNG)])
    output = tmp_path / "executeLlmDelegatedJson.txt"

    controller.execute_llm(schema, str(output))

    assert (
        output.read_text(encoding="utf-8")
        == '{"answer":"delegated answer","filepaths":[],"references":[]}'
    )
    media = captured[0].messages[0].media
    assert len(media) == 1
    assert media[0].payload is image


def test_execute_llm_output_type2_writes_plain_answer_only(
    tmp_path: Path,
    chat_runtime: Callable[..., CoreChatRuntime],
    make_controller: Callable[..., GenerativeAiController],
) -> None:
    """出力モード 2 では回答本文だけを書き、PLAIN_ANSWER_TEXT を core へ渡すこと"""
    captured: list[CoreChatRequest] = []
    runtime = chat_runtime(
        captured,
        CoreChatResult.success(
            "plain delegated answer", [], OutputModeHint.PLAIN_ANSWER_TEXT
        ),
    )
    controller = make_controller(runtime, 2)
    schema = RequestSchema(messages=[Message.of_index(0, "hello")])
    output = tmp_path / "executeLlmDelegatedPlain.txt"

    controller.execute_llm(schema, str(output))

    assert output.read_text(encoding="utf-8") == "plain delegated answer"
    assert captured[0].output_mode_hint == OutputModeHint.PLAIN_ANSWER_TEXT
