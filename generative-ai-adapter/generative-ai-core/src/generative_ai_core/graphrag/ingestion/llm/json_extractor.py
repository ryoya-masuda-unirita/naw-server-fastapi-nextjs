"""LLM が返した候補 JSON を検証して候補にする（移植元 LlmJsonCandidateExtractor）。

LLM の出力は信用せず、候補のまま（`candidate`・`llm_suggested`）・同じチャンクの根拠付き・
安全な ID だけを受け入れる。違反は `LlmCandidateOutputException` で拒否する。
"""

import json
import re
from dataclasses import dataclass
from typing import Any, NoReturn

from generative_ai_core.failure import sanitize
from generative_ai_core.graphrag.ingestion.candidates import (
    IngestionEdgeCandidate,
    IngestionEntityCandidate,
)
from generative_ai_core.graphrag.ingestion.llm.models import (
    STATUS_CANDIDATE,
    TRUST_LLM_SUGGESTED,
    LlmCandidateExtraction,
    LlmCandidateOrigin,
    LlmCandidateOutputException,
)
from generative_ai_core.graphrag.ingestion.llm.request import (
    LlmCandidateExtractionRequest,
    LlmCandidateOutputProvider,
)

FAILURE_CODE = "LLM_CANDIDATE_OUTPUT_REJECTED"
UNREADABLE_FAILURE_CODE = "LLM_CANDIDATE_OUTPUT_UNREADABLE"
MAX_CANDIDATES = 100
MAX_REPAIR_VALUE_LENGTH = 128

_SAFE_ID = re.compile(r"[A-Za-z0-9._:-]{1,128}")
_SAFE_TYPE = re.compile(r"[A-Z][A-Z0-9_]{0,63}")
_UNSAFE_VALUE = re.compile(
    r"(?i)(https?://|jdbc:|Bearer\s+|(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]+|password\s*[=:]|"
    r"api[_-]?key\s*[=:]|BEGIN PRIVATE KEY|customer[-_\s]?data|"
    r"production[-_\s]?data|private[-_\s]?(identifier|id|data)|"
    r"cross[-_\s]?tenant)"
)
_UNSAFE_REPAIR_VALUE = re.compile(
    r"(?i)([A-Za-z]:\\|/(mnt|home|users|var|tmp|workspace)/|"
    r"\b\w+(Exception|Error)\b|\bat\s+[\w.$]+\(|"
    r"raw[-_\s]?prompt|raw[-_\s]?provider|raw[-_\s]?response|"
    r"provider[-_\s]?response|"
    r"document[-_\s]?chunk|"
    r"chunk[-_\s]?text|document[-_\s]?text)"
)
_FORBIDDEN_KEY_TOKENS = (
    "prompt",
    "completion",
    "apimetadata",
    "providermetadata",
    "providerrequest",
    "providerresponse",
    "request",
    "response",
    "credential",
    "secret",
    "embedding",
    "apikey",
    "internalurl",
    "privateidentifier",
    "customerdata",
    "productiondata",
    "crosstenant",
    "sourcepath",
    "filepath",
    "absolutepath",
    "chunktext",
    "documenttext",
    "stacktrace",
    "normalizedbody",
    "rawtext",
)
_REPAIR_ROOT_FIELDS = ("extraction_run_id",)
_REPAIR_ENTITY_FIELDS = (
    "candidate_id",
    "entity_type",
    "label_hash",
    "evidence_id",
    "verification_status",
    "trust_level",
    "source_chunk_id",
)
_REPAIR_EDGE_FIELDS = (
    "candidate_id",
    "source_entity_id",
    "target_entity_id",
    "edge_type",
    "evidence_id",
    "verification_status",
    "trust_level",
    "source_chunk_id",
)
_NON_KEY_CHARS = re.compile(r"[^A-Za-z0-9]")


class _MalformedOutput(ValueError):
    """JSON の形が想定と違う（移植元の IllegalStateException に相当）。"""


@dataclass(frozen=True)
class _CandidateFields:
    """候補の共通項目（ID と由来）。"""

    candidate_id: str
    origin: LlmCandidateOrigin


