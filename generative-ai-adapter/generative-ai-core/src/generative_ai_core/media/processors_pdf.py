"""PDF のプロセッサ（移植元 PdfCoreMediaProcessor・PdfRenderingSupport）。

PDFBox の代わりに、本文の取り出しとページの描画（150 DPI。移植元と同じ）は pypdfium2、
暗号化の判定と埋め込み画像の取り出しは pypdf で行う。
"""

import io
import logging
from typing import Any

import pypdf
import pypdfium2  # type: ignore[import-untyped]
from PIL import Image

from generative_ai_core.media.model import (
    CORRUPT_FILE,
    EMBEDDED_IMAGE_TYPE,
    ENCRYPTED_PDF,
    IMAGE_EXTRACTION_FAILURE,
    PAGE_IMAGE_TYPE,
    RENDERING_FAILURE,
    CoreImageExplanationEntry,
    CoreMediaPreprocessingMode,
    CoreMediaPreprocessingRequest,
    CoreMediaPreprocessingResult,
    CoreProcessedImage,
)
from generative_ai_core.media.processor_support import (
    failure,
    has_extension,
    png_bytes,
)

logger = logging.getLogger(__name__)

PDF_EXTENSION = ".pdf"
RENDER_DPI = 150
PDF_POINTS_PER_INCH = 72
PNG_MIME_TYPE = "image/png"
_PIL_PNG_MODES = frozenset({"RGB", "RGBA", "L", "LA", "P", "1"})


def render_page(document: Any, page_index: int, source_hint: str) -> CoreProcessedImage:
    """ページを 150 DPI の PNG にする（移植元 PdfRenderingSupport#fromPage）。

    Parameters
    ----------
    document : Any
        開いた PDF（pypdfium2.PdfDocument）。
    page_index : int
        0 始まりのページ番号。
    source_hint : str
        画像の出所のヒント。

    Returns
    -------
    CoreProcessedImage
        描画した画像。

    Raises
    ------
    CoreMediaPreprocessingError
        描画できないとき（RENDERING_FAILURE）。
    """
    try:
        bitmap = document[page_index].render(scale=RENDER_DPI / PDF_POINTS_PER_INCH)
        image = bitmap.to_pil().convert("RGB")
    except Exception as e:
        raise failure(RENDERING_FAILURE, str(e) or type(e).__name__) from e
    return CoreProcessedImage(
        png_bytes(image, RENDERING_FAILURE), PNG_MIME_TYPE, source_hint
    )


def image_to_png(image: Image.Image, source_hint: str) -> CoreProcessedImage:
    """埋め込み画像を PNG にする（移植元 PdfRenderingSupport#fromImage）。

    Parameters
    ----------
    image : Image.Image
        PDF から取り出した画像。
    source_hint : str
        画像の出所のヒント。

    Returns
    -------
    CoreProcessedImage
        PNG にした画像。

    Raises
    ------
    CoreMediaPreprocessingError
        PNG にできないとき（IMAGE_EXTRACTION_FAILURE）。
    """
    if image.mode not in _PIL_PNG_MODES:
        image = image.convert("RGB")
    return CoreProcessedImage(
        png_bytes(image, IMAGE_EXTRACTION_FAILURE), PNG_MIME_TYPE, source_hint
    )


def _page_images(page: pypdf.PageObject) -> list[tuple[str, Image.Image]]:
    """ページの画像 XObject を、リソース名（`Im0` など）付きで取り出す。

    Parameters
    ----------
    page : pypdf.PageObject
        PDF のページ。

    Returns
    -------
    list[tuple[str, Image.Image]]
        (リソース名, 画像) の列。リソースがなければ空。

    Raises
    ------
    CoreMediaPreprocessingError
        画像を取り出せないとき（IMAGE_EXTRACTION_FAILURE）。
    """
    try:
        return [
            (str(file.name).rsplit(".", 1)[0], file.image)
            for file in page.images
            if file.image is not None
        ]
    except Exception as e:
        raise failure(IMAGE_EXTRACTION_FAILURE, str(e) or type(e).__name__) from e


