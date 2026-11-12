import pytest
from pydantic import ValidationError

from app.schemas.message import MessageContentCreateRequest
from app.schemas.response_format import ResponseFormatRequest


class TestMessageContentCreateRequest:
    """MessageContentCreateRequest のバリデーションテスト"""

    def test_raises_error_when_both_message_id_and_content_id_are_none(self):
        """messageId・messageContentIdのいずれも指定しない場合バリデーションエラーになること"""
        with pytest.raises(ValidationError):
            MessageContentCreateRequest(userInput="質問")

    def test_accepts_message_content_id_only(self):
        """messageContentIdのみ指定した場合、正常にインスタンス化できること（回答再生成）"""
        req = MessageContentCreateRequest(
            messageContentId="content-1", userInput="質問"
        )
        assert req.messageId is None
        assert req.messageContentId == "content-1"

    def test_accepts_message_id_only(self):
        """messageIdのみ指定した場合、正常にインスタンス化できること（既存動作）"""
        req = MessageContentCreateRequest(messageId="msg-1", userInput="質問")
        assert req.messageId == "msg-1"
        assert req.messageContentId is None

    def test_accepts_spring_create_library_name(self):
        """移植元のcreateLibraryで指定したライブラリ生成フラグを受け取れること"""
        req = MessageContentCreateRequest.model_validate(
            {"messageId": "msg-1", "userInput": "質問", "createLibrary": True}
        )
        assert req.isCreateLibrary is True

    def test_accepts_spring_response_format_name(self):
        """移植元のresponse_formatで指定した出力フォーマットを受け取れること"""
        req = MessageContentCreateRequest.model_validate(
            {
                "messageId": "msg-1",
                "userInput": "質問",
                "response_format": {"type": "json_object"},
            }
        )
        assert req.responseFormat == ResponseFormatRequest(type="json_object")

    def test_normalizes_history_type_to_lower_role(self):
        """移植元の大文字のtypeで指定した会話履歴の発話種別が小文字のroleになること"""
        req = MessageContentCreateRequest.model_validate(
            {
                "messageId": "msg-1",
                "userInput": "質問",
                "historyMessages": [
                    {"type": "USER", "content": "過去の質問"},
                    {"type": "ASSISTANT", "content": "過去の回答"},
                    {"type": "SYSTEM", "content": "指示"},
                ],
            }
        )
        assert [turn.role for turn in req.historyMessages] == [
            "user",
            "assistant",
            "system",
        ]

    def test_raises_error_when_history_type_is_unknown(self):
        """会話履歴の発話種別が移植元の列挙値以外の場合バリデーションエラーになること"""
        with pytest.raises(ValidationError):
            MessageContentCreateRequest.model_validate(
                {
                    "messageId": "msg-1",
                    "userInput": "質問",
                    "historyMessages": [{"type": "TOOL", "content": "過去"}],
                }
            )
