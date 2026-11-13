"""RAG Context JSON v1 の読み込み（移植元 RagContextJsonInputMapper ほか）。

契約は移植元 `docs/rag-context-json-contract.md`。不正な入力は理由を出さない固定の
失敗にし、旧経路（index 3・5）へ戻さない。各コンテキストは命令として扱われないよう
`RAG_CONTEXT_BEGIN`〜`RAG_CONTEXT_END` の囲み（data-only envelope）にする。
"""

import json
from dataclasses import dataclass
from pathlib import Path, PurePath
from typing import Any

from generative_ai_core.jsonutil import RawNumber, loads_with_raw_numbers

from generative_ai_adapter.domain import Message, RequestSchema, RetrievalContext
from generative_ai_adapter.rag_prompt import rag_system_message

MAX_JSON_BYTES = 1_048_576
MAX_CONTEXTS = 20
MAX_CONTENT_CHARS = 8_000
MAX_PATH_TEXT_CHARS = 1_000
MAX_ID_CHARS = 200
MAX_SOURCE_PATH_CHARS = 512
MAX_REASON_TYPE_CHARS = 50
MAX_TYPE_CHARS = 100
MAX_LABEL_CHARS = 200
MAX_INT = 2**31 - 1
MIN_PATH_ITEMS = 3
MAX_PATH_ITEMS = 7
MIN_GRAPH_DEPTH = 1
MAX_GRAPH_DEPTH = 3
DEFAULT_FILE_NAME = "rag-context"
REASON_GRAPH_PATH = "graph_path"
REJECTED_MESSAGE = "RAG Context JSON input rejected."
FORBIDDEN_MARKERS = ("RAG_CONTEXT_BEGIN", "RAG_CONTEXT_END")
FORBIDDEN_ROLE_MARKERS = ("system:", "developer:", "assistant:")

ROOT_FIELDS = frozenset({"schemaVersion", "query", "generatedAt", "contexts"})
CONTEXT_FIELDS = frozenset(
    {
        "sourceFilePath",
        "sourceRef",
        "chunkId",
        "chunkSequence",
        "content",
        "score",
        "retrievalSignals",
        "graphEvidence",
    }
)
SIGNAL_FIELDS = frozenset({"vector", "pgroonga", "graph"})
GRAPH_EVIDENCE_FIELDS = frozenset({"reasonType", "pathText", "graphDepth", "path"})
PATH_NODE_FIELDS = frozenset({"nodeType", "label"})
PATH_EDGE_FIELDS = frozenset({"edgeType", "edgeLabel"})


class RagContextJsonInputError(Exception):
    """RAG Context JSON を受け付けない（移植元 RagContextJsonInputException）。"""

    def __init__(self) -> None:
        """固定のメッセージで作る（パス・JSON の中身を出さない）。"""
        super().__init__(REJECTED_MESSAGE)


@dataclass(frozen=True)
class RagContextJsonInputPath:
    """index 6 のパスと、読んでよいディレクトリ（プロパティ 62）。

    Attributes
    ----------
    path : str | None
        index 6 の値（allow root からの相対、または絶対パス）。
    allow_root : Path | None
        読んでよいディレクトリ。None なら読まない。
    """

    path: str | None
    allow_root: Path | None


def _rejected() -> RagContextJsonInputError:
    """受け付けないエラーを作る。

    Returns
    -------
    RagContextJsonInputError
        作ったエラー。
    """
    return RagContextJsonInputError()


def _read_path(input_path: RagContextJsonInputPath) -> str:
    """allow root の中の通常ファイルを UTF-8 で読む。

    Parameters
    ----------
    input_path : RagContextJsonInputPath
        パスと allow root。

    Returns
    -------
    str
        ファイルの中身。

    Raises
    ------
    RagContextJsonInputError
        root 未設定・root の外・ディレクトリ・存在しない・
        大きすぎる・UTF-8 でないとき。
    """
    if input_path.allow_root is None or input_path.path is None:
        raise _rejected()
    try:
        # 移植元: root は toRealPath(NOFOLLOW_LINKS)、対象は root からの解決後に
        # toRealPath（リンクを辿る）。辿った先が root の外なら受け付けない
        root = input_path.allow_root.resolve(strict=True)
        requested = (root / input_path.path).resolve(strict=True)
        if not requested.is_relative_to(root) or requested.is_dir():
            raise _rejected()
        data = requested.read_bytes()
        if len(data) > MAX_JSON_BYTES:
            raise _rejected()
        return data.decode("utf-8")
    except RagContextJsonInputError:
        raise
    except (OSError, UnicodeDecodeError, RuntimeError) as e:
        raise _rejected() from e


