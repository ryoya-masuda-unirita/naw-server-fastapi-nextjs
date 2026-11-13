"""Message のテスト。

移植元: domain/MessageTest。
Java の `new Message(String role, ...)` は `Message(role, content)`、`new Message(int, ...)` は
`Message.of_index`、コンテキスト用の 4 引数コンストラクタは `Message.context` に当たる。
画像は Spring の ByteArrayResource・MimeType ではなく、バイト列と MIME タイプの文字列で持つ。
"""

import pytest
from generative_ai_adapter.domain import Message

CONTENT = "Hello, world!"


def test_constructor_with_string_role() -> None:
    """文字列のロールと本文をそのまま持つこと"""
    message = Message("user", CONTENT)

    assert message.role == "user"
    assert message.text == CONTENT


@pytest.mark.parametrize(
    ("role", "expected_role"),
    [(0, "user"), (1, "system"), (2, "assistant"), (3, "user")],
)
def test_constructor_with_int_role(role: int, expected_role: str) -> None:
    """番号のロールを user・system・assistant に変え、それ以外は user にすること"""
    message = Message.of_index(role, CONTENT)

    assert message.role == expected_role
    assert message.text == CONTENT


@pytest.mark.parametrize(
    ("role", "file_path", "content", "count", "expected_role"),
    [
        (1, "/path/to/file", CONTENT, 5, "system"),
        (0, "/path/to/file", CONTENT, 5, "user"),
        (3, "/user/path", "User content", 3, "user"),
        (2, "/assistant/path", "Assistant content", 7, "assistant"),
    ],
)
def test_context_constructor_formats_file_block(
    role: int, file_path: str, content: str, count: int, expected_role: str
) -> None:
    """コンテキスト用のメッセージを File ID・FileName・Content の囲みにすること"""
    message = Message.context(role, file_path, content, count)

    assert message.role == expected_role
    assert message.text == (
        f'"""\n## File ID\n  {count} \n## FileName\n{file_path} \n'
        f'## Content\n{content}\n"""'
    )


@pytest.mark.parametrize(
    ("role", "content", "image", "mime_type", "expected_role"),
    [
        (0, "This is an image message", b"dummy image data", "image/png", "user"),
        (1, "System message with image", b"system image data", "image/jpeg", "system"),
        (
            2,
            "Assistant message with image",
            b"assistant image data",
            "image/gif",
            "assistant",
        ),
    ],
)
def test_constructor_with_image_resource(
    role: int, content: str, image: bytes, mime_type: str, expected_role: str
) -> None:
    """画像と MIME タイプを本文と一緒に持つこと"""
    message = Message.of_index(role, content, image, mime_type)

    assert message.role == expected_role
    assert message.text == content
    assert message.image_resource == image
    assert message.mime_type == mime_type


def test_constructor_with_none_image_resource() -> None:
    """画像と MIME タイプが None でも作れること"""
    message = Message.of_index(0, "Message without image", None, None)

    assert message.role == "user"
    assert message.text == "Message without image"
    assert message.image_resource is None
    assert message.mime_type is None
