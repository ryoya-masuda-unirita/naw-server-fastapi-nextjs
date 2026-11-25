import copy
import re
from typing import Any

import pytest
from generative_ai_adapter.constants import PropertyIds
from retrieval_adapter.constants import RetrievalPropertyIds

from tests.studio_support import graph_data
from waha_emulator.studio.graph import compile_graph, parse_graph
from waha_emulator.studio.validation import GraphError
from waha_emulator.workflow_config import (
    ECHO_PROPERTIES,
    NORMAL_CHAT_OUTPUT_TYPE,
    PLAIN_ANSWER_OUTPUT_TYPE,
    RAG_OUTPUT_TYPE,
)


def test_parse_graph_accepts_chat_without_retrieval() -> None:
    """開始 → 生成AI → 終了の鎖を読めること"""
    graph = parse_graph(graph_data())

    assert [n.type for n in graph.chain()] == ["start", "generative-ai", "end"]
    assert graph.service_ids == ("wf-1",)


def test_parse_graph_accepts_chat_with_retrieval() -> None:
    """開始 → 検索 → 生成AI → 終了の鎖を読めること"""
    graph = parse_graph(graph_data(retrieval=True))

    assert [n.type for n in graph.chain()] == [
        "start",
        "retrieval",
        "generative-ai",
        "end",
    ]


def test_parse_graph_follows_edges_not_node_order() -> None:
    """ノードの並び順ではなく、線のつなぎ方で順番が決まること"""
    data = graph_data(retrieval=True)
    data["nodes"].reverse()

    graph = parse_graph(data)

    assert [n.id for n in graph.chain()] == ["start", "ret", "gen", "end"]


def _without(data: dict[str, Any], key: str) -> dict[str, Any]:
    """キーを 1 つ消したコピーを返す。

    Parameters
    ----------
    data : dict[str, Any]
        定義。
    key : str
        消すキー。

    Returns
    -------
    dict[str, Any]
        キーを消した定義。
    """
    copied = copy.deepcopy(data)
    del copied[key]
    return copied


def _edit(data: dict[str, Any], **changes: Any) -> dict[str, Any]:
    """トップレベルの項目を差し替えたコピーを返す。

    Parameters
    ----------
    data : dict[str, Any]
        定義。
    **changes : Any
        差し替える項目。

    Returns
    -------
    dict[str, Any]
        差し替えた定義。
    """
    return {**copy.deepcopy(data), **changes}


def _node(data: dict[str, Any], node_id: str) -> dict[str, Any]:
    """ID でノードを取り出す。

    Parameters
    ----------
    data : dict[str, Any]
        定義。
    node_id : str
        ノードの ID。

    Returns
    -------
    dict[str, Any]
        ノード。
    """
    return next(n for n in data["nodes"] if n["id"] == node_id)


BASE = graph_data()
WITH_RETRIEVAL = graph_data(retrieval=True)


