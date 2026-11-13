"""検索結果の出力形式（移植元 RetrievalOutputFormat）。

- `LEGACY_TSV`（出力モード 0）: `"id"` をタブで区切った 1 行（末尾に改行）
- `RAG_CONTEXT_JSON_V1`（出力モード 1）: 生成AIアダプタの列 index 6 が読む RAG Context JSON。
  最大 20 件、本文は 8000 文字まで。接続情報や秘密は含めない
"""

import json
import re
from collections.abc import Mapping
from datetime import UTC, datetime
from enum import Enum
from typing import Any

from generative_ai_core.retrieval.models import CoreRetrievalResult

SCHEMA_VERSION = 1
MAX_CONTEXTS = 20
MAX_CONTENT_CHARS = 8000
MAX_PATH_TEXT_CHARS = 1000
MAX_PATH_ITEMS = 7
MIN_GRAPH_DEPTH = 1
MAX_GRAPH_DEPTH = 3
FALLBACK_CONTENT = "context"
LEXICAL_SIGNAL_KEY = "pgroonga"
_EDGE = re.compile(r"\s*--([A-Za-z0-9_:-]+)\(([^\r\n()]*)\)-->\s*")
_FORBIDDEN_MARKERS = ("RAG_CONTEXT_BEGIN", "RAG_CONTEXT_END")
_ROLE_MARKERS = ("system:", "developer:", "assistant:")
_UNSAFE_PATH_MARKERS = ("jdbc:", "password", "passwd", "token", "api_key", "apikey")
# Gson は JSON として問題になる行区切り文字をエスケープする
_LINE_SEPARATORS = {" ": "\\u2028", " ": "\\u2029"}


class RetrievalOutputFormat(Enum):
    """検索結果の出力形式。"""

    LEGACY_TSV = "LEGACY_TSV"
    RAG_CONTEXT_JSON_V1 = "RAG_CONTEXT_JSON_V1"

    @classmethod
    def from_out_mode(cls, out_mode: int) -> "RetrievalOutputFormat":
        """出力モードから形式を決める。

        Parameters
        ----------
        out_mode : int
            出力モード（0=LEGACY_TSV、1=RAG_CONTEXT_JSON_V1）。

        Returns
        -------
        RetrievalOutputFormat
            出力形式。

        Raises
        ------
        ValueError
            0・1 以外のとき。
        """
        if out_mode == 0:
            return cls.LEGACY_TSV
        if out_mode == 1:
            return cls.RAG_CONTEXT_JSON_V1
        raise ValueError("Unsupported retrieval output mode.")

    def render(self, result: CoreRetrievalResult) -> str:
        """検索結果をこの形式の文字列にする。

        Parameters
        ----------
        result : CoreRetrievalResult
            検索結果。

        Returns
        -------
        str
            出力する文字列。
        """
        if self is RetrievalOutputFormat.LEGACY_TSV:
            return result.to_quoted_tab_separated_ids()
        return _to_json(_to_payload(result))


def _to_json(payload: Mapping[str, Any]) -> str:
    """Gson（HTML エスケープなし）と同じ形の JSON 文字列にする。

    Parameters
    ----------
    payload : Mapping[str, Any]
        JSON にする値。

    Returns
    -------
    str
        空白なしの JSON。
    """
    text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    for char, escaped in _LINE_SEPARATORS.items():
        text = text.replace(char, escaped)
    return text


def _now() -> str:
    """UTC の現在時刻を ISO 8601（Java の OffsetDateTime.toString 相当）で返す。

    Returns
    -------
    str
        `2026-01-02T03:04:05.123456Z` の形。
    """
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def _to_payload(result: CoreRetrievalResult) -> dict[str, Any]:
    """検索結果を RAG Context JSON の本体にする。

    Parameters
    ----------
    result : CoreRetrievalResult
        検索結果。

    Returns
    -------
    dict[str, Any]
        JSON の本体（最大 20 件のコンテキスト）。
    """
    evidence = result.evidence
    contexts: list[dict[str, Any]] = []
    for identifier in result.visible_ordered_ids():
        context = _context(identifier, result.graph_expanded, evidence)
        if context is not None:
            contexts.append(context)
        if len(contexts) == MAX_CONTEXTS:
            break
    return {
        "schemaVersion": SCHEMA_VERSION,
        "generatedAt": _now(),
        "contexts": contexts,
    }


