"""移植元 PdfCoreMediaProcessorTest・WordCoreMediaProcessorTest・ExcelCoreMediaProcessorTest・
PowerPointCoreMediaProcessorTest・OfficeCoreMediaProcessorFailureTest・
PdfPowerPointFailureCompatibilityTest の移植。

移植元の CoreMediaTestFixtures に当たる docx・xlsx・pptx・pdf は、テスト内で一時ファイルとして作る
（バイナリのフィクスチャは置かない）。Java との差:

- PowerPoint の FULL_PAGE は、スライドを描画する手段がなく RENDERING_FAILURE になる
  （移植元は描画して画像説明を作る）。
- PDF の埋め込み画像の資源名は pypdf の画像名（`Im0` など）。
"""

import datetime
import io
from collections.abc import Callable
from pathlib import Path

import docx
import openpyxl  # type: ignore[import-untyped]
import pptx
import pypdf
import pytest
from generative_ai_core.chat.models import CoreImageExplanationRequest
from generative_ai_core.chat.models import CoreImageExplanationResult as ImageResult
from generative_ai_core.chat.runtime import CoreChatRuntime
from generative_ai_core.failure import CoreFailure
from generative_ai_core.media import (
    CORRUPT_FILE,
    IMAGE_EXPLANATION_FAILURE,
    PARSER_FAILURE,
    CoreMediaPreprocessingError,
    CoreMediaPreprocessingMode,
    CoreMediaPreprocessingRequest,
    CoreMediaPreprocessingRuntime,
    ExcelCoreMediaProcessor,
    PdfCoreMediaProcessor,
    PowerPointCoreMediaProcessor,
    WordCoreMediaProcessor,
)
from generative_ai_core.media.model import ENCRYPTED_PDF, RENDERING_FAILURE
from generative_ai_core.media.processors_office import (
    java_date_string,
    java_double_string,
)
from generative_ai_core.provider.model import Capability
from generative_ai_core.provider.runtime import CoreProviderRuntime, ExecutionContext
from PIL import Image
from pptx.util import Emu

DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
PPTX_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
ImageHandler = Callable[[object, ExecutionContext], ImageResult]


def _image_runtime(handler: ImageHandler) -> CoreChatRuntime:
    """OpenAI の IMAGE_EXPLANATION だけを登録した runtime を作る。

    Parameters
    ----------
    handler : ImageHandler
        画像説明のハンドラー。

    Returns
    -------
    CoreChatRuntime
        runtime。
    """
    return CoreChatRuntime(
        CoreProviderRuntime.builder()
        .register(
            "OpenAI",
            Capability.IMAGE_EXPLANATION,
            CoreImageExplanationRequest,
            handler,
        )
        .build()
    )


