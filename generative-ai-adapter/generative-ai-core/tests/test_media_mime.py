"""MIME 判定 `detect_mime_type` のテスト。

移植元は Apache Tika で判定していたが、Python 版は先頭のバイト・拡張子・テキストか
どうかで判定する。その代替実装を確認するための、移植元にないテスト。
"""

from collections.abc import Callable
from pathlib import Path

import pytest
from generative_ai_core.media import detect_mime_type

DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
ZIP_MAGIC = b"PK\x03\x04"


@pytest.fixture
def write_file(tmp_path: Path) -> Callable[[str, bytes], Path]:
    """tmp_path に指定の名前と中身のファイルを作る関数を返す。

    Returns
    -------
    Callable[[str, bytes], Path]
        ファイル名と中身を受け取り、作ったファイルのパスを返す関数。
    """

    def write(name: str, data: bytes) -> Path:
        """ファイルを作る。

        Parameters
        ----------
        name : str
            ファイル名。
        data : bytes
            ファイルの中身。

        Returns
        -------
        Path
            作ったファイルのパス。
        """
        path = tmp_path / name
        path.write_bytes(data)
        return path

    return write


def test_detects_png_from_png_fixture(
    write_file: Callable[[str, bytes], Path], png_bytes: bytes
) -> None:
    """PNG の先頭のバイトから image/png と判定すること"""
    assert detect_mime_type(write_file("noext", png_bytes)) == "image/png"


@pytest.mark.parametrize(
    ("data", "expected"),
    [
        (b"\xff\xd8\xff\xe0" + b"\x00" * 8, "image/jpeg"),
        (b"GIF89a" + b"\x00" * 8, "image/gif"),
        (b"GIF87a" + b"\x00" * 8, "image/gif"),
        (b"RIFF\x00\x00\x00\x00WEBPVP8 ", "image/webp"),
        (b"%PDF-1.7\n%binary", "application/pdf"),
        (b"BM" + b"\x00" * 8, "image/bmp"),
    ],
)
def test_detects_type_from_magic_bytes_ignoring_extension(
    write_file: Callable[[str, bytes], Path], data: bytes, expected: str
) -> None:
    """拡張子が違っても先頭のバイトで判定すること"""
    assert detect_mime_type(write_file("misnamed.txt", data)) == expected


def test_detects_ooxml_from_zip_magic_and_extension(
    write_file: Callable[[str, bytes], Path],
) -> None:
    """ZIP の先頭と拡張子から OOXML の種類を判定すること"""
    assert detect_mime_type(write_file("a.docx", ZIP_MAGIC + b"\x00")) == DOCX_TYPE


def test_detects_plain_zip_without_office_extension(
    write_file: Callable[[str, bytes], Path],
) -> None:
    """Office 拡張子でない ZIP は application/zip と判定すること"""
    assert (
        detect_mime_type(write_file("a.zip", ZIP_MAGIC + b"\x00")) == "application/zip"
    )


def test_falls_back_to_extension_when_no_magic(
    write_file: Callable[[str, bytes], Path],
) -> None:
    """先頭のバイトで判定できないときは拡張子で判定すること"""
    assert detect_mime_type(write_file("a.json", b'{"a": 1}')) == "application/json"
    assert detect_mime_type(write_file("a.html", b"<p>x</p>")) == "text/html"


def test_detects_text_without_extension(
    write_file: Callable[[str, bytes], Path],
) -> None:
    """拡張子がなくても UTF-8 と CP932 の本文を text/plain と判定すること"""
    assert detect_mime_type(write_file("utf8", "テスト本文".encode())) == "text/plain"
    assert (
        detect_mime_type(write_file("sjis", "テスト本文".encode("cp932")))
        == "text/plain"
    )


def test_detects_binary_without_extension_as_octet_stream(
    write_file: Callable[[str, bytes], Path],
) -> None:
    """NUL を含む拡張子なしのバイナリを application/octet-stream と判定すること"""
    assert (
        detect_mime_type(write_file("blob", b"\x01\x02\x00\x04"))
        == "application/octet-stream"
    )
