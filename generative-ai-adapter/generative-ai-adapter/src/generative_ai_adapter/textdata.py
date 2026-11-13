"""SecuAiGent の textData JSON（プロパティ 43）と tools JSON（プロパティ 48）。

移植元 textdata パッケージ（SecuAiGentTextDataFileLoader・SecuAiGentToolsJsonFileLoader・
SecuAiGentTextDataOverlay・SecuAiGentTextDataOverlayApplier・SecuAiGentChatToolsMerger・
SecuAiGentTextDataFailure）。解析は core（CoreSecuAiGentTextDataLoader）に任せる。
移植元は adapter 側に同じ項目の Document・Overlay 型を持つが、Python では core の
Document をそのまま使う。
"""

from collections.abc import Sequence

from generative_ai_core.chat.models import CoreChatTool, CoreChatToolKind
from generative_ai_core.provider.clients.secuaigent.text_data import (
    CODE,
    SAFE_MESSAGE,
    CoreSecuAiGentTextDataDocument,
    CoreSecuAiGentTextDataFailure,
    CoreSecuAiGentTextDataLoader,
)

from generative_ai_adapter.constants import ReasoningEffort, Verbosity
from generative_ai_adapter.domain import AccessCredential, ChatGPTParameter


class SecuAiGentTextDataFailure(Exception):
    """textData・tools JSON が使えない（固定のメッセージ。パス・値を出さない）。"""

    code = CODE

    def __init__(self) -> None:
        """固定のメッセージで作る。"""
        super().__init__(SAFE_MESSAGE)

    @property
    def safe_message(self) -> str:
        """出力・ログに出してよいメッセージ。

        Returns
        -------
        str
            固定のメッセージ。
        """
        return SAFE_MESSAGE


def load_text_data_document(file_path: str) -> CoreSecuAiGentTextDataDocument:
    """textData JSON を厳密に読む。

    Parameters
    ----------
    file_path : str
        textData JSON のパス。

    Returns
    -------
    CoreSecuAiGentTextDataDocument
        読んだ内容。

    Raises
    ------
    SecuAiGentTextDataFailure
        ファイル・JSON・キー・値が不正なとき。
    """
    try:
        return CoreSecuAiGentTextDataLoader().load(file_path)
    except CoreSecuAiGentTextDataFailure:
        raise SecuAiGentTextDataFailure() from None


def load_tools_json(file_path: str) -> tuple[CoreChatTool, ...]:
    """tools JSON（トップレベルは `tools` だけ）を読む。

    Parameters
    ----------
    file_path : str
        tools JSON のパス。

    Returns
    -------
    tuple[CoreChatTool, ...]
        読んだ tools。

    Raises
    ------
    SecuAiGentTextDataFailure
        ファイル・JSON・キー・値が不正なとき。
    """
    try:
        return CoreSecuAiGentTextDataLoader().load_tools_only(file_path)
    except CoreSecuAiGentTextDataFailure:
        raise SecuAiGentTextDataFailure() from None


def _tool_identity(tool: CoreChatTool) -> str:
    """tools を重ねるときの同一性のキー（web_search は 1 つ、mcp は server_label）。

    Parameters
    ----------
    tool : CoreChatTool
        ツール。

    Returns
    -------
    str
        同一性のキー。

    Raises
    ------
    SecuAiGentTextDataFailure
        server_label のない mcp のとき。
    """
    if tool.kind == CoreChatToolKind.WEB_SEARCH:
        return "web_search"
    if tool.is_mcp and tool.server_label is not None:
        return f"mcp:{tool.server_label}"
    raise SecuAiGentTextDataFailure()


