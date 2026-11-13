"""通常 chat のリクエストの変換のテスト（移植元 service/core/AdapterCoreChatMapperTest）。

移植元との違い:

- 移植元は画像を Spring の Resource で持ち、ファイル名（getFilename）があればそれを
  sourceHint にする。Python 版の Message は画像をバイト列で持ちファイル名がないため、
  本番の ByteArrayResource と同じく常に `Byte array resource` になる。ファイル名を
  上書きした Resource の確認は、この既定の名前の確認に置き換えた
- 移植元の tools 1 件のオーバーロード（`(CoreChatTool) null`・webSearch）は、Python 版の
  `chat_tools` のシーケンス（空・1 件）で確かめる
"""

from typing import cast

import pytest
from generative_ai_adapter.constants import ReasoningEffort, Verbosity
from generative_ai_adapter.core_mappers import AdapterCoreChatMapper
from generative_ai_adapter.domain import ChatGPTParameter, Message, RequestSchema
from generative_ai_core.chat.models import (
    GENERATION_OPTIONS_ATTRIBUTE,
    RAG_JSON_RESPONSE_ATTRIBUTE,
    RAG_TOOL_INTENT_ATTRIBUTE,
    CoreChatTool,
    CoreGenerationOptions,
    OutputModeHint,
    Role,
)
from generative_ai_core.network.setting import CoreNetworkSetting

BYTE_ARRAY_RESOURCE = "Byte array resource"


@pytest.fixture
def mapper() -> AdapterCoreChatMapper:
    """OpenAI・既定のネットワーク設定の mapper を返す。

    Returns
    -------
    AdapterCoreChatMapper
        テスト対象の mapper。
    """
    return AdapterCoreChatMapper("OpenAI", CoreNetworkSetting.defaults())


def test_maps_roles_output_mode_hints_and_preserves_media(
    mapper: AdapterCoreChatMapper,
) -> None:
    """役割・出力モードを変換し、画像を media としてそのまま渡すこと"""
    image = bytes([1, 2, 3])
    schema = RequestSchema(
        messages=[
            Message.of_index(1, "system message"),
            Message.of_index(0, "user message", image, "image/png"),
            Message.of_index(2, "assistant message"),
        ]
    )

    json_request = mapper.to_chat_request(schema, 0)
    plain_request = mapper.to_chat_request(schema, 2)

    assert json_request.output_mode_hint == OutputModeHint.RETRIEVAL_ANSWER_JSON
    assert plain_request.output_mode_hint == OutputModeHint.PLAIN_ANSWER_TEXT
    assert [m.role for m in json_request.messages] == [
        Role.SYSTEM,
        Role.USER,
        Role.ASSISTANT,
    ]
    assert [m.content for m in json_request.messages] == [
        "system message",
        "user message",
        "assistant message",
    ]
    user_message = json_request.messages[1]
    assert user_message.media_references == (BYTE_ARRAY_RESOURCE,)
    assert len(user_message.media) == 1
    media = user_message.media[0]
    assert media.mime_type == "image/png"
    assert media.source_hint == BYTE_ARRAY_RESOURCE
    assert media.payload is image
    assert schema not in json_request.attributes.values()


def test_maps_none_message_list_to_empty_core_messages(
    mapper: AdapterCoreChatMapper,
) -> None:
    """メッセージがなければ core のメッセージは空になること"""
    request = mapper.to_chat_request(RequestSchema(), 0)

    assert request.messages == ()


def test_maps_none_request_without_adapter_dto_attributes(
    mapper: AdapterCoreChatMapper,
) -> None:
    """リクエストが None なら、メッセージも属性も空になること"""
    request = mapper.to_chat_request(None, 0)

    assert request.messages == ()
    assert request.attributes == {}


def test_empty_or_single_tool_keeps_legacy_behavior(
    mapper: AdapterCoreChatMapper,
) -> None:
    """tools なしなら空、web_search 1 件ならその 1 件が渡ること"""
    schema = RequestSchema()

    no_tool_request = mapper.to_chat_request(schema, 0, ())
    web_search_request = mapper.to_chat_request(schema, 0, [CoreChatTool.web_search()])

    assert no_tool_request.tools() == []
    assert web_search_request.tools() == [CoreChatTool.web_search()]


@pytest.mark.parametrize("provider_id", [None, " "])
def test_rejects_blank_provider_id(provider_id: str | None) -> None:
    """プロバイダが None・空白なら ValueError になること"""
    with pytest.raises(ValueError, match="providerId"):
        AdapterCoreChatMapper(cast(str, provider_id), CoreNetworkSetting.defaults())


def test_defaults_none_network_setting() -> None:
    """ネットワーク設定が None なら既定の設定を使うこと"""
    mapper_with_default_network = AdapterCoreChatMapper("OpenAI", None)

    request = mapper_with_default_network.to_chat_request(RequestSchema(), 0)

    assert request.network_setting == CoreNetworkSetting.defaults()


def test_maps_none_message_unknown_role_and_resource_description_fallback(
    mapper: AdapterCoreChatMapper,
) -> None:
    """None のメッセージと未知の役割は user にし、画像の名前は既定の説明にすること"""
    image_without_filename = bytes([9, 8, 7])
    schema = RequestSchema(
        messages=cast(
            list[Message],
            [
                None,
                Message("tool", "falls back to user", image_without_filename, None),
            ],
        )
    )

    request = mapper.to_chat_request(schema, 0)

    assert len(request.messages) == 2
    assert request.messages[0].role == Role.USER
    assert request.messages[0].content == ""
    assert request.messages[1].role == Role.USER
    assert len(request.messages[1].media) == 1
    media = request.messages[1].media[0]
    assert media.mime_type == ""
    assert BYTE_ARRAY_RESOURCE in media.source_hint


def test_maps_generation_parameters_and_rag_intent_into_core_request_attributes(
    mapper: AdapterCoreChatMapper,
) -> None:
    """生成パラメータ・JSON 応答・submit_question の意図を属性に入れること"""
    parameter = ChatGPTParameter(
        temperature=0.25,
        top_p=0.75,
        frequency_penalty=0.15,
        presence_penalty=0.35,
        max_tokens=256,
        stop="STOP",
        reasoning_effort=ReasoningEffort.HIGH,
        verbosity=Verbosity.LOW,
    )
    schema = RequestSchema.with_parameter("gpt-4o-mini", parameter)
    schema.messages = [Message.of_index(0, "hello")]
    schema.set_response_json()
    schema.add_submit_question_tool()

    request = mapper.to_chat_request(schema, 1)

    assert request.attributes[RAG_JSON_RESPONSE_ATTRIBUTE] is True
    assert request.attributes[RAG_TOOL_INTENT_ATTRIBUTE] == "submit_question"
    assert schema not in request.attributes.values()
    options = request.attributes[GENERATION_OPTIONS_ATTRIBUTE]
    assert isinstance(options, CoreGenerationOptions)
    assert options.temperature == 0.25
    assert options.top_p == 0.75
    assert options.frequency_penalty == 0.15
    assert options.presence_penalty == 0.35
    assert options.max_tokens == 256
    assert options.stop == "STOP"
    assert options.reasoning_effort == "high"
    assert options.verbosity == "low"
