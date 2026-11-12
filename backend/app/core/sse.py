"""移植元と同じ形式のSSE(Server-Sent Events)イベントを組み立てる。

送信API(`message_service.py`)と汎用チャットAPI(`llm_chat_service.py`)の双方から
使う純粋関数のため、「serviceが別serviceを呼ばない」規約に抵触しない`core/`に置く。
"""

import json


def sse_event(event_type: str, payload: dict[str, object]) -> bytes:
    """移植元と同じ形式のSSEイベント1件を組み立てる。

    移植元は`response/sse`配下のイベント（先頭フィールドが`type`のレコード）を
    JSON化し、`SseEmitter.event().data(json)`でイベント名の行を付けずに送る。
    受け手（secuaigent/client・local-server）はJSON内の`type`で種別を判定するため、
    この形式に合わせる（issue-183・issue-224）。

    Args:
        event_type: イベント種別（`text_delta`・`message_stop`等）。
        payload: 種別以外のイベントデータ(JSONへ変換される)。

    Returns:
        SSE形式にエンコードされたバイト列。
    """
    # payloadに`type`キーが含まれていても種別が上書きされないよう、`type`を後に置く。
    data = {**payload, "type": event_type}
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n".encode()
