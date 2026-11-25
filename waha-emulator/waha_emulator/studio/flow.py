"""版 2（ノードと線で自由に組む）の保存形式の検証と、変数のテンプレート。

版 1（鎖に固定。`graph.py`）と共存する。ノードは `start`・`llm`・`template`・`retrieval`・
`branch`・`end`。ノードの出力は、`{{ノードID.text}}`（検索は `{{ノードID.contexts_text}}`）で、
あとのノードのテンプレートに埋め込める。条件分岐は、「はい」「いいえ」の 2 つの出口を持つ。
"""

import re
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any

from waha_emulator.studio.validation import (
    GRAPH_ID_PATTERN,
    MAX_NAME_LENGTH,
    GraphError,
    number_value,
    service_ids_value,
    text_value,
)
from waha_emulator.workflow_config import (
    NORMAL_CHAT_OUTPUT_TYPE,
    PLAIN_ANSWER_OUTPUT_TYPE,
    WorkflowConfigError,
    WorkflowDefinition,
    expand_env,
    parse_definition,
)

FLOW_VERSION = 2
NODE_START = "start"
NODE_LLM = "llm"
NODE_TEMPLATE = "template"
NODE_RETRIEVAL = "retrieval"
NODE_BRANCH = "branch"
NODE_END = "end"
NODE_TYPES = frozenset(
    {NODE_START, NODE_LLM, NODE_TEMPLATE, NODE_RETRIEVAL, NODE_BRANCH, NODE_END}
)
# ノードが出す変数の名前（`ノードID.変数名` で、あとのノードから参照できる）
OUTPUT_VARIABLES: Mapping[str, str] = {
    NODE_LLM: "text",
    NODE_TEMPLATE: "text",
    NODE_RETRIEVAL: "contexts_text",
}
MAX_NODES = 50
MAX_TEXT_LENGTH = 20000
HANDLE_TRUE = "true"
HANDLE_FALSE = "false"
BRANCH_HANDLES = frozenset({HANDLE_TRUE, HANDLE_FALSE})
OPERATOR_CONTAINS = "contains"
OPERATOR_EQUALS = "equals"
OPERATOR_EMPTY = "empty"
OPERATORS = frozenset({OPERATOR_CONTAINS, OPERATOR_EQUALS, OPERATOR_EMPTY})
# 検索ノードの質問（検索語）の既定。利用者の質問をそのまま使う
DEFAULT_RETRIEVAL_QUERY = "{{question}}"
NODE_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
# {{...}} の参照（中の空白は無視する）
REFERENCE_PATTERN = re.compile(r"\{\{\s*([^{}\s]+)\s*\}\}")
VARIABLE_QUESTION = "question"
VARIABLE_HISTORY = "history"
START_VARIABLES = frozenset({VARIABLE_QUESTION, VARIABLE_HISTORY})
OUTPUT_VARIABLE = "text"
OUTPUT_SUFFIX = f".{OUTPUT_VARIABLE}"
RAG_OUTPUT_TYPE_VALUE = 1
ROOT_KEYS = frozenset({"version", "id", "name", "serviceIds", "nodes", "edges"})
NODE_KEYS = frozenset({"id", "type", "name", "position", "config"})
EDGE_KEYS = frozenset({"source", "target"})
EDGE_OPTIONAL_KEYS = frozenset({"sourceHandle"})
CONFIG_KEYS: Mapping[str, frozenset[str]] = {
    NODE_START: frozenset(),
    NODE_LLM: frozenset(
        {"prompt", "properties", "outputType", "inheritContext", "retrieval"}
    ),
    NODE_TEMPLATE: frozenset({"text"}),
    NODE_RETRIEVAL: frozenset({"query", "properties"}),
    NODE_BRANCH: frozenset({"variable", "operator", "value"}),
    NODE_END: frozenset({"output"}),
}
# ノードの設定のうち、{{...}} を埋め込めるテンプレートの項目名（必須のもの）
TEMPLATE_FIELDS: Mapping[str, str] = {
    NODE_LLM: "prompt",
    NODE_TEMPLATE: "text",
    NODE_END: "output",
}
DEFAULT_NODE_POSITION = (0.0, 0.0)


