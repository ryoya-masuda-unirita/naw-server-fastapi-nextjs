import copy
import re
from typing import Any

import pytest
from generative_ai_adapter.constants import PropertyIds

from tests.studio_support import flow_data
from waha_emulator.studio.flow import (
    compile_flow,
    parse_flow,
    references,
    render,
    single_reference,
)
from waha_emulator.studio.validation import GraphError
from waha_emulator.workflow_config import (
    ECHO_PROPERTIES,
    NORMAL_CHAT_OUTPUT_TYPE,
    PLAIN_ANSWER_OUTPUT_TYPE,
)


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


def test_parse_flow_accepts_polish_workflow() -> None:
    """推敲のワークフロー（開始 → 下書き → 推敲 → 終了）を読めること"""
    flow = parse_flow(flow_data())

    assert [n.id for n in flow.nodes] == ["start", "draft", "polish", "end"]
    assert flow.next_id("start") == "draft"
    assert flow.next_id("end") is None
    assert flow.node("draft").config["outputType"] == PLAIN_ANSWER_OUTPUT_TYPE
    assert flow.node("polish").config["outputType"] == NORMAL_CHAT_OUTPUT_TYPE
    assert flow.node("polish").config["inheritContext"] is False


def test_parse_flow_accepts_template_node() -> None:
    """テンプレートのノードの出力を、あとのプロンプトで使えること"""
    data = flow_data()
    data["nodes"].insert(
        2,
        {
            "id": "wrap",
            "type": "template",
            "config": {"text": "【下書き】{{draft.text}}"},
        },
    )
    data["edges"] = [
        {"source": "start", "target": "draft"},
        {"source": "draft", "target": "wrap"},
        {"source": "wrap", "target": "polish"},
        {"source": "polish", "target": "end"},
    ]
    _node(data, "polish")["config"]["prompt"] = "直して: {{wrap.text}}"

    flow = parse_flow(data)

    assert flow.node("wrap").name == "wrap"


def test_parse_flow_accepts_spaces_inside_braces() -> None:
    """`{{ draft.text }}` のように、波括弧の中に空白があっても参照として読めること"""
    data = flow_data()
    _node(data, "polish")["config"]["prompt"] = "{{ draft.text }} と {{  question }}"

    parse_flow(data)