def _object(value: Any) -> dict[str, Any]:
    """JSON のオブジェクトであることを確かめる。

    Parameters
    ----------
    value : Any
        値。

    Returns
    -------
    dict[str, Any]
        受け取った値。

    Raises
    ------
    RagContextJsonInputError
        オブジェクトでないとき。
    """
    if not isinstance(value, dict):
        raise _rejected()
    return value


def _reject_unknown(value: dict[str, Any], allowed: frozenset[str]) -> None:
    """許可されていない項目があれば受け付けない。

    Parameters
    ----------
    value : dict[str, Any]
        JSON のオブジェクト。
    allowed : frozenset[str]
        許可する項目名。

    Raises
    ------
    RagContextJsonInputError
        許可されていない項目があるとき。
    """
    if not set(value).issubset(allowed):
        raise _rejected()


def _primitive_text(value: Any) -> str:
    """JSON の値（オブジェクト・配列以外）を文字列にする（Gson の getAsString 相当）。

    Parameters
    ----------
    value : Any
        値。

    Returns
    -------
    str
        文字列にした値。

    Raises
    ------
    RagContextJsonInputError
        オブジェクト・配列のとき。
    """
    if isinstance(value, (dict, list)):
        raise _rejected()
    if isinstance(value, RawNumber):
        return value.text
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def _optional(value: dict[str, Any], key: str, max_length: int) -> str | None:
    """任意の項目を文字列で読む。

    Parameters
    ----------
    value : dict[str, Any]
        JSON のオブジェクト。
    key : str
        項目名。
    max_length : int
        最大文字数。

    Returns
    -------
    str | None
        値。項目がない・null なら None。

    Raises
    ------
    RagContextJsonInputError
        オブジェクト・配列、または長すぎるとき。
    """
    if value.get(key) is None:
        return None
    text = _primitive_text(value[key])
    if len(text) > max_length:
        raise _rejected()
    return text


def _required(value: dict[str, Any], key: str, max_length: int) -> str:
    """必須の項目を空でない文字列で読む。

    Parameters
    ----------
    value : dict[str, Any]
        JSON のオブジェクト。
    key : str
        項目名。
    max_length : int
        最大文字数。

    Returns
    -------
    str
        値。

    Raises
    ------
    RagContextJsonInputError
        ない・空・長すぎるとき。
    """
    text = _optional(value, key, max_length)
    if text is None or not text.strip():
        raise _rejected()
    return text


def _bool(value: dict[str, Any], key: str) -> bool:
    """真偽値の項目を読む。

    Parameters
    ----------
    value : dict[str, Any]
        JSON のオブジェクト。
    key : str
        項目名。

    Returns
    -------
    bool
        値。

    Raises
    ------
    RagContextJsonInputError
        ない・真偽値でないとき。
    """
    item = value.get(key)
    if not isinstance(item, bool):
        raise _rejected()
    return item


def _number(value: dict[str, Any], key: str) -> None:
    """数値の項目があることを確かめる。

    Parameters
    ----------
    value : dict[str, Any]
        JSON のオブジェクト。
    key : str
        項目名。

    Raises
    ------
    RagContextJsonInputError
        ない・数値でないとき。
    """
    if not isinstance(value.get(key), RawNumber):
        raise _rejected()


def _required_int(value: dict[str, Any], key: str, minimum: int, maximum: int) -> int:
    """整数の項目を範囲付きで読む（Gson の getAsInt と同じく小数部は切り捨てる）。

    Parameters
    ----------
    value : dict[str, Any]
        JSON のオブジェクト。
    key : str
        項目名。
    minimum : int
        最小値。
    maximum : int
        最大値。

    Returns
    -------
    int
        値。

    Raises
    ------
    RagContextJsonInputError
        ない・数値でない・範囲外のとき。
    """
    item = value.get(key)
    if not isinstance(item, RawNumber):
        raise _rejected()
    try:
        number = (
            int(float(item.text))
            if not item.text.lstrip("-").isdigit()
            else int(item.text)
        )
    except (ValueError, OverflowError) as e:
        raise _rejected() from e
    if number < minimum or number > maximum:
        raise _rejected()
    return number