def _invalid_cases() -> list[tuple[dict[str, Any], str]]:
    """不正な定義と、エラーメッセージに含まれる文字列の組を作る。

    Returns
    -------
    list[tuple[dict[str, Any], str]]
        （不正な定義、メッセージの一部）。
    """
    cases: list[tuple[dict[str, Any], str]] = [
        ("not an object", "オブジェクト"),  # type: ignore[list-item]
        (_edit(BASE, version=2), "version"),
        (_edit(BASE, version=True), "version"),
        (_edit(BASE, unknown=1), "未知の項目"),
        (_edit(BASE, id="Upper"), "id は"),
        (_edit(BASE, id="a/b"), "id は"),
        (_edit(BASE, id="x" * 65), "id は"),
        (_edit(BASE, name=""), "name"),
        (_edit(BASE, name="x" * 101), "name"),
        (_edit(BASE, serviceIds=[]), "serviceIds"),
        (_edit(BASE, serviceIds=["a", "a"]), "重複"),
        (_edit(BASE, serviceIds=[1]), "serviceIds[0]"),
        (_edit(BASE, nodes="x"), "配列"),
        (_edit(BASE, edges="x"), "配列"),
        (_without(BASE, "version"), "version"),
    ]
    bad_type = copy.deepcopy(BASE)
    _node(bad_type, "gen")["type"] = "llm"
    cases.append((bad_type, "type は"))
    bad_position = copy.deepcopy(BASE)
    _node(bad_position, "gen")["position"] = {"x": "a", "y": 0}
    cases.append((bad_position, "position.x"))
    start_props = copy.deepcopy(BASE)
    _node(start_props, "start")["properties"] = {"A": "1"}
    cases.append((start_props, "properties を持てません"))
    dup_id = copy.deepcopy(BASE)
    _node(dup_id, "end")["id"] = "gen"
    cases.append((dup_id, "重複"))
    two_gen = copy.deepcopy(BASE)
    two_gen["nodes"].append(copy.deepcopy(_node(two_gen, "gen")) | {"id": "gen2"})
    cases.append((two_gen, "generative-ai ノードは 1 つ"))
    no_end = copy.deepcopy(BASE)
    no_end["nodes"] = [n for n in no_end["nodes"] if n["id"] != "end"]
    no_end["edges"] = [e for e in no_end["edges"] if e["target"] != "end"]
    cases.append((no_end, "end ノードは 1 つ"))
    no_start = copy.deepcopy(BASE)
    no_start["nodes"] = [n for n in no_start["nodes"] if n["id"] != "start"]
    no_start["edges"] = [e for e in no_start["edges"] if e["source"] != "start"]
    cases.append((no_start, "start ノードは 1 つ"))
    two_ret = copy.deepcopy(WITH_RETRIEVAL)
    two_ret["nodes"].append(copy.deepcopy(_node(two_ret, "ret")) | {"id": "ret2"})
    cases.append((two_ret, "retrieval ノードは 1 つまで"))
    unknown_end = _edit(BASE, edges=[{"source": "start", "target": "none"}])
    cases.append((unknown_end, "存在しないノード"))
    bad_edge = _edit(BASE, edges=[{"source": "start"}])
    cases.append((bad_edge, "source と target"))
    branch = copy.deepcopy(WITH_RETRIEVAL)
    branch["edges"].append({"source": "start", "target": "gen"})
    cases.append((branch, "複数の線は出せません"))
    merge = copy.deepcopy(WITH_RETRIEVAL)
    merge["edges"].append({"source": "start", "target": "end"})
    cases.append((merge, "つなぎ方が不正"))
    reversed_edges = _edit(
        BASE,
        edges=[
            {"source": "end", "target": "gen"},
            {"source": "gen", "target": "start"},
        ],
    )
    cases.append((reversed_edges, "つなぎ方が不正"))
    disconnected = _edit(BASE, edges=[{"source": "start", "target": "gen"}])
    cases.append((disconnected, "つなぎ方が不正"))
    skip_retrieval = copy.deepcopy(WITH_RETRIEVAL)
    skip_retrieval["edges"] = [
        {"source": "start", "target": "gen"},
        {"source": "gen", "target": "end"},
    ]
    cases.append((skip_retrieval, "つなぎ方が不正"))
    cycle = copy.deepcopy(BASE)
    cycle["edges"] = [
        {"source": "start", "target": "gen"},
        {"source": "gen", "target": "start"},
    ]
    cases.append((cycle, "輪"))
    output_with_retrieval = copy.deepcopy(WITH_RETRIEVAL)
    _node(output_with_retrieval, "gen")["outputType"] = 0
    cases.append((output_with_retrieval, "outputType は書けません"))
    bad_output = copy.deepcopy(BASE)
    _node(bad_output, "gen")["outputType"] = 1
    cases.append((bad_output, "outputType は 0 か 2"))
    output_on_start = copy.deepcopy(BASE)
    _node(output_on_start, "start")["outputType"] = 0
    cases.append((output_on_start, "generative-ai だけ"))
    return cases


