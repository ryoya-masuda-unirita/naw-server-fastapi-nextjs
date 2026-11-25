"""版 2（ノードと線で自由に組む）の保存形式の検証と、変数のテンプレート。

版 1（鎖に固定。`graph.py`）と共存する。ノードは `start`・`llm`・`template`・`end`。
ノードの出力は、`{{ノードID.text}}` で、あとのノードのテンプレートに埋め込める。
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
NODE_END = "end"
NODE_TYPES = frozenset({NODE_START, NODE_LLM, NODE_TEMPLATE, NODE_END})
# 出力を `ノードID.text` の変数にできるノード
NODES_WITH_TEXT_OUTPUT = frozenset({NODE_LLM, NODE_TEMPLATE})
MAX_NODES = 50
MAX_TEXT_LENGTH = 20000
# 1 つのノードから出せる線の数（条件分岐が入るまでは 1 本）
MAX_OUTGOING_EDGES = 1
NODE_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
# {{...}} の参照（中の空白は無視する）
REFERENCE_PATTERN = re.compile(r"\{\{\s*([^{}\s]+)\s*\}\}")
VARIABLE_QUESTION = "question"
VARIABLE_HISTORY = "history"
START_VARIABLES = frozenset({VARIABLE_QUESTION, VARIABLE_HISTORY})
OUTPUT_VARIABLE = "text"
OUTPUT_SUFFIX = f".{OUTPUT_VARIABLE}"
ROOT_KEYS = frozenset({"version", "id", "name", "serviceIds", "nodes", "edges"})
NODE_KEYS = frozenset({"id", "type", "name", "position", "config"})
EDGE_KEYS = frozenset({"source", "target"})
CONFIG_KEYS: Mapping[str, frozenset[str]] = {
    NODE_START: frozenset(),
    NODE_LLM: frozenset({"prompt", "properties", "outputType", "inheritContext"}),
    NODE_TEMPLATE: frozenset({"text"}),
    NODE_END: frozenset({"output"}),
}
# ノードの設定のうち、{{...}} を埋め込めるテンプレートの項目名
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
    """

    source: str
    target: str


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

    def next_id(self, node_id: str) -> str | None:
        """ノードから出る線の、入力先のノード ID を返す。

        Parameters
        ----------
        node_id : str
            出力元のノード ID。

        Returns
        -------
        str | None
            入力先のノード ID。線がなければ None。
        """
        return next((e.target for e in self.edges if e.source == node_id), None)


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
        properties = raw.get("properties", {})
        if not isinstance(properties, dict):
            raise GraphError(f"{where}: config.properties はオブジェクトにしてください")
        output_type = raw.get("outputType", NORMAL_CHAT_OUTPUT_TYPE)
        if isinstance(output_type, bool) or output_type not in (
            NORMAL_CHAT_OUTPUT_TYPE,
            PLAIN_ANSWER_OUTPUT_TYPE,
        ):
            raise GraphError(f"{where}: config.outputType は 0 か 2 です")
        inherit_context = raw.get("inheritContext", False)
        if not isinstance(inherit_context, bool):
            raise GraphError(f"{where}: config.inheritContext は真偽値にしてください")
        config.update(
            properties=properties,
            outputType=output_type,
            inheritContext=inherit_context,
        )
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
    if not isinstance(raw, dict) or set(raw) != EDGE_KEYS:
        raise GraphError(
            f"{where} は source と target を持つオブジェクトにしてください"
        )
    source, target = raw["source"], raw["target"]
    if not isinstance(source, str) or not isinstance(target, str):
        raise GraphError(f"{where}: source と target は文字列にしてください")
    return FlowEdge(source, target)


def _check_structure(
    nodes: tuple[FlowNode, ...], edges: tuple[FlowEdge, ...]
) -> dict[str, list[str]]:
    """ノードの数と、線のつなぎ方（輪・到達・行き止まり）を確かめる。

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
    outgoing: dict[str, list[str]] = {node_id: [] for node_id in ids}
    incoming: dict[str, int] = {node_id: 0 for node_id in ids}
    by_id = {node.id: node for node in nodes}
    for edge in edges:
        if edge.source not in known or edge.target not in known:
            raise GraphError(
                f"線「{edge.source} → {edge.target}」の端に、存在しないノードがあります"
            )
        if by_id[edge.target].type == NODE_START:
            raise GraphError("start ノードへ入る線は引けません")
        if by_id[edge.source].type == NODE_END:
            raise GraphError("end ノードから出る線は引けません")
        outgoing[edge.source].append(edge.target)
        incoming[edge.target] += 1
    for node_id, targets in outgoing.items():
        if len(targets) > MAX_OUTGOING_EDGES:
            raise GraphError(
                f"つなぎ方が不正です: ノード「{node_id}」から複数の線は出せません"
            )
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
        """深さ優先で、たどり中のノードに戻ったら輪とする。"""
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


def _check_references(
    nodes: tuple[FlowNode, ...], outgoing: Mapping[str, list[str]]
) -> None:
    """テンプレートの `{{...}}` が、使える変数だけであることを確かめる。

    使える変数は、`question`・`history`、と、そのノードより前に実行される
    `llm`・`template` ノードの `ノードID.text`。

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
        template_field = TEMPLATE_FIELDS.get(node.type)
        if template_field is None:
            continue
        upstream = _ancestors(node.id, outgoing)
        for token in references(node.config[template_field]):
            if token in START_VARIABLES:
                continue
            where = f"ノード「{node.id}」: {template_field} の {{{{{token}}}}}"
            if not token.endswith(OUTPUT_SUFFIX):
                raise GraphError(
                    f"{where} は使えません（使えるのは question・history・ノードID.text）"
                )
            source_id = token[: -len(OUTPUT_SUFFIX)]
            source = by_id.get(source_id)
            if source is None:
                raise GraphError(f"{where} の、ノード「{source_id}」がありません")
            if source.type not in NODES_WITH_TEXT_OUTPUT:
                raise GraphError(
                    f"{where} は使えません（ノード「{source_id}」は、出力を持たない種類です）"
                )
            if source_id not in upstream:
                raise GraphError(
                    f"{where} は使えません（ノード「{source_id}」は、このノードより前に動きません）"
                )


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
    if data.get("version") != FLOW_VERSION or isinstance(data.get("version"), bool):
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
    """生成AI ノードの接続を検証し、アダプターを動かす定義にする。

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
        生成AI ノードの ID → アダプターを動かす定義。

    Raises
    ------
    GraphError
        接続が不正なとき（メッセージに、どのノードかを含める）。
    """
    plans: dict[str, WorkflowDefinition] = {}
    for node in flow.nodes:
        if node.type != NODE_LLM:
            continue
        properties = node.config["properties"]
        _check_environment_references(node, properties, environ)
        raw = {"outputType": node.config["outputType"], "properties": dict(properties)}
        try:
            plans[node.id] = parse_definition(raw, environ, f"ノード「{node.id}」")
        except WorkflowConfigError as e:
            raise GraphError(str(e)) from e
    return plans