class _Counter:
    """画像説明の呼び出し回数を数え、固定の説明を返すハンドラー。"""

    def __init__(self, caption: str) -> None:
        """説明文を受け取る。

        Parameters
        ----------
        caption : str
            返す説明。
        """
        self.caption = caption
        self.calls = 0

    def __call__(self, request: object, context: ExecutionContext) -> ImageResult:
        """呼び出しを数えて固定の説明を返す。

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
        self.calls += 1
        return ImageResult.success(self.caption)


def _request(
    file: Path,
    mime_type: str,
    mode: CoreMediaPreprocessingMode = CoreMediaPreprocessingMode.DISABLED,
    handler: ImageHandler | None = None,
) -> CoreMediaPreprocessingRequest:
    """検出済みの MIME を持つリクエストを作る。

    Parameters
    ----------
    file : Path
        ファイル。
    mime_type : str
        検出済みの MIME。
    mode : CoreMediaPreprocessingMode
        前処理のモード。
    handler : ImageHandler | None
        画像説明のハンドラー。あれば runtime を付ける。

    Returns
    -------
    CoreMediaPreprocessingRequest
        リクエスト。
    """
    return CoreMediaPreprocessingRequest(
        file,
        mode=mode,
        detected_mime_type=mime_type,
        provider_id="OpenAI",
        image_explanation_runtime=None if handler is None else _image_runtime(handler),
    )


def _pdf_bytes(text: str = "PDF body") -> bytes:
    """Helvetica で 1 行書いた最小の PDF を手書きで作る（移植元 pdfFile 相当）。

    Parameters
    ----------
    text : str
        ページに書く ASCII の文字列。

    Returns
    -------
    bytes
        PDF のバイト列。
    """
    stream = f"BT /F1 12 Tf 100 700 Td ({text}) Tj ET".encode()
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        (
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            b"/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>"
        ),
        b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for number, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % number + body + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1)
    for offset in offsets:
        out += b"%010d 00000 n \n" % offset
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (
        len(objects) + 1,
        xref,
    )
    return bytes(out)


def _write_pdf_with_image(path: Path, png: bytes) -> None:
    """白紙のページと、画像を 1 枚描いたページの 2 ページの PDF を作る。

    Parameters
    ----------
    path : Path
        書き出し先。
    png : bytes
        埋め込む PNG。
    """
    image_pdf = io.BytesIO()
    Image.open(io.BytesIO(png)).convert("RGB").save(image_pdf, format="PDF")
    writer = pypdf.PdfWriter()
    writer.add_blank_page(width=200, height=200)
    writer.append(pypdf.PdfReader(io.BytesIO(image_pdf.getvalue())))
    with path.open("wb") as f:
        writer.write(f)


# ---- PDF ----


def test_pdf_extracts_text(tmp_path: Path) -> None:
    """PDF のテキストを取り出すこと"""
    file = tmp_path / "sample.pdf"
    file.write_bytes(_pdf_bytes())

    result = PdfCoreMediaProcessor().process(_request(file, "application/pdf"))

    assert "PDF body" in result.text
    assert result.image_explanations == ()


def test_pdf_full_page_keeps_text_and_adds_page_rendering_explanation(
    tmp_path: Path,
) -> None:
    """FULL_PAGE ではテキストを残し、ページ描画の説明（type 2）を付けること"""
    file = tmp_path / "sample.pdf"
    file.write_bytes(_pdf_bytes())
    counter = _Counter("PDFページ説明")

    result = PdfCoreMediaProcessor().process(
        _request(file, "application/pdf", CoreMediaPreprocessingMode.FULL_PAGE, counter)
    )

    assert "PDF body" in result.text
    assert len(result.image_explanations) == 1
    entry = result.image_explanations[0]
    assert entry.type == 2
    assert "PDFページ説明" in entry.caption
    assert "PDFの1ページ目.png" in entry.source_hint
    assert counter.calls == 1


def test_pdf_embed_only_explains_images_and_skips_pages_without_resources(
    tmp_path: Path, png_bytes: bytes
) -> None:
    """EMBED_ONLY では埋め込み画像だけを説明にし、リソースのないページは飛ばすこと"""
    file = tmp_path / "embedded-image.pdf"
    _write_pdf_with_image(file, png_bytes)
    counter = _Counter("埋め込み画像説明")

    result = PdfCoreMediaProcessor().process(
        _request(
            file, "application/pdf", CoreMediaPreprocessingMode.EMBED_ONLY, counter
        )
    )

    assert len(result.image_explanations) == 1
    entry = result.image_explanations[0]
    assert entry.type == 1
    assert "埋め込み画像説明" in entry.caption
    assert entry.source_hint.startswith("PDF2ページ目の画像 - ")
    assert counter.calls == 1


def test_pdf_supports_only_pdf_extension() -> None:
    """拡張子が .pdf のときだけ扱うこと"""
    processor = PdfCoreMediaProcessor()

    assert processor.supports(CoreMediaPreprocessingRequest(Path("doc.pdf")))
    assert processor.supports(CoreMediaPreprocessingRequest(Path("DOC.PDF")))
    assert not processor.supports(CoreMediaPreprocessingRequest(Path("doc.txt")))


def test_pdf_encrypted_returns_encrypted_pdf_failure(tmp_path: Path) -> None:
    """暗号化された PDF は ENCRYPTED_PDF の失敗になること"""
    writer = pypdf.PdfWriter(clone_from=io.BytesIO(_pdf_bytes()))
    writer.encrypt("secret")
    file = tmp_path / "encrypted.pdf"
    with file.open("wb") as f:
        writer.write(f)

    result = CoreMediaPreprocessingRuntime().preprocess(
        CoreMediaPreprocessingRequest(file)
    )

    assert result.failure is not None
    assert result.failure.code == ENCRYPTED_PDF


def test_corrupt_pdf_returns_secret_safe_failure(tmp_path: Path) -> None:
    """壊れた PDF は秘密情報を含まない CORRUPT_FILE か PARSER_FAILURE になること"""
    file = tmp_path / "broken.pdf"
    file.write_text("not a pdf endpoint=https://prod.example.invalid")

    result = CoreMediaPreprocessingRuntime().preprocess(
        CoreMediaPreprocessingRequest(file)
    )

    assert result.failure is not None
    assert result.failure.code in (CORRUPT_FILE, PARSER_FAILURE)
    assert "https://prod.example.invalid" not in result.failure.summary


def test_pdf_full_page_image_explanation_failure_is_secret_safe(
    tmp_path: Path,
) -> None:
    """FULL_PAGE の画像説明の失敗が秘密情報を含まない IMAGE_EXPLANATION_FAILURE になること"""
    file = tmp_path / "sample.pdf"
    file.write_bytes(_pdf_bytes())

    def failing(request: object, context: ExecutionContext) -> ImageResult:
        """秘密情報を含む失敗を返す。

        Parameters
        ----------
        request : object
            画像説明のリクエスト。
        context : ExecutionContext
            実行の文脈。

        Returns
        -------
        ImageResult
            失敗の結果。
        """
        return ImageResult.from_failure(
            CoreFailure.of(
                "IMAGE_EXPLANATION_FAILURE",
                "api_key=sk-secret endpoint=https://prod.example.invalid",
            )
        )

    result = CoreMediaPreprocessingRuntime().preprocess(
        CoreMediaPreprocessingRequest(
            file,
            mode=CoreMediaPreprocessingMode.FULL_PAGE,
            provider_id="OpenAI",
            image_explanation_runtime=_image_runtime(failing),
        )
    )

    assert result.failure is not None
    assert result.failure.code == IMAGE_EXPLANATION_FAILURE
    assert "sk-secret" not in result.failure.summary
    assert "https://prod.example.invalid" not in result.failure.summary


# ---- Word ----


def _word_file(path: Path, png: bytes | None = None) -> Path:
    """Word 文書を作る。画像を渡すと本文の次の run に埋め込む。

    Parameters
    ----------
    path : Path
        書き出し先。
    png : bytes | None
        埋め込む PNG。

    Returns
    -------
    Path
        書き出したファイル。
    """
    document = docx.Document()
    paragraph = document.add_paragraph("Word画像本文" if png else "Word本文")
    if png is not None:
        paragraph.add_run().add_picture(io.BytesIO(png))
    document.save(str(path))
    return path


def test_word_extracts_text(tmp_path: Path) -> None:
    """Word の段落のテキストを取り出すこと"""
    file = _word_file(tmp_path / "sample.docx")

    result = WordCoreMediaProcessor().process(_request(file, DOCX_TYPE))

    assert result.text == "Word本文\n"


def test_word_skips_blank_paragraphs(tmp_path: Path) -> None:
    """空白だけの段落は出力しないこと"""
    document = docx.Document()
    document.add_paragraph("   ")
    document.add_paragraph("本文")
    file = tmp_path / "blank.docx"
    document.save(str(file))

    result = WordCoreMediaProcessor().process(_request(file, DOCX_TYPE))

    assert result.text == "本文\n"


def test_word_embed_mode_explains_pictures_and_keeps_text(
    tmp_path: Path, png_bytes: bytes
) -> None:
    """EMBED_ONLY では埋め込み画像を説明にし、本文を残すこと"""
    file = _word_file(tmp_path / "with-image.docx", png_bytes)
    counter = _Counter("Word画像説明")

    result = WordCoreMediaProcessor().process(
        _request(file, DOCX_TYPE, CoreMediaPreprocessingMode.EMBED_ONLY, counter)
    )

    assert "Word画像本文" in result.text
    assert len(result.image_explanations) == 1
    assert "Word画像説明" in result.image_explanations[0].caption
    assert result.image_explanations[0].source_hint.startswith(
        "Word内の埋め込み画像 - image"
    )
    assert counter.calls == 1


def test_word_disabled_mode_does_not_explain_pictures(
    tmp_path: Path, png_bytes: bytes
) -> None:
    """DISABLED では画像を説明にしないこと"""
    file = _word_file(tmp_path / "with-image.docx", png_bytes)

    result = WordCoreMediaProcessor().process(_request(file, DOCX_TYPE))

    assert result.image_explanations == ()


def test_word_supports_only_docx_extension() -> None:
    """拡張子が .docx のときだけ扱うこと"""
    processor = WordCoreMediaProcessor()

    assert processor.supports(CoreMediaPreprocessingRequest(Path("doc.docx")))
    assert not processor.supports(CoreMediaPreprocessingRequest(Path("doc.pdf")))


def test_unreadable_office_file_returns_parser_or_corrupt_failure(
    tmp_path: Path,
) -> None:
    """読めない Office ファイルは PARSER_FAILURE か CORRUPT_FILE になること"""
    file = tmp_path / "broken.docx"
    file.write_text("not a docx")

    result = CoreMediaPreprocessingRuntime().preprocess(
        CoreMediaPreprocessingRequest(file)
    )

    assert result.failure is not None
    assert result.failure.code in (PARSER_FAILURE, CORRUPT_FILE)


# ---- Excel ----


def _excel_file(path: Path) -> Path:
    """Sheet1 の A1 に「Excel本文」を書いたブックを作る。

    Parameters
    ----------
    path : Path
        書き出し先。

    Returns
    -------
    Path
        書き出したファイル。
    """
    workbook = openpyxl.Workbook()
    workbook.active.title = "Sheet1"
    workbook.active["A1"] = "Excel本文"
    workbook.save(str(path))
    return path


def test_excel_extracts_text(tmp_path: Path) -> None:
    """Excel のシート名とセルのテキストを取り出すこと"""
    file = _excel_file(tmp_path / "sample.xlsx")

    result = ExcelCoreMediaProcessor().process(_request(file, XLSX_TYPE))

    assert result.text == "【シート名: Sheet1】\nExcel本文\t\n"


def test_excel_extracts_supported_cell_types_and_skips_images_when_disabled(
    tmp_path: Path,
) -> None:
    """文字・数値・真偽・数式・日付を取り出し、空セルは出さず、DISABLED では画像を扱わないこと"""
    workbook = openpyxl.Workbook()
    sheet = workbook.active
    sheet.title = "Data"
    sheet["A1"] = "text"
    sheet["B1"] = 12.5
    sheet["C1"] = True
    sheet["D1"] = "=B1*2"
    sheet["E1"] = datetime.datetime(1970, 1, 1, 0, 0, 0)
    sheet["E1"].number_format = "yyyy-mm-dd"
    sheet["F1"].number_format = "0.00"
    file = tmp_path / "cell-types.xlsx"
    workbook.save(str(file))

    result = ExcelCoreMediaProcessor().process(_request(file, XLSX_TYPE))

    for expected in ("Data", "text", "12.5", "true", "B1*2", "1970"):
        assert expected in result.text
    assert "\t\t" not in result.text
    assert result.image_explanations == ()


def test_excel_integer_cell_is_formatted_like_java_double(tmp_path: Path) -> None:
    """整数のセルが Java の Double.toString と同じ「5.0」になること"""
    workbook = openpyxl.Workbook()
    workbook.active["A1"] = 5
    file = tmp_path / "int.xlsx"
    workbook.save(str(file))

    result = ExcelCoreMediaProcessor().process(_request(file, XLSX_TYPE))

    assert "5.0\t" in result.text


def test_excel_explains_workbook_pictures_for_each_sheet(
    tmp_path: Path, png_bytes: bytes
) -> None:
    """EMBED_ONLY ではブックの画像をシートごとに説明にすること（移植元の getAllPictures と同じ）"""
    workbook = openpyxl.Workbook()
    first = workbook.active
    first.title = "S1"
    first["A1"] = "本文"
    first.add_image(openpyxl.drawing.image.Image(io.BytesIO(png_bytes)), "B2")
    workbook.create_sheet("S2")["A1"] = "二枚目"
    file = tmp_path / "pictures.xlsx"
    workbook.save(str(file))
    counter = _Counter("Excel画像説明")

    result = ExcelCoreMediaProcessor().process(
        _request(file, XLSX_TYPE, CoreMediaPreprocessingMode.EMBED_ONLY, counter)
    )

    hints = [entry.source_hint for entry in result.image_explanations]
    assert hints == [
        "S1の画像 - /xl/media/image1.png",
        "S2の画像 - /xl/media/image1.png",
    ]
    assert counter.calls == 2


def test_excel_supports_only_xlsx_extension() -> None:
    """拡張子が .xlsx のときだけ扱うこと"""
    processor = ExcelCoreMediaProcessor()

    assert processor.supports(CoreMediaPreprocessingRequest(Path("book.xlsx")))
    assert not processor.supports(CoreMediaPreprocessingRequest(Path("book.csv")))


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (12.5, "12.5"),
        (5.0, "5.0"),
        (0.0, "0.0"),
        (-3.25, "-3.25"),
        (1e7, "1.0E7"),
        (12345678.9, "1.23456789E7"),
        (0.0001, "1.0E-4"),
        (1.5e-5, "1.5E-5"),
        (1e10, "1.0E10"),
        (float("nan"), "NaN"),
        (float("inf"), "Infinity"),
    ],
)
def test_java_double_string_matches_java(value: float, expected: str) -> None:
    """Java の Double.toString と同じ書式になること"""
    assert java_double_string(value) == expected


def test_java_date_string_uses_java_util_date_format() -> None:
    """日付が java.util.Date#toString の書式（曜日 月 日 時刻 ゾーン 年）になること"""
    text = java_date_string(datetime.datetime(1970, 1, 1, 9, 30, 15))

    assert text.startswith("Thu Jan 01 09:30:15 ")
    assert text.endswith(" 1970")