def _context(
    identifier: str, graph_expanded: bool, evidence: Mapping[str, str]
) -> dict[str, Any] | None:
    """1 件分のコンテキストを作る。

    Parameters
    ----------
    identifier : str
        チャンク ID。
    graph_expanded : bool
        Graph で広げた結果か。
    evidence : Mapping[str, str]
        証拠。

    Returns
    -------
    dict[str, Any] | None
        コンテキスト。Graph だけで見つかり根拠のパスが不正なものは None。
    """
    content = _trim(
        _first(evidence, f"content.{identifier}"), identifier, MAX_CONTENT_CHARS
    )
    graph_evidence = _graph_evidence(evidence, identifier) if graph_expanded else None
    if (
        graph_expanded
        and graph_evidence is None
        and evidence.get(f"graphOnly.{identifier}", "").lower() == "true"
    ):
        return None
    signals = {
        "vector": True,
        LEXICAL_SIGNAL_KEY: _bool(
            evidence, f"signal.{LEXICAL_SIGNAL_KEY}.{identifier}"
        ),
        "graph": graph_evidence is not None,
    }
    source_file_path = _first(evidence, f"sourceFilePath.{identifier}")
    if not _safe_source_file_path(source_file_path):
        source_file_path = None
    context: dict[str, Any] = {}
    if source_file_path is not None:
        context["sourceFilePath"] = source_file_path
    context["sourceRef"] = _first(evidence, f"sourceRef.{identifier}", identifier)
    context["chunkId"] = identifier
    context["content"] = content
    context["score"] = _score(evidence, identifier)
    context["retrievalSignals"] = signals
    if graph_evidence is not None:
        context["graphEvidence"] = [graph_evidence]
    return context


def _graph_evidence(
    evidence: Mapping[str, str], identifier: str
) -> dict[str, Any] | None:
    """Graph の根拠（パスの文字列と深さ）を検証して JSON の形にする。

    Parameters
    ----------
    evidence : Mapping[str, str]
        証拠。
    identifier : str
        チャンク ID。

    Returns
    -------
    dict[str, Any] | None
        根拠。種類が `graph_path` でない・パスが不正・深さが合わなければ None。
    """
    reason_type = _first(
        evidence, f"graphEvidence.reasonType.{identifier}", "graph_path"
    )
    path_text = evidence.get(f"graphEvidence.pathText.{identifier}")
    if (
        reason_type != "graph_path"
        or path_text is None
        or not path_text.strip()
        or not _safe_data(path_text)
    ):
        return None
    graph_path = _graph_path(path_text)
    depth = _integer(evidence, f"graphEvidence.graphDepth.{identifier}")
    if (
        graph_path is None
        or depth != graph_path[0]
        or depth < MIN_GRAPH_DEPTH
        or depth > MAX_GRAPH_DEPTH
    ):
        return None
    return {
        "reasonType": reason_type,
        "pathText": _trim(path_text, "", MAX_PATH_TEXT_CHARS),
        "graphDepth": depth,
        "path": graph_path[1],
    }


