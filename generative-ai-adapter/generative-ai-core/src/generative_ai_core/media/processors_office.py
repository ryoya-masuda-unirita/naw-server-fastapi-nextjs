"""Word・Excel・PowerPoint のプロセッサ（移植元 Word/Excel/PowerPointCoreMediaProcessor・
OfficeImageExtractionSupport・PowerPointRenderingSupport）。

Apache POI の代わりに python-docx・openpyxl・python-pptx を使う。再現できない差は次のとおり。

- PowerPoint のスライドの描画（FULL_PAGE）: 移植元は POI の `slide.draw(Graphics2D)` で
  描くが、Python に同等の描画手段がない（LibreOffice などの外部コマンドが要る）。
  描画せず RENDERING_FAILURE の失敗にする。DISABLED・EMBED_ONLY は移植元どおり。
- Excel の日付セルは移植元が `java.util.Date#toString()`（`Thu Jan 01 09:00:00 JST 1970`）
  を出す。Python 版は同じ書式で、タイムゾーンはプロセスのローカルのものを使う。
- Excel の画像: openpyxl はパッケージ内の部品名を持たないため、シートの画像を
  読み込み順に `/xl/media/image{n}.{拡張子}` と名付ける。
"""

import datetime
import decimal
import hashlib
import math
import zipfile
from collections.abc import Iterator
from typing import Any

import docx
import openpyxl  # type: ignore[import-untyped]
import pptx
from docx.opc.exceptions import PackageNotFoundError as DocxPackageNotFoundError
from pptx.enum.shapes import MSO_SHAPE_TYPE
from pptx.exc import PackageNotFoundError as PptxPackageNotFoundError

from generative_ai_core.media.model import (
    CORRUPT_FILE,
    EMBEDDED_IMAGE_TYPE,
    RENDERING_FAILURE,
    CoreImageExplanationEntry,
    CoreMediaPreprocessingMode,
    CoreMediaPreprocessingRequest,
    CoreMediaPreprocessingResult,
    CoreProcessedImage,
)
from generative_ai_core.media.processor_support import failure, has_extension

DOCX_EXTENSION = ".docx"
XLSX_EXTENSION = ".xlsx"
PPTX_EXTENSION = ".pptx"
EXCEL_CELL_SEPARATOR = "\t"
JAVA_DOUBLE_PLAIN_MIN = 1e-3
JAVA_DOUBLE_PLAIN_MAX = 1e7
_IMAGE_MIME_BY_FORMAT = {
    "png": "image/png",
    "jpeg": "image/jpeg",
    "jpg": "image/jpeg",
    "gif": "image/gif",
    "bmp": "image/bmp",
    "tiff": "image/tiff",
}
_NS_BLIP_EMBED = (
    "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed"
)
_NS_BLIP = "{http://schemas.openxmlformats.org/drawingml/2006/main}blip"


def _corrupt(kind: str, request: CoreMediaPreprocessingRequest) -> Exception:
    """読み込めないファイルの失敗を作る（元の例外の文言は要約に入れない）。

    Parameters
    ----------
    kind : str
        ファイルの種類（Word など）。
    request : CoreMediaPreprocessingRequest
        前処理のリクエスト。

    Returns
    -------
    Exception
        CORRUPT_FILE の前処理例外。
    """
    return failure(CORRUPT_FILE, f"{kind} file is invalid: {request.source_name}")


def _part_file_name(part_name: str) -> str:
    """部品名（`/word/media/image1.png`）の最後の要素を返す。

    Parameters
    ----------
    part_name : str
        パッケージ内の部品名。

    Returns
    -------
    str
        ファイル名。
    """
    return str(part_name).rsplit("/", 1)[-1]