def _invalid_cases() -> list[tuple[Any, str]]:
    """不正な定義と、エラーメッセージに含まれる文字列の組を作る。

    Returns
    -------
    list[tuple[Any, str]]
        （不正な定義、メッセージの一部）。
    """
    base = flow_data()
    cases: list[tuple[Any, str]] = [
        ("not an object", "オブジェクト"),
        (_edit(base, version=1), "version"),
        (_edit(base, version=True), "version"),
        (_edit(base, unknown=1), "未知の項目"),
        (_edit(base, id="Upper"), "id は"),
        (_edit(base, name=""), "name"),
        (_edit(base, serviceIds=[]), "serviceIds"),
        (_edit(base, nodes="x"), "配列"),
        (_edit(base, edges="x"), "配列"),
    ]

    def variant(mutate: Any) -> dict[str, Any]:
        """コピーを作って、変更を加える。"""
        copied = copy.deepcopy(base)
        mutate(copied)
        return copied

    cases += [
        (variant(lambda d: d["nodes"][1].update(id="bad id")), "英数字"),
        (variant(lambda d: d["nodes"][1].update(id="a" * 65)), "英数字"),
        (variant(lambda d: d["nodes"][1].update(type="retrieval")), "type は"),
        (variant(lambda d: d["nodes"][1].update(extra=1)), "未知の項目"),
        (
            variant(
                lambda d: d["nodes"].__setitem__(2, {**d["nodes"][2], "id": "draft"})
            ),
            "重複",
        ),
        (
            variant(lambda d: d["nodes"][1].update(position={"x": "a", "y": 0})),
            "position.x",
        ),
        (variant(lambda d: d["nodes"][1].update(config="x")), "config はオブジェクト"),
        (
            variant(lambda d: _node(d, "draft")["config"].pop("prompt")),
            "config.prompt が必要",
        ),
        (variant(lambda d: _node(d, "draft")["config"].update(prompt="")), "prompt"),
        (
            variant(lambda d: _node(d, "draft")["config"].update(prompt="x" * 20001)),
            "prompt",
        ),
        (
            variant(lambda d: _node(d, "draft")["config"].update(outputType=1)),
            "outputType は 0 か 2",
        ),
        (
            variant(lambda d: _node(d, "draft")["config"].update(outputType=True)),
            "outputType は 0 か 2",
        ),
        (
            variant(lambda d: _node(d, "draft")["config"].update(inheritContext="yes")),
            "inheritContext",
        ),
        (
            variant(lambda d: _node(d, "draft")["config"].update(properties=[])),
            "properties",
        ),
        (variant(lambda d: _node(d, "draft")["config"].update(extra=1)), "未知の項目"),
        (variant(lambda d: _node(d, "start").update(config={"x": 1})), "未知の項目"),
        (
            variant(lambda d: _node(d, "end")["config"].pop("output")),
            "config.output が必要",
        ),
        (
            variant(lambda d: d["nodes"].append({"id": "s2", "type": "start"})),
            "start ノードは 1 つ",
        ),
        (variant(lambda d: d["nodes"].pop(0)), "start ノードは 1 つ"),
        (variant(lambda d: d["nodes"].pop()), "end ノードは 1 つ以上"),
    ]
    many = variant(lambda d: None)
    many["nodes"] += [
        {"id": f"t{i}", "type": "template", "config": {"text": "x"}} for i in range(50)
    ]
    cases.append((many, "50 個まで"))
    cases += [
        (
            variant(
                lambda d: d["edges"].__setitem__(
                    0, {"source": "start", "target": "none"}
                )
            ),
            "存在しないノード",
        ),
        (
            variant(lambda d: d["edges"].__setitem__(0, {"source": "start"})),
            "source と target",
        ),
        (
            variant(
                lambda d: d["edges"].append({"source": "polish", "target": "start"})
            ),
            "start ノードへ",
        ),
        (
            variant(lambda d: d["edges"].append({"source": "end", "target": "draft"})),
            "end ノードから",
        ),
        (
            variant(
                lambda d: d["edges"].append({"source": "start", "target": "polish"})
            ),
            "複数の線は出せません",
        ),
    ]
    cycle = variant(lambda d: None)
    cycle["edges"] = [
        {"source": "start", "target": "draft"},
        {"source": "draft", "target": "polish"},
        {"source": "polish", "target": "draft"},
    ]
    cases.append((cycle, "輪"))
    unreachable = variant(
        lambda d: d["nodes"].append(
            {"id": "lone", "type": "end", "config": {"output": "x"}}
        )
    )
    cases.append((unreachable, "到達できません"))
    dead_end = variant(lambda d: None)
    dead_end["edges"] = [
        {"source": "start", "target": "draft"},
        {"source": "draft", "target": "polish"},
    ]
    cases.append((dead_end, "行き止まり"))
    return cases


@pytest.mark.parametrize(("data", "message"), _invalid_cases())
def test_parse_flow_rejects_invalid_definition(data: Any, message: str) -> None:
    """不正な定義を弾き、メッセージに、どの項目かが出ること"""
    with pytest.raises(GraphError, match=re.escape(message)):
        parse_flow(data)


