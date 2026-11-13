"""前処理の実行（移植元 CoreMediaPreprocessingRuntime・TextCoreMediaProcessor・
ImageCoreMediaProcessor・CoreMediaProcessorRegistry）。

移植元は Apache Tika で MIME 判定・テキスト抽出をする。Python では次で代える
（docs/issue-298 の 03 を参照）。

- MIME 判定: 先頭のバイト（PNG・JPEG・GIF・WebP・BMP・TIFF・PDF・ZIP・OLE）→
  拡張子 → 中身がテキストとして読めるか、の順
- テキスト抽出: テキスト系の MIME だけを UTF-8（BOM 可）→ CP932 の順で読む。
  HTML はタグを除いた本文にする
"""

import html.parser
import logging
import mimetypes
from collections.abc import Sequence
from pathlib import Path
from typing import Protocol

from generative_ai_core.media.model import (
    CORRUPT_FILE,
    EMPTY_FILE,
    ENCRYPTED_PDF,
    IMAGE_EXTRACTION_FAILURE,
    PARSER_FAILURE,
    RENDERING_FAILURE,
    UNSUPPORTED_MIME,
    CoreMediaPreprocessingError,
    CoreMediaPreprocessingFailure,
    CoreMediaPreprocessingMode,
    CoreMediaPreprocessingRequest,
    CoreMediaPreprocessingResult,
    CoreProcessedImage,
)
from generative_ai_core.media.processors_office import (
    ExcelCoreMediaProcessor,
    PowerPointCoreMediaProcessor,
    WordCoreMediaProcessor,
)
from generative_ai_core.media.processors_pdf import PdfCoreMediaProcessor

logger = logging.getLogger(__name__)

OCTET_STREAM = "application/octet-stream"
TEXT_PLAIN = "text/plain"
TEXT_HTML = "text/html"
SNIFF_BYTES = 8192
TEXT_ENCODINGS = ("utf-8-sig", "cp932")
OFFICE_EXTENSIONS = (".pdf", ".docx", ".pptx", ".xlsx")
_MAGIC: tuple[tuple[bytes, str], ...] = (
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"GIF87a", "image/gif"),
    (b"GIF89a", "image/gif"),
    (b"BM", "image/bmp"),
    (b"II*\x00", "image/tiff"),
    (b"MM\x00*", "image/tiff"),
    (b"%PDF-", "application/pdf"),
)
_ZIP_MAGIC = b"PK\x03\x04"
_OLE_MAGIC = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"
_OOXML_TYPES = {
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}
_OLE_TYPES = {
    ".doc": "application/msword",
    ".xls": "application/vnd.ms-excel",
    ".ppt": "application/vnd.ms-powerpoint",
}
_TEXT_APPLICATION_TYPES = frozenset(
    {
        "application/json",
        "application/xml",
        "application/javascript",
        "application/x-sh",
        "application/x-yaml",
        "application/yaml",
        "application/sql",
    }
)


def _sniff_magic(head: bytes, suffix: str) -> str | None:
    """先頭のバイトから MIME タイプを判定する。

    Parameters
    ----------
    head : bytes
        先頭のバイト列。
    suffix : str
        小文字の拡張子。

    Returns
    -------
    str | None
        MIME タイプ。判定できなければ None。
    """
    for magic, mime_type in _MAGIC:
        if head.startswith(magic):
            return mime_type
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image/webp"
    if head.startswith(_ZIP_MAGIC):
        return _OOXML_TYPES.get(suffix, "application/zip")
    if head.startswith(_OLE_MAGIC):
        return _OLE_TYPES.get(suffix, "application/x-tika-msoffice")
    return None