class WordCoreMediaProcessor:
    """Word（.docx）を扱うプロセッサ。"""

    def supports(self, request: CoreMediaPreprocessingRequest) -> bool:
        """拡張子が `.docx` か判定する。

        Parameters
        ----------
        request : CoreMediaPreprocessingRequest
            前処理のリクエスト。

        Returns
        -------
        bool
            `.docx` なら True。
        """
        return has_extension(request.file_path, DOCX_EXTENSION)

    def process(
        self, request: CoreMediaPreprocessingRequest
    ) -> CoreMediaPreprocessingResult:
        """段落のテキストを集め、モードに応じて埋め込み画像を説明にする。

        Parameters
        ----------
        request : CoreMediaPreprocessingRequest
            前処理のリクエスト。

        Returns
        -------
        CoreMediaPreprocessingResult
            前処理の結果。

        Raises
        ------
        CoreMediaPreprocessingError
            読み込めない・画像説明に失敗したとき。
        """
        text_content: list[str] = []
        explanations: list[CoreImageExplanationEntry] = []
        try:
            document = docx.Document(str(request.file_path))
        except (
            DocxPackageNotFoundError,
            zipfile.BadZipFile,
            KeyError,
            ValueError,
        ) as e:
            raise _corrupt("Word", request) from e
        for paragraph in document.paragraphs:
            text = paragraph.text
            if text.strip():
                text_content.append(f"{text}\n")
            if request.mode != CoreMediaPreprocessingMode.DISABLED:
                self._process_paragraph_images(
                    request, document, paragraph, explanations
                )
        return CoreMediaPreprocessingResult.success(
            "".join(text_content), None, request.detected_mime_type, tuple(explanations)
        )

    @staticmethod
    def _process_paragraph_images(
        request: CoreMediaPreprocessingRequest,
        document: Any,
        paragraph: Any,
        explanations: list[CoreImageExplanationEntry],
    ) -> None:
        """段落の run に埋め込まれた画像を説明にする。

        Parameters
        ----------
        request : CoreMediaPreprocessingRequest
            前処理のリクエスト。
        document : Any
            開いた Word 文書。
        paragraph : Any
            段落。
        explanations : list[CoreImageExplanationEntry]
            画像説明の追加先。

        Raises
        ------
        CoreMediaPreprocessingError
            画像説明に失敗したとき。
        """
        for run in paragraph.runs:
            for blip in run._r.iter(_NS_BLIP):
                rel_id = blip.get(_NS_BLIP_EMBED)
                if rel_id is None or rel_id not in document.part.related_parts:
                    continue
                part = document.part.related_parts[rel_id]
                file_name = _part_file_name(str(part.partname))
                source_hint = f"Word内の埋め込み画像 - {file_name}"
                image = CoreProcessedImage(part.blob, part.content_type, source_hint)
                caption = request.explain_image(
                    source_hint, image.data, image.mime_type, file_name
                )
                explanations.append(
                    CoreImageExplanationEntry(EMBEDDED_IMAGE_TYPE, caption, source_hint)
                )


def java_double_string(value: float) -> str:
    """`Double.toString` と同じ書式の文字列にする（`12.5`・`1.0`・`1.0E10`）。

    Parameters
    ----------
    value : float
        数値。

    Returns
    -------
    str
        Java の書式の文字列。
    """
    if math.isnan(value):
        return "NaN"
    if value in (float("inf"), float("-inf")):
        return "Infinity" if value > 0 else "-Infinity"
    magnitude = abs(value)
    if magnitude == 0 or JAVA_DOUBLE_PLAIN_MIN <= magnitude < JAVA_DOUBLE_PLAIN_MAX:
        return repr(float(value))
    sign, digit_tuple, exponent = decimal.Decimal(repr(float(value))).as_tuple()
    digits = "".join(str(d) for d in digit_tuple)
    mantissa = f"{digits[0]}.{digits[1:].rstrip('0') or '0'}"
    return f"{'-' if sign else ''}{mantissa}E{len(digits) + int(exponent) - 1}"


def java_date_string(value: datetime.datetime) -> str:
    """`java.util.Date#toString` の書式（`Thu Jan 01 09:00:00 JST 1970`）にする。

    Parameters
    ----------
    value : datetime.datetime
        Excel の日時（タイムゾーンなし。ローカル時刻として扱う）。

    Returns
    -------
    str
        Java の書式の文字列。
    """
    local = value.astimezone()
    return f"{local:%a %b %d %H:%M:%S} {local:%Z} {local:%Y}"