def merge_chat_tools(
    first: Sequence[CoreChatTool], second: Sequence[CoreChatTool]
) -> list[CoreChatTool]:
    """2 つの tools を重ねる。同じものは 1 つにし、中身の違う重複は失敗にする。

    Parameters
    ----------
    first : Sequence[CoreChatTool]
        先に評価する tools（textData）。
    second : Sequence[CoreChatTool]
        後に評価する tools（tools JSON）。

    Returns
    -------
    list[CoreChatTool]
        重ねた tools（先に出た順）。

    Raises
    ------
    SecuAiGentTextDataFailure
        同じ同一性で中身が違う tool があるとき。
    """
    by_identity: dict[str, CoreChatTool] = {}
    for tool in (*first, *second):
        identity = _tool_identity(tool)
        previous = by_identity.setdefault(identity, tool)
        if previous != tool:
            raise SecuAiGentTextDataFailure()
    return list(by_identity.values())


def apply_credential(
    base: AccessCredential | None, document: CoreSecuAiGentTextDataDocument | None
) -> AccessCredential:
    """textData の値で資格情報を上書きした写しを作る（元は変えない）。

    Parameters
    ----------
    base : AccessCredential | None
        プロパティから作った資格情報。
    document : CoreSecuAiGentTextDataDocument | None
        textData。None なら上書きしない。

    Returns
    -------
    AccessCredential
        上書きした写し。
    """
    copy = (base or AccessCredential()).copy()
    if document is None:
        return copy
    overlay: list[tuple[str, object | None]] = [
        ("url", document.url),
        ("secuaigent_access_token", document.access_token),
        ("model_name", document.deploy_name),
        ("tenant_id", document.tenant_id),
        ("secuaigent_stream_file_path", document.stream_file_path),
        ("secuaigent_message_id", document.message_id),
        ("secuaigent_additional_prompt", document.additional_prompt),
        ("secuaigent_create_library", document.create_library),
    ]
    for name, value in overlay:
        if value is not None:
            setattr(copy, name, value)
    return copy


def _to_reasoning_effort(value: str) -> ReasoningEffort:
    """textData の reasoning_effort（"low" などの名前、または "0"〜"5"）を変換する。

    Parameters
    ----------
    value : str
        textData の値。

    Returns
    -------
    ReasoningEffort
        推論の深さ。名前でも番号でもなければ MEDIUM。
    """
    for effort in ReasoningEffort:
        if effort.wire_value().lower() == value.lower():
            return effort
    return ReasoningEffort.from_string(value)


def _to_verbosity(value: str) -> Verbosity:
    """textData の verbosity（"low" などの名前、または "0"〜"3"）を変換する。

    Parameters
    ----------
    value : str
        textData の値。

    Returns
    -------
    Verbosity
        回答の詳細度。名前でも番号でもなければ MEDIUM。
    """
    for verbosity in Verbosity:
        if verbosity.wire_value().lower() == value.lower():
            return verbosity
    return Verbosity.from_string(value)


def apply_parameter(
    base: ChatGPTParameter | None, document: CoreSecuAiGentTextDataDocument | None
) -> ChatGPTParameter:
    """textData の値で生成パラメータを上書きした写しを作る（元は変えない）。

    Parameters
    ----------
    base : ChatGPTParameter | None
        プロパティから作った生成パラメータ。
    document : CoreSecuAiGentTextDataDocument | None
        textData。None なら上書きしない。

    Returns
    -------
    ChatGPTParameter
        上書きした写し。
    """
    source = base or ChatGPTParameter()
    copy = ChatGPTParameter(
        temperature=source.temperature,
        top_p=source.top_p,
        frequency_penalty=source.frequency_penalty,
        presence_penalty=source.presence_penalty,
        max_tokens=source.max_tokens,
        stop=source.stop,
        reasoning_effort=source.reasoning_effort,
        verbosity=source.verbosity,
    )
    if document is None:
        return copy
    if document.temperature is not None:
        copy.temperature = document.temperature
    if document.max_tokens is not None:
        copy.max_tokens = document.max_tokens
    if document.reasoning_effort is not None:
        copy.reasoning_effort = _to_reasoning_effort(document.reasoning_effort)
    if document.verbosity is not None:
        copy.verbosity = _to_verbosity(document.verbosity)
    return copy
