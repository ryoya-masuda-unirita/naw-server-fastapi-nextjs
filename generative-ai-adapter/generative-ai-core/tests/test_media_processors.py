"""移植元 TextCoreMediaProcessorTest・ImageCoreMediaProcessorTest・
CoreMediaProcessorRegistryTest の移植。

レジストリの既定は移植元と同じ順序（PDF・Word・PowerPoint・Excel・画像・テキスト）。
PDF・Office の処理器自体のテストは test_media_office.py。
"""

from pathlib import Path
from typing import cast

import pytest
from generative_ai_core.chat.models import CoreImageExplanationRequest
from generative_ai_core.chat.models import CoreImageExplanationResult as ImageResult
from generative_ai_core.chat.runtime import CoreChatRuntime
from generative_ai_core.media import (
    CORRUPT_FILE,
    PARSER_FAILURE,
    UNSUPPORTED_MIME,
    CoreMediaPreprocessingMode,
    CoreMediaPreprocessingRequest,
    CoreMediaPreprocessingRuntime,
    ExcelCoreMediaProcessor,
    ImageCoreMediaProcessor,
    PdfCoreMediaProcessor,
    PowerPointCoreMediaProcessor,
    TextCoreMediaProcessor,
    TikaClient,
    TikaFileError,
    TikaUnavailableError,
    WordCoreMediaProcessor,
)
from generative_ai_core.media.runtime import default_processors
from generative_ai_core.provider.model import Capability
from generative_ai_core.provider.runtime import CoreProviderRuntime, ExecutionContext

DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
PPTX_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _request(name: str, mime_type: str) -> CoreMediaPreprocessingRequest:
    """存在しないファイル名と検出済みの MIME だけを持つリクエストを作る。

    Parameters
    ----------
    name : str
        ファイル名。
    mime_type : str
        検出済みの MIME。

    Returns
    -------
    CoreMediaPreprocessingRequest
        作ったリクエスト。
    """
    return CoreMediaPreprocessingRequest(
        Path(name), source_name=name, detected_mime_type=mime_type
    )


def _select(name: str, mime_type: str) -> object | None:
    """既定の処理器から、リクエストを扱えるものを先頭から探す。

    Parameters
    ----------
    name : str
        ファイル名。
    mime_type : str
        検出済みの MIME。

    Returns
    -------
    object | None
        最初に扱えると答えた処理器。なければ None。
    """
    request = _request(name, mime_type)
    return next((p for p in default_processors() if p.supports(request)), None)


def _image_runtime(explanation: str) -> CoreChatRuntime:
    """固定の説明を返す画像説明の runtime を作る。

    Parameters
    ----------
    explanation : str
        返す説明。

    Returns
    -------
    CoreChatRuntime
        OpenAI の IMAGE_EXPLANATION だけを登録した runtime。
    """

    def handle(request: object, context: ExecutionContext) -> ImageResult:
        """固定の説明を成功として返す。

        Parameters
        ----------
        request : object
            画像説明のリクエスト。
        context : ExecutionContext
            実行の文脈。

        Returns
        -------
        ImageResult
            固定の説明。
        """
        return ImageResult.success(explanation)

    return CoreChatRuntime(
        CoreProviderRuntime.builder()
        .register(
            "OpenAI", Capability.IMAGE_EXPLANATION, CoreImageExplanationRequest, handle
        )
        .build()
    )


def test_registry_selects_processor_from_detected_mime_and_extension() -> None:
    """検出した MIME と拡張子から処理器を選ぶこと"""
    assert isinstance(_select("sample.png", "image/png"), ImageCoreMediaProcessor)
    assert isinstance(_select("sample.txt", "text/plain"), TextCoreMediaProcessor)
    assert isinstance(_select("sample.pdf", "application/pdf"), PdfCoreMediaProcessor)
    assert isinstance(_select("sample.docx", DOCX_TYPE), WordCoreMediaProcessor)
    assert isinstance(_select("sample.pptx", PPTX_TYPE), PowerPointCoreMediaProcessor)
    assert isinstance(_select("sample.xlsx", XLSX_TYPE), ExcelCoreMediaProcessor)
    assert _select("sample.bin", "application/octet-stream") is None


