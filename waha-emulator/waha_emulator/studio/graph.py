"""ノードと線で組んだワークフローの定義（検証と、今の定義への変換）。

保存の形は版（`version`）を持つ。最初の版は、`start →（retrieval →）generative-ai → end`
の 1 本の鎖だけを扱う。
"""

import os
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
    RAG_OUTPUT_TYPE,
    WorkflowConfigError,
    WorkflowDefinition,
    expand_env,
    parse_definition,
)

GRAPH_VERSION = 1
NODE_START = "start"
NODE_RETRIEVAL = "retrieval"
NODE_GENERATIVE_AI = "generative-ai"
NODE_END = "end"
NODE_TYPES = frozenset({NODE_START, NODE_RETRIEVAL, NODE_GENERATIVE_AI, NODE_END})
# プロパティを持つノード
NODE_TYPES_WITH_PROPERTIES = frozenset({NODE_RETRIEVAL, NODE_GENERATIVE_AI})
ROOT_KEYS = frozenset({"version", "id", "name", "serviceIds", "nodes", "edges"})
NODE_KEYS = frozenset({"id", "type", "name", "position", "properties", "outputType"})
EDGE_KEYS = frozenset({"source", "target"})
DEFAULT_NODE_POSITION = (0.0, 0.0)


@dataclass(frozen=True)
class GraphNode:
    """ワークフローのノード。

    Attributes
    ----------
    id : str
        ワークフローの中で一意なノード ID。
    type : str
        ノードの種類（`start`・`retrieval`・`generative-ai`・`end`）。
    name : str
        画面に出す名前。省略すると ID。
    x : float
        画面上の位置（横）。
    y : float
        画面上の位置（縦）。
    properties : Mapping[str, Any]
        アダプターのプロパティ（名前 → 値。環境変数の参照は展開前のまま）。
    output_type : int | None
        生成AI ノードの出力モード（0 か 2）。省略は None。
    """

    id: str
    type: str
    name: str
    x: float = DEFAULT_NODE_POSITION[0]
    y: float = DEFAULT_NODE_POSITION[1]
    properties: Mapping[str, Any] = field(default_factory=dict)
    output_type: int | None = None


@dataclass(frozen=True)
class GraphEdge:
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
class GraphDefinition:
    """ノードと線で組んだワークフロー。

    Attributes
    ----------
    id : str
        ワークフローの ID（保存先のファイル名）。
    name : str
        名前。
    service_ids : tuple[str, ...]
        このワークフローを呼ぶサービス ID。
    nodes : tuple[GraphNode, ...]
        ノード。
    edges : tuple[GraphEdge, ...]
        線。
    """

    id: str
    name: str
    service_ids: tuple[str, ...]
    nodes: tuple[GraphNode, ...]
    edges: tuple[GraphEdge, ...]

    def chain(self) -> tuple[GraphNode, ...]:
        """`start` から線をたどった順のノードを返す（検証済みの定義だけで呼ぶ）。

        Returns
        -------
        tuple[GraphNode, ...]
            `start` から `end` までの順のノード。
        """
        by_id = {node.id: node for node in self.nodes}
        next_of = {edge.source: edge.target for edge in self.edges}
        current = next(node for node in self.nodes if node.type == NODE_START)
        ordered = [current]
        while current.id in next_of:
            current = by_id[next_of[current.id]]
            ordered.append(current)
        return tuple(ordered)

    def node_of_type(self, node_type: str) -> GraphNode | None:
        """指定した種類のノードを返す。

        Parameters
        ----------
        node_type : str
            ノードの種類。

        Returns
        -------
        GraphNode | None
            最初に見つかったノード。なければ None。
        """
        return next((n for n in self.nodes if n.type == node_type), None)