@dataclass(frozen=True)
class FlowNode:
    """版 2 のノード。

    Attributes
    ----------
    id : str
        ワークフローの中で一意なノード ID。
    type : str
        ノードの種類（`start`・`llm`・`template`・`end`）。
    name : str
        画面に出す名前。省略すると ID。
    x : float
        画面上の位置（横）。
    y : float
        画面上の位置（縦）。
    config : Mapping[str, Any]
        種類ごとの設定（省略した項目は、既定値を入れて持つ）。
    """

    id: str
    type: str
    name: str
    x: float = DEFAULT_NODE_POSITION[0]
    y: float = DEFAULT_NODE_POSITION[1]
    config: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class FlowEdge:
    """ノードをつなぐ線。

    Attributes
    ----------
    source : str
        出力元のノード ID。
    target : str
        入力先のノード ID。
    handle : str | None
        条件分岐の出口（`true`・`false`）。条件分岐以外の線は None。
    """

    source: str
    target: str
    handle: str | None = None


@dataclass(frozen=True)
class FlowDefinition:
    """版 2 のワークフロー。

    Attributes
    ----------
    id : str
        ワークフローの ID（保存先のファイル名）。
    name : str
        名前。
    service_ids : tuple[str, ...]
        このワークフローを呼ぶサービス ID。
    nodes : tuple[FlowNode, ...]
        ノード。
    edges : tuple[FlowEdge, ...]
        線。
    """

    id: str
    name: str
    service_ids: tuple[str, ...]
    nodes: tuple[FlowNode, ...]
    edges: tuple[FlowEdge, ...]

    def node(self, node_id: str) -> FlowNode:
        """ID からノードを返す（検証済みの定義だけで呼ぶ）。

        Parameters
        ----------
        node_id : str
            ノード ID。

        Returns
        -------
        FlowNode
            ノード。
        """
        return next(node for node in self.nodes if node.id == node_id)

    def start(self) -> FlowNode:
        """開始ノードを返す（検証済みの定義だけで呼ぶ）。

        Returns
        -------
        FlowNode
            開始ノード。
        """
        return next(node for node in self.nodes if node.type == NODE_START)

    def next_id(self, node_id: str, handle: str | None = None) -> str | None:
        """ノードから出る線の、入力先のノード ID を返す。

        Parameters
        ----------
        node_id : str
            出力元のノード ID。
        handle : str | None
            条件分岐の出口（`true`・`false`）。条件分岐以外は None。

        Returns
        -------
        str | None
            入力先のノード ID。線がなければ None。
        """
        return next(
            (
                e.target
                for e in self.edges
                if e.source == node_id and e.handle == handle
            ),
            None,
        )


def render(template: str, variables: Mapping[str, str]) -> str:
    """テンプレートの `{{変数}}` を、変数の値で置き換える。

    閉じていない `{{` など、参照の形でない部分は、そのまま残す。

    Parameters
    ----------
    template : str
        テンプレート。
    variables : Mapping[str, str]
        変数名 → 値。

    Returns
    -------
    str
        埋め込んだ文字列。

    Raises
    ------
    KeyError
        変数にない参照があるとき（検証済みの定義では起きない）。
    """
    return REFERENCE_PATTERN.sub(lambda match: variables[match.group(1)], template)


def references(template: str) -> list[str]:
    """テンプレートの `{{...}}` の参照を、出てくる順に返す。

    Parameters
    ----------
    template : str
        テンプレート。

    Returns
    -------
    list[str]
        参照（`question`・`draft.text` のような名前）。
    """
    return REFERENCE_PATTERN.findall(template)


