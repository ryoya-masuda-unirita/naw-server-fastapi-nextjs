"""LLM 候補抽出の要求・抽出器・出力プロバイダー（移植元の対応する型）。"""

from collections.abc import Callable
from dataclasses import dataclass
from typing import TYPE_CHECKING

from generative_ai_core.graphrag.ingestion.llm.models import (
    LlmCandidateExtraction,
    LlmCandidateRepairContext,
)
from generative_ai_core.graphrag.ingestion.request import IngestionRequest

if TYPE_CHECKING:
    # extraction → llm.models → (この llm パッケージ) の循環を避けるため、型検査のときだけ読む
    from generative_ai_core.graphrag.ingestion.extraction import IngestionExtraction


@dataclass(frozen=True)
class LlmCandidateExtractionRequest:
    """LLM 候補抽出の要求。`repair_context` があれば修復（やり直し）の呼び出し。"""

    ingestion_request: IngestionRequest
    deterministic_extraction: "IngestionExtraction"
    source_chunk_id: str
    repair_context: LlmCandidateRepairContext | None = None

    def __post_init__(self) -> None:
        """必須項目を検査し、チャンク ID の前後の空白を除く。

        Raises
        ------
        ValueError
            要求・決定的抽出が None、またはチャンク ID が空のとき。
        """
        if self.ingestion_request is None:
            raise ValueError("ingestionRequest")
        if self.deterministic_extraction is None:
            raise ValueError("deterministicExtraction")
        if self.source_chunk_id is None or not self.source_chunk_id.strip():
            raise ValueError("sourceChunkId is required")
        object.__setattr__(self, "source_chunk_id", self.source_chunk_id.strip())

    def repair_attempt(self) -> bool:
        """修復の呼び出しか。

        Returns
        -------
        bool
            修復の文脈があれば True。
        """
        return self.repair_context is not None


LlmCandidateExtractor = Callable[
    [LlmCandidateExtractionRequest], LlmCandidateExtraction
]
"""候補を抽出する関数（移植元 LlmCandidateExtractor）。"""

LlmCandidateOutputProvider = Callable[[LlmCandidateExtractionRequest], str]
"""LLM を呼んで候補 JSON の文字列を返す関数（移植元 LlmCandidateOutputProvider）。"""


def disabled_extractor(
    request: LlmCandidateExtractionRequest,
) -> LlmCandidateExtraction:
    """何も抽出しない抽出器（移植元 LlmCandidateExtractor.disabled()）。

    Parameters
    ----------
    request : LlmCandidateExtractionRequest
        抽出の要求（使わない）。

    Returns
    -------
    LlmCandidateExtraction
        空の結果。
    """
    return LlmCandidateExtraction.empty()
