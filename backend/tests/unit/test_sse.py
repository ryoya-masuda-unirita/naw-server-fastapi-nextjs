import json

from app.core.sse import sse_event


class TestSseEvent:
    """sse_event のテスト"""

    def test_builds_data_line_with_type(self) -> None:
        """イベント名の行を付けず、typeを含むJSONを1行のdata行として組み立てること"""
        event = sse_event("text_delta", {"text": "こんにちは"}).decode()

        assert not event.startswith("event:")
        assert event.startswith("data: ")
        assert event.endswith("\n\n")
        assert "こんにちは" in event
        assert json.loads(event[len("data: ") :]) == {
            "type": "text_delta",
            "text": "こんにちは",
        }

    def test_type_is_not_overwritten_by_payload(self) -> None:
        """payloadにtypeが含まれていてもイベント種別で上書きされること"""
        event = sse_event("error", {"type": "other", "message": "失敗"}).decode()

        assert json.loads(event[len("data: ") :])["type"] == "error"