def single_reference(template: str) -> str | None:
    """テンプレートが、`{{...}}` の参照 1 つだけ（前後の空白は除く）なら、その参照を返す。

    Parameters
    ----------
    template : str
        テンプレート。

    Returns
    -------
    str | None
        参照 1 つだけのときその名前。ほかは None。
    """
    match = REFERENCE_PATTERN.fullmatch(template.strip())
    return None if match is None else match.group(1)


def _properties_value(raw: Any, where: str) -> dict[str, Any]:
    """ノードの接続のプロパティ（`config.properties`）を取り出す。

    Parameters
    ----------
    raw : Any
        JSON の `properties`（省略は空）。
    where : str
        エラーメッセージに出す場所。

    Returns
    -------
    dict[str, Any]
        プロパティ。

    Raises
    ------
    GraphError
        オブジェクトでないとき。
    """
    if not isinstance(raw, dict):
        raise GraphError(f"{where}: config.properties はオブジェクトにしてください")
    return raw


def _llm_config(raw: dict[str, Any], where: str) -> dict[str, Any]:
    """生成AI ノードの設定（プロパティ・出力モード・文脈の引き継ぎ・検索の紐づけ）を検証する。

    Parameters
    ----------
    raw : dict[str, Any]
        JSON の `config`。
    where : str
        エラーメッセージに出す場所。

    Returns
    -------
    dict[str, Any]
        `properties`・`outputType`・`inheritContext`・`retrieval`。

    Raises
    ------
    GraphError
        設定が不正なとき。
    """
    properties = _properties_value(raw.get("properties", {}), where)
    retrieval = raw.get("retrieval")
    if retrieval is not None:
        if (
            not isinstance(retrieval, str)
            or NODE_ID_PATTERN.fullmatch(retrieval) is None
        ):
            raise GraphError(
                f"{where}: config.retrieval は、検索ノードの ID にしてください"
            )
        if "outputType" in raw:
            raise GraphError(f"{where}: retrieval があるとき outputType は書けません")
        output_type = RAG_OUTPUT_TYPE_VALUE
    else:
        output_type = raw.get("outputType", NORMAL_CHAT_OUTPUT_TYPE)
        if isinstance(output_type, bool) or output_type not in (
            NORMAL_CHAT_OUTPUT_TYPE,
            PLAIN_ANSWER_OUTPUT_TYPE,
        ):
            raise GraphError(f"{where}: config.outputType は 0 か 2 です")
    inherit_context = raw.get("inheritContext", False)
    if not isinstance(inherit_context, bool):
        raise GraphError(f"{where}: config.inheritContext は真偽値にしてください")
    return {
        "properties": properties,
        "outputType": output_type,
        "inheritContext": inherit_context,
        "retrieval": retrieval,
    }


def _branch_config(raw: dict[str, Any], where: str) -> dict[str, Any]:
    """条件分岐ノードの設定（調べる変数・演算子・値）を検証する。

    Parameters
    ----------
    raw : dict[str, Any]
        JSON の `config`。
    where : str
        エラーメッセージに出す場所。

    Returns
    -------
    dict[str, Any]
        `variable`・`operator`・`value`。

    Raises
    ------
    GraphError
        設定が不正なとき。
    """
    if "variable" not in raw:
        raise GraphError(f"{where}: config.variable が必要です")
    variable = text_value(raw["variable"], f"{where}.config.variable", MAX_NAME_LENGTH)
    # {{judge.text}} のように、波括弧つきで書かれても、変数の名前として読む
    variable = single_reference(variable) or variable
    operator = raw.get("operator")
    if not isinstance(operator, str) or operator not in OPERATORS:
        raise GraphError(
            f"{where}: config.operator は {sorted(OPERATORS)} のどれかです"
        )
    if operator == OPERATOR_EMPTY:
        if "value" in raw:
            raise GraphError(f"{where}: operator が empty のとき value は書けません")
        value = ""
    else:
        if "value" not in raw:
            raise GraphError(f"{where}: config.value が必要です")
        value = text_value(raw["value"], f"{where}.config.value", MAX_TEXT_LENGTH)
    return {"variable": variable, "operator": operator, "value": value}