def _node(raw: Any, index: int) -> GraphNode:
    """JSON の 1 つのノードを読む。

    Parameters
    ----------
    raw : Any
        JSON のノード。
    index : int
        ノードの位置（エラーメッセージ用）。

    Returns
    -------
    GraphNode
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
    node_id = text_value(raw.get("id"), f"{where}.id", MAX_NAME_LENGTH)
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
    properties = raw.get("properties", {})
    if not isinstance(properties, dict):
        raise GraphError(f"{where}: properties はオブジェクトにしてください")
    if properties and node_type not in NODE_TYPES_WITH_PROPERTIES:
        raise GraphError(f"{where}: {node_type} は properties を持てません")
    output_type = raw.get("outputType")
    if output_type is not None:
        if node_type != NODE_GENERATIVE_AI:
            raise GraphError(f"{where}: outputType は generative-ai だけです")
        if isinstance(output_type, bool) or output_type not in (
            NORMAL_CHAT_OUTPUT_TYPE,
            PLAIN_ANSWER_OUTPUT_TYPE,
        ):
            raise GraphError(f"{where}: outputType は 0 か 2 です")
    return GraphNode(node_id, node_type, name, x, y, properties, output_type)


def _edge(raw: Any, index: int) -> GraphEdge:
    """JSON の 1 本の線を読む。

    Parameters
    ----------
    raw : Any
        JSON の線。
    index : int
        線の位置（エラーメッセージ用）。

    Returns
    -------
    GraphEdge
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
    return GraphEdge(source, target)


def _check_structure(
    nodes: tuple[GraphNode, ...], edges: tuple[GraphEdge, ...]
) -> None:
    """ノードの数と、線のつなぎ方（1 本の鎖）を確かめる。

    Parameters
    ----------
    nodes : tuple[GraphNode, ...]
        ノード。
    edges : tuple[GraphEdge, ...]
        線。

    Raises
    ------
    GraphError
        ノードの ID の重複・数の不正・線の不正・つなぎ方の不正があるとき。
    """
    ids = [node.id for node in nodes]
    if len(set(ids)) != len(ids):
        raise GraphError("ノードの id に重複があります")
    counts = {t: sum(1 for n in nodes if n.type == t) for t in NODE_TYPES}
    for required in (NODE_START, NODE_GENERATIVE_AI, NODE_END):
        if counts[required] != 1:
            raise GraphError(f"{required} ノードは 1 つにしてください")
    if counts[NODE_RETRIEVAL] > 1:
        raise GraphError("retrieval ノードは 1 つまでです")
    known = set(ids)
    for edge in edges:
        if edge.source not in known or edge.target not in known:
            raise GraphError(
                f"線「{edge.source} → {edge.target}」の端に、存在しないノードがあります"
            )
    sources = [edge.source for edge in edges]
    targets = [edge.target for edge in edges]
    if len(set(sources)) != len(sources):
        raise GraphError("つなぎ方が不正です: 1 つのノードから複数の線は出せません")
    if len(set(targets)) != len(targets):
        raise GraphError("つなぎ方が不正です: 1 つのノードに複数の線は入れません")
    expected = [NODE_START]
    if counts[NODE_RETRIEVAL]:
        expected.append(NODE_RETRIEVAL)
    expected += [NODE_GENERATIVE_AI, NODE_END]
    by_id = {node.id: node for node in nodes}
    next_of = {edge.source: edge.target for edge in edges}
    current = next(node for node in nodes if node.type == NODE_START)
    walked = [current.type]
    visited = {current.id}
    while current.id in next_of:
        current = by_id[next_of[current.id]]
        if current.id in visited:
            raise GraphError("つなぎ方が不正です: 線が輪になっています")
        visited.add(current.id)
        walked.append(current.type)
    if walked != expected:
        order = " → ".join(expected)
        raise GraphError(
            f"つなぎ方が不正です: {order} の順に、すべてのノードをつないでください"
        )


