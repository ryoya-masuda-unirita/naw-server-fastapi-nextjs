"""取り込みで得た候補の集まり（移植元 IngestionExtraction）。"""

from dataclasses import dataclass, field

from generative_ai_core.graphrag.ingestion.candidates import (
    IngestionEdgeCandidate,
    IngestionEntityCandidate,
    IngestionIdentifier,
)
from generative_ai_core.graphrag.ingestion.llm.models import (
    LlmCandidateExtraction,
    LlmCandidateOrigin,
)


@dataclass(frozen=True)
class IngestionExtraction:
    """決定的抽出と LLM 候補をまとめた抽出結果。"""

    identifiers: tuple[IngestionIdentifier, ...] = field(default_factory=tuple)
    entities: tuple[IngestionEntityCandidate, ...] = field(default_factory=tuple)
    edges: tuple[IngestionEdgeCandidate, ...] = field(default_factory=tuple)
    llm_candidate_origins: tuple[LlmCandidateOrigin, ...] = field(default_factory=tuple)

    def __post_init__(self) -> None:
        """一覧をタプルに揃える（None は空）。"""
        set_ = object.__setattr__
        set_(self, "identifiers", tuple(self.identifiers or ()))
        set_(self, "entities", tuple(self.entities or ()))
        set_(self, "edges", tuple(self.edges or ()))
        set_(self, "llm_candidate_origins", tuple(self.llm_candidate_origins or ()))

    @classmethod
    def empty(cls) -> "IngestionExtraction":
        """候補のない抽出結果を返す。

        Returns
        -------
        IngestionExtraction
            空の結果。
        """
        return cls()

    def with_llm_candidates(
        self, llm_extraction: LlmCandidateExtraction | None
    ) -> "IngestionExtraction":
        """LLM の候補を末尾に加えた抽出結果を返す。

        Parameters
        ----------
        llm_extraction : LlmCandidateExtraction | None
            LLM の候補。由来がなければ何も加えない。

        Returns
        -------
        IngestionExtraction
            候補を加えた結果（加えるものがなければ自分自身）。
        """
        if llm_extraction is None or not llm_extraction.origins:
            return self
        return IngestionExtraction(
            self.identifiers,
            self.entities + llm_extraction.entities,
            self.edges + llm_extraction.edges,
            self.llm_candidate_origins + llm_extraction.origins,
        )