def _config(node_type: str, raw: Any, where: str) -> dict[str, Any]:
    """ノードの設定を検証し、省略した項目に既定値を入れて返す。

    Parameters
    ----------
    node_type : str
        ノードの種類。
    raw : Any
        JSON の `config`。
    where : str
        エラーメッセージに出す場所（`ノード「…」`）。

    Returns
    -------
    dict[str, Any]
        設定。

    Raises
    ------
    GraphError
        設定が不正なとき。
    """
    if not isinstance(raw, dict):
        raise GraphError(f"{where}: config はオブジェクトにしてください")
    unknown = set(raw) - CONFIG_KEYS[node_type]
    if unknown:
        raise GraphError(f"{where}: config に未知の項目があります: {sorted(unknown)}")
    config: dict[str, Any] = {}
    template_field = TEMPLATE_FIELDS.get(node_type)
    if template_field is not None:
        if template_field not in raw:
            raise GraphError(f"{where}: config.{template_field} が必要です")
        config[template_field] = text_value(
            raw[template_field], f"{where}.config.{template_field}", MAX_TEXT_LENGTH
        )
    if node_type == NODE_LLM:
        config.update(_llm_config(raw, where))
    elif node_type == NODE_RETRIEVAL:
        config["query"] = text_value(
            raw.get("query", DEFAULT_RETRIEVAL_QUERY),
            f"{where}.config.query",
            MAX_TEXT_LENGTH,
        )
        config["properties"] = _properties_value(raw.get("properties", {}), where)
    elif node_type == NODE_BRANCH:
        config.update(_branch_config(raw, where))
    return config


def _node(raw: Any, index: int) -> FlowNode:
    """JSON の 1 つのノードを読む。

    Parameters
    ----------
    raw : Any
        JSON のノード。
    index : int
        ノードの位置（エラーメッセージ用）。

    Returns
    -------
    FlowNode
        ノード。

    Raises
    ------
    GraphError
        ノードが不正なとき。
    """
    where = f"nodes[{index}]"
    if not isinstance(raw, dict):
        raise GraphError(f"{where} はオブジェクトにしてください")
    unknown = set(raw) - NODE_KEYS
    if unknown:
        raise GraphError(f"{where}: 未知の項目です: {sorted(unknown)}")
    node_id = raw.get("id")
    if not isinstance(node_id, str) or NODE_ID_PATTERN.fullmatch(node_id) is None:
        raise GraphError(f"{where}.id は英数字・-・_ の 1〜64 文字にしてください")
    where = f"ノード「{node_id}」"
    node_type = raw.get("type")
    if node_type not in NODE_TYPES:
        raise GraphError(f"{where}: type は {sorted(NODE_TYPES)} のどれかです")
    name = text_value(raw.get("name", node_id), f"{where}.name", MAX_NAME_LENGTH)
    x, y = DEFAULT_NODE_POSITION
    if "position" in raw:
        position = raw["position"]
        if not isinstance(position, dict) or set(position) != {"x", "y"}:
            raise GraphError(f"{where}: position は x と y を持つオブジェクトです")
        x = number_value(position["x"], f"{where}.position.x")
        y = number_value(position["y"], f"{where}.position.y")
    config = _config(node_type, raw.get("config", {}), where)
    return FlowNode(node_id, node_type, name, x, y, config)


