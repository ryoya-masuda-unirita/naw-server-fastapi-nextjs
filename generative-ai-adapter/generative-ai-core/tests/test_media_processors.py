"""移植元 TextCoreMediaProcessorTest・ImageCoreMediaProcessorTest・
CoreMediaProcessorRegistryTest の移植。

レジストリの既定は移植元と同じ順序（PDF・Word・PowerPoint・Excel・画像・テキスト）。
PDF・Office の処理器自体のテストは test_media_office.py。
"""

from pathlib import Path

import pytest
from generative_ai_core.chat.models import CoreImageExplanationRequest
from generative_ai_core.chat.models import CoreImageExplanationResult as ImageResult
from generative_ai_core.chat.runtime import CoreChatRuntime
from generative_ai_core.media import (
    UNSUPPORTED_MIME,
    CoreMediaPreprocessingMode,
    CoreMediaPreprocessingRequest,
    CoreMediaPreprocessingRuntime,
    ExcelCoreMediaProcessor,
    ImageCoreMediaProcessor,
    PdfCoreMediaProcessor,
    PowerPointCoreMediaProcessor,
    TextCoreMediaProcessor,
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