def _graph_path(path_text: str) -> tuple[int, list[dict[str, str]]] | None:
    """`A --型(ラベル)--> B` の連なりを深さとパス（ノードとエッジの交互）に分ける。

    Parameters
    ----------
    path_text : str
        パスの文字列。

    Returns
    -------
    tuple[int, list[dict[str, str]]] | None
        (深さ, パス)。ノード・エッジが空や不正、深さが 3 を超える・パスが 7 要素を超える
        なら None。
    """
    path: list[dict[str, str]] = []
    position = 0
    depth = 0
    for match in _EDGE.finditer(path_text):
        node_label = path_text[position : match.start()].strip()
        edge_type = match.group(1).strip()
        edge_label = match.group(2).strip()
        if (
            not node_label
            or not edge_type
            or not edge_label
            or not _safe_data(node_label)
            or not _safe_data(edge_type)
            or not _safe_data(edge_label)
        ):
            return None
        if depth == 0:
            path.append({"nodeType": "Document", "label": node_label})
        path.append({"edgeType": edge_type, "edgeLabel": edge_label})
        position = match.end()
        depth += 1
    tail_label = path_text[position:].strip()
    if (
        depth == 0
        or depth > MAX_GRAPH_DEPTH
        or not tail_label
        or not _safe_data(tail_label)
    ):
        return None
    path.append({"nodeType": "Document", "label": tail_label})
    return None if len(path) > MAX_PATH_ITEMS else (depth, path)


def _safe_data(value: str) -> bool:
    """データとして出してよい文字列かを返す。

    Parameters
    ----------
    value : str
        文字列。

    Returns
    -------
    bool
        制御文字・コンテキストの境界語・ロール語を含まなければ True。
    """
    lower = value.lower()
    return (
        all(ord(ch) >= 0x20 for ch in value)
        and not any(marker in value for marker in _FORBIDDEN_MARKERS)
        and not any(marker in lower for marker in _ROLE_MARKERS)
    )


def _safe_source_file_path(value: str | None) -> bool:
    """元ファイルのパスとして出してよいかを返す。

    Parameters
    ----------
    value : str | None
        パス。

    Returns
    -------
    bool
        データとして安全で、URL・JDBC・秘密らしい語を含まなければ True。
    """
    if value is None or not value.strip() or not _safe_data(value):
        return False
    lower = value.lower()
    return not (
        lower.startswith(("http://", "https://"))
        or any(marker in lower for marker in _UNSAFE_PATH_MARKERS)
    )


def _first(
    evidence: Mapping[str, str], key: str, fallback: str | None = None
) -> str | None:
    """証拠の値を返す（なければ・空白だけなら代わりの値）。

    Parameters
    ----------
    evidence : Mapping[str, str]
        証拠。
    key : str
        キー。
    fallback : str | None
        代わりの値。

    Returns
    -------
    str | None
        値。
    """
    value = evidence.get(key)
    return fallback if value is None or not value.strip() else value


def _trim(value: str | None, fallback: str, max_length: int) -> str:
    """値（なければ代わりの値、それも空なら `context`）を上限の長さまでにする。

    Parameters
    ----------
    value : str | None
        値。
    fallback : str
        代わりの値。
    max_length : int
        最大の長さ。

    Returns
    -------
    str
        切り詰めた値。
    """
    normalized = fallback if value is None or not value.strip() else value
    if not normalized.strip():
        normalized = FALLBACK_CONTENT
    return normalized[:max_length]


def _bool(evidence: Mapping[str, str], key: str) -> bool:
    """証拠の値が `true`（大文字小文字は無視）かを返す。

    Parameters
    ----------
    evidence : Mapping[str, str]
        証拠。
    key : str
        キー。

    Returns
    -------
    bool
        `true` なら True。
    """
    return evidence.get(key, "").lower() == "true"


def _score(evidence: Mapping[str, str], identifier: str) -> float:
    """スコアを読む（なければ・読めなければ 1.0）。

    Parameters
    ----------
    evidence : Mapping[str, str]
        証拠。
    identifier : str
        チャンク ID。

    Returns
    -------
    float
        スコア。
    """
    try:
        return float(_first(evidence, f"score.{identifier}", "1.0") or "1.0")
    except ValueError:
        return 1.0


def _integer(evidence: Mapping[str, str], key: str) -> int:
    """整数を読む（なければ・読めなければ -1）。

    Parameters
    ----------
    evidence : Mapping[str, str]
        証拠。
    key : str
        キー。

    Returns
    -------
    int
        整数。
    """
    try:
        return int(_first(evidence, key, "-1") or "-1")
    except ValueError:
        return -1