def _edge(raw: Any, index: int) -> FlowEdge:
    """JSON の 1 本の線を読む。

    Parameters
    ----------
    raw : Any
        JSON の線。
    index : int
        線の位置（エラーメッセージ用）。

    Returns
    -------
    FlowEdge
        線。

    Raises
    ------
    GraphError
        線が不正なとき。
    """
    where = f"edges[{index}]"
    if (
        not isinstance(raw, dict)
        or not EDGE_KEYS <= set(raw)
        or set(raw) - EDGE_KEYS - EDGE_OPTIONAL_KEYS
    ):
        raise GraphError(
            f"{where} は source と target（と、あれば sourceHandle）を持つオブジェクトにしてください"
        )
    source, target = raw["source"], raw["target"]
    if not isinstance(source, str) or not isinstance(target, str):
        raise GraphError(f"{where}: source と target は文字列にしてください")
    handle = raw.get("sourceHandle")
    # 文字列でない値（配列・オブジェクト）は、集合の検索で TypeError になるため、先に型で弾く
    if handle is not None and (
        not isinstance(handle, str) or handle not in BRANCH_HANDLES
    ):
        raise GraphError(
            f"{where}: sourceHandle は {sorted(BRANCH_HANDLES)} のどちらかです"
        )
    return FlowEdge(source, target, handle)


def _check_structure(
    nodes: tuple[FlowNode, ...], edges: tuple[FlowEdge, ...]
) -> dict[str, list[str]]:
    """ノードの数と、線のつなぎ方（出口・合流・輪・到達・行き止まり）を確かめる。

    Parameters
    ----------
    nodes : tuple[FlowNode, ...]
        ノード。
    edges : tuple[FlowEdge, ...]
        線。

    Returns
    -------
    dict[str, list[str]]
        ノード ID → 出る線の入力先（参照の検証に使う）。

    Raises
    ------
    GraphError
        ノードの数・線・つなぎ方が不正なとき。
    """
    if len(nodes) > MAX_NODES:
        raise GraphError(f"ノードは {MAX_NODES} 個までです")
    ids = [node.id for node in nodes]
    if len(set(ids)) != len(ids):
        raise GraphError("ノードの id に重複があります")
    starts = [node for node in nodes if node.type == NODE_START]
    if len(starts) != 1:
        raise GraphError("start ノードは 1 つにしてください")
    if not any(node.type == NODE_END for node in nodes):
        raise GraphError("end ノードは 1 つ以上必要です")
    known = set(ids)
    by_id = {node.id: node for node in nodes}
    edges_from: dict[str, list[FlowEdge]] = {node_id: [] for node_id in ids}
    incoming: dict[str, int] = {node_id: 0 for node_id in ids}
    for edge in edges:
        if edge.source not in known or edge.target not in known:
            raise GraphError(
                f"線「{edge.source} → {edge.target}」の端に、存在しないノードがあります"
            )
        if by_id[edge.target].type == NODE_START:
            raise GraphError("start ノードへ入る線は引けません")
        if by_id[edge.source].type == NODE_END:
            raise GraphError("end ノードから出る線は引けません")
        edges_from[edge.source].append(edge)
        incoming[edge.target] += 1
    for node in nodes:
        _check_outgoing(node, edges_from[node.id])
    for node_id, count in incoming.items():
        if count > 1:
            raise GraphError(
                f"つなぎ方が不正です: ノード「{node_id}」に複数の線が入っています（合流は、まだ作れません）"
            )
    outgoing = {node_id: [e.target for e in out] for node_id, out in edges_from.items()}
    _check_acyclic(ids, outgoing)
    reachable = _reachable(starts[0].id, outgoing)
    for node in nodes:
        if node.id not in reachable:
            raise GraphError(
                f"つなぎ方が不正です: ノード「{node.id}」に、開始から到達できません"
            )
        if node.type != NODE_END and not outgoing[node.id]:
            raise GraphError(
                f"つなぎ方が不正です: ノード「{node.id}」から先に、線がありません（行き止まり）"
            )
    return outgoing


