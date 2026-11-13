"""LLM による候補抽出の入出力の型（移植元 ingestion.llm パッケージの record・例外）。"""

from dataclasses import dataclass, field

from generative_ai_core.failure import sanitize
from generative_ai_core.graphrag.ingestion.candidates import (
    IngestionEdgeCandidate,
    IngestionEntityCandidate,
)

STATUS_CANDIDATE = "candidate"
TRUST_LLM_SUGGESTED = "llm_suggested"


def _require_non_blank(value: str | None, name: str) -> str:
    """空でない文字列を要求し、前後の空白を除いて返す。

    Parameters
    ----------
    value : str | None
        値。
    name : str
        エラーメッセージに出す項目名。

    Returns
    -------
    str
        前後の空白を除いた値。

    Raises
    ------
    ValueError
        None または空白だけのとき。
    """
    if value is None or not value.strip():
        raise ValueError(f"{name} is required")
    return value.strip()


@dataclass(frozen=True)
class LlmCandidateOrigin:
    """LLM が提案した候補の由来（候補のまま・LLM 提案として扱う印）。"""

    candidate_kind: str
    candidate_id: str
    source_chunk_id: str
    extraction_run_id: str
    verification_status: str
    trust_level: str
    sanitized_evidence_id: str

    STATUS_CANDIDATE = STATUS_CANDIDATE
    TRUST_LLM_SUGGESTED = TRUST_LLM_SUGGESTED

    def __post_init__(self) -> None:
        """すべての項目を必須にし、前後の空白を除く。"""
        for name in (
            "candidate_kind",
            "candidate_id",
            "source_chunk_id",
            "extraction_run_id",
            "verification_status",
            "trust_level",
            "sanitized_evidence_id",
        ):
            object.__setattr__(
                self, name, _require_non_blank(getattr(self, name), name)
            )


@dataclass(frozen=True)
class LlmCandidateExtractionSettings:
    """LLM による候補抽出を使うかの設定。"""

    active: bool

    @classmethod
    def disabled(cls) -> "LlmCandidateExtractionSettings":
        """無効の設定を返す。

        Returns
        -------
        LlmCandidateExtractionSettings
            無効の設定。
        """
        return cls(False)

    @classmethod
    def enabled(cls) -> "LlmCandidateExtractionSettings":
        """有効の設定を返す。

        Returns
        -------
        LlmCandidateExtractionSettings
            有効の設定。
        """
        return cls(True)

    def is_enabled(self) -> bool:
        """有効か。

        Returns
        -------
        bool
            有効なら True。
        """
        return self.active


@dataclass(frozen=True)
class LlmCandidateExtraction:
    """LLM が提案した候補（エンティティ・エッジ・由来）。"""

    entities: tuple[IngestionEntityCandidate, ...] = field(default_factory=tuple)
    edges: tuple[IngestionEdgeCandidate, ...] = field(default_factory=tuple)
    origins: tuple[LlmCandidateOrigin, ...] = field(default_factory=tuple)

    def __post_init__(self) -> None:
        """一覧をタプルに揃える（None は空）。"""
        set_ = object.__setattr__
        set_(self, "entities", tuple(self.entities or ()))
        set_(self, "edges", tuple(self.edges or ()))
        set_(self, "origins", tuple(self.origins or ()))

    @classmethod
    def empty(cls) -> "LlmCandidateExtraction":
        """候補のない結果を返す。

        Returns
        -------
        LlmCandidateExtraction
            空の結果。
        """
        return cls((), (), ())


@dataclass(frozen=True)
class LlmCandidateRepairContext:
    """修復（やり直し）の入力。拒否された候補 JSON と拒否コード。"""

    candidate_json_body: str
    failure_code: str

    def __post_init__(self) -> None:
        """両項目を必須にし、拒否コードを伏せ字にする。"""
        body = _require_non_blank(self.candidate_json_body, "candidateJsonBody")
        code = sanitize(_require_non_blank(self.failure_code, "failureCode"))
        object.__setattr__(self, "candidate_json_body", body)
        object.__setattr__(self, "failure_code", code)


class LlmCandidateOutputException(RuntimeError):
    """LLM の候補出力が拒否された（移植元 LlmCandidateOutputException）。"""

    def __init__(
        self,
        failure_code: str,
        message: str,
        candidate_json_body: str | None = None,
    ) -> None:
        """拒否コード・メッセージ・修復用の候補 JSON から作る。

        Parameters
        ----------
        failure_code : str
            拒否コード。
        message : str
            メッセージ。
        candidate_json_body : str | None
            修復に使う候補 JSON。伏せ字にし、空なら持たない。
        """
        super().__init__(message)
        self.failure_code = failure_code
        self._candidate_json_body = self._sanitize(candidate_json_body)

    @staticmethod
    def _sanitize(body: str | None) -> str | None:
        """候補 JSON を伏せ字にする。空なら None。

        Parameters
        ----------
        body : str | None
            候補 JSON。

        Returns
        -------
        str | None
            伏せ字にした候補 JSON。
        """
        if body is None or not body.strip():
            return None
        sanitized = sanitize(body).strip()
        return sanitized or None

    def candidate_json_body(self) -> str | None:
        """修復に使う候補 JSON を返す。

        Returns
        -------
        str | None
            候補 JSON。なければ None。
        """
        return self._candidate_json_body