def _reject(message: str) -> NoReturn:
    """候補出力の拒否（LLM_CANDIDATE_OUTPUT_REJECTED）を送出する。

    Parameters
    ----------
    message : str
        拒否の理由。

    Raises
    ------
    LlmCandidateOutputException
        常に送出する。
    """
    raise LlmCandidateOutputException(FAILURE_CODE, sanitize(message))


def _reject_unreadable(message: str) -> NoReturn:
    """読めない出力の拒否（LLM_CANDIDATE_OUTPUT_UNREADABLE）を送出する。

    Parameters
    ----------
    message : str
        拒否の理由。

    Raises
    ------
    LlmCandidateOutputException
        常に送出する。
    """
    raise LlmCandidateOutputException(UNREADABLE_FAILURE_CODE, sanitize(message))


def _as_object(element: Any) -> dict[str, Any]:
    """JSON の値をオブジェクトとして取り出す。

    Parameters
    ----------
    element : Any
        JSON の値。

    Returns
    -------
    dict[str, Any]
        オブジェクト。

    Raises
    ------
    _MalformedOutput
        オブジェクトでないとき。
    """
    if not isinstance(element, dict):
        raise _MalformedOutput("Not a JSON Object")
    return element


def _as_string(element: Any) -> str:
    """JSON のプリミティブ値を文字列にする（Gson の getAsString 相当）。

    Parameters
    ----------
    element : Any
        JSON の値。

    Returns
    -------
    str
        文字列表現。

    Raises
    ------
    _MalformedOutput
        オブジェクト・配列・null のとき。
    """
    if isinstance(element, bool):
        return "true" if element else "false"
    if isinstance(element, str):
        return element
    if isinstance(element, (int, float)):
        return str(element)
    raise _MalformedOutput("Not a JSON primitive")


def _array(root: dict[str, Any], field: str) -> list[Any]:
    """項目を配列として取り出す（なければ空）。

    Parameters
    ----------
    root : dict[str, Any]
        JSON のオブジェクト。
    field : str
        項目名。

    Returns
    -------
    list[Any]
        配列。
    """
    value = root.get(field)
    if value is None:
        return []
    if not isinstance(value, list):
        _reject(f"{field} must be an array")
    return value


def _reject_unsafe_value(value: str | None) -> None:
    """安全でない値（URL・鍵・パスなど）を拒否する。

    Parameters
    ----------
    value : str | None
        検査する値。
    """
    if value is not None and _UNSAFE_VALUE.search(value):
        _reject_unreadable("unsafe LLM candidate output value")
    if value is not None and _UNSAFE_REPAIR_VALUE.search(value):
        _reject("unsafe LLM candidate output value")


def _required_safe(obj: dict[str, Any], field: str) -> str:
    """必須の安全な ID 文字列を取り出す。

    Parameters
    ----------
    obj : dict[str, Any]
        JSON のオブジェクト。
    field : str
        項目名。

    Returns
    -------
    str
        前後の空白を除いた値。
    """
    if obj.get(field) is None:
        _reject(f"missing {field}")
    value = _as_string(obj[field]).strip()
    _reject_unsafe_value(value)
    if not _SAFE_ID.fullmatch(value):
        _reject(f"unsupported {field} value")
    return value


def _required_type(obj: dict[str, Any], field: str) -> str:
    """必須の種類名（大文字とアンダースコア）を取り出す。

    Parameters
    ----------
    obj : dict[str, Any]
        JSON のオブジェクト。
    field : str
        項目名。

    Returns
    -------
    str
        種類名。
    """
    value = _required_safe(obj, field)
    if not _SAFE_TYPE.fullmatch(value):
        _reject(f"unsupported {field} value")
    return value


def _required_evidence(obj: dict[str, Any], candidate_id: str) -> str:
    """必須の根拠 ID を取り出す。

    Parameters
    ----------
    obj : dict[str, Any]
        JSON のオブジェクト。
    candidate_id : str
        候補 ID（拒否メッセージ用）。

    Returns
    -------
    str
        根拠 ID。
    """
    if obj.get("evidence_id") is None:
        _reject(f"missing evidence for candidate {candidate_id}")
    return _required_safe(obj, "evidence_id")


def _normalized_key(key: str) -> str:
    """キー名を英数字の小文字だけにする。

    Parameters
    ----------
    key : str
        キー名。

    Returns
    -------
    str
        正規化したキー名。
    """
    return _NON_KEY_CHARS.sub("", key).lower()