# ---- PowerPoint ----


def _powerpoint_file(
    path: Path, png: bytes | None = None, text: str = "PowerPoint本文"
) -> Path:
    """テキストボックス（と画像）を置いたスライド 1 枚のファイルを作る。

    Parameters
    ----------
    path : Path
        書き出し先。
    png : bytes | None
        置く PNG。
    text : str
        テキストボックスの文字列。

    Returns
    -------
    Path
        書き出したファイル。
    """
    presentation = pptx.Presentation()
    slide = presentation.slides.add_slide(presentation.slide_layouts[6])
    box = slide.shapes.add_textbox(Emu(0), Emu(0), Emu(914400), Emu(914400))
    box.text_frame.text = text
    if png is not None:
        slide.shapes.add_picture(io.BytesIO(png), Emu(0), Emu(914400))
    presentation.save(str(path))
    return path


def test_powerpoint_extracts_text(tmp_path: Path) -> None:
    """PowerPoint のテキストを取り出すこと"""
    file = _powerpoint_file(tmp_path / "sample.pptx")

    result = PowerPointCoreMediaProcessor().process(_request(file, PPTX_TYPE))

    assert result.text == "PowerPoint本文\n"


def test_powerpoint_full_page_returns_rendering_failure(tmp_path: Path) -> None:
    """FULL_PAGE はスライドを描画できず RENDERING_FAILURE になること（移植元との差）"""
    file = _powerpoint_file(tmp_path / "sample.pptx")
    counter = _Counter("スライド説明")

    with pytest.raises(CoreMediaPreprocessingError) as raised:
        PowerPointCoreMediaProcessor().process(
            _request(file, PPTX_TYPE, CoreMediaPreprocessingMode.FULL_PAGE, counter)
        )

    assert raised.value.failure.code == RENDERING_FAILURE
    assert counter.calls == 0


