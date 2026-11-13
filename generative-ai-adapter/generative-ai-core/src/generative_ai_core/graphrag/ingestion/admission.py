"""取り込みの受け入れ判定と決定的な抽出（移植元 IngestionAdmissionGate・IngestionDeterministicExtractor）。"""

import re

from generative_ai_core.graphrag.ingestion.candidates import (
    IngestionEdgeCandidate,
    IngestionEntityCandidate,
    IngestionIdentifier,
    normalize_identifier,
    stable_id,
)
from generative_ai_core.graphrag.ingestion.extraction import IngestionExtraction
from generative_ai_core.graphrag.ingestion.request import IngestionRequest
from generative_ai_core.graphrag.ingestion.result import IngestionAdmissionDecision

TENANT_WIDE_ACL_MODE = "tenant_wide"
REQUIRED_CLASSIFICATION_RANK = 1

# 移植元は Map.of（順序は未定義）だが、結果の並びを固定するため宣言順にする
_IDENTIFIER_PATTERNS: dict[str, re.Pattern[str]] = {
    "DOC": re.compile(r"\bDOC-[0-9]{4}-[0-9]{4}\b"),
    "POLICY": re.compile(r"\bPOLICY-[A-Z0-9]+-[0-9]+\b"),
    "TICKET": re.compile(r"\bTICKET-[0-9]+\b"),
}
_ENTITY_MARKER = re.compile(r"\[\[ENTITY:([A-Za-z0-9_-]+):([A-Za-z0-9_-]+)\]\]")
_EDGE_MARKER = re.compile(
    r"\[\[EDGE:([A-Za-z0-9_-]+)->([A-Za-z0-9_-]+):([A-Za-z0-9_-]+)\]\]"
)


def _is_blank(value: str | None) -> bool:
    """None または空白だけか。

    Parameters
    ----------
    value : str | None
        文字列。

    Returns
    -------
    bool
        空なら True。
    """
    return value is None or not value.strip()


class IngestionAdmissionGate:
    """取り込みを受け入れてよいかを判定する（テナント全体公開・分類ランク 1 のみ）。"""

    def decide(self, request: IngestionRequest | None) -> IngestionAdmissionDecision:
        """要求を判定する。

        Parameters
        ----------
        request : IngestionRequest | None
            取り込みの要求。

        Returns
        -------
        IngestionAdmissionDecision
            受け入れ、または拒否コード付きの拒否。
        """
        if request is None:
            return IngestionAdmissionDecision.reject("REQUEST_MISSING")
        if _is_blank(request.tenant_id):
            return IngestionAdmissionDecision.reject("TENANT_MISSING")
        if _is_blank(request.source_ref):
            return IngestionAdmissionDecision.reject("MISSING_SOURCE_REF")
        if _is_blank(request.normalized_body):
            return IngestionAdmissionDecision.reject("BODY_MISSING")
        if not request.has_acl_context():
            return IngestionAdmissionDecision.reject("ACL_CONTEXT_MISSING")
        if request.acl_revision < 1:
            return IngestionAdmissionDecision.reject("ACL_STALE")
        if request.classification_rank < REQUIRED_CLASSIFICATION_RANK:
            return IngestionAdmissionDecision.reject("CLASSIFICATION_AMBIGUOUS")
        if request.classification_rank > REQUIRED_CLASSIFICATION_RANK:
            return IngestionAdmissionDecision.reject("CLASSIFICATION_TOO_HIGH")
        if request.acl_mode != TENANT_WIDE_ACL_MODE:
            return IngestionAdmissionDecision.reject("ACL_NOT_TENANT_WIDE")
        if request.acl_principals:
            return IngestionAdmissionDecision.reject("ACL_PRINCIPAL_NOT_EMPTY")
        return IngestionAdmissionDecision.accept()


class IngestionDeterministicExtractor:
    """本文のマーカー（`[[ENTITY:…]]`・`[[EDGE:…]]`）と識別子から決定的に候補を抽出する。"""

    def extract(self, body: str | None) -> IngestionExtraction:
        """本文から候補を抽出する。

        Parameters
        ----------
        body : str | None
            本文。

        Returns
        -------
        IngestionExtraction
            識別子・エンティティ・エッジの候補。
        """
        safe_body = body or ""
        identifiers = self._identifiers(safe_body)
        entities = self._entities(safe_body)
        edges = self._edges(safe_body, entities)
        return IngestionExtraction(
            tuple(identifiers), tuple(entities.values()), tuple(edges)
        )

    def _identifiers(self, body: str) -> list[IngestionIdentifier]:
        """本文から識別子を抽出する（種類と値で重複を除く）。

        Parameters
        ----------
        body : str
            本文。

        Returns
        -------
        list[IngestionIdentifier]
            識別子の一覧。
        """
        result: dict[str, IngestionIdentifier] = {}
        for identifier_type, pattern in _IDENTIFIER_PATTERNS.items():
            for match in pattern.finditer(body):
                normalized = normalize_identifier(match.group())
                key = f"{identifier_type}:{normalized}"
                result.setdefault(
                    key,
                    IngestionIdentifier(
                        identifier_type, normalized, stable_id("identifier", key)
                    ),
                )
        return list(result.values())

    def _entities(self, body: str) -> dict[str, IngestionEntityCandidate]:
        """本文からエンティティのマーカーを抽出する（ラベルで重複を除く）。

        Parameters
        ----------
        body : str
            本文。

        Returns
        -------
        dict[str, IngestionEntityCandidate]
            ラベル → エンティティ候補。
        """
        result: dict[str, IngestionEntityCandidate] = {}
        for match in _ENTITY_MARKER.finditer(body):
            entity_type = match.group(1)
            label = match.group(2)
            entity_id = stable_id("entity", f"{entity_type}:{label}")
            result.setdefault(
                label,
                IngestionEntityCandidate(
                    match.group(), entity_id, entity_type, stable_id("label", label)
                ),
            )
        return result

    def _edges(
        self, body: str, entities: dict[str, IngestionEntityCandidate]
    ) -> list[IngestionEdgeCandidate]:
        """本文からエッジのマーカーを抽出する（両端のエンティティがあるものだけ）。

        Parameters
        ----------
        body : str
            本文。
        entities : dict[str, IngestionEntityCandidate]
            ラベル → エンティティ候補。

        Returns
        -------
        list[IngestionEdgeCandidate]
            エッジ候補の一覧。
        """
        result: list[IngestionEdgeCandidate] = []
        for match in _EDGE_MARKER.finditer(body):
            source = entities.get(match.group(1))
            target = entities.get(match.group(2))
            if source is None or target is None:
                continue
            edge_type = match.group(3)
            edge_id = stable_id(
                "edge", f"{source.entity_id}:{target.entity_id}:{edge_type}"
            )
            result.append(
                IngestionEdgeCandidate(
                    match.group(),
                    edge_id,
                    source.entity_id,
                    target.entity_id,
                    edge_type,
                )
            )
        return result