def _looks_like_text(head: bytes) -> bool:
    """先頭のバイトがテキストとして読めるか判定する。

    Parameters
    ----------
    head : bytes
        先頭のバイト列。

    Returns
    -------
    bool
        テキストなら True。
    """
    if b"\x00" in head:
        return False
    for encoding in TEXT_ENCODINGS:
        try:
            head.decode(encoding)
        except UnicodeDecodeError as e:
            # 読み取った範囲の末尾で文字が切れただけなら、テキストとみなす
            if e.start >= len(head) - 3:
                return True
            continue
        return True
    return False


def detect_mime_type(path: Path) -> str:
    """移植元 Tika#detect(Path) の代わり。

    Parameters
    ----------
    path : Path
        調べるファイル。

    Returns
    -------
    str
        MIME タイプ。
    """
    with path.open("rb") as f:
        head = f.read(SNIFF_BYTES)
    suffix = path.suffix.lower()
    magic = _sniff_magic(head, suffix)
    if magic is not None:
        return magic
    guessed, _ = mimetypes.guess_type(path.name)
    if guessed is not None:
        return guessed
    return TEXT_PLAIN if _looks_like_text(head) else OCTET_STREAM


def _mime_starts(mime_type: str, prefix: str) -> bool:
    """MIME タイプが接頭辞で始まるか判定する（大文字小文字は問わない）。

    Parameters
    ----------
    mime_type : str
        MIME タイプ。
    prefix : str
        接頭辞。

    Returns
    -------
    bool
        始まれば True。
    """
    return mime_type.lower().startswith(prefix.lower())


def _is_text_mime(mime_type: str) -> bool:
    """テキストとして読む MIME タイプか判定する。

    Parameters
    ----------
    mime_type : str
        MIME タイプ。

    Returns
    -------
    bool
        テキスト系なら True。
    """
    base = mime_type.split(";", 1)[0].strip().lower()
    return (
        base.startswith("text/")
        or base in _TEXT_APPLICATION_TYPES
        or base.endswith(("+xml", "+json"))
    )


class _HtmlText(html.parser.HTMLParser):
    """HTML からタグを除いた本文を集める。"""

    _SKIPPED = frozenset({"script", "style"})

    def __init__(self) -> None:
        """パーサーを作る。"""
        super().__init__()
        self.parts: list[str] = []
        self._skip_depth = 0

    def handle_starttag(
        self, tag: str, attrs: Sequence[tuple[str, str | None]]
    ) -> None:
        """script・style の中に入ったら本文を捨てる。

        Parameters
        ----------
        tag : str
            タグ名。
        attrs : Sequence[tuple[str, str | None]]
            属性。
        """
        if tag in self._SKIPPED:
            self._skip_depth += 1

    def handle_endtag(self, tag: str) -> None:
        """script・style から出る。

        Parameters
        ----------
        tag : str
            タグ名。
        """
        if tag in self._SKIPPED and self._skip_depth:
            self._skip_depth -= 1

    def handle_data(self, data: str) -> None:
        """本文を集める。

        Parameters
        ----------
        data : str
            本文の文字列。
        """
        if not self._skip_depth:
            self.parts.append(data)


def _decode_text(data: bytes) -> str:
    """バイト列を UTF-8（BOM 可）→ CP932 の順で文字列にする。

    Parameters
    ----------
    data : bytes
        バイト列。

    Returns
    -------
    str
        デコードした文字列。

    Raises
    ------
    CoreMediaPreprocessingError
        どちらでも読めないとき。
    """
    for encoding in TEXT_ENCODINGS:
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise CoreMediaPreprocessingError(
        CoreMediaPreprocessingFailure.of(
            PARSER_FAILURE, "Text encoding could not be detected."
        )
    )


