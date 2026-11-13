"""SecuAiGent の SSE（`data:` 行の JSON）の解析（移植元 SecuAiGentSseParser・SecuAiGentSseEvent）。"""

import json
from dataclasses import dataclass
from typing import Any

DATA_PREFIX = "data:"
DEFAULT_ERROR_MESSAGE = "stream error"


class SseSyntaxError(Exception):
    """`data:` の JSON が読めない。

    移植元では Gson の JsonSyntaxException・IllegalStateException（ValueError 相当では
    ない）になり、失敗の分類は NETWORK になる。Python の json.JSONDecodeError は
    ValueError（VALIDATION に分類される）のため、別の例外にして分類を揃える。"""


@dataclass(frozen=True)
class ReasoningDelta:
    """推論の途中経過のイベント。"""

    text: str


@dataclass(frozen=True)
class LibraryTitleDelta:
    """ライブラリのタイトルの差分イベント。"""

    text: str


@dataclass(frozen=True)
class LibraryContentDelta:
    """ライブラリの内容の差分イベント。"""

    text: str


@dataclass(frozen=True)
class TextDelta:
    """回答の差分イベント。"""

    text: str


@dataclass(frozen=True)
class MessageStop:
    """回答の終わりのイベント（トークン数つき）。"""

    input_tokens: int
    output_tokens: int


@dataclass(frozen=True)
class ErrorEvent:
    """エラーのイベント。"""

    message: str


SseEvent = (
    ReasoningDelta
    | LibraryTitleDelta
    | LibraryContentDelta
    | TextDelta
    | MessageStop
    | ErrorEvent
)


def _text(payload: dict[str, Any]) -> str:
    """payload の text を文字列にする。

    Parameters
    ----------
    payload : dict[str, Any]
        イベントの JSON オブジェクト。

    Returns
    -------
    str
        text の文字列。なければ空文字列。

    Raises
    ------
    ValueError
        text が JSON の配列・オブジェクトのとき。
    """
    value = payload.get("text")
    if value is None:
        return ""
    if isinstance(value, (dict, list)):
        # 移植元は IllegalArgumentException（失敗の分類は VALIDATION）
        raise ValueError("SSE text must be a JSON primitive")  # noqa: TRY004
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def _tokens(payload: dict[str, Any], key: str) -> int:
    """payload のトークン数を整数にする。

    Parameters
    ----------
    payload : dict[str, Any]
        イベントの JSON オブジェクト。
    key : str
        トークン数のキー。

    Returns
    -------
    int
        トークン数。キーがなければ 0。

    Raises
    ------
    ValueError
        値が数値でないとき。
    """
    if key not in payload:
        return 0
    value = payload[key]
    if isinstance(value, bool) or not isinstance(value, (int, float, str)):
        # 移植元は NumberFormatException（IllegalArgumentException の一種）
        raise ValueError(f"SSE {key} must be a number")  # noqa: TRY004
    return int(value)


def _message(payload: dict[str, Any]) -> str:
    """payload の message を文字列にする。

    Parameters
    ----------
    payload : dict[str, Any]
        イベントの JSON オブジェクト。

    Returns
    -------
    str
        message の文字列。なければ既定のメッセージ。
    """
    value = payload.get("message")
    return DEFAULT_ERROR_MESSAGE if value is None else str(value)


def parse_data_line(line: str | None) -> SseEvent | None:
    """1 行を解析する。`data:` 以外・空の行は None。未知の type は ValueError。

    Parameters
    ----------
    line : str | None
        SSE の 1 行。

    Returns
    -------
    SseEvent | None
        イベント。対象外の行なら None。

    Raises
    ------
    SseSyntaxError
        `data:` の JSON が読めない・type がないとき。
    ValueError
        未知の type・不正な値のとき。
    """
    if line is None or not line.strip():
        return None
    trimmed = line.strip()
    if not trimmed.startswith(DATA_PREFIX):
        return None
    raw = trimmed[len(DATA_PREFIX) :].strip()
    if not raw:
        return None
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as e:
        raise SseSyntaxError(f"SSE data is not JSON: {e.msg}") from None
    if not isinstance(payload, dict):
        raise SseSyntaxError("SSE data is not a JSON object")
    event_type = payload.get("type")
    if event_type is None or isinstance(event_type, (dict, list)):
        raise SseSyntaxError("SSE type is missing")
    match str(event_type).lower():
        case "reasoning_delta":
            return ReasoningDelta(_text(payload))
        case "library_title_delta":
            return LibraryTitleDelta(_text(payload))
        case "library_content_delta":
            return LibraryContentDelta(_text(payload))
        case "text_delta":
            return TextDelta(_text(payload))
        case "message_stop":
            return MessageStop(
                _tokens(payload, "inputTokens"), _tokens(payload, "outputTokens")
            )
        case "error":
            return ErrorEvent(_message(payload))
    raise ValueError(f"Unsupported SSE event type: {event_type}")


def parse_data_lines(lines: list[str]) -> list[SseEvent]:
    """複数の行を解析してイベントの列にする。

    Parameters
    ----------
    lines : list[str]
        SSE の行の列。

    Returns
    -------
    list[SseEvent]
        解析できたイベントの列。
    """
    events: list[SseEvent] = []
    for line in lines:
        event = parse_data_line(line)
        if event is not None:
            events.append(event)
    return events