def _cell_string(cell: Any) -> str:
    """セルの値を移植元の `cellString` と同じ文字列にする。

    Parameters
    ----------
    cell : Any
        openpyxl のセル。

    Returns
    -------
    str
        セルの文字列。空セル・エラーセルは空文字。
    """
    value = cell.value
    data_type = cell.data_type
    if value is None:
        return ""
    if data_type == "f":
        return str(value).removeprefix("=")
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (datetime.datetime, datetime.date)):
        if not isinstance(value, datetime.datetime):
            value = datetime.datetime.combine(value, datetime.time())
        return java_date_string(value)
    if isinstance(value, (datetime.time, datetime.timedelta)):
        return ""
    if isinstance(value, (int, float)):
        return java_double_string(float(value))
    if data_type == "e":
        return ""
    return str(value)


def _sheet_rows(sheet: Any) -> Iterator[list[Any]]:
    """シートの定義済みの行ごとに、定義済みのセルを列順で返す（POI の Row 反復と同じ）。

    Parameters
    ----------
    sheet : Any
        openpyxl のシート。

    Yields
    ------
    list[Any]
        1 行分のセル。
    """
    rows: dict[int, list[Any]] = {}
    for (row_index, _column), cell in sorted(sheet._cells.items()):
        rows.setdefault(row_index, []).append(cell)
    yield from (rows[index] for index in sorted(rows))


def _workbook_pictures(workbook: Any) -> list[tuple[str, bytes, str]]:
    """ブック内の画像を重複なく (部品名, バイト列, MIME) で集める（POI の getAllPictures）。

    Parameters
    ----------
    workbook : Any
        openpyxl のブック。

    Returns
    -------
    list[tuple[str, bytes, str]]
        画像の列。
    """
    pictures: list[tuple[str, bytes, str]] = []
    seen: set[str] = set()
    for sheet in workbook.worksheets:
        for image in getattr(sheet, "_images", []):
            stream = image.ref
            stream.seek(0)
            data = stream.read()
            digest = hashlib.sha256(data).hexdigest()
            if digest in seen:
                continue
            seen.add(digest)
            image_format = str(image.format or "png").lower()
            name = f"/xl/media/image{len(pictures) + 1}.{image_format}"
            mime_type = _IMAGE_MIME_BY_FORMAT.get(image_format, f"image/{image_format}")
            pictures.append((name, data, mime_type))
    return pictures


class ExcelCoreMediaProcessor:
    """Excel（.xlsx）を扱うプロセッサ。"""

    def supports(self, request: CoreMediaPreprocessingRequest) -> bool:
        """拡張子が `.xlsx` か判定する。

        Parameters
        ----------
        request : CoreMediaPreprocessingRequest
            前処理のリクエスト。

        Returns
        -------
        bool
            `.xlsx` なら True。
        """
        return has_extension(request.file_path, XLSX_EXTENSION)

    def process(
        self, request: CoreMediaPreprocessingRequest
    ) -> CoreMediaPreprocessingResult:
        """シートごとにセルのテキストを集め、モードに応じて画像を説明にする。

        Parameters
        ----------
        request : CoreMediaPreprocessingRequest
            前処理のリクエスト。

        Returns
        -------
        CoreMediaPreprocessingResult
            前処理の結果。

        Raises
        ------
        CoreMediaPreprocessingError
            読み込めない・画像説明に失敗したとき。
        """
        text_content: list[str] = []
        explanations: list[CoreImageExplanationEntry] = []
        try:
            workbook = openpyxl.load_workbook(str(request.file_path))
        except (zipfile.BadZipFile, KeyError, ValueError, OSError) as e:
            raise _corrupt("Excel", request) from e
        try:
            pictures = (
                _workbook_pictures(workbook)
                if request.mode != CoreMediaPreprocessingMode.DISABLED
                else []
            )
            for sheet in workbook.worksheets:
                text_content.append(f"【シート名: {sheet.title}】\n")
                for cells in _sheet_rows(sheet):
                    for cell in cells:
                        cell_text = _cell_string(cell)
                        if cell_text.strip():
                            text_content.append(f"{cell_text}{EXCEL_CELL_SEPARATOR}")
                    text_content.append("\n")
                for part_name, data, mime_type in pictures:
                    source_hint = f"{sheet.title}の画像 - {part_name}"
                    file_name = _part_file_name(part_name)
                    caption = request.explain_image(
                        source_hint, data, mime_type, file_name
                    )
                    explanations.append(
                        CoreImageExplanationEntry(
                            EMBEDDED_IMAGE_TYPE, caption, source_hint
                        )
                    )
        finally:
            workbook.close()
        return CoreMediaPreprocessingResult.success(
            "".join(text_content), None, request.detected_mime_type, tuple(explanations)
        )


