import pytest
from pydantic import ValidationError

from app.schemas.message import MessageContentCreateRequest


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