@pytest.mark.parametrize(
    ("node_id", "field", "template", "message"),
    [
        ("draft", "prompt", "{{polish.text}}", "より前に動きません"),
        ("draft", "prompt", "{{draft.text}}", "より前に動きません"),
        ("draft", "prompt", "{{nope.text}}", "ノード「nope」がありません"),
        ("draft", "prompt", "{{question.text}}", "ノード「question」がありません"),
        (
            "draft",
            "prompt",
            "{{answer}}",
            "使えるのは question・history・ノードID.text",
        ),
        ("draft", "prompt", "{{start.text}}", "出力を持たない"),
        ("end", "output", "{{end.text}}", "出力を持たない"),
        ("end", "output", "{{polish.answer}}", "使えるのは"),
    ],
)
def test_parse_flow_rejects_unusable_reference(
    node_id: str, field: str, template: str, message: str
) -> None:
    """使えない変数の参照を、どのノードのどの項目かを示して弾くこと"""
    data = flow_data()
    _node(data, node_id)["config"][field] = template

    with pytest.raises(GraphError, match=re.escape(message)) as error:
        parse_flow(data)

    assert f"ノード「{node_id}」" in str(error.value)
    assert field in str(error.value)


def test_compile_flow_builds_adapter_definition_per_llm_node() -> None:
    """生成AI ノードごとに、出力モードとプロパティを持つ定義を作ること"""
    plans = compile_flow(parse_flow(flow_data()), {})

    assert set(plans) == {"draft", "polish"}
    assert plans["draft"].output_type == PLAIN_ANSWER_OUTPUT_TYPE
    assert plans["polish"].output_type == NORMAL_CHAT_OUTPUT_TYPE
    assert plans["draft"].properties[PropertyIds.MODEL_NAME] == "echo"


def test_compile_flow_expands_environment_references() -> None:
    """プロパティの `${名前}` が環境変数に展開されること"""
    data = flow_data(properties={**ECHO_PROPERTIES, "API_KEY": "${MY_KEY}"})

    plans = compile_flow(parse_flow(data), {"MY_KEY": "secret"})

    assert plans["draft"].properties[PropertyIds.API_KEY] == "secret"


def test_compile_flow_rejects_missing_environment_variable_with_node_name() -> None:
    """参照した環境変数がないとき、どのノードかを示して弾くこと"""
    data = flow_data(properties={**ECHO_PROPERTIES, "API_KEY": "${MISSING}"})

    with pytest.raises(GraphError, match=r"ノード「draft」.*MISSING"):
        compile_flow(parse_flow(data), {})


def test_compile_flow_rejects_unknown_property_with_node_name() -> None:
    """未知のプロパティを、どのノードかを示して弾くこと"""
    data = flow_data()
    _node(data, "polish")["config"]["properties"]["NOPE"] = "1"

    with pytest.raises(GraphError, match=r"ノード「polish」.*NOPE"):
        compile_flow(parse_flow(data), {})


def test_render_replaces_variables() -> None:
    """変数を埋め、同じ変数を複数回使え、波括弧の中の空白を無視すること"""
    text = render("{{a}} と {{ a }} と {{b.text}}", {"a": "X", "b.text": "Y"})

    assert text == "X と X と Y"


def test_render_keeps_text_that_is_not_a_reference() -> None:
    """参照でない文字列（閉じていない波括弧、変数のない文字列）はそのまま残すこと"""
    assert render("{{未完 と {単一} と ふつう", {}) == "{{未完 と {単一} と ふつう"


def test_render_raises_key_error_for_missing_variable() -> None:
    """変数にない参照は KeyError になること（検証済みの定義では起きない）"""
    with pytest.raises(KeyError):
        render("{{none}}", {})


def test_render_does_not_expand_braces_inside_values() -> None:
    """変数の値に `{{x}}` があっても、もう一度は展開しないこと（値の中の波括弧を、そのまま出す）"""
    assert render("{{a}}", {"a": "{{b}}", "b": "NG"}) == "{{b}}"


def test_references_and_single_reference() -> None:
    """参照の一覧と、参照 1 つだけの判定ができること"""
    assert references("{{a}} {{ b.text }}") == ["a", "b.text"]
    assert single_reference("  {{ draft.text }} \n") == "draft.text"
    assert single_reference("{{a}} {{b}}") is None
    assert single_reference("前 {{a}}") is None
    assert single_reference("固定") is None