def _reject_forbidden_content(element: Any) -> None:
    """禁止されたキー（プロンプト・秘密など）と安全でない値を再帰的に拒否する。

    Parameters
    ----------
    element : Any
        JSON の値。
    """
    if element is None:
        return
    if isinstance(element, str):
        _reject_unsafe_value(element)
        return
    if isinstance(element, list):
        for child in element:
            _reject_forbidden_content(child)
        return
    if isinstance(element, dict):
        for key, value in element.items():
            normalized = _normalized_key(key)
            if any(token in normalized for token in _FORBIDDEN_KEY_TOKENS):
                _reject_unreadable(f"unsafe LLM candidate output field {key}")
            _reject_forbidden_content(value)


def _sanitize_repair_value(field: str, value: str | None) -> str:
    """修復用 JSON に載せる値を伏せ字にする（危険なら "redacted"）。

    Parameters
    ----------
    field : str
        項目名。
    value : str | None
        値。

    Returns
    -------
    str
        伏せ字にした値。
    """
    sanitized = sanitize(value or "").strip()
    unsupported_type = field in (
        "entity_type",
        "edge_type",
    ) and not _SAFE_TYPE.fullmatch(sanitized)
    if (
        len(sanitized) > MAX_REPAIR_VALUE_LENGTH
        or _UNSAFE_REPAIR_VALUE.search(sanitized)
        or unsupported_type
    ):
        return "redacted"
    return sanitized


def _copy_allowed_string(
    source: dict[str, Any], target: dict[str, Any], field: str
) -> None:
    """許可した項目の文字列だけを、伏せ字にして写す。

    Parameters
    ----------
    source : dict[str, Any]
        写し元。
    target : dict[str, Any]
        写し先。
    field : str
        項目名。
    """
    value = source.get(field)
    if value is None or isinstance(value, (dict, list)):
        return
    target[field] = _sanitize_repair_value(field, _as_string(value))


def _sanitized_candidate_array(
    source: Any, allowed_fields: tuple[str, ...]
) -> list[dict[str, Any]]:
    """候補の配列から、許可した項目だけを伏せ字にして写す。

    Parameters
    ----------
    source : Any
        JSON の値（配列、または 1 件のオブジェクト）。
    allowed_fields : tuple[str, ...]
        写してよい項目名。

    Returns
    -------
    list[dict[str, Any]]
        整えた候補の一覧。
    """
    if isinstance(source, dict):
        items: list[Any] = [source]
    elif isinstance(source, list):
        items = source
    else:
        return []
    sanitized: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        candidate: dict[str, Any] = {}
        for field in allowed_fields:
            _copy_allowed_string(item, candidate, field)
        sanitized.append(candidate)
    return sanitized


def sanitized_repair_candidate_json(root: dict[str, Any]) -> str:
    """修復の入力に使う候補 JSON を、許可した項目だけ・伏せ字にして作る。

    Parameters
    ----------
    root : dict[str, Any]
        拒否された出力の JSON オブジェクト。

    Returns
    -------
    str
        整えた JSON 文字列（空白なし）。
    """
    sanitized: dict[str, Any] = {}
    for field in _REPAIR_ROOT_FIELDS:
        _copy_allowed_string(root, sanitized, field)
    sanitized["entities"] = _sanitized_candidate_array(
        root.get("entities"), _REPAIR_ENTITY_FIELDS
    )
    sanitized["edges"] = _sanitized_candidate_array(
        root.get("edges"), _REPAIR_EDGE_FIELDS
    )
    return json.dumps(sanitized, ensure_ascii=False, separators=(",", ":"))