class CoreMediaProcessor(Protocol):
    """前処理の 1 種類を担当するプロセッサ。"""

    def supports(self, request: CoreMediaPreprocessingRequest) -> bool:
        """このプロセッサが扱えるか判定する。

        Parameters
        ----------
        request : CoreMediaPreprocessingRequest
            前処理のリクエスト。

        Returns
        -------
        bool
            扱えるなら True。
        """

    def process(
        self, request: CoreMediaPreprocessingRequest
    ) -> CoreMediaPreprocessingResult:
        """前処理をする。

        Parameters
        ----------
        request : CoreMediaPreprocessingRequest
            前処理のリクエスト。

        Returns
        -------
        CoreMediaPreprocessingResult
            前処理の結果。
        """


class ImageCoreMediaProcessor:
    """画像を扱うプロセッサ。"""

    def supports(self, request: CoreMediaPreprocessingRequest) -> bool:
        """画像か判定する。

        Parameters
        ----------
        request : CoreMediaPreprocessingRequest
            前処理のリクエスト。

        Returns
        -------
        bool
            画像の MIME タイプなら True。
        """
        return _mime_starts(request.detected_mime_type, "image/")

    def process(
        self, request: CoreMediaPreprocessingRequest
    ) -> CoreMediaPreprocessingResult:
        """画像をそのまま添付にするか、説明文にする。

        Parameters
        ----------
        request : CoreMediaPreprocessingRequest
            前処理のリクエスト。

        Returns
        -------
        CoreMediaPreprocessingResult
            前処理の結果。
        """
        data = request.file_path.read_bytes()
        mime_type = request.detected_mime_type
        if request.mode == CoreMediaPreprocessingMode.DISABLED:
            return CoreMediaPreprocessingResult.success(
                "",
                CoreProcessedImage(data, mime_type, request.source_name),
                mime_type,
            )
        caption = request.explain_image(request.source_name, data, mime_type)
        return CoreMediaPreprocessingResult.success(caption, None, mime_type)


class TextCoreMediaProcessor:
    """テキスト系のファイルを扱うプロセッサ。"""

    def supports(self, request: CoreMediaPreprocessingRequest) -> bool:
        """テキスト系のファイルか判定する。

        Parameters
        ----------
        request : CoreMediaPreprocessingRequest
            前処理のリクエスト。

        Returns
        -------
        bool
            テキストとして読めるなら True。
        """
        mime_type = request.detected_mime_type
        if _mime_starts(mime_type, "image/"):
            return False
        if request.file_path.name.lower().endswith(OFFICE_EXTENSIONS):
            return False
        if mime_type.lower() == OCTET_STREAM:
            return False
        # 移植元（Tika）は Office の旧形式なども読むが、Python 版はテキスト系だけ
        return _is_text_mime(mime_type)

    def process(
        self, request: CoreMediaPreprocessingRequest
    ) -> CoreMediaPreprocessingResult:
        """テキストを抽出する。HTML はタグを除く。

        Parameters
        ----------
        request : CoreMediaPreprocessingRequest
            前処理のリクエスト。

        Returns
        -------
        CoreMediaPreprocessingResult
            前処理の結果。
        """
        text = _decode_text(request.file_path.read_bytes())
        if request.detected_mime_type.lower().startswith(TEXT_HTML):
            parser = _HtmlText()
            parser.feed(text)
            text = "".join(parser.parts)
        return CoreMediaPreprocessingResult.success(
            text.strip(), None, request.detected_mime_type
        )


def default_processors() -> list[CoreMediaProcessor]:
    """既定のプロセッサの列を返す。

    Returns
    -------
    list[CoreMediaProcessor]
        移植元 CoreMediaProcessorRegistry#defaults と同じ順序
        （PDF・Word・PowerPoint・Excel・画像・テキスト）のプロセッサ。
    """
    return [
        PdfCoreMediaProcessor(),
        WordCoreMediaProcessor(),
        PowerPointCoreMediaProcessor(),
        ExcelCoreMediaProcessor(),
        ImageCoreMediaProcessor(),
        TextCoreMediaProcessor(),
    ]


