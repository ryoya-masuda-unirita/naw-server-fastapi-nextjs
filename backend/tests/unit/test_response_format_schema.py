import pytest
from pydantic import ValidationError

from app.schemas.llm import LlmChatRequest, LlmChatTurn
from app.schemas.message import MessageContentCreateRequest
from app.schemas.response_format import ResponseFormatRequest


class TestResponseFormatRequest:
    """ResponseFormatRequest のテスト"""

    def test_accepts_json_object_type(self):
        """typeがjson_objectの場合はバリデーションを通過すること"""
        assert ResponseFormatRequest(type="json_object").type == "json_object"

    def test_accepts_json_schema_type(self):
        """typeがjson_schemaの場合はバリデーションを通過すること"""
        assert ResponseFormatRequest(type="json_schema").type == "json_schema"

    def test_rejects_invalid_type(self):
        """typeが不正な値の場合はValidationErrorになること"""
        with pytest.raises(ValidationError):
            ResponseFormatRequest(type="text")

    def test_rejects_empty_type(self):
        """typeが空文字の場合はValidationErrorになること"""
        with pytest.raises(ValidationError):
            ResponseFormatRequest(type="")


class TestLlmChatRequestResponseFormat:
    """LlmChatRequest.responseFormat のテスト"""

    def test_defaults_to_none(self):
        """responseFormat未指定時はNoneになること"""
        req = LlmChatRequest(
            deployName="gpt-4o",
            messages=[LlmChatTurn(role="user", content="こんにちは")],
        )
        assert req.responseFormat is None

    def test_accepts_response_format(self):
        """responseFormat指定時はResponseFormatRequestとして保持すること"""
        req = LlmChatRequest(
            deployName="gpt-4o",
            messages=[LlmChatTurn(role="user", content="こんにちは")],
            responseFormat={"type": "json_object"},
        )
        assert req.responseFormat == ResponseFormatRequest(type="json_object")


class TestMessageContentCreateRequestResponseFormat:
    """MessageContentCreateRequest.responseFormat のテスト"""

    def test_defaults_to_none(self):
        """responseFormat未指定時はNoneになること"""
        req = MessageContentCreateRequest(messageId="msg-1", userInput="こんにちは")
        assert req.responseFormat is None

    def test_accepts_response_format(self):
        """responseFormat指定時はResponseFormatRequestとして保持すること"""
        req = MessageContentCreateRequest(
            messageId="msg-1",
            userInput="こんにちは",
            responseFormat={"type": "json_schema"},
        )
        assert req.responseFormat == ResponseFormatRequest(type="json_schema")
