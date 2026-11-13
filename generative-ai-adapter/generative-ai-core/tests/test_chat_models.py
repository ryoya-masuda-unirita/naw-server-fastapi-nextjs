"""移植元 CoreChatToolsTest・CoreChatResultTest・CoreGenerationOptionsBranchTest・
CoreImageExplanationRequestTest・CoreImageExplanationResultTest の移植。

移植元の `CoreChatRequest.builder(...).addTool(tool)` は Python 版にないため
`tools([tool])` で代える。
"""

from collections.abc import Mapping
from typing import cast

import pytest
from generative_ai_core.chat.models import (
    CANDIDATE_JSON_RESPONSE_ATTRIBUTE,
    CHAT_TOOLS_ATTRIBUTE,
    GENERATION_OPTIONS_ATTRIBUTE,
    RAG_TOOL_INTENT_ATTRIBUTE,
    CoreChatRequestBuilder,
    CoreChatResult,
    CoreChatTool,
    CoreChatToolKind,
    CoreGenerationOptions,
    CoreImageExplanationRequest,
    CoreImageExplanationResult,
    CoreMedia,
    CoreMessage,
    OutputModeHint,
)
from generative_ai_core.failure import CoreFailure
from generative_ai_core.network.setting import CoreNetworkSetting


def test_no_tools_path_keeps_existing_request_shape() -> None:
    """tools を指定しないときは属性に tools を持たないこと"""
    request = (
        CoreChatRequestBuilder("OpenAI").add_message(CoreMessage.user("hello")).build()
    )

    assert request.tools() == []
    assert CHAT_TOOLS_ATTRIBUTE not in request.attributes
    assert request.with_tools([]).tools() == []
    assert CoreChatRequestBuilder("OpenAI").tools(None).build().tools() == []


def test_carries_single_provider_neutral_web_search_tool_defensively() -> None:
    """web_search の tool を運び、with_tools(None) で外せること"""
    tool = CoreChatTool.web_search()

    request = (
        CoreChatRequestBuilder("SecuAiGent")
        .add_message(CoreMessage.user("hello"))
        .tools([tool])
        .build()
    )

    assert request.tools() == [tool]
    assert CHAT_TOOLS_ATTRIBUTE in request.attributes
    assert request.with_tools(None).tools() == []


def test_carries_mcp_tool_fields_without_changing_runtime_messages() -> None:
    """mcp の tool を運んでもメッセージは変わらないこと"""
    tool = CoreChatTool.mcp("redacted-label", "redacted-url", "never")

    request = (
        CoreChatRequestBuilder("SecuAiGent")
        .add_message(CoreMessage.user("runtime message"))
        .tools([tool])
        .build()
    )

    assert request.last_user_text() == "runtime message"
    assert request.tools() == [tool]
    assert request.tools()[0].kind == CoreChatToolKind.MCP
    assert request.tools()[0].require_approval == "never"


def test_builder_and_tool_normalization_keep_optional_fields_safe() -> None:
    """builder と tool の正規化で任意項目・ヘッダーが整えられること"""
    # 移植元は null のキー・値を含む LinkedHashMap を渡す
    headers = cast(
        Mapping[str, str],
        {" X-Trace ": " trace-value ", None: "ignored", "X-Null": None},
    )
    tool = CoreChatTool.mcp(
        " label ", " https://mcp.example ", " ", " bearer redacted ", headers
    )

    request = (
        CoreChatRequestBuilder(" OpenAI ")
        .messages(None)
        .add_message(CoreMessage.system("system"))
        .add_message(CoreMessage.user("first"))
        .messages([CoreMessage.user("replacement")])
        .tools([tool])
        .attribute(RAG_TOOL_INTENT_ATTRIBUTE, 123)
        .candidate_json_response(True)
        .candidate_json_response(False)
        .build()
    )

    assert tool.is_mcp
    assert tool.wire_name == "mcp"
    assert tool.server_label == "label"
    assert tool.server_url == "https://mcp.example"
    assert tool.require_approval is None
    assert tool.authorization == "bearer redacted"
    assert dict(tool.headers) == {"X-Trace": "trace-value"}
    assert request.provider_id == "OpenAI"
    assert request.last_user_text() == "replacement"
    assert request.rag_tool_intent() == ""
    assert not request.candidate_json_response_requested()
    assert request.tools() == [tool]
    assert CHAT_TOOLS_ATTRIBUTE not in request.with_tools([]).attributes
    with pytest.raises(ValueError):
        CoreChatRequestBuilder("OpenAI").attribute(" ", "value")


def test_tool_headers_are_unmodifiable() -> None:
    """tool のヘッダーは変更できないこと（移植元は unmodifiableMap）"""
    tool = CoreChatTool.mcp("label", "url", "never", None, {"X-Trace": "value"})

    with pytest.raises(TypeError):
        cast(dict[str, str], tool.headers)["new"] = "value"