def _classify_io(error: OSError) -> str:
    """IO エラーのメッセージから失敗のコードを選ぶ。

    Parameters
    ----------
    error : OSError
        IO エラー。

    Returns
    -------
    str
        失敗のコード。
    """
    message = str(error).lower()
    if "encrypt" in message:
        return ENCRYPTED_PDF
    if "render" in message:
        return RENDERING_FAILURE
    if "image" in message:
        return IMAGE_EXTRACTION_FAILURE
    if "corrupt" in message or "invalid" in message or "not a pdf" in message:
        return CORRUPT_FILE
    return PARSER_FAILURE


def _failure(code: str, summary: str) -> CoreMediaPreprocessingResult:
    """失敗の結果を作る。

    Parameters
    ----------
    code : str
        失敗のコード。
    summary : str
        失敗の要約。

    Returns
    -------
    CoreMediaPreprocessingResult
        失敗の結果。
    """
    return CoreMediaPreprocessingResult.from_failure(
        CoreMediaPreprocessingFailure.of(code, summary)
    )


class CoreMediaPreprocessingRuntime:
    """前処理を実行する。"""

    def __init__(self, processors: Sequence[CoreMediaProcessor] | None = None) -> None:
        """実行環境を作る。

        Parameters
        ----------
        processors : Sequence[CoreMediaProcessor] | None
            プロセッサの列。省略すると既定のもの。
        """
        self._processors = (
            list(processors) if processors is not None else (default_processors())
        )

    def preprocess(
        self, request: CoreMediaPreprocessingRequest
    ) -> CoreMediaPreprocessingResult:
        """ファイルを判定して前処理する。例外は失敗の結果にする。

        Parameters
        ----------
        request : CoreMediaPreprocessingRequest
            前処理のリクエスト。

        Returns
        -------
        CoreMediaPreprocessingResult
            前処理の結果。
        """
        try:
            if not request.file_path.exists():
                return _failure(
                    CORRUPT_FILE, f"Media file does not exist: {request.source_name}"
                )
            if request.file_path.stat().st_size == 0:
                return _failure(
                    EMPTY_FILE, f"Media file is empty: {request.source_name}"
                )
            detected = request.with_detected_mime_type(
                detect_mime_type(request.file_path)
            )
            processor = next(
                (p for p in self._processors if p.supports(detected)), None
            )
            if processor is None:
                raise CoreMediaPreprocessingError(
                    CoreMediaPreprocessingFailure.of(
                        UNSUPPORTED_MIME,
                        f"Unsupported media type: {detected.detected_mime_type}",
                    )
                )
            logger.info(
                "media preprocessing: source=%s, mime=%s, processor=%s, mode=%s",
                detected.source_name,
                detected.detected_mime_type,
                type(processor).__name__,
                detected.mode,
            )
            return self._validate(processor.process(detected), detected)
        except CoreMediaPreprocessingError as e:
            return CoreMediaPreprocessingResult.from_failure(e.failure)
        except OSError as e:
            return _failure(_classify_io(e), str(e))
        except Exception as e:  # noqa: BLE001 — 移植元と同じく失敗の結果にして返す
            return _failure(PARSER_FAILURE, str(e) or type(e).__name__)

    @staticmethod
    def _validate(
        result: CoreMediaPreprocessingResult, request: CoreMediaPreprocessingRequest
    ) -> CoreMediaPreprocessingResult:
        """結果が空でないことを確かめる。

        Parameters
        ----------
        result : CoreMediaPreprocessingResult
            プロセッサの結果。
        request : CoreMediaPreprocessingRequest
            前処理のリクエスト。

        Returns
        -------
        CoreMediaPreprocessingResult
            検証済みの結果。中身がなければ失敗の結果。
        """
        if result.failure is not None:
            return result
        if (
            result.attachment is None
            and not result.text.strip()
            and not result.image_explanations
        ):
            return _failure(
                PARSER_FAILURE,
                f"Media preprocessing produced no content: {request.source_name}",
            )
        return result