@pytest.mark.parametrize(("data", "message"), _invalid_cases())
def test_parse_graph_rejects_invalid_definition(data: Any, message: str) -> None:
    """不正な定義を弾き、メッセージに、どの項目かが出ること"""
    with pytest.raises(GraphError, match=re.escape(message)):
        parse_graph(data)


def test_compile_graph_uses_normal_chat_without_retrieval() -> None:
    """検索なしは通常チャット（出力モード 0）の定義になり、プロパティが ID に直ること"""
    definition = compile_graph(parse_graph(graph_data()), {})

    assert definition.output_type == NORMAL_CHAT_OUTPUT_TYPE
    assert definition.retrieval is None
    assert definition.properties[PropertyIds.MODEL_NAME] == "echo"


def test_compile_graph_keeps_plain_answer_output_type() -> None:
    """生成AI ノードの outputType 2 が、回答の本文だけの出力モードになること"""
    data = graph_data()
    _node(data, "gen")["outputType"] = 2

    definition = compile_graph(parse_graph(data), {})

    assert definition.output_type == PLAIN_ANSWER_OUTPUT_TYPE


def test_compile_graph_sets_rag_output_type_with_retrieval() -> None:
    """検索ありは RAG（出力モード 1）の定義になり、検索のプロパティを持つこと"""
    definition = compile_graph(parse_graph(graph_data(retrieval=True)), {})

    assert definition.output_type == RAG_OUTPUT_TYPE
    assert definition.retrieval is not None
    assert (
        definition.retrieval.properties[RetrievalPropertyIds.VDB_TABLE_NAME]
        == "vectors"
    )


def test_compile_graph_expands_environment_references() -> None:
    """プロパティの `${名前}` が環境変数に展開されること"""
    data = graph_data(properties={**_echo(), "API_KEY": "${MY_KEY}"})

    definition = compile_graph(parse_graph(data), {"MY_KEY": "secret"})

    assert definition.properties[PropertyIds.API_KEY] == "secret"


def test_compile_graph_rejects_missing_environment_variable() -> None:
    """参照した環境変数がないと、ノードの名前つきで弾くこと"""
    data = graph_data(properties={**_echo(), "API_KEY": "${MISSING}"})

    with pytest.raises(GraphError, match=r"ノード「gen」.*MISSING"):
        compile_graph(parse_graph(data), {})


def test_compile_graph_rejects_unknown_property_with_node_name() -> None:
    """未知のプロパティを、ノードの名前つきで弾くこと"""
    data = graph_data(properties={**_echo(), "NOPE": "1"})

    with pytest.raises(GraphError, match=r"ノード「gen」.*NOPE"):
        compile_graph(parse_graph(data), {})


def test_compile_graph_rejects_retrieval_error_with_retrieval_node_name() -> None:
    """検索のプロパティの誤りは、検索ノードの名前つきで弾くこと"""
    data = graph_data(retrieval=True)
    _node(data, "ret")["properties"]["NOPE"] = "1"

    with pytest.raises(GraphError, match=r"ノード「ret」.*NOPE"):
        compile_graph(parse_graph(data), {})


def test_compile_graph_rejects_reserved_property() -> None:
    """エミュレーターが決めるプロパティ（OUTPUT_DIR）を弾くこと"""
    data = graph_data(properties={**_echo(), "OUTPUT_DIR": "/tmp"})

    with pytest.raises(GraphError, match="OUTPUT_DIR"):
        compile_graph(parse_graph(data), {})


def _echo() -> dict[str, str]:
    """echo のプロパティのコピーを返す。

    Returns
    -------
    dict[str, str]
        プロパティ。
    """
    return dict(ECHO_PROPERTIES)