class PowerPointCoreMediaProcessor:
    """PowerPoint（.pptx）を扱うプロセッサ。"""

    def supports(self, request: CoreMediaPreprocessingRequest) -> bool:
        """拡張子が `.pptx` か判定する。

        Parameters
        ----------
        request : CoreMediaPreprocessingRequest
            前処理のリクエスト。

        Returns
        -------
        bool
            `.pptx` なら True。
        """
        return has_extension(request.file_path, PPTX_EXTENSION)

    def process(
        self, request: CoreMediaPreprocessingRequest
    ) -> CoreMediaPreprocessingResult:
        """スライドのテキストを集め、モードに応じて画像を説明にする。

        Parameters
        ----------
        request : CoreMediaPreprocessingRequest
            前処理のリクエスト。

        Returns
        -------
        CoreMediaPreprocessingResult
            前処理の結果。

        Raises
        ------
        CoreMediaPreprocessingError
            読み込めない・スライドを描画できない（FULL_PAGE）・画像説明に失敗したとき。
        """
        text_content: list[str] = []
        explanations: list[CoreImageExplanationEntry] = []
        try:
            presentation = pptx.Presentation(str(request.file_path))
        except (
            PptxPackageNotFoundError,
            zipfile.BadZipFile,
            KeyError,
            ValueError,
        ) as e:
            raise _corrupt("PowerPoint", request) from e
        for slide_index, slide in enumerate(presentation.slides):
            if request.mode == CoreMediaPreprocessingMode.FULL_PAGE:
                # 移植元は POI の Graphics2D で描くが、Python に同等の描画手段がない
                raise failure(
                    RENDERING_FAILURE,
                    "PowerPoint slide rendering is not supported: "
                    f"{request.source_name} (slide {slide_index + 1})",
                )
            self._process_slide_shapes(
                request, slide, slide_index, text_content, explanations
            )
        return CoreMediaPreprocessingResult.success(
            "".join(text_content), None, request.detected_mime_type, tuple(explanations)
        )

    @staticmethod
    def _process_slide_shapes(
        request: CoreMediaPreprocessingRequest,
        slide: Any,
        slide_index: int,
        text_content: list[str],
        explanations: list[CoreImageExplanationEntry],
    ) -> None:
        """スライドの図形のテキストを集め、画像を説明にする。

        Parameters
        ----------
        request : CoreMediaPreprocessingRequest
            前処理のリクエスト。
        slide : Any
            スライド。
        slide_index : int
            0 始まりのスライド番号。
        text_content : list[str]
            テキストの追加先。
        explanations : list[CoreImageExplanationEntry]
            画像説明の追加先。

        Raises
        ------
        CoreMediaPreprocessingError
            画像説明に失敗したとき。
        """
        for shape in slide.shapes:
            if shape.has_text_frame and shape.text_frame.text.strip():
                text_content.append(f"{shape.text_frame.text}\n")
            if request.mode == CoreMediaPreprocessingMode.DISABLED:
                continue
            if shape.shape_type == MSO_SHAPE_TYPE.PICTURE:
                part = slide.part.related_part(shape._element.blip_rId)
                file_name = _part_file_name(str(part.partname))
                source_hint = f"スライド{slide_index + 1}ページ目の画像 - {file_name}"
                image = CoreProcessedImage(part.blob, part.content_type, source_hint)
                caption = request.explain_image(
                    source_hint, image.data, image.mime_type, file_name
                )
                explanations.append(
                    CoreImageExplanationEntry(EMBEDDED_IMAGE_TYPE, caption, source_hint)
                )


__all__ = [
    "ExcelCoreMediaProcessor",
    "PowerPointCoreMediaProcessor",
    "WordCoreMediaProcessor",
    "java_date_string",
    "java_double_string",
]
