import base64

import pytest
from pydantic import ValidationError

from app.schemas.llm import LlmChatRequest
from app.schemas.response_format import ResponseFormatRequest


def _payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "deployName": "gpt-4o",
        "messages": [{"role": "user", "content": "こんにちは"}],
    }
    payload.update(overrides)
    return payload


def _file(name: str) -> dict[str, object]:
    return {
        "name": name,
        "type": "image/png",
        "data": base64.b64encode(b"image").decode(),
    }


class TestLlmChatRequest:
    """LlmChatRequest（移植元 LlmChatTextDataRequest 相当）のテスト"""

    def test_accepts_response_format_snake_case(self):
        """移植元と同じresponse_formatの項目名で出力フォーマット指定を受け取れること"""
        req = LlmChatRequest.model_validate(
            _payload(response_format={"type": "json_object"})
        )

        assert req.responseFormat == ResponseFormatRequest(type="json_object")

    def test_attachments_default_to_empty(self):
        """発話のattachments省略時は空になること"""
        req = LlmChatRequest.model_validate(_payload())

        assert req.messages[0].attachments == []

    def test_accepts_attachments(self):
        """発話のattachmentsでファイル名の一覧を受け取れること"""
        req = LlmChatRequest.model_validate(
            _payload(
                messages=[{"role": "user", "content": "質問", "attachments": ["a.png"]}]
            )
        )

        assert req.messages[0].attachments == ["a.png"]

    def test_accepts_attatchments_alias(self):
        """移植元と同じく、綴り違いのattatchmentsでも受け取れること"""
        req = LlmChatRequest.model_validate(
            _payload(
                messages=[
                    {"role": "user", "content": "質問", "attatchments": ["a.png"]}
                ]
            )
        )

        assert req.messages[0].attachments == ["a.png"]

    def test_ignores_reasoning_effort_and_verbosity(self):
        """移植元のreasoning_effort・verbosityを受け取ってもエラーにならないこと"""
        req = LlmChatRequest.model_validate(
            _payload(reasoning_effort="high", verbosity="low")
        )

        assert req.deployName == "gpt-4o"

    def test_rejects_duplicate_attachment_file_names(self):
        """同じファイル名の添付ファイルが複数ある場合はValidationErrorになること"""
        with pytest.raises(ValidationError) as exc_info:
            LlmChatRequest.model_validate(
                _payload(attachmentFiles=[_file("a.png"), _file("a.png")])
            )

        assert "添付ファイルのリストに同名のファイルが含まれています" in str(
            exc_info.value
        )