def test_registry_defaults_follow_the_java_order() -> None:
    """既定の処理器が移植元と同じ順序であること"""
    assert [type(p) for p in default_processors()] == [
        PdfCoreMediaProcessor,
        WordCoreMediaProcessor,
        PowerPointCoreMediaProcessor,
        ExcelCoreMediaProcessor,
        ImageCoreMediaProcessor,
        TextCoreMediaProcessor,
    ]


def test_text_processor_extracts_text(tmp_path: Path) -> None:
    """テキスト処理器が本文を取り出すこと"""
    file = tmp_path / "sample.txt"
    file.write_text("テスト本文", encoding="utf-8")

    result = TextCoreMediaProcessor().process(
        CoreMediaPreprocessingRequest(file, detected_mime_type="text/plain")
    )

    assert "テスト本文" in result.text


def test_text_processor_decodes_cp932(tmp_path: Path) -> None:
    """テキスト処理器が CP932 の本文も読めること"""
    file = tmp_path / "sjis.txt"
    file.write_bytes("テスト本文".encode("cp932"))

    result = TextCoreMediaProcessor().process(
        CoreMediaPreprocessingRequest(file, detected_mime_type="text/plain")
    )

    assert result.text == "テスト本文"


def test_text_processor_strips_html_tags_and_scripts(tmp_path: Path) -> None:
    """HTML のタグと script・style を除いた本文にすること"""
    file = tmp_path / "page.html"
    file.write_text(
        "<html><style>p{}</style><script>x()</script><p>本文</p></html>",
        encoding="utf-8",
    )

    result = TextCoreMediaProcessor().process(
        CoreMediaPreprocessingRequest(file, detected_mime_type="text/html")
    )

    assert result.text == "本文"


def test_text_processor_supports_only_non_binary_non_office_non_image() -> None:
    """テキスト処理器がバイナリ・Office・画像を扱わないこと"""
    processor = TextCoreMediaProcessor()

    assert processor.supports(_request("notes.txt", "text/plain"))
    assert not processor.supports(_request("image.png", "image/png"))
    assert not processor.supports(_request("doc.pdf", "application/pdf"))
    assert not processor.supports(_request("doc.docx", DOCX_TYPE))
    assert not processor.supports(_request("deck.pptx", PPTX_TYPE))
    assert not processor.supports(_request("book.xlsx", XLSX_TYPE))
    assert not processor.supports(_request("unknown.bin", "application/octet-stream"))


