"""学習データのファイルの、分割・検証・テキストの取り出しのテスト（移植元 `ContentSplitter` ほか）。"""

import pytest
from fastapi import HTTPException

from app.core.file_vectorization import (
    DEFAULT_SPLIT_LENGTH,
    extract_text,
    split_content,
    validate_split_length,
)


class TestSplitContent:
    """split_content（移植元 `ContentSplitter.split` と同じ動き）のテスト"""

    def test_short_content_is_one_part_with_trailing_period(self) -> None:
        """分割長に収まる文は、1 つにまとまり、各文の後ろに「。」が付くこと"""
        assert split_content("りんご。みかん。", 100) == ["りんご。みかん。"]

    def test_sentence_delimiters_are_removed_and_period_appended(self) -> None:
        """区切り（。.!?！？）が取り除かれ、つないだ文の後ろに「。」が付くこと"""
        assert split_content("A.B!C?D！E？F", 100) == ["A。B。C。D。E。F。"]

    def test_parts_are_split_when_length_exceeded(self) -> None:
        """分割長を超えると、文の区切りで次の部分に分かれること"""
        sentence = "あ" * 60

        parts = split_content(f"{sentence}。{sentence}。{sentence}。", 100)

        assert parts == [f"{sentence}。"] * 3

    def test_two_short_sentences_share_a_part_until_limit(self) -> None:
        """収まる文は同じ部分につながり、超えると次の部分になること"""
        parts = split_content(
            "あ" * 40 + "。" + "い" * 40 + "。" + "う" * 40 + "。", 100
        )

        assert parts == ["あ" * 40 + "。" + "い" * 40 + "。", "う" * 40 + "。"]

    def test_sentence_longer_than_limit_is_forcibly_split(self) -> None:
        """分割長より長い文は、分割長ごとに強制的に分かれること"""
        parts = split_content("あ" * 250, 100)

        assert parts == ["あ" * 100, "あ" * 100, "あ" * 50]

    def test_trailing_delimiters_do_not_create_empty_parts(self) -> None:
        """末尾に区切りが続いても、空の要素が捨てられ、1 文になること（Java の分割と同じ）"""
        assert split_content("あ。。。", 100) == ["あ。"]

    def test_empty_sentences_in_the_middle_are_kept(self) -> None:
        """途中の連続した区切りの空の要素は残り、「。」が付くこと（Java の分割と同じ）"""
        assert split_content("あ。。い", 100) == ["あ。。い。"]

    def test_part_may_exceed_limit_by_the_appended_period(self) -> None:
        """移植元と同じく、つないだ文の後ろの「。」の分、1 つの部分が分割長を超えうること"""
        parts = split_content("あ" * 99 + "。", 100)

        assert parts == ["あ" * 99 + "。"]
        assert len(parts[0]) == 100

    def test_empty_content_returns_itself(self) -> None:
        """空の文章は、そのまま 1 つで返ること"""
        assert split_content("", 100) == [""]


class TestValidateSplitLength:
    """validate_split_length（移植元 `validateSplitLength`）のテスト"""

    @pytest.mark.parametrize("raw", [None, ""])
    def test_empty_means_default(self, raw: str | None) -> None:
        """未指定・空文字は、既定の 1000 になること"""
        assert validate_split_length(raw) == DEFAULT_SPLIT_LENGTH

    @pytest.mark.parametrize(
        ("raw", "expected"), [("100", 100), ("10000", 10000), ("+500", 500)]
    )
    def test_valid_values(self, raw: str, expected: int) -> None:
        """範囲内の数値が、整数で返ること"""
        assert validate_split_length(raw) == expected

    @pytest.mark.parametrize("raw", ["99", "10001", "0", "-5"])
    def test_out_of_range_is_rejected(self, raw: str) -> None:
        """範囲外の値が、400 になること"""
        with pytest.raises(HTTPException) as raised:
            validate_split_length(raw)

        assert raised.value.status_code == 400
        assert "100から10000" in raised.value.detail

    @pytest.mark.parametrize("raw", ["abc", "1.5", " 100", "1_000", "１００"])
    def test_non_numeric_is_rejected(self, raw: str) -> None:
        """数値でない値（空白・小数・全角・区切りつき）が、400 になること"""
        with pytest.raises(HTTPException) as raised:
            validate_split_length(raw)

        assert raised.value.status_code == 400
        assert "有効な数値" in raised.value.detail


class TestExtractText:
    """extract_text（Tika の代わりの、テキスト系の取り出し）のテスト"""

    def test_utf8_text_is_decoded(self) -> None:
        """UTF-8 のテキストが、取り出せること"""
        assert (
            extract_text("a.txt", "text/plain", "こんにちは".encode()) == "こんにちは"
        )

    def test_bom_is_removed(self) -> None:
        """UTF-8 の BOM が、取り除かれること"""
        assert extract_text("a.txt", None, b"\xef\xbb\xbfabc") == "abc"

    def test_shift_jis_is_decoded(self) -> None:
        """Shift_JIS のテキストが、取り出せること"""
        assert extract_text("a.csv", None, "社内文書".encode("cp932")) == "社内文書"

    def test_html_tags_are_removed(self) -> None:
        """HTML のタグが取り除かれ、本文だけになること"""
        html_text = "<html><body><h1>見出し</h1><p>本文</p></body></html>"

        assert extract_text("a.html", "text/html", html_text.encode()) == "見出し\n本文"

    @pytest.mark.parametrize(
        ("filename", "content_type"),
        [("a.pdf", "application/pdf"), ("a.docx", None), ("a.png", "image/png")],
    )
    def test_unsupported_format_is_rejected(
        self, filename: str, content_type: str | None
    ) -> None:
        """テキスト系でない形式が、分かるメッセージで 400 になること"""
        with pytest.raises(HTTPException) as raised:
            extract_text(filename, content_type, b"\x00\x01")

        assert raised.value.status_code == 400
        assert "取り出せません" in raised.value.detail

    def test_undecodable_bytes_are_rejected(self) -> None:
        """文字コードを判別できないバイト列が、400 になること"""
        with pytest.raises(HTTPException) as raised:
            extract_text("a.txt", "text/plain", b"\x81\x20\xff\xfe")

        assert raised.value.status_code == 400
