"""移植元 SecuAiGentRequestMapperTest・SecuAiGentRequestMapperToolsTest の移植。"""

import json
from collections.abc import Callable, Mapping, Sequence
from typing import Any

import pytest
from generative_ai_core.chat.models import (
    GENERATION_OPTIONS_ATTRIBUTE,
    RAG_JSON_RESPONSE_ATTRIBUTE,
    CoreChatRequest,
    CoreChatRequestBuilder,
    CoreChatTool,
    CoreGenerationOptions,
    CoreMedia,
    CoreMessage,
    Role,
)
from generative_ai_core.provider.clients.secuaigent import keys
from generative_ai_core.provider.clients.secuaigent.request_mapper import (
    to_text_data_json,
)
from generative_ai_core.provider.clients.secuaigent.text_data import (
    CoreSecuAiGentTextDataFailure,
)
from generative_ai_core.provider.model import (
    CoreCredential,
    CoreProviderId,
    RuntimeProviderConfiguration,
)

Configure = Callable[..., RuntimeProviderConfiguration]
PROVIDER = CoreProviderId.SecuAiGent.canonical_name
LIBRARY_ATTRIBUTES = [
    {keys.CREATE_LIBRARY: "true"},
    {keys.MESSAGE_ID: " ", keys.CREATE_LIBRARY: "true"},
]


def _configuration(
    make_configuration: Configure,
    attributes: Mapping[str, str] | None = None,
    endpoint: str = "https://secuaigent.example.invalid",
) -> RuntimeProviderConfiguration:
    """移植元のテストが使う SecuAiGent の設定を作る。

    Parameters
    ----------
    make_configuration : Configure
        設定の工場。
    attributes : Mapping[str, str] | None, optional
        プロバイダ固有の属性。
    endpoint : str, optional
        接続先。

    Returns
    -------
    RuntimeProviderConfiguration
        設定。
    """
    return make_configuration(
        CoreProviderId.SecuAiGent,
        model_name="deploy-fixture",
        endpoint=endpoint,
        credential=CoreCredential.api_key("login-fixture", "SecuAiGent"),
        attributes=attributes,
    )


def _request(*messages: CoreMessage) -> CoreChatRequest:
    """発言だけを持つ chat リクエストを作る。

    Parameters
    ----------
    *messages : CoreMessage
        発言。

    Returns
    -------
    CoreChatRequest
        chat リクエスト。
    """
    return CoreChatRequestBuilder(PROVIDER).messages(messages).build()


def _map(
    configuration: RuntimeProviderConfiguration, request: CoreChatRequest
) -> dict[str, Any]:
    """textData JSON を作り、辞書として読み戻す。

    Parameters
    ----------
    configuration : RuntimeProviderConfiguration
        設定。
    request : CoreChatRequest
        chat リクエスト。

    Returns
    -------
    dict[str, Any]
        textData の内容。
    """
    root: dict[str, Any] = json.loads(to_text_data_json(configuration, request))
    return root


def _map_tools(
    make_configuration: Configure, tools: Sequence[CoreChatTool]
) -> dict[str, Any]:
    """tools を付けたリクエストの textData を作る。

    Parameters
    ----------
    make_configuration : Configure
        設定の工場。
    tools : Sequence[CoreChatTool]
        付ける tools。

    Returns
    -------
    dict[str, Any]
        textData の内容。
    """
    request = (
        CoreChatRequestBuilder(PROVIDER)
        .add_message(CoreMessage.user("runtime-user-message"))
        .tools(tools)
        .build()
    )
    return _map(
        _configuration(make_configuration, endpoint="https://provider.example.invalid"),
        request,
    )


def test_serializes_ordered_media_filenames_as_message_attachments(
    make_configuration: Configure,
) -> None:
    """メディアのファイル名が、順番どおり発言の attachments になること"""
    request = _request(
        CoreMessage.user(
            "describe",
            [
                CoreMedia("image/png", "first.png", b"\x01"),
                CoreMedia("image/jpeg", "second.jpg", b"\x02"),
            ],
        ),
        CoreMessage.assistant("no media"),
    )

    messages = _map(_configuration(make_configuration), request)["messages"]

    assert messages[0]["attachments"] == ["first.png", "second.jpg"]
    assert "attachments" not in messages[1]