@pytest.mark.parametrize("name", ["a.doc", "a.xls", "a.ppt"])
def test_runtime_returns_unsupported_mime_for_legacy_office(
    tmp_path: Path, name: str
) -> None:
    """旧形式の Office（.doc・.xls・.ppt）が UNSUPPORTED_MIME の失敗になること"""
    file = tmp_path / name
    file.write_bytes(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1\x00")

    result = CoreMediaPreprocessingRuntime().preprocess(
        CoreMediaPreprocessingRequest(file)
    )

    assert result.failure is not None
    assert result.failure.code == UNSUPPORTED_MIME


def test_image_processor_keeps_attachment_when_disabled(
    tmp_path: Path, png_bytes: bytes
) -> None:
    """DISABLED では画像を添付として残し、runtime を必要としないこと"""
    file = tmp_path / "image.png"
    file.write_bytes(png_bytes)

    result = ImageCoreMediaProcessor().process(
        CoreMediaPreprocessingRequest(
            file,
            mode=CoreMediaPreprocessingMode.DISABLED,
            detected_mime_type="image/png",
        )
    )

    assert result.attachment is not None
    assert result.attachment.data == png_bytes
    assert not result.text.strip()


def test_image_processor_uses_core_image_explanation_when_enabled(
    tmp_path: Path, png_bytes: bytes
) -> None:
    """有効なモードでは core の画像説明を使い、添付を残さないこと"""
    file = tmp_path / "image.png"
    file.write_bytes(png_bytes)

    result = ImageCoreMediaProcessor().process(
        CoreMediaPreprocessingRequest(
            file,
            mode=CoreMediaPreprocessingMode.EMBED_ONLY,
            detected_mime_type="image/png",
            provider_id="OpenAI",
            image_explanation_runtime=_image_runtime("画像説明"),
        )
    )

    assert "画像説明" in result.text
    assert result.attachment is None


def test_runtime_preprocesses_png_end_to_end(tmp_path: Path, png_bytes: bytes) -> None:
    """runtime が PNG を MIME 判定から処理器まで通して処理すること"""
    file = tmp_path / "noext"
    file.write_bytes(png_bytes)

    result = CoreMediaPreprocessingRuntime().preprocess(
        CoreMediaPreprocessingRequest(file)
    )

    assert result.failure is None
    assert result.mime_type == "image/png"
    assert result.attachment is not None


OLE_MAGIC = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"
LEGACY_OFFICE_TYPES = {
    "a.doc": "application/msword",
    "a.xls": "application/vnd.ms-excel",
    "a.ppt": "application/vnd.ms-powerpoint",
    "a.rtf": "application/rtf",
    "a.epub": "application/epub+zip",
}


class _StubTika:
    """Tika のクライアントの代わり。決めた本文を返すか、決めた例外を投げる。"""

    def __init__(self, text: str = "", error: Exception | None = None) -> None:
        self._text = text
        self._error = error
        self.calls: list[tuple[str, str, bytes]] = []

    def extract_text(self, filename: str, mime_type: str, data: bytes) -> str:
        self.calls.append((filename, mime_type, data))
        if self._error is not None:
            raise self._error
        return self._text


def _tika_processor(stub: _StubTika) -> TextCoreMediaProcessor:
    """偽の Tika を使うテキストのプロセッサを作る。

    Parameters
    ----------
    stub : _StubTika
        偽の Tika。

    Returns
    -------
    TextCoreMediaProcessor
        Tika を使うプロセッサ。
    """
    return TextCoreMediaProcessor(cast(TikaClient, stub))


def test_text_processor_supports_legacy_office_when_tika_enabled() -> None:
    """Tika が使えるとき、旧形式の Office・RTF・EPUB が対象になること"""
    processor = _tika_processor(_StubTika())
    for name, mime_type in LEGACY_OFFICE_TYPES.items():
        assert processor.supports(_request(name, mime_type)), name


def test_text_processor_excludes_dedicated_formats_when_tika_enabled() -> None:
    """Tika が使えても、専用のプロセッサが読む形式・octet-stream は対象外であること"""
    processor = _tika_processor(_StubTika())
    excluded = [
        ("a.png", "image/png"),
        ("a.pdf", "application/pdf"),
        ("a.docx", DOCX_TYPE),
        ("a.pptx", PPTX_TYPE),
        ("a.xlsx", XLSX_TYPE),
        ("a.bin", "application/octet-stream"),
    ]
    for name, mime_type in excluded:
        assert not processor.supports(_request(name, mime_type)), name


def test_text_processor_keeps_text_only_when_tika_disabled() -> None:
    """Tika が使えないとき、従来どおりテキスト系だけが対象であること"""
    processor = TextCoreMediaProcessor()
    assert processor.supports(_request("a.txt", "text/plain"))
    assert not processor.supports(_request("a.doc", "application/msword"))


def test_text_processor_extracts_via_tika(tmp_path: Path) -> None:
    """Tika の本文の前後の空白を除いた成功の結果になり、MIME とファイル名を渡すこと"""
    path = tmp_path / "a.doc"
    path.write_bytes(OLE_MAGIC + b"body")
    stub = _StubTika(text="\n  本文です\n\n")
    result = _tika_processor(stub).process(
        CoreMediaPreprocessingRequest(
            path, source_name="議事録.doc", detected_mime_type="application/msword"
        )
    )
    assert result.text == "本文です"
    assert stub.calls == [("議事録.doc", "application/msword", OLE_MAGIC + b"body")]


def test_tika_empty_text_is_parser_failure(tmp_path: Path) -> None:
    """Tika が空の本文を返したとき、前処理の失敗（PARSER_FAILURE）になること"""
    path = tmp_path / "a.doc"
    path.write_bytes(OLE_MAGIC + b"body")
    runtime = CoreMediaPreprocessingRuntime([_tika_processor(_StubTika(text=" \n"))])
    result = runtime.preprocess(CoreMediaPreprocessingRequest(path))
    assert result.failure is not None
    assert result.failure.code == PARSER_FAILURE


@pytest.mark.parametrize(
    ("error", "code"),
    [
        (
            TikaFileError(UNSUPPORTED_MIME, "Tika does not support this format"),
            UNSUPPORTED_MIME,
        ),
        (TikaFileError(CORRUPT_FILE, "Tika could not parse this file"), CORRUPT_FILE),
    ],
)
def test_tika_file_problems_map_to_failure_codes(
    tmp_path: Path, error: TikaFileError, code: str
) -> None:
    """ファイルの問題が、対応する失敗のコードになること"""
    path = tmp_path / "a.doc"
    path.write_bytes(OLE_MAGIC + b"body")
    runtime = CoreMediaPreprocessingRuntime([_tika_processor(_StubTika(error=error))])
    result = runtime.preprocess(CoreMediaPreprocessingRequest(path))
    assert result.failure is not None
    assert result.failure.code == code


def test_tika_outage_maps_to_parser_failure_without_content(tmp_path: Path) -> None:
    """Tika の障害は PARSER_FAILURE になり、要約にファイルの中身が出ないこと"""
    path = tmp_path / "a.doc"
    path.write_bytes(OLE_MAGIC + b"SECRET-CONTENT")
    error = TikaUnavailableError("Tika is unavailable")
    runtime = CoreMediaPreprocessingRuntime([_tika_processor(_StubTika(error=error))])
    result = runtime.preprocess(CoreMediaPreprocessingRequest(path))
    assert result.failure is not None
    assert result.failure.code == PARSER_FAILURE
    assert "Tika is unavailable" in result.failure.summary
    assert "SECRET-CONTENT" not in result.failure.summary


def test_octet_stream_stays_unsupported_when_tika_enabled(tmp_path: Path) -> None:
    """Tika が使えても、判定できないファイルは UNSUPPORTED_MIME のままであること"""
    path = tmp_path / "a.bin"
    path.write_bytes(b"\x00\x01\x02\x03" * 64)
    stub = _StubTika(text="x")
    runtime = CoreMediaPreprocessingRuntime([_tika_processor(stub)])
    result = runtime.preprocess(CoreMediaPreprocessingRequest(path))
    assert result.failure is not None
    assert result.failure.code == UNSUPPORTED_MIME
    assert stub.calls == []


def test_default_processors_use_tika_only_when_configured(monkeypatch) -> None:
    """既定のプロセッサは、環境変数があるときだけ Tika を使うこと"""
    from generative_ai_core.media import shutdown_tika

    monkeypatch.delenv("TIKA_URL", raising=False)
    monkeypatch.delenv("TIKA_SERVER_JAR", raising=False)
    shutdown_tika()
    assert _select("a.doc", "application/msword") is None
    monkeypatch.setenv("TIKA_URL", "http://tika:9998")
    shutdown_tika()
    try:
        assert isinstance(
            _select("a.doc", "application/msword"), TextCoreMediaProcessor
        )
    finally:
        shutdown_tika()
