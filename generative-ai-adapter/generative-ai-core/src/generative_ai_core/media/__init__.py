"""ファイルの前処理（移植元 jp.co.unirita.ai.core.media）。

テキスト・画像（#298）と、PDF・Word・Excel・PowerPoint（#300）を移植している。
再現できない差（PowerPoint のスライド描画など）は processors_office.py の docstring を参照。
"""

from generative_ai_core.media.model import (
    CORRUPT_FILE,
    EMPTY_FILE,
    IMAGE_EXPLANATION_FAILURE,
    PARSER_FAILURE,
    UNSUPPORTED_MIME,
    CoreImageExplanationEntry,
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
from generative_ai_core.media.runtime import (
    CoreMediaPreprocessingRuntime,
    CoreMediaProcessor,
    ImageCoreMediaProcessor,
    TextCoreMediaProcessor,
    detect_mime_type,
)

__all__ = [
    "CORRUPT_FILE",
    "EMPTY_FILE",
    "IMAGE_EXPLANATION_FAILURE",
    "PARSER_FAILURE",
    "UNSUPPORTED_MIME",
    "CoreImageExplanationEntry",
    "CoreMediaPreprocessingError",
    "CoreMediaPreprocessingFailure",
    "CoreMediaPreprocessingMode",
    "CoreMediaPreprocessingRequest",
    "CoreMediaPreprocessingResult",
    "CoreMediaPreprocessingRuntime",
    "CoreMediaProcessor",
    "CoreProcessedImage",
    "ExcelCoreMediaProcessor",
    "ImageCoreMediaProcessor",
    "PdfCoreMediaProcessor",
    "PowerPointCoreMediaProcessor",
    "TextCoreMediaProcessor",
    "WordCoreMediaProcessor",
    "detect_mime_type",
]