def test_serializes_allowed_non_tool_attributes_and_keeps_runtime_messages(
    make_configuration: Configure,
) -> None:
    """許可した属性・生成パラメータが textData に入り、発言はそのまま残ること"""
    configuration = _configuration(
        make_configuration,
        {
            keys.TENANT_ID: "tenant-fixture",
            keys.MESSAGE_ID: "  message-fixture  ",
            keys.ADDITIONAL_PROMPT: "prompt-fixture",
            keys.CREATE_LIBRARY: "true",
        },
        "https://provider.example.invalid",
    )
    request = (
        CoreChatRequestBuilder(PROVIDER)
        .add_message(CoreMessage.user("runtime-user-message"))
        .attribute(
            GENERATION_OPTIONS_ATTRIBUTE,
            CoreGenerationOptions(
                temperature=0.2,
                max_tokens=1024,
                reasoning_effort="high",
                verbosity="low",
            ),
        )
        .build()
    )

    root = _map(configuration, request)

    assert root["messageId"] == "message-fixture"
    assert root["additionalPrompt"] == "prompt-fixture"
    assert root["createLibrary"] is True
    assert root["verbosity"] == "low"
    assert root["reasoning_effort"] == "high"
    assert len(root["messages"]) == 1
    assert root["messages"][0]["content"] == "runtime-user-message"


def test_preserves_explicit_false_and_omits_message_id_when_library_is_disabled(
    make_configuration: Configure,
) -> None:
    """createLibrary が false なら false を残し、messageId は出さないこと"""
    configuration = _configuration(
        make_configuration,
        {keys.MESSAGE_ID: "message-fixture", keys.CREATE_LIBRARY: "false"},
    )

    root = _map(configuration, _request(CoreMessage.user("runtime-user-message")))

    assert root["createLibrary"] is False
    assert "messageId" not in root


def test_omits_library_pair_when_create_library_is_absent(
    make_configuration: Configure,
) -> None:
    """createLibrary の指定がなければ、createLibrary・messageId を出さないこと"""
    configuration = _configuration(
        make_configuration, {keys.MESSAGE_ID: "message-fixture"}
    )

    root = _map(configuration, _request(CoreMessage.user("runtime-user-message")))

    assert "createLibrary" not in root
    assert "messageId" not in root


@pytest.mark.parametrize("attributes", LIBRARY_ATTRIBUTES)
def test_rejects_library_creation_without_nonblank_message_id(
    make_configuration: Configure, attributes: dict[str, str]
) -> None:
    """ライブラリを作るのに messageId がない（未指定・空白）と拒否されること"""
    configuration = _configuration(make_configuration, attributes)

    with pytest.raises(CoreSecuAiGentTextDataFailure):
        to_text_data_json(
            configuration, _request(CoreMessage.user("runtime-user-message"))
        )


def test_serializes_all_message_roles_and_omits_blank_optional_attributes(
    make_configuration: Configure,
) -> None:
    """全ロールを書き出し、空白の任意属性は出さず、推論の強さは既定の medium になること"""
    configuration = _configuration(
        make_configuration,
        {keys.MESSAGE_ID: " ", keys.ADDITIONAL_PROMPT: "", keys.CREATE_LIBRARY: " "},
        "https://provider.example.invalid",
    )
    request = (
        CoreChatRequestBuilder(PROVIDER)
        .add_message(CoreMessage.system("system"))
        .add_message(CoreMessage.assistant("assistant"))
        .add_message(CoreMessage(Role.TOOL, "tool"))
        .attribute(
            GENERATION_OPTIONS_ATTRIBUTE, CoreGenerationOptions(reasoning_effort=" ")
        )
        .build()
    )

    root = _map(configuration, request)

    for omitted in ("messageId", "additionalPrompt", "createLibrary"):
        assert omitted not in root
    assert root["reasoning_effort"] == "medium"
    assert [m["role"] for m in root["messages"]] == ["system", "assistant", "tool"]