def test_powerpoint_embed_mode_extracts_text_and_explains_pictures(
    tmp_path: Path, png_bytes: bytes
) -> None:
    """EMBED_ONLY ではスライドの本文を残し、画像を説明にすること"""
    file = _powerpoint_file(
        tmp_path / "with-image.pptx", png_bytes, "画像付きスライド本文"
    )
    counter = _Counter("PowerPoint画像説明")

    result = PowerPointCoreMediaProcessor().process(
        _request(file, PPTX_TYPE, CoreMediaPreprocessingMode.EMBED_ONLY, counter)
    )

    assert "画像付きスライド本文" in result.text
    assert len(result.image_explanations) == 1
    entry = result.image_explanations[0]
    assert entry.type == 1
    assert "PowerPoint画像説明" in entry.caption
    assert entry.source_hint.startswith("スライド1ページ目の画像 - image")
    assert counter.calls == 1


def test_powerpoint_disabled_mode_does_not_explain_pictures(
    tmp_path: Path, png_bytes: bytes
) -> None:
    """DISABLED では画像を説明にしないこと"""
    file = _powerpoint_file(tmp_path / "with-image.pptx", png_bytes)

    result = PowerPointCoreMediaProcessor().process(_request(file, PPTX_TYPE))

    assert result.image_explanations == ()


