from app.core.library_stream_router import LibraryStreamRouter

_FULL = (
    "<<<TITLE>>>\n"
    "部門別 予実対比 2025 Q3\n"
    "<<<CONTENT>>>\n"
    "## 概要\n"
    "予実の対比をまとめます。\n\n"
    "```chart:line\n"
    '{"version": 1}\n'
    "```\n"
)


def _collect(
    router: LibraryStreamRouter, kind: str, emitted: list[tuple[str, str]]
) -> str:
    return "".join(text for k, text in emitted if k == kind)


class TestFeed:
    """LibraryStreamRouter.feed のテスト"""

    def test_routes_title_and_content_char_by_char(self):
        """タイトル・本文をまたぐ全文を1文字ずつ供給すると正しく振り分けられること"""
        router = LibraryStreamRouter()
        emitted: list[tuple[str, str]] = []
        for ch in _FULL:
            emitted.extend(router.feed(ch))
        emitted.extend(router.flush())

        title = _collect(router, "title", emitted)
        content = _collect(router, "content", emitted)
        assert title.strip() == "部門別 予実対比 2025 Q3"
        assert "## 概要" in content
        assert "```chart:line" in content
        assert "<<<" not in title
        assert "##" not in title

    def test_handles_marker_split_across_chunks(self):
        """<<<TITLE>>>がチャンク境界で分割されても正しく振り分けられること"""
        router = LibraryStreamRouter()
        emitted: list[tuple[str, str]] = []
        emitted.extend(router.feed("<<<TIT"))
        emitted.extend(router.feed("LE>>>\nタイトルA\n<<<CON"))
        emitted.extend(router.feed("TENT>>>\n本文B"))
        emitted.extend(router.flush())

        assert _collect(router, "title", emitted).strip() == "タイトルA"
        assert _collect(router, "content", emitted).strip() == "本文B"

    def test_routes_comment_section_to_comment_kind(self):
        """<<<COMMENT>>>セクションがcomment区分として振り分けられること"""
        router = LibraryStreamRouter()
        emitted: list[tuple[str, str]] = []
        emitted.extend(
            router.feed(
                "<<<TITLE>>>\nタイトル\n<<<CONTENT>>>\n本文\n<<<COMMENT>>>\nご確認ください"
            )
        )
        emitted.extend(router.flush())

        assert _collect(router, "comment", emitted).strip() == "ご確認ください"
        assert "ご確認ください" not in _collect(router, "content", emitted)

    def test_comment_marker_split_across_chunks(self):
        """<<<COMMENT>>>マーカーがチャンク境界をまたいでも正しくルーティングされること"""
        router = LibraryStreamRouter()
        emitted: list[tuple[str, str]] = []
        emitted.extend(router.feed("<<<TITLE>>>\nT\n<<<CONTENT>>>\n本文A\n<<<COM"))
        emitted.extend(router.feed("MENT>>>\nコメントB"))
        emitted.extend(router.flush())

        content = _collect(router, "content", emitted)
        comment = _collect(router, "comment", emitted)
        assert "本文A" in content
        assert "コメントB" not in content
        assert comment.strip() == "コメントB"

    def test_content_deltas_preserve_order(self):
        """本文区間のデルタが分割されても順序通り結合されること"""
        router = LibraryStreamRouter()
        emitted: list[tuple[str, str]] = []
        emitted.extend(router.feed("<<<TITLE>>>\nT\n<<<CONTENT>>>\n"))
        emitted.extend(router.feed("あ"))
        emitted.extend(router.feed("い"))
        emitted.extend(router.feed("う"))
        emitted.extend(router.flush())

        assert _collect(router, "content", emitted) == "あいう"


class TestFinal:
    """LibraryStreamRouter.final_title / final_content / final_comment のテスト"""

    def test_final_title_and_content_return_confirmed_values(self):
        """全文供給後、final_title/final_contentが正本を返すこと"""
        router = LibraryStreamRouter()
        router.feed(_FULL)
        router.flush()

        assert router.final_title() == "部門別 予実対比 2025 Q3"
        assert router.final_content().startswith("## 概要")
        assert "```chart:line" in router.final_content()

    def test_fallback_when_markers_missing(self):
        """マーカーが一切ない全文を供給すると、タイトルは空・本文が全文になること"""
        router = LibraryStreamRouter()
        router.feed("マーカーのない素のテキスト")
        router.flush()

        assert router.final_title() == ""
        assert router.final_content() == "マーカーのない素のテキスト"

    def test_final_content_excludes_comment_section(self):
        """<<<COMMENT>>>がある場合、final_contentはCOMMENT_MARKERより手前までを返すこと"""
        router = LibraryStreamRouter()
        router.feed(
            "<<<TITLE>>>\nタイトル\n<<<CONTENT>>>\n本文の内容\n<<<COMMENT>>>\nコメント"
        )
        router.flush()

        assert router.final_content() == "本文の内容"
        assert "コメント" not in router.final_content()
        assert "<<<COMMENT>>>" not in router.final_content()

    def test_final_comment_returns_comment_text(self):
        """final_commentがCOMMENT_MARKER以降のテキストを返すこと"""
        router = LibraryStreamRouter()
        router.feed(
            "<<<TITLE>>>\nタイトル\n<<<CONTENT>>>\n本文\n<<<COMMENT>>>\n追加しますか？"
        )
        router.flush()

        assert router.final_comment() == "追加しますか？"

    def test_final_comment_empty_when_no_marker(self):
        """<<<COMMENT>>>がない場合、final_commentは空文字を返すこと"""
        router = LibraryStreamRouter()
        router.feed("<<<TITLE>>>\nタイトル\n<<<CONTENT>>>\n本文")
        router.flush()

        assert router.final_comment() == ""