def test_serializes_mcp_tools_with_require_approval_never_and_rejects_escalation(
    make_configuration: Configure,
) -> None:
    """MCP の tools を承認 never で書き出し、承認の引き上げは拒否すること"""
    configuration = _configuration(make_configuration)
    request = (
        CoreChatRequestBuilder(PROVIDER)
        .add_message(CoreMessage.user("hello"))
        .tools(
            [
                CoreChatTool.web_search(),
                CoreChatTool.mcp("server", "https://mcp.example.invalid", "never"),
                CoreChatTool.mcp(
                    "secure",
                    "https://secure-mcp.example.invalid",
                    None,
                    "Bearer structural-fixture",
                    {"X-Test-Header": "fixture"},
                ),
            ]
        )
        .build()
    )
    rejected = (
        CoreChatRequestBuilder(PROVIDER)
        .add_message(CoreMessage.user("hello"))
        .tools([CoreChatTool.mcp("server", "https://mcp.example.invalid", "always")])
        .build()
    )

    tools = _map(configuration, request)["tools"]

    assert len(tools) == 3
    assert tools[0]["name"] == "web_search"
    assert tools[1]["require_approval"] == "never"
    assert "headers" not in tools[1]
    assert tools[2]["authorization"] == "Bearer structural-fixture"
    assert tools[2]["headers"]["X-Test-Header"] == "fixture"
    with pytest.raises(ValueError, match="require_approval"):
        to_text_data_json(configuration, rejected)


def test_omits_stream_file_path_attribute_from_request_body(
    make_configuration: Configure,
) -> None:
    """streamFilePath の属性がリクエスト本文に出ないこと"""
    configuration = _configuration(
        make_configuration,
        {"secuaigent.streamFilePath": "C:\\fixture\\secuaigent-textdata.json"},
    )

    root = _map(configuration, _request(CoreMessage.user("hello")))

    assert "streamfilepath" not in root


def test_serializes_json_object_response_format_for_rag_json_response(
    make_configuration: Configure,
) -> None:
    """RAG の JSON 応答の指定が response_format の json_object になること"""
    request = (
        CoreChatRequestBuilder(PROVIDER)
        .attribute(RAG_JSON_RESPONSE_ATTRIBUTE, True)
        .add_message(CoreMessage.user("Answer from context."))
        .build()
    )

    root = _map(_configuration(make_configuration), request)

    assert root["response_format"]["type"] == "json_object"


def test_serializes_json_object_response_format_for_candidate_json_response(
    make_configuration: Configure,
) -> None:
    """候補の JSON 応答の指定が json_object になり、temperature は出ないこと"""
    request = (
        CoreChatRequestBuilder(PROVIDER)
        .candidate_json_response(True)
        .add_message(CoreMessage.user("Extract candidates."))
        .build()
    )

    root = _map(_configuration(make_configuration), request)

    assert "temperature" not in root
    assert root["response_format"]["type"] == "json_object"


def test_omits_response_format_for_normal_chat(make_configuration: Configure) -> None:
    """通常の chat では response_format を出さないこと"""
    root = _map(_configuration(make_configuration), _request(CoreMessage.user("hello")))

    assert "response_format" not in root


def test_serializes_web_search_tool_as_name_field(
    make_configuration: Configure,
) -> None:
    """web_search の tool が name だけで書き出されること"""
    tool = _map_tools(make_configuration, [CoreChatTool.web_search()])["tools"][0]

    assert tool["name"] == "web_search"
    assert "type" not in tool


def test_serializes_mcp_auth_headers_and_provider_approval_never(
    make_configuration: Configure,
) -> None:
    """MCP の認証・ヘッダーを書き出し、承認を never にすること"""
    tool = CoreChatTool.mcp(
        "redacted-label",
        "redacted-url",
        None,
        "auth-body-fixture",
        {"X-Trace-Fixture": "header-value-fixture"},
    )

    mcp = _map_tools(make_configuration, [tool])["tools"][0]

    assert mcp["name"] == "mcp"
    assert mcp["server_label"] == "redacted-label"
    assert mcp["server_url"] == "redacted-url"
    assert mcp["require_approval"] == "never"
    assert mcp["authorization"] == "auth-body-fixture"
    assert mcp["headers"]["X-Trace-Fixture"] == "header-value-fixture"


def test_rejects_unsupported_mcp_approval_before_provider_serialization(
    make_configuration: Configure,
) -> None:
    """MCP の承認が never 以外なら、書き出す前に拒否されること"""
    tool = CoreChatTool.mcp("redacted-label", "redacted-url", "always")

    with pytest.raises(ValueError, match="require_approval"):
        _map_tools(make_configuration, [tool])


def test_omits_tools_when_no_tools_configured(make_configuration: Configure) -> None:
    """tools がなければ tools を出さないこと"""
    root = _map(
        _configuration(make_configuration, endpoint="https://provider.example.invalid"),
        _request(CoreMessage.user("runtime-user-message")),
    )

    assert "tools" not in root