class LlmJsonCandidateExtractor:
    """LLM に候補 JSON を出させ、検証して `LlmCandidateExtraction` にする抽出器。"""

    def __init__(self, provider: LlmCandidateOutputProvider) -> None:
        """LLM を呼ぶ関数を受け取る。

        Parameters
        ----------
        provider : LlmCandidateOutputProvider
            要求から候補 JSON の文字列を作る関数。
        """
        self._provider = provider

    def __call__(
        self, request: LlmCandidateExtractionRequest
    ) -> LlmCandidateExtraction:
        """`extract` を呼ぶ（抽出器を関数として渡せるようにする）。

        Parameters
        ----------
        request : LlmCandidateExtractionRequest
            抽出の要求。

        Returns
        -------
        LlmCandidateExtraction
            検証済みの候補。
        """
        return self.extract(request)

    def extract(self, request: LlmCandidateExtractionRequest) -> LlmCandidateExtraction:
        """LLM の出力を検証して候補にする。

        Parameters
        ----------
        request : LlmCandidateExtractionRequest
            抽出の要求。

        Returns
        -------
        LlmCandidateExtraction
            検証済みの候補。

        Raises
        ------
        LlmCandidateOutputException
            出力が空・読めない・安全でない・規則に違反しているとき。
            初回の違反では、修復用の候補 JSON を添える。
        """
        output = self._provider(request)
        if output is None or not output.strip():
            _reject_unreadable("malformed LLM candidate output: empty output")
        try:
            root = _as_object(json.loads(output))
            try:
                _reject_forbidden_content(root)
                return self._parse(root, request)
            except LlmCandidateOutputException as e:
                if not request.repair_attempt():
                    raise LlmCandidateOutputException(
                        e.failure_code, str(e), sanitized_repair_candidate_json(root)
                    ) from e
                raise
        except ValueError as e:
            _reject_unreadable(f"malformed LLM candidate output: {e}")
            raise

    def _parse(
        self, root: dict[str, Any], request: LlmCandidateExtractionRequest
    ) -> LlmCandidateExtraction:
        """JSON を検証して候補にする。

        Parameters
        ----------
        root : dict[str, Any]
            出力の JSON オブジェクト。
        request : LlmCandidateExtractionRequest
            抽出の要求。

        Returns
        -------
        LlmCandidateExtraction
            検証済みの候補。
        """
        self._validate_repair_bounds(root, request)
        run_id = _required_safe(root, "extraction_run_id")
        entities: list[IngestionEntityCandidate] = []
        edges: list[IngestionEdgeCandidate] = []
        origins: list[LlmCandidateOrigin] = []
        candidate_ids: set[str] = set()
        known_entities = {
            entity.entity_id for entity in request.deterministic_extraction.entities
        }
        for element in _array(root, "entities"):
            entity = _as_object(element)
            fields = self._fields(
                entity, "entity", run_id, request.source_chunk_id, candidate_ids
            )
            entity_type = _required_type(entity, "entity_type")
            label_hash = _required_safe(entity, "label_hash")
            entities.append(
                IngestionEntityCandidate(
                    f"llm:{fields.candidate_id}",
                    fields.candidate_id,
                    entity_type,
                    label_hash,
                )
            )
            known_entities.add(fields.candidate_id)
            origins.append(fields.origin)
        for element in _array(root, "edges"):
            edge = _as_object(element)
            fields = self._fields(
                edge, "edge", run_id, request.source_chunk_id, candidate_ids
            )
            source = _required_safe(edge, "source_entity_id")
            target = _required_safe(edge, "target_entity_id")
            edge_type = _required_type(edge, "edge_type")
            if source == target:
                _reject(
                    f"self-loop edge is not allowed for candidate {fields.candidate_id}"
                )
            if source not in known_entities or target not in known_entities:
                _reject(
                    f"edge candidate {fields.candidate_id} references missing entity"
                )
            edges.append(
                IngestionEdgeCandidate(
                    f"llm:{fields.candidate_id}",
                    fields.candidate_id,
                    source,
                    target,
                    edge_type,
                )
            )
            origins.append(fields.origin)
        if len(origins) > MAX_CANDIDATES:
            _reject(f"over-limit LLM candidate output: {len(origins)}")
        return LlmCandidateExtraction(tuple(entities), tuple(edges), tuple(origins))

    def _validate_repair_bounds(
        self, repair_output: dict[str, Any], request: LlmCandidateExtractionRequest
    ) -> None:
        """修復の出力が、元の候補を増やしていないことを検査する。

        Parameters
        ----------
        repair_output : dict[str, Any]
            修復の出力 JSON。
        request : LlmCandidateExtractionRequest
            抽出の要求（修復でなければ何もしない）。
        """
        if not request.repair_attempt() or request.repair_context is None:
            return
        try:
            original = _as_object(
                json.loads(request.repair_context.candidate_json_body)
            )
        except ValueError:
            _reject("repair input candidate JSON is not readable")
            return
        if len(_array(repair_output, "entities")) > len(_array(original, "entities")):
            _reject("repair output adds entity candidates")
        if len(_array(repair_output, "edges")) > len(_array(original, "edges")):
            _reject("repair output adds edge candidates")
        self._reject_absent_ids(
            "entity",
            self._candidate_ids(original, "entities"),
            self._candidate_ids(repair_output, "entities"),
        )
        self._reject_absent_ids(
            "edge",
            self._candidate_ids(original, "edges"),
            self._candidate_ids(repair_output, "edges"),
        )
        original_evidence = self._evidence_ids(original)
        for evidence_id in self._evidence_ids(repair_output):
            if evidence_id not in original_evidence:
                _reject(f"repair output adds evidence candidate {evidence_id}")

    def _reject_absent_ids(
        self, kind: str, original_ids: set[str], repair_ids: set[str]
    ) -> None:
        """修復の出力に、元になかった候補 ID があれば拒否する。

        Parameters
        ----------
        kind : str
            候補の種類（entity・edge）。
        original_ids : set[str]
            元の候補 ID。
        repair_ids : set[str]
            修復の出力の候補 ID。
        """
        for candidate_id in repair_ids:
            if candidate_id not in original_ids:
                _reject(f"repair output adds {kind} candidate {candidate_id}")

    def _candidate_ids(self, root: dict[str, Any], array_field: str) -> set[str]:
        """配列の候補 ID を集める。

        Parameters
        ----------
        root : dict[str, Any]
            JSON のオブジェクト。
        array_field : str
            配列の項目名。

        Returns
        -------
        set[str]
            候補 ID の集合。
        """
        return {
            _required_safe(element, "candidate_id")
            for element in _array(root, array_field)
            if isinstance(element, dict)
        }

    def _evidence_ids(self, root: dict[str, Any]) -> set[str]:
        """エンティティ・エッジの根拠 ID を集める。

        Parameters
        ----------
        root : dict[str, Any]
            JSON のオブジェクト。

        Returns
        -------
        set[str]
            根拠 ID の集合。
        """
        ids: set[str] = set()
        for field in ("entities", "edges"):
            for element in _array(root, field):
                if isinstance(element, dict) and element.get("evidence_id") is not None:
                    ids.add(_as_string(element["evidence_id"]).strip())
        return ids

    def _fields(
        self,
        obj: dict[str, Any],
        kind: str,
        run_id: str,
        expected_source_chunk_id: str,
        candidate_ids: set[str],
    ) -> _CandidateFields:
        """候補の共通項目（ID・チャンク・根拠・状態）を検証して由来を作る。

        Parameters
        ----------
        obj : dict[str, Any]
            候補の JSON オブジェクト。
        kind : str
            候補の種類（entity・edge）。
        run_id : str
            抽出の実行 ID。
        expected_source_chunk_id : str
            期待する取り込み元チャンク ID。
        candidate_ids : set[str]
            ここまでの候補 ID（重複検査用。追加される）。

        Returns
        -------
        _CandidateFields
            候補 ID と由来。
        """
        candidate_id = _required_safe(obj, "candidate_id")
        if candidate_id in candidate_ids:
            _reject(f"duplicate candidate id {candidate_id}")
        candidate_ids.add(candidate_id)
        source_chunk_id = _required_safe(obj, "source_chunk_id")
        if expected_source_chunk_id != source_chunk_id:
            _reject(f"cross-chunk LLM candidate evidence for {candidate_id}")
        evidence_id = _required_evidence(obj, candidate_id)
        verification_status = _required_safe(obj, "verification_status")
        trust_level = _required_safe(obj, "trust_level")
        if verification_status != STATUS_CANDIDATE:
            _reject(f"LLM suggestion must remain candidate for {candidate_id}")
        if trust_level != TRUST_LLM_SUGGESTED:
            _reject(f"LLM suggestion must remain llm_suggested for {candidate_id}")
        origin = LlmCandidateOrigin(
            kind,
            candidate_id,
            source_chunk_id,
            run_id,
            verification_status,
            trust_level,
            evidence_id,
        )
        return _CandidateFields(candidate_id, origin)