def _validate_data(value: str | None, body: bool, max_length: int) -> None:
    """プロンプトへ入れる値に、囲みの印・役割の印・制御文字がないことを確かめる。

    Parameters
    ----------
    value : str | None
        値。None は確かめない。
    body : bool
        本文（改行・タブを許す）か。
    max_length : int
        最大文字数。

    Raises
    ------
    RagContextJsonInputError
        許されない文字・印を含む、または長すぎるとき。
    """
    if value is None:
        return
    lower = value.lower()
    if (
        len(value) > max_length
        or any(marker in value for marker in FORBIDDEN_MARKERS)
        or any(marker in lower for marker in FORBIDDEN_ROLE_MARKERS)
    ):
        raise _rejected()
    for ch in value:
        code = ord(ch)
        if code == 0 or (not body and ch in "\r\n"):
            raise _rejected()
        if code < 0x20 and ch not in "\t\n\r":
            raise _rejected()


def _validate_path(evidence: dict[str, Any], depth: int) -> None:
    """graphEvidence の path（ノードと辺の交互・深さと辺の数が一致）を確かめる。

    Parameters
    ----------
    evidence : dict[str, Any]
        graphEvidence の 1 件。
    depth : int
        graphDepth。

    Raises
    ------
    RagContextJsonInputError
        形が契約と合わないとき。
    """
    path = evidence.get("path")
    if not isinstance(path, list):
        raise _rejected()
    size = len(path)
    if (
        size < MIN_PATH_ITEMS
        or size > MAX_PATH_ITEMS
        or size % 2 == 0
        or (size - 1) // 2 != depth
    ):
        raise _rejected()
    for i, raw in enumerate(path):
        item = _object(raw)
        if i % 2 == 0:
            _reject_unknown(item, PATH_NODE_FIELDS)
            _validate_data(_required(item, "nodeType", MAX_TYPE_CHARS), False, 100)
            _validate_data(_required(item, "label", MAX_LABEL_CHARS), False, 200)
        else:
            _reject_unknown(item, PATH_EDGE_FIELDS)
            _validate_data(_required(item, "edgeType", MAX_TYPE_CHARS), False, 100)
            _validate_data(_required(item, "edgeLabel", MAX_LABEL_CHARS), False, 200)


def _graph_text(context: dict[str, Any], graph: bool) -> str | None:
    """graphEvidence を確かめ、最初の pathText を返す。

    Parameters
    ----------
    context : dict[str, Any]
        contexts の 1 件。
    graph : bool
        retrievalSignals.graph。

    Returns
    -------
    str | None
        最初の pathText。graph が false なら None。

    Raises
    ------
    RagContextJsonInputError
        graph と graphEvidence の有無が合わない、
        または graphEvidence が不正なとき。
    """
    raw = context.get("graphEvidence")
    evidence = raw if isinstance(raw, list) else None
    if graph and not evidence:
        raise _rejected()
    if not graph and evidence:
        raise _rejected()
    if not graph or evidence is None:
        return None
    first_path_text: str | None = None
    for item in evidence:
        graph_evidence = _object(item)
        _reject_unknown(graph_evidence, GRAPH_EVIDENCE_FIELDS)
        if _required(graph_evidence, "reasonType", MAX_REASON_TYPE_CHARS) != (
            REASON_GRAPH_PATH
        ):
            raise _rejected()
        path_text = _required(graph_evidence, "pathText", MAX_PATH_TEXT_CHARS)
        depth = _required_int(
            graph_evidence, "graphDepth", MIN_GRAPH_DEPTH, MAX_GRAPH_DEPTH
        )
        _validate_path(graph_evidence, depth)
        first_path_text = first_path_text or path_text
    return first_path_text


def _envelope(
    chunk_id: str,
    source_ref: str,
    source_file_path: str | None,
    graph_text: str | None,
    content: str,
) -> str:
    """コンテキスト 1 件を data-only envelope にする。

    Parameters
    ----------
    chunk_id : str
        chunkId。
    source_ref : str
        sourceRef。
    source_file_path : str | None
        sourceFilePath。空なら行を出さない。
    graph_text : str | None
        最初の pathText。空なら行を出さない。
    content : str
        本文。

    Returns
    -------
    str
        囲んだ文字列。
    """
    lines = [f"RAG_CONTEXT_BEGIN id={chunk_id} source={source_ref}"]
    if source_file_path and source_file_path.strip():
        lines.append(f"SOURCE_PATH: {source_file_path}")
    if graph_text and graph_text.strip():
        lines.append(f"GRAPH_REASON: {graph_text}")
    lines.append(f"CONTENT: {content}")
    lines.append(f"RAG_CONTEXT_END id={chunk_id}")
    return "\n".join(lines)


