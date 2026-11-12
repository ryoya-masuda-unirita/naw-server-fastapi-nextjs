"""移植元 NawSseEvent（NAW 互換 SSE のイベント）。"""

from typing import Any

from app.core.jsonutil import to_compact_json

DATA_PREFIX = "data:"
EVENT_DELIMITER = "\n\n"


def format_sse_data(json_payload: str) -> str:
    """Spring の SseEmitter と同じく `data:` の直後に空白を入れずに出力する。"""
    return f"{DATA_PREFIX}{json_payload}{EVENT_DELIMITER}"


def library_id_event(library_id: str) -> dict[str, Any]:
    return {"type": "library_id", "libraryId": library_id}


def text_delta_event(text: str) -> dict[str, Any]:
    return {"type": "text_delta", "text": text}


def message_stop_event(input_tokens: int = 0, output_tokens: int = 0) -> dict[str, Any]:
    return {
        "type": "message_stop",
        "inputTokens": input_tokens,
        "outputTokens": output_tokens,
    }


def message_content_event(data: dict[str, Any]) -> dict[str, Any]:
    return {"type": "message_content", "data": data}


def error_event(message: str | None) -> dict[str, Any]:
    return {"type": "error", "message": message}


def to_sse(event: dict[str, Any]) -> str:
    return format_sse_data(to_compact_json(event))