def test_powerpoint_supports_only_pptx_extension() -> None:
    """拡張子が .pptx のときだけ扱うこと"""
    processor = PowerPointCoreMediaProcessor()

    assert processor.supports(CoreMediaPreprocessingRequest(Path("deck.pptx")))
    assert not processor.supports(CoreMediaPreprocessingRequest(Path("deck.docx")))


def test_corrupt_powerpoint_returns_secret_safe_failure(tmp_path: Path) -> None:
    """壊れた PowerPoint は秘密情報を含まない CORRUPT_FILE か PARSER_FAILURE になること"""
    file = tmp_path / "broken.pptx"
    file.write_text("not a pptx api_key=sk-secret")

    result = CoreMediaPreprocessingRuntime().preprocess(
        CoreMediaPreprocessingRequest(file)
    )

    assert result.failure is not None
    assert result.failure.code in (CORRUPT_FILE, PARSER_FAILURE)
    assert "sk-secret" not in result.failure.summary


def test_runtime_preprocesses_docx_end_to_end(tmp_path: Path) -> None:
    """runtime が Word を MIME 判定から処理器まで通して処理すること"""
    file = _word_file(tmp_path / "sample.docx")

    result = CoreMediaPreprocessingRuntime().preprocess(
        CoreMediaPreprocessingRequest(file)
    )

    assert result.failure is None
    assert result.text == "Word本文\n"
    assert result.mime_type == DOCX_TYPE


def test_runtime_preprocesses_pdf_end_to_end(tmp_path: Path) -> None:
    """runtime が PDF を MIME 判定から処理器まで通して処理すること"""
    file = tmp_path / "sample.pdf"
    file.write_bytes(_pdf_bytes())

    result = CoreMediaPreprocessingRuntime().preprocess(
        CoreMediaPreprocessingRequest(file)
    )

    assert result.failure is None
    assert "PDF body" in result.text
    assert result.mime_type == "application/pdf"
