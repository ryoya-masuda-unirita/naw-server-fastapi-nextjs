import base64

from app.core.attachment_media import build_user_content
from app.schemas.attachment import AttachmentFile


def _image_file(name: str = "photo.png") -> AttachmentFile:
    # AttachmentFile.dataはBase64Bytes型のため、代入する値は常にBase64
    # エンコード済みであることを前提とする(内部的にはデコード後の生バイト列を保持する)。
    return AttachmentFile(
        name=name, type="image/png", data=base64.b64encode(b"\x89PNG\r\n")
    )


def _pdf_file(name: str = "doc.pdf") -> AttachmentFile:
    return AttachmentFile(
        name=name, type="application/pdf", data=base64.b64encode(b"%PDF-1.4")
    )


class TestBuildUserContent:
    """build_user_content のテスト"""

    def test_returns_text_as_is_when_no_files(self):
        """添付ファイルがない場合、textをそのまま返すこと"""
        result = build_user_content("こんにちは", [])
        assert result == "こんにちは"

    def test_returns_text_and_image_parts_when_only_images(self):
        """画像ファイルのみの場合、text部と画像パートのリストを返すこと"""
        result = build_user_content("こんにちは", [_image_file()])

        assert isinstance(result, list)
        assert result[0] == {"type": "text", "text": "こんにちは"}
        assert result[1]["type"] == "image_url"
        assert result[1]["image_url"]["url"].startswith("data:image/png;base64,")

    def test_appends_note_when_only_non_image_files(self):
        """非画像ファイルのみの場合、text部にファイル名の注記を付記し画像パートは含まないこと"""
        result = build_user_content("こんにちは", [_pdf_file("doc.pdf")])

        assert isinstance(result, list)
        assert len(result) == 1
        assert result[0]["type"] == "text"
        assert "こんにちは" in result[0]["text"]
        assert "doc.pdf" in result[0]["text"]

    def test_includes_both_note_and_image_part_when_mixed(self):
        """画像と非画像が混在する場合、注記と画像パートの両方を含むこと"""
        result = build_user_content(
            "こんにちは", [_image_file("photo.png"), _pdf_file("doc.pdf")]
        )

        assert isinstance(result, list)
        assert len(result) == 2
        assert "doc.pdf" in result[0]["text"]
        assert result[1]["type"] == "image_url"


class TestAttachmentFileSchema:
    """AttachmentFile のBase64デコード確認"""

    def test_decodes_base64_data_from_json(self):
        """JSON入力(Base64文字列)からdataがbytesにデコードされること"""
        import json

        encoded = base64.b64encode(b"binary-content").decode("ascii")
        file = AttachmentFile.model_validate_json(
            json.dumps({"name": "a.png", "type": "image/png", "data": encoded})
        )

        assert file.data == b"binary-content"