def _file_name(path: str | None) -> str:
    """表示用のファイル名（パスの最後の要素）。

    Parameters
    ----------
    path : str | None
        パス。

    Returns
    -------
    str
        ファイル名。求まらなければ `rag-context`。
    """
    if path is None or not path.strip():
        return DEFAULT_FILE_NAME
    name = PurePath(path).name
    return name or DEFAULT_FILE_NAME


def _to_contexts(text: str) -> list[RetrievalContext]:
    """JSON を検証してコンテキストの一覧にする。

    Parameters
    ----------
    text : str
        JSON の文字列。

    Returns
    -------
    list[RetrievalContext]
        コンテキストの一覧。

    Raises
    ------
    RagContextJsonInputError
        契約に合わないとき。
    """
    try:
        root = _object(loads_with_raw_numbers(text))
    except json.JSONDecodeError as e:
        raise _rejected() from e
    _reject_unknown(root, ROOT_FIELDS)
    _required_int(root, "schemaVersion", 1, 1)
    contexts = root.get("contexts")
    if not isinstance(contexts, list) or len(contexts) > MAX_CONTEXTS:
        raise _rejected()
    result: list[RetrievalContext] = []
    for raw in contexts:
        context = _object(raw)
        _reject_unknown(context, CONTEXT_FIELDS)
        chunk_id = _required(context, "chunkId", MAX_ID_CHARS)
        source_ref = _required(context, "sourceRef", MAX_ID_CHARS)
        content = _required(context, "content", MAX_CONTENT_CHARS)
        source_file_path = _optional(context, "sourceFilePath", MAX_SOURCE_PATH_CHARS)
        _number(context, "score")
        if "chunkSequence" in context:
            _required_int(context, "chunkSequence", 0, MAX_INT)
        signals = _object(context.get("retrievalSignals"))
        _reject_unknown(signals, SIGNAL_FIELDS)
        _bool(signals, "vector")
        _bool(signals, "pgroonga")
        graph = _bool(signals, "graph")
        graph_text = _graph_text(context, graph)
        _validate_data(chunk_id, False, MAX_ID_CHARS)
        _validate_data(source_ref, False, MAX_ID_CHARS)
        _validate_data(source_file_path, True, MAX_SOURCE_PATH_CHARS)
        _validate_data(content, True, MAX_CONTENT_CHARS)
        if graph_text is not None:
            _validate_data(graph_text, True, MAX_PATH_TEXT_CHARS)
        path = (
            source_file_path
            if source_file_path and source_file_path.strip()
            else (source_ref)
        )
        block = _envelope(chunk_id, source_ref, source_file_path, graph_text, content)
        result.append(RetrievalContext(block, path, _file_name(path)))
    return result


def from_inline(
    inline_json: str | None,
    path_input: RagContextJsonInputPath | None,
    user_question: str | None,
) -> RequestSchema:
    """RAG Context JSON から RAG のリクエストを組み立てる。

    JSON の本文かパスのどちらか一方だけを受け付ける。

    Parameters
    ----------
    inline_json : str | None
        JSON の本文。
    path_input : RagContextJsonInputPath | None
        JSON のパスと allow root。
    user_question : str | None
        ユーザーの質問。

    Returns
    -------
    RequestSchema
        RAG 回答の契約プロンプト・質問・コンテキストを入れたリクエスト。

    Raises
    ------
    RagContextJsonInputError
        入力が契約に合わないとき。
    """
    has_inline = inline_json is not None and bool(inline_json.strip())
    has_path = (
        path_input is not None
        and path_input.path is not None
        and bool(path_input.path.strip())
    )
    if has_inline == has_path:
        raise _rejected()
    text = inline_json if has_inline and inline_json is not None else ""
    if has_path and path_input is not None:
        text = _read_path(path_input)
    if len(text.encode("utf-8")) > MAX_JSON_BYTES:
        raise _rejected()
    question = user_question or ""
    schema = RequestSchema()
    schema.messages = [rag_system_message(), Message.of_index(0, question)]
    schema.user_question = question
    schema.retrieval_contexts = _to_contexts(text)
    return schema