def _check_outgoing(node: FlowNode, out: list[FlowEdge]) -> None:
    """ノードから出る線が、そのノードの種類に合うことを確かめる。

    条件分岐は、「はい」（true）と「いいえ」（false）の線を 1 本ずつ。それ以外は、1 本まで
    で、出口（sourceHandle）は付けない。

    Parameters
    ----------
    node : FlowNode
        ノード。
    out : list[FlowEdge]
        そのノードから出る線。

    Raises
    ------
    GraphError
        線の数・出口が合わないとき。
    """
    if node.type == NODE_BRANCH:
        if sorted(edge.handle or "" for edge in out) != sorted(BRANCH_HANDLES):
            raise GraphError(
                f"つなぎ方が不正です: 条件分岐「{node.id}」には、「はい」（true）と"
                "「いいえ」（false）の線を 1 本ずつ引いてください"
            )
        return
    if len(out) > 1:
        raise GraphError(
            f"つなぎ方が不正です: ノード「{node.id}」から複数の線は出せません"
        )
    if any(edge.handle is not None for edge in out):
        raise GraphError(
            f"つなぎ方が不正です: ノード「{node.id}」は条件分岐ではないため、sourceHandle は書けません"
        )


def _check_acyclic(ids: list[str], outgoing: Mapping[str, list[str]]) -> None:
    """線が輪（ループ）になっていないことを確かめる。

    Parameters
    ----------
    ids : list[str]
        すべてのノード ID。
    outgoing : Mapping[str, list[str]]
        ノード ID → 出る線の入力先。

    Raises
    ------
    GraphError
        輪があるとき。
    """
    state: dict[str, int] = {}  # 0 未訪問 / 1 たどり中 / 2 済み

    def visit(node_id: str) -> None:
        """深さ優先で、たどり中のノードに戻ったら輪とする。

        Parameters
        ----------
        node_id : str
            たどるノードの ID。

        Raises
        ------
        GraphError
            たどり中のノードに戻る線（輪）があるとき。
        """
        state[node_id] = 1
        for target in outgoing[node_id]:
            current = state.get(target, 0)
            if current == 1:
                raise GraphError("つなぎ方が不正です: 線が輪になっています")
            if current == 0:
                visit(target)
        state[node_id] = 2

    for node_id in ids:
        if state.get(node_id, 0) == 0:
            visit(node_id)


def _reachable(start_id: str, outgoing: Mapping[str, list[str]]) -> set[str]:
    """開始から線をたどって到達できるノードの ID を返す。

    Parameters
    ----------
    start_id : str
        開始ノードの ID。
    outgoing : Mapping[str, list[str]]
        ノード ID → 出る線の入力先。

    Returns
    -------
    set[str]
        到達できるノード ID（開始を含む）。
    """
    seen = {start_id}
    stack = [start_id]
    while stack:
        for target in outgoing[stack.pop()]:
            if target not in seen:
                seen.add(target)
                stack.append(target)
    return seen


def _ancestors(node_id: str, outgoing: Mapping[str, list[str]]) -> set[str]:
    """あるノードより前に実行されうるノード（線を逆にたどって着くノード）を返す。

    Parameters
    ----------
    node_id : str
        ノード ID。
    outgoing : Mapping[str, list[str]]
        ノード ID → 出る線の入力先。

    Returns
    -------
    set[str]
        上流のノード ID（自分自身は含まない）。
    """
    parents: dict[str, list[str]] = {}
    for source, targets in outgoing.items():
        for target in targets:
            parents.setdefault(target, []).append(source)
    seen: set[str] = set()
    stack = list(parents.get(node_id, []))
    while stack:
        current = stack.pop()
        if current not in seen:
            seen.add(current)
            stack.extend(parents.get(current, []))
    return seen


def _node_references(node: FlowNode) -> list[tuple[str, str]]:
    """ノードの設定の中の、変数の参照を（項目名、参照）の組で返す。

    Parameters
    ----------
    node : FlowNode
        ノード。

    Returns
    -------
    list[tuple[str, str]]
        （項目名、参照）。参照は `question`・`ノードID.text` のような名前。
    """
    if node.type == NODE_BRANCH:
        return [("variable", node.config["variable"])]
    field_name = TEMPLATE_FIELDS.get(node.type)
    if node.type == NODE_RETRIEVAL:
        field_name = "query"
    if field_name is None:
        return []
    return [(field_name, token) for token in references(node.config[field_name])]


