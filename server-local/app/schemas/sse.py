"""移植元 NawSseEvent（NAW 互換 SSE のイベント）。"""

from typing import Any

from app.core.jsonutil import to_compact_json

DATA_PREFIX = "data:"
EVENT_DELIMITER = "\n\n"


def format_sse_data(json_payload: str) -> str:
    """JSON 文字列を SSE の 1 イベント分の文字列にする。

    Spring の SseEmitter と同じく `data:` の直後に空白を入れずに出力し、空行で区切る。

    Parameters
    ----------
    json_payload : str
        イベントの内容の JSON 文字列。

    Returns
    -------
    str
        ``data:{JSON}`` と区切りの空行。
    """
    return f"{DATA_PREFIX}{json_payload}{EVENT_DELIMITER}"


def library_id_event(library_id: str) -> dict[str, Any]:
    """生成するライブラリの ID を知らせる ``library_id`` イベントを作る。

    Parameters
    ----------
    library_id : str
        NAW 本体に作ったライブラリの ID。

    Returns
    -------
    dict[str, Any]
        イベントの内容。
    """
    return {"type": "library_id", "libraryId": library_id}


def text_delta_event(text: str) -> dict[str, Any]:
    """回答の本文を送る ``text_delta`` イベントを作る。

    Parameters
    ----------
    text : str
        送る本文。

    Returns
    -------
    dict[str, Any]
        イベントの内容。
    """
    return {"type": "text_delta", "text": text}


def message_stop_event(input_tokens: int = 0, output_tokens: int = 0) -> dict[str, Any]:
    """回答の生成が終わったことを知らせる ``message_stop`` イベントを作る。

    Parameters
    ----------
    input_tokens : int, optional
        入力のトークン数。Waha! は返さないため、呼び出し側は 0 を渡す。
    output_tokens : int, optional
        出力のトークン数。Waha! は返さないため、呼び出し側は 0 を渡す。

    Returns
    -------
    dict[str, Any]
        イベントの内容。
    """
    return {
        "type": "message_stop",
        "inputTokens": input_tokens,
        "outputTokens": output_tokens,
    }


def message_content_event(data: dict[str, Any]) -> dict[str, Any]:
    """保存したメッセージ内容を送る ``message_content`` イベントを作る。

    Parameters
    ----------
    data : dict[str, Any]
        保存したメッセージ内容（添付ファイル付き）。

    Returns
    -------
    dict[str, Any]
        イベントの内容。
    """
    return {"type": "message_content", "data": data}


def error_event(message: str | None) -> dict[str, Any]:
    """回答の生成に失敗したことを知らせる ``error`` イベントを作る。

    Parameters
    ----------
    message : str | None
        エラーメッセージ。

    Returns
    -------
    dict[str, Any]
        イベントの内容。
    """
    return {"type": "error", "message": message}


def to_sse(event: dict[str, Any]) -> str:
    """イベントを、移植元と同じ JSON 表現の SSE 文字列にする。

    Parameters
    ----------
    event : dict[str, Any]
        ``library_id_event`` などで作ったイベントの内容。

    Returns
    -------
    str
        ``data:{JSON}`` と区切りの空行。
    """
    return format_sse_data(to_compact_json(event))
