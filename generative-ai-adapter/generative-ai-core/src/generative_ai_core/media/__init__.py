"""ファイルの前処理（移植元 jp.co.unirita.ai.core.media）。

移植したのはテキスト・画像だけ。PDF・Word・Excel・PowerPoint の処理（移植元の
Pdf/Word/Excel/PowerPointCoreMediaProcessor）は後続の Issue で移植し、それまでは
UNSUPPORTED_MIME の失敗になる。
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
    "ImageCoreMediaProcessor",
    "TextCoreMediaProcessor",
    "detect_mime_type",
]