def _check_token(
    node: FlowNode,
    field_name: str,
    token: str,
    by_id: Mapping[str, FlowNode],
    upstream: set[str],
) -> None:
    """変数の参照が、使えるものであることを確かめる。

    使えるのは、`question`・`history`、と、そのノードより前に動くノードの出力
    （生成AI・テンプレートは `ノードID.text`、検索は `ノードID.contexts_text`）。

    Parameters
    ----------
    node : FlowNode
        参照を書いたノード。
    field_name : str
        参照を書いた項目の名前。
    token : str
        参照（波括弧の中の名前）。
    by_id : Mapping[str, FlowNode]
        ノード ID → ノード。
    upstream : set[str]
        そのノードより前に動くノードの ID。

    Raises
    ------
    GraphError
        使えない参照のとき（どのノードのどの項目かを含める）。
    """
    if token in START_VARIABLES:
        return
    where = f"ノード「{node.id}」: {field_name} の {{{{{token}}}}}"
    source_id, _, variable = token.partition(".")
    if not variable:
        raise GraphError(
            f"{where} は使えません（使えるのは question・history・ノードID.変数名）"
        )
    source = by_id.get(source_id)
    if source is None:
        raise GraphError(f"{where} の、ノード「{source_id}」がありません")
    expected = OUTPUT_VARIABLES.get(source.type)
    if expected is None:
        raise GraphError(
            f"{where} は使えません（ノード「{source_id}」は、出力を持たない種類です）"
        )
    if variable != expected:
        raise GraphError(
            f"{where} は使えません（ノード「{source_id}」の変数は {source_id}.{expected} です）"
        )
    if source_id not in upstream:
        raise GraphError(
            f"{where} は使えません（ノード「{source_id}」は、このノードより前に動きません）"
        )


def _check_retrieval_link(
    node: FlowNode, by_id: Mapping[str, FlowNode], upstream: set[str]
) -> None:
    """生成AI ノードが引用資料に使う検索ノード（config.retrieval）が、使えることを確かめる。

    Parameters
    ----------
    node : FlowNode
        生成AI ノード。
    by_id : Mapping[str, FlowNode]
        ノード ID → ノード。
    upstream : set[str]
        そのノードより前に動くノードの ID。

    Raises
    ------
    GraphError
        検索ノードがない・検索ノードでない・このノードより前に動かないとき。
    """
    link = node.config.get("retrieval")
    if link is None:
        return
    where = f"ノード「{node.id}」: retrieval「{link}」"
    source = by_id.get(link)
    if source is None or source.type != NODE_RETRIEVAL:
        raise GraphError(f"{where} は、検索ノードではありません")
    if link not in upstream:
        raise GraphError(f"{where} は、このノードより前に動きません")


def _check_references(
    nodes: tuple[FlowNode, ...], outgoing: Mapping[str, list[str]]
) -> None:
    """テンプレート・条件分岐の変数の参照と、生成AI の検索の紐づけが、使えることを確かめる。

    Parameters
    ----------
    nodes : tuple[FlowNode, ...]
        ノード。
    outgoing : Mapping[str, list[str]]
        ノード ID → 出る線の入力先。

    Raises
    ------
    GraphError
        使えない参照があるとき（どのノードのどの項目かを含める）。
    """
    by_id = {node.id: node for node in nodes}
    for node in nodes:
        upstream = _ancestors(node.id, outgoing)
        for field_name, token in _node_references(node):
            _check_token(node, field_name, token, by_id, upstream)
        if node.type == NODE_LLM:
            _check_retrieval_link(node, by_id, upstream)


