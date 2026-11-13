"""決定的な抽出で得る識別子・エンティティ・エッジの候補（移植元の各 record）。"""

import hashlib
from dataclasses import dataclass

STABLE_ID_HEX_LENGTH = 24


@dataclass(frozen=True)
class IngestionIdentifier:
    """文書から抽出した識別子（DOC・POLICY・TICKET）。"""

    identifier_type: str
    identifier_value_norm: str
    identifier_hash: str


@dataclass(frozen=True)
class IngestionEntityCandidate:
    """エンティティの候補。"""

    marker: str
    entity_id: str
    entity_type: str
    label_hash: str


@dataclass(frozen=True)
class IngestionEdgeCandidate:
    """エッジの候補。"""

    marker: str
    edge_id: str
    source_entity_id: str
    target_entity_id: str
    edge_type: str


def normalize_identifier(value: str | None) -> str:
    """識別子を比較用に正規化する（前後の空白を除き大文字にする）。

    Parameters
    ----------
    value : str | None
        識別子。

    Returns
    -------
    str
        正規化した識別子。None は空文字。
    """
    if value is None:
        return ""
    return value.strip().upper()


def stable_id(prefix: str, value: str | None) -> str:
    """値から決まる ID を作る（`prefix-` + SHA-256 の先頭 24 桁）。

    Parameters
    ----------
    prefix : str
        ID の接頭辞。
    value : str | None
        元の値。None は空文字として扱う。

    Returns
    -------
    str
        安定した ID。
    """
    digest = hashlib.sha256((value or "").encode("utf-8")).hexdigest()
    return f"{prefix}-{digest[:STABLE_ID_HEX_LENGTH]}"