def parse_graph(data: Any) -> GraphDefinition:
    """JSON（読み込み済み）からワークフローの定義を作る。

    アダプターのプロパティの検証・環境変数の展開は `compile_graph` で行う
    （参照する環境変数がない場合に、定義の形の誤りと区別するため）。

    Parameters
    ----------
    data : Any
        JSON の値。

    Returns
    -------
    GraphDefinition
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
    if data.get("version") != GRAPH_VERSION or isinstance(data.get("version"), bool):
        raise GraphError("未対応の version です（対応: 1・2）")
    graph_id = data.get("id")
    if not isinstance(graph_id, str) or GRAPH_ID_PATTERN.fullmatch(graph_id) is None:
        raise GraphError("id は英小文字・数字・-・_ の 1〜64 文字にしてください")
    name = text_value(data.get("name"), "name", MAX_NAME_LENGTH)
    service_ids = service_ids_value(data.get("serviceIds"))
    raw_nodes, raw_edges = data.get("nodes"), data.get("edges")
    if not isinstance(raw_nodes, list) or not isinstance(raw_edges, list):
        raise GraphError("nodes と edges は配列にしてください")
    nodes = tuple(_node(raw, i) for i, raw in enumerate(raw_nodes))
    edges = tuple(_edge(raw, i) for i, raw in enumerate(raw_edges))
    _check_structure(nodes, edges)
    generative = next(n for n in nodes if n.type == NODE_GENERATIVE_AI)
    has_retrieval = any(n.type == NODE_RETRIEVAL for n in nodes)
    if has_retrieval and generative.output_type is not None:
        raise GraphError(
            f"ノード「{generative.id}」: retrieval があるとき outputType は書けません"
        )
    return GraphDefinition(graph_id, name, service_ids, nodes, edges)


def compile_graph(
    graph: GraphDefinition, environ: Mapping[str, str] | None = None
) -> WorkflowDefinition:
    """検証済みの定義から、今のワークフローの定義を作る。

    アダプターのプロパティを検証し、`${環境変数}` を展開する。

    Parameters
    ----------
    graph : GraphDefinition
        ワークフローの定義。
    environ : Mapping[str, str] | None
        環境変数。None なら os.environ。

    Returns
    -------
    WorkflowDefinition
        生成AI（と検索）を動かす定義。

    Raises
    ------
    GraphError
        プロパティが不正なとき（メッセージに、どのノードかを含める）。
    """
    env = os.environ if environ is None else environ
    generative = graph.node_of_type(NODE_GENERATIVE_AI)
    retrieval = graph.node_of_type(NODE_RETRIEVAL)
    assert generative is not None
    for node in (retrieval, generative):
        if node is not None:
            _check_environment_references(node, env)
    raw: dict[str, Any] = {"properties": dict(generative.properties)}
    if retrieval is None:
        raw["outputType"] = (
            NORMAL_CHAT_OUTPUT_TYPE
            if generative.output_type is None
            else generative.output_type
        )
    else:
        raw["outputType"] = RAG_OUTPUT_TYPE
        raw["retrieval"] = {"properties": dict(retrieval.properties)}
    try:
        return parse_definition(raw, env, f"ノード「{generative.id}」")
    except WorkflowConfigError as e:
        raise GraphError(_with_node_names(str(e), generative, retrieval)) from e


def _check_environment_references(node: GraphNode, environ: Mapping[str, str]) -> None:
    """ノードのプロパティが参照する環境変数がすべてあることを確かめる。

    どのノードの誤りかを、メッセージに出すため。

    Parameters
    ----------
    node : GraphNode
        ノード。
    environ : Mapping[str, str]
        環境変数。

    Raises
    ------
    GraphError
        参照した環境変数がないとき。
    """
    for name, value in node.properties.items():
        if not isinstance(value, str):
            continue
        try:
            expand_env(value, environ)
        except WorkflowConfigError as e:
            raise GraphError(f"ノード「{node.id}」: {name}: {e}") from e


def _with_node_names(
    message: str, generative: GraphNode, retrieval: GraphNode | None
) -> str:
    """検索の設定の誤りに、検索ノードの名前を付ける。

    Parameters
    ----------
    message : str
        `workflow_config` のエラーメッセージ（`ノード「生成AIのID」.retrieval: …` の形）。
    generative : GraphNode
        生成AI ノード。
    retrieval : GraphNode | None
        検索ノード。

    Returns
    -------
    str
        検索の誤りなら検索ノードの名前を使ったメッセージ。それ以外はそのまま。
    """
    marker = f"ノード「{generative.id}」.retrieval"
    if retrieval is not None and marker in message:
        return message.replace(marker, f"ノード「{retrieval.id}」")
    return message
