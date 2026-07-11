"""LLM呼び出し時のresponse_format(構造化出力)指定スキーマ。

`schemas/llm.py`(`LlmChatRequest`)・`schemas/message.py`(`MessageContentCreateRequest`)の
両方から参照される共有スキーマのため、専用モジュールに切り出す。
"""

from pydantic import BaseModel, Field, field_validator


class ResponseFormatRequest(BaseModel):
    """response_format(構造化出力)指定。

    移植元(Spring Boot)の`ResponseFormatRequest`に対応するが、`json_schema`による
    構造強制は移植元でも未実装(暫定的にjson_objectと同じ「JSON形式で出力させる」動作)
    のため、本ポートでも`type`のみを受け取り、`json_schema`の中身は反映しない
    (`docs/issue-100/01_要件定義.md`参照)。
    """

    type: str = Field(min_length=1)

    @field_validator("type")
    @classmethod
    def _validate_type(cls, value: str) -> str:
        """typeがjson_object/json_schemaのいずれかであることを検証する。"""
        if value not in ("json_object", "json_schema"):
            raise ValueError(
                "response_format.type は json_object または json_schema です"
            )
        return value