def test_candidate_json_response_option_is_typed_request_attribute() -> None:
    """候補抽出の JSON 応答の指定が属性 True で運ばれること"""
    request = (
        CoreChatRequestBuilder("OpenAI")
        .candidate_json_response(True)
        .add_message(CoreMessage.user("Extract candidates."))
        .build()
    )

    assert request.candidate_json_response_requested()
    assert request.attributes[CANDIDATE_JSON_RESPONSE_ATTRIBUTE] is True


def test_constructor_without_failure_is_answer_present() -> None:
    """失敗なしで作った結果は answer_present になること"""
    result = CoreChatResult("answer", ("ref",), (), OutputModeHint.CHAT_TEXT, None)

    assert result.answer_present


def test_constructor_with_failure_is_not_answer_present() -> None:
    """失敗ありで作った結果は answer_present にならないこと"""
    result = CoreChatResult(
        "answer",
        ("ref",),
        (),
        OutputModeHint.CHAT_TEXT,
        CoreFailure.of("SAFE_FAILURE", "safe"),
    )

    assert not result.answer_present


def test_default_chat_result_is_normalized() -> None:
    """既定の結果は空の回答・RETRIEVAL_ANSWER_JSON・失敗なしになること"""
    normalized = CoreChatResult()

    assert normalized.answer == ""
    assert normalized.references == ()
    assert normalized.reference_ids == ()
    assert normalized.output_mode_hint == OutputModeHint.RETRIEVAL_ANSWER_JSON
    assert normalized.failure is None


@pytest.mark.parametrize(
    "options",
    [
        CoreGenerationOptions(temperature=0.1),
        CoreGenerationOptions(top_p=0.2),
        CoreGenerationOptions(frequency_penalty=0.3),
        CoreGenerationOptions(presence_penalty=0.4),
        CoreGenerationOptions(max_tokens=16),
        CoreGenerationOptions(stop=" stop "),
        CoreGenerationOptions(reasoning_effort=" low "),
        CoreGenerationOptions(verbosity=" terse "),
    ],
)
def test_is_empty_requires_every_option_to_be_unset(
    options: CoreGenerationOptions,
) -> None:
    """どれか 1 つでも指定があれば空ではないこと"""
    assert not options.is_empty()


def test_generation_options_trim_text_and_treat_blank_as_unset() -> None:
    """文字列の生成パラメータは前後の空白を除き、空なら未指定になること"""
    assert CoreGenerationOptions.empty().is_empty()
    assert CoreGenerationOptions(stop=" stop ").stop == "stop"
    assert CoreGenerationOptions(reasoning_effort=" low ").reasoning_effort == "low"
    assert CoreGenerationOptions(verbosity=" terse ").verbosity == "terse"
    assert CoreGenerationOptions(stop=" ").is_empty()


def test_converts_prepared_media_to_waha_independent_chat_request() -> None:
    """画像説明のリクエストが CHAT_TEXT の chat リクエストに変わること"""
    media = CoreMedia("image/png", "figure-1.png", b"\x01\x02\x03")
    request = CoreImageExplanationRequest(
        "OpenAI",
        CoreNetworkSetting.defaults(),
        "説明してください",
        "追加文脈",
        (media,),
        CoreGenerationOptions(temperature=0.2),
    )

    chat_request = request.to_chat_request()

    assert chat_request.provider_id == "OpenAI"
    assert chat_request.output_mode_hint == OutputModeHint.CHAT_TEXT
    assert len(chat_request.messages) == 1
    assert chat_request.messages[0].media == (media,)
    assert "説明してください" in chat_request.messages[0].content
    assert "追加文脈" in chat_request.messages[0].content
    assert chat_request.attributes[
        GENERATION_OPTIONS_ATTRIBUTE
    ] == CoreGenerationOptions(temperature=0.2)


def test_rejects_blank_provider_without_adapter_types() -> None:
    """プロバイダが空の画像説明リクエストは作れないこと"""
    with pytest.raises(ValueError, match="providerId"):
        CoreImageExplanationRequest(" ")


def test_converts_chat_result_boundaries_into_image_explanation_outcome() -> None:
    """chat の結果が画像説明の結果に変わること"""
    missing = CoreImageExplanationResult.from_chat_result(None)
    assert missing.failure is not None
    assert missing.failure.code == "IMAGE_EXPLANATION_PROVIDER_FAILURE"

    failure = CoreFailure.of("IMAGE_FAILURE", "safe failure")
    failed = CoreImageExplanationResult.from_chat_result(
        CoreChatResult.from_failure(failure, OutputModeHint.CHAT_TEXT)
    )
    assert failed.failure == failure

    no_answer = CoreImageExplanationResult.from_chat_result(
        CoreChatResult.no_answer(OutputModeHint.CHAT_TEXT)
    )
    assert not no_answer.explanation_present
    assert no_answer.failure is None

    success = CoreImageExplanationResult.from_chat_result(
        CoreChatResult.success("diagram explanation", [], OutputModeHint.CHAT_TEXT)
    )
    assert success.explanation_present
    assert success.explanation == "diagram explanation"