def _extract_text(data: bytes) -> str:
    """PDF の本文を取り出す（移植元 PDFTextStripper#getText に近い形）。

    pypdf の `extract_text` は、表の 1 行が 1 セルずつの行に分かれ、Chrome などが作った PDF の
    日本語が康熙部首（例: ⽅・⻑）の文字コードで出るため、検索・埋め込みで本来の文字と一致しない。
    PDFium（描画で使う pypdfium2）は、同じ行を 1 行にまとめ、通常の漢字で返す。

    Parameters
    ----------
    data : bytes
        PDF の中身。

    Returns
    -------
    str
        本文。ページごとに行を並べ、改行は `\n`。前後の空白は除く。
    """
    document = pypdfium2.PdfDocument(data)
    try:
        pages = [
            page.get_textpage().get_text_range().replace("\r\n", "\n")
            for page in document
        ]
    finally:
        document.close()
    return "\n".join(pages).strip()


class PdfCoreMediaProcessor:
    """PDF を扱うプロセッサ。"""

    def supports(self, request: CoreMediaPreprocessingRequest) -> bool:
        """拡張子が `.pdf` か判定する。

        Parameters
        ----------
        request : CoreMediaPreprocessingRequest
            前処理のリクエスト。

        Returns
        -------
        bool
            `.pdf` なら True。
        """
        return has_extension(request.file_path, PDF_EXTENSION)

    def process(
        self, request: CoreMediaPreprocessingRequest
    ) -> CoreMediaPreprocessingResult:
        """テキストを取り出し、モードに応じて画像の説明を付ける。

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
            暗号化・破損・描画失敗・画像説明の失敗のとき。
        """
        data = request.file_path.read_bytes()
        invalid = f"PDF file is invalid: {request.source_name}"
        try:
            reader = pypdf.PdfReader(io.BytesIO(data))
            encrypted = reader.is_encrypted
        except Exception as e:
            raise failure(CORRUPT_FILE, invalid) from e
        if encrypted:
            raise failure(
                ENCRYPTED_PDF, f"PDF file is encrypted: {request.source_name}"
            )
        try:
            text = _extract_text(data)
        except Exception as e:
            raise failure(CORRUPT_FILE, invalid) from e
        explanations: list[CoreImageExplanationEntry] = []
        if request.mode != CoreMediaPreprocessingMode.DISABLED:
            explanations = self._process_images(request, reader, data)
        return CoreMediaPreprocessingResult.success(
            text, None, request.detected_mime_type, tuple(explanations)
        )

    @staticmethod
    def _process_images(
        request: CoreMediaPreprocessingRequest, reader: pypdf.PdfReader, data: bytes
    ) -> list[CoreImageExplanationEntry]:
        """ページの描画（FULL_PAGE）または埋め込み画像（EMBED_ONLY）を説明にする。

        Parameters
        ----------
        request : CoreMediaPreprocessingRequest
            前処理のリクエスト。
        reader : pypdf.PdfReader
            開いた PDF。
        data : bytes
            PDF のバイト列（描画用）。

        Returns
        -------
        list[CoreImageExplanationEntry]
            画像説明の列。

        Raises
        ------
        CoreMediaPreprocessingError
            描画・取り出し・説明に失敗したとき。
        """
        entries: list[CoreImageExplanationEntry] = []
        if request.mode == CoreMediaPreprocessingMode.FULL_PAGE:
            try:
                document = pypdfium2.PdfDocument(data)
            except Exception as e:
                raise failure(RENDERING_FAILURE, str(e) or type(e).__name__) from e
            try:
                for page_index in range(len(reader.pages)):
                    source_hint = f"PDFの{page_index + 1}ページ目.png"
                    image = render_page(document, page_index, source_hint)
                    caption = request.explain_image(
                        source_hint, image.data, image.mime_type
                    )
                    entries.append(
                        CoreImageExplanationEntry(PAGE_IMAGE_TYPE, caption, source_hint)
                    )
            finally:
                document.close()
            return entries
        for page_index, page in enumerate(reader.pages):
            for name, pil_image in _page_images(page):
                source_hint = f"PDF{page_index + 1}ページ目の画像 - {name}"
                image = image_to_png(pil_image, source_hint)
                caption = request.explain_image(
                    source_hint, image.data, image.mime_type
                )
                entries.append(
                    CoreImageExplanationEntry(EMBEDDED_IMAGE_TYPE, caption, source_hint)
                )
        return entries
