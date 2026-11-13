"""SecuAiGent の `/api/llm/chat` に送る textData JSON（移植元 SecuAiGentRequestMapper）。

キーの順序は移植元（Gson の JsonObject の追加順）と同じにする。
"""

import json
from typing import Any

from generative_ai_core.chat.models import CoreChatRequest, Role
from generative_ai_core.provider.clients.secuaigent.keys import (
    ADDITIONAL_PROMPT,
    CREATE_LIBRARY,
    MESSAGE_ID,
)
from generative_ai_core.provider.clients.secuaigent.text_data import (
    CoreSecuAiGentTextDataFailure,
)
from generative_ai_core.provider.model import RuntimeProviderConfiguration

DEFAULT_REASONING_EFFORT = "medium"
APPROVAL_NEVER = "never"
_ROLES = {
    Role.SYSTEM: "system",
    Role.ASSISTANT: "assistant",
    Role.USER: "user",
    Role.TOOL: "tool",
}


def _parse_boolean(value: str | None) -> bool | None:
    """移植元 Boolean.parseBoolean（"true" だけ真。大文字小文字は問わない）。

    Parameters
    ----------
    value : str | None
        属性の値。

    Returns
    -------
    bool | None
        真偽値。未指定・空白なら None。
    """
    if value is None or not value.strip():
        return None
    return value.lower() == "true"


def _tools(request: CoreChatRequest) -> list[dict[str, Any]] | None:
    """リクエストのツールを textData の tools にする。

    Parameters
    ----------
    request : CoreChatRequest
        chat のリクエスト。

    Returns
    -------
    list[dict[str, Any]] | None
        tools の配列。ツールがなければ None。

    Raises
    ------
    ValueError
        require_approval が never 以外のとき。
    """
    tools = request.tools()
    if not tools:
        return None
    result: list[dict[str, Any]] = []
    for tool in tools:
        value: dict[str, Any] = {"name": tool.wire_name}
        if tool.is_mcp:
            if tool.server_label is not None:
                value["server_label"] = tool.server_label
            if tool.server_url is not None:
                value["server_url"] = tool.server_url
            if (
                tool.require_approval is not None
                and tool.require_approval != APPROVAL_NEVER
            ):
                raise ValueError("require_approval must be absent or never")
            value["require_approval"] = APPROVAL_NEVER
            if tool.authorization is not None:
                value["authorization"] = tool.authorization
            if tool.headers:
                value["headers"] = dict(tool.headers)
        result.append(value)
    return result


def to_text_data(
    configuration: RuntimeProviderConfiguration, request: CoreChatRequest
) -> dict[str, Any]:
    """textData の JSON オブジェクトを組み立てる。

    Parameters
    ----------
    configuration : RuntimeProviderConfiguration
        プロバイダの実行時設定。
    request : CoreChatRequest
        chat のリクエスト。

    Returns
    -------
    dict[str, Any]
        textData（キーは移植元と同じ順）。

    Raises
    ------
    CoreSecuAiGentTextDataFailure
        createLibrary なのに messageId がないとき。
    """
    root: dict[str, Any] = {"deployName": configuration.model_name}
    options = request.generation_options()
    if options.temperature is not None:
        root["temperature"] = options.temperature
    if options.max_tokens is not None:
        root["maxTokens"] = options.max_tokens
    reasoning_effort = options.reasoning_effort
    root["reasoning_effort"] = (
        reasoning_effort
        if reasoning_effort is not None and reasoning_effort.strip()
        else DEFAULT_REASONING_EFFORT
    )
    if options.verbosity is not None:
        root["verbosity"] = options.verbosity
    create_library = _parse_boolean(configuration.attributes.get(CREATE_LIBRARY))
    if create_library is True:
        message_id = configuration.attributes.get(MESSAGE_ID)
        if message_id is None or not message_id.strip():
            raise CoreSecuAiGentTextDataFailure()
        root["messageId"] = message_id
    additional_prompt = configuration.attributes.get(ADDITIONAL_PROMPT)
    if additional_prompt is not None and additional_prompt.strip():
        root["additionalPrompt"] = additional_prompt
    if create_library is not None:
        root["createLibrary"] = create_library
    if (
        request.candidate_json_response_requested()
        or request.rag_json_response_requested()
    ):
        root["response_format"] = {"type": "json_object"}
    tools = _tools(request)
    if tools is not None:
        root["tools"] = tools
    messages: list[dict[str, Any]] = []
    for message in request.messages:
        turn: dict[str, Any] = {
            "role": _ROLES[message.role],
            "content": message.content,
        }
        if message.media:
            turn["attachments"] = [media.filename for media in message.media]
        messages.append(turn)
    root["messages"] = messages
    return root


def to_text_data_json(
    configuration: RuntimeProviderConfiguration, request: CoreChatRequest
) -> str:
    """textData を JSON 文字列にする。

    Parameters
    ----------
    configuration : RuntimeProviderConfiguration
        プロバイダの実行時設定。
    request : CoreChatRequest
        chat のリクエスト。

    Returns
    -------
    str
        空白なしの JSON 文字列。
    """
    return json.dumps(
        to_text_data(configuration, request),
        ensure_ascii=False,
        separators=(",", ":"),
    )