def parse_flow(data: Any) -> FlowDefinition:
    """JSON（読み込み済み）から、版 2 のワークフローの定義を作る。

    接続（プロパティ）の検証と環境変数の展開は `compile_flow` で行う。

    Parameters
    ----------
    data : Any
        JSON の値。

    Returns
    -------
    FlowDefinition
        定義。

    Raises
    ------
    GraphError
        定義が不正なとき。
    """
    if not isinstance(data, dict):
        raise GraphError("ワークフローの定義はオブジェクトにしてください")
    unknown = set(data) - ROOT_KEYS
    if unknown:
        raise GraphError(f"未知の項目です: {sorted(unknown)}")
    version = data.get("version")
    # 2.0 や True を、2 として通さない（bool は int の仲間のため、型で確かめる）
    if type(version) is not int or version != FLOW_VERSION:
        raise GraphError(f"未対応の version です（このデータは {FLOW_VERSION}）")
    flow_id = data.get("id")
    if not isinstance(flow_id, str) or GRAPH_ID_PATTERN.fullmatch(flow_id) is None:
        raise GraphError("id は英小文字・数字・-・_ の 1〜64 文字にしてください")
    name = text_value(data.get("name"), "name", MAX_NAME_LENGTH)
    service_ids = service_ids_value(data.get("serviceIds"))
    raw_nodes, raw_edges = data.get("nodes"), data.get("edges")
    if not isinstance(raw_nodes, list) or not isinstance(raw_edges, list):
        raise GraphError("nodes と edges は配列にしてください")
    nodes = tuple(_node(raw, i) for i, raw in enumerate(raw_nodes))
    edges = tuple(_edge(raw, i) for i, raw in enumerate(raw_edges))
    outgoing = _check_structure(nodes, edges)
    _check_references(nodes, outgoing)
    return FlowDefinition(flow_id, name, service_ids, nodes, edges)


def _check_environment_references(
    node: FlowNode, properties: Mapping[str, Any], environ: Mapping[str, str]
) -> None:
    """ノードのプロパティが参照する環境変数がすべてあることを確かめる。

    Parameters
    ----------
    node : FlowNode
        ノード。
    properties : Mapping[str, Any]
        ノードの接続のプロパティ。
    environ : Mapping[str, str]
        環境変数。

    Raises
    ------
    GraphError
        参照した環境変数がないとき（どのノードかを含める）。
    """
    for name, value in properties.items():
        if not isinstance(value, str):
            continue
        try:
            expand_env(value, environ)
        except WorkflowConfigError as e:
            raise GraphError(f"ノード「{node.id}」: {name}: {e}") from e


def compile_flow(
    flow: FlowDefinition, environ: Mapping[str, str]
) -> dict[str, WorkflowDefinition]:
    """生成AI・検索ノードの接続を検証し、アダプターを動かす定義にする。

    `${環境変数}` を展開し、アダプターの保存時チェックを通す。

    Parameters
    ----------
    flow : FlowDefinition
        ワークフローの定義。
    environ : Mapping[str, str]
        環境変数。

    Returns
    -------
    dict[str, WorkflowDefinition]
        生成AI・検索ノードの ID → アダプターを動かす定義（検索は、検索アダプターの設定を持つ）。

    Raises
    ------
    GraphError
        接続が不正なとき（メッセージに、どのノードかを含める）。
    """
    plans: dict[str, WorkflowDefinition] = {}
    for node in flow.nodes:
        if node.type not in (NODE_LLM, NODE_RETRIEVAL):
            continue
        properties = node.config["properties"]
        _check_environment_references(node, properties, environ)
        if node.type == NODE_LLM:
            raw: dict[str, Any] = {
                "outputType": node.config["outputType"],
                "properties": dict(properties),
            }
        else:
            raw = {
                "outputType": RAG_OUTPUT_TYPE_VALUE,
                "properties": {},
                "retrieval": {"properties": dict(properties)},
            }
        try:
            plans[node.id] = parse_definition(raw, environ, f"ノード「{node.id}」")
        except WorkflowConfigError as e:
            raise GraphError(str(e)) from e
    return plans
