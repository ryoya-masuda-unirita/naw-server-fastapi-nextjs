import json
from dataclasses import dataclass, field
from typing import Any

import pytest
from generative_ai_core.chat.models import CoreChatRequest, CoreChatResult

from tests.conftest import ScriptedProvider
from tests.studio_support import flow_data, rag_check_flow_data
from tests.test_retrieval_workflow import FakeSearchClient, _runtime_factory
from waha_emulator.sessions import (
    SLOT_ATTACHMENT,
    SLOT_HISTORY,
    SLOT_QUESTION,
    SLOT_TEXTDATA,
    SlotFile,
)
from waha_emulator.studio.engine import FlowWorkflow, _evaluate
from waha_emulator.studio.flow import compile_flow, parse_flow
from waha_emulator.workflows.base import WorkflowError, WorkflowRequest

QUESTION = "出張旅費の精算期限は？"
HISTORY = [
    {"role": "user", "content": "前の質問"},
    {"role": "assistant", "content": "前の回答"},
]


@dataclass
class SequenceProvider(ScriptedProvider):
    """呼び出しごとに、決めた回答を順に返す偽のプロバイダ。"""

    answers: list[str] = field(default_factory=list)

    def respond(self, request: CoreChatRequest) -> CoreChatResult:
        """今回の呼び出しの回答を決めてから、決まった動き（差分の送出・記録）に任せる。

        Parameters
        ----------
        request : CoreChatRequest
            core の chat のリクエスト。

        Returns
        -------
        CoreChatResult
            回答。
        """
        self.reasoning = [self.answers[len(self.received)]]
        return super().respond(request)


def _slot(data: str, filename: str = "x.txt") -> SlotFile:
    """文字列から、スロットのファイルを作る。

    Parameters
    ----------
    data : str
        中身。
    filename : str
        ファイル名。

    Returns
    -------
    SlotFile
        スロットのファイル。
    """
    return SlotFile(filename, "text/plain", data.encode())


def _request(inputs: dict[str, SlotFile] | None = None) -> WorkflowRequest:
    """ワークフローへの入力を作る（質問だけが既定）。

    Parameters
    ----------
    inputs : dict[str, SlotFile] | None
        入力スロット。None なら質問だけ。

    Returns
    -------
    WorkflowRequest
        入力。
    """
    return WorkflowRequest(
        service_id="flow",
        params={},
        inputs=inputs if inputs is not None else {SLOT_QUESTION: _slot(QUESTION)},
        stream=None,
    )


def _workflow(
    data: dict[str, Any],
    provider: ScriptedProvider,
    search: FakeSearchClient | None = None,
) -> FlowWorkflow:
    """定義から、偽のプロバイダ（と、あれば偽の検索）で動くワークフローを作る。

    Parameters
    ----------
    data : dict[str, Any]
        版 2 の定義。
    provider : ScriptedProvider
        偽のプロバイダ。
    search : FakeSearchClient | None
        偽のベクトル検索。None なら、検索を使わない。

    Returns
    -------
    FlowWorkflow
        ワークフロー。
    """
    flow = parse_flow(data)
    return FlowWorkflow(
        flow,
        compile_flow(flow, {}),
        provider.chat_runtime_factory,
        None if search is None else _runtime_factory(search),
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


async def test_run_chains_two_llm_nodes_with_previous_answer() -> None:
    """推敲: 2 回の生成AI が呼ばれ、2 回目のプロンプトに 1 回目の回答が入り、最終回答は 2 回目の回答になること"""
    provider = SequenceProvider(answers=["下書きの本文", "推敲した回答"])

    output = await _workflow(flow_data(), provider).run(_request())

    first, second = provider.received
    assert first.last_user_text() == f"{QUESTION} に回答してください"
    assert "下書きの本文" in second.last_user_text()
    assert second.last_user_text().startswith("次の下書きの誤りを直してください:")
    assert json.loads(output)["answer"] == "推敲した回答"


async def test_run_returns_last_llm_output_as_is_when_end_is_single_reference() -> None:
    """終了の出力が `{{生成AIノード.text}}` 1 つだけなら、そのノードの出力（回答の JSON）をそのまま返すこと"""
    provider = SequenceProvider(answers=["下書き", "最終"])

    output = await _workflow(flow_data(), provider).run(_request())

    assert json.loads(output) == {
        "answer": "最終",
        "filepaths": [],
        "references": [],
        "imageExplanations": [],
    }


async def test_run_returns_plain_text_when_end_references_plain_answer_node() -> None:
    """終了が、出力モード 2 のノードを直接参照するときは、そのノードの本文だけを返すこと（版 1 の出力モード 2 と同じ）"""
    data = flow_data()
    _node(data, "end")["config"]["output"] = "{{draft.text}}"
    data["nodes"] = [n for n in data["nodes"] if n["id"] != "polish"]
    data["edges"] = [
        {"source": "start", "target": "draft"},
        {"source": "draft", "target": "end"},
    ]
    provider = SequenceProvider(answers=["下書きの本文"])

    output = await _workflow(data, provider).run(_request())

    assert output == "下書きの本文"


async def test_run_builds_answer_json_when_end_output_is_composed_text() -> None:
    """終了の出力に文字が混ざるときは、埋めた文字列を、回答の JSON にすること"""
    data = flow_data()
    _node(data, "end")["config"]["output"] = (
        "結果: {{polish.text}}（下書き: {{draft.text}}）"
    )
    provider = SequenceProvider(answers=["下書き", "最終"])

    output = await _workflow(data, provider).run(_request())

    assert json.loads(output) == {
        "answer": "結果: 最終（下書き: 下書き）",
        "filepaths": [],
        "references": [],
        "imageExplanations": [],
    }


async def test_run_plain_answer_node_text_is_raw_and_json_node_text_is_answer() -> None:
    """出力モード 2 のノードは本文が、0 のノードは JSON の answer が、変数になること"""
    data = flow_data()
    _node(data, "end")["config"]["output"] = "[{{draft.text}}][{{polish.text}}]"
    provider = SequenceProvider(answers=["本文A", "本文B"])

    output = await _workflow(data, provider).run(_request())

    assert json.loads(output)["answer"] == "[本文A][本文B]"


async def test_run_template_node_output_is_usable_in_later_prompt() -> None:
    """テンプレートのノードの出力を、あとのプロンプトで使えること"""
    data = flow_data()
    data["nodes"].insert(
        2,
        {
            "id": "wrap",
            "type": "template",
            "config": {"text": "【参考】{{draft.text}}"},
        },
    )
    data["edges"] = [
        {"source": "start", "target": "draft"},
        {"source": "draft", "target": "wrap"},
        {"source": "wrap", "target": "polish"},
        {"source": "polish", "target": "end"},
    ]
    _node(data, "polish")["config"]["prompt"] = "直して: {{wrap.text}}"
    provider = SequenceProvider(answers=["下書き", "最終"])

    await _workflow(data, provider).run(_request())

    assert provider.received[1].last_user_text() == "直して: 【参考】下書き"


async def test_run_template_only_workflow_needs_no_llm() -> None:
    """生成AI がなく、テンプレートだけのワークフローが、質問から固定の文を作れること"""
    data = flow_data()
    data["nodes"] = [n for n in data["nodes"] if n["id"] not in ("draft", "polish")]
    data["nodes"].insert(
        1,
        {
            "id": "greet",
            "type": "template",
            "config": {"text": "ご質問「{{question}}」を承りました"},
        },
    )
    _node(data, "end")["config"]["output"] = "{{greet.text}}"
    data["edges"] = [
        {"source": "start", "target": "greet"},
        {"source": "greet", "target": "end"},
    ]
    provider = SequenceProvider()

    output = await _workflow(data, provider).run(_request())

    assert json.loads(output)["answer"] == f"ご質問「{QUESTION}」を承りました"
    assert provider.received == []


async def test_run_history_is_passed_only_when_inherit_context_is_true() -> None:
    """会話履歴は、inheritContext が true のノードにだけ渡り、false のノードには渡らないこと"""
    data = flow_data()
    _node(data, "polish")["config"]["inheritContext"] = True
    inputs = {
        SLOT_QUESTION: _slot(QUESTION),
        SLOT_HISTORY: _slot(json.dumps(HISTORY, ensure_ascii=False)),
    }
    provider = SequenceProvider(answers=["下書き", "最終"])

    await _workflow(data, provider).run(_request(inputs))

    without, with_history = provider.received
    assert len(without.messages) == 1
    assert len(with_history.messages) == len(HISTORY) + 1
    assert "前の質問" in str(with_history.messages[0])


async def test_run_history_variable_can_be_used_in_prompt() -> None:
    """`{{history}}` で、会話履歴を、プロンプトの文字列として使えること"""
    data = flow_data()
    _node(data, "draft")["config"]["prompt"] = "履歴: {{history}} / 質問: {{question}}"
    inputs = {SLOT_QUESTION: _slot(QUESTION), SLOT_HISTORY: _slot("H")}
    provider = SequenceProvider(answers=["a", "b"])

    await _workflow(data, provider).run(_request(inputs))

    assert provider.received[0].last_user_text() == f"履歴: H / 質問: {QUESTION}"


async def test_run_history_variable_is_empty_without_history() -> None:
    """会話履歴がないとき、`{{history}}` は空の文字列になること"""
    data = flow_data()
    _node(data, "draft")["config"]["prompt"] = "[{{history}}]{{question}}"
    provider = SequenceProvider(answers=["a", "b"])

    await _workflow(data, provider).run(_request())

    assert provider.received[0].last_user_text() == f"[]{QUESTION}"


async def test_run_always_passes_text_data_to_llm_nodes() -> None:
    """textData は、inheritContext に関係なく、生成AI ノードに渡ること（保存先の検証・ストリームの指定を失わない）"""
    inputs = {
        SLOT_QUESTION: _slot(QUESTION),
        SLOT_TEXTDATA: _slot(json.dumps({"createLibrary": False})),
        SLOT_ATTACHMENT: _slot("attachment-body", "a.txt"),
    }
    provider = SequenceProvider(answers=["a", "b"])

    output = await _workflow(flow_data(), provider).run(_request(inputs))

    assert json.loads(output)["answer"] == "b"


async def test_run_failure_prefixes_node_name() -> None:
    """生成AI の失敗理由に、ノードの名前が付き、そこで止まること"""
    provider = ScriptedProvider(reasoning=[], error=RuntimeError("boom"))

    with pytest.raises(
        WorkflowError, match=r"^ノード「下書き」: 生成AIアダプタの実行に失敗しました"
    ):
        await _workflow(flow_data(), provider).run(_request())

    assert len(provider.received) == 1


async def test_run_second_node_failure_names_second_node() -> None:
    """2 つ目の生成AI が失敗したら、その名前が付くこと（1 つ目の回答は、失敗にならない）"""

    @dataclass
    class FailOnSecond(SequenceProvider):
        """2 回目だけ失敗する偽のプロバイダ。"""

        def respond(self, request: CoreChatRequest) -> CoreChatResult:
            """2 回目の呼び出しで失敗する。

            Parameters
            ----------
            request : CoreChatRequest
                core の chat のリクエスト。

            Returns
            -------
            CoreChatResult
                1 回目の回答。

            Raises
            ------
            RuntimeError
                2 回目の呼び出しのとき。
            """
            if len(self.received) == 1:
                self.received.append(request)
                raise RuntimeError("second failed")
            return super().respond(request)

    provider = FailOnSecond(answers=["下書き"])

    with pytest.raises(
        WorkflowError, match=r"^ノード「推敲」: 生成AIアダプタの実行に失敗しました"
    ):
        await _workflow(flow_data(), provider).run(_request())


async def test_run_rejects_missing_question() -> None:
    """質問がない呼び出しを、質問がないという理由で失敗にすること"""
    with pytest.raises(WorkflowError, match="question がありません"):
        await _workflow(flow_data(), SequenceProvider()).run(_request({}))


async def test_run_rejects_question_that_is_not_utf8() -> None:
    """質問が UTF-8 でないとき、失敗にすること"""
    inputs = {SLOT_QUESTION: SlotFile("q.txt", "text/plain", b"\xff\xfe")}

    with pytest.raises(WorkflowError, match="UTF-8"):
        await _workflow(flow_data(), SequenceProvider()).run(_request(inputs))


async def test_run_fails_when_json_answer_is_unreadable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """出力モード 0 のノードの出力に answer がなければ、そのノードの失敗にすること"""

    class _BrokenLlm:
        """answer のない JSON を返す、生成AI のワークフロー。"""

        def __init__(self, *args: object) -> None:
            """引数は使わない。"""

        async def run(self, request: WorkflowRequest) -> str:
            """answer のない出力を返す。

            Parameters
            ----------
            request : WorkflowRequest
                使わない。

            Returns
            -------
            str
                answer のない JSON。
            """
            return '{"no": "answer"}'

    monkeypatch.setattr("waha_emulator.studio.engine.GenerativeAiWorkflow", _BrokenLlm)
    data = flow_data()
    _node(data, "draft")["config"]["outputType"] = 0
    flow = parse_flow(data)
    workflow = FlowWorkflow(flow, compile_flow(flow, {}))

    with pytest.raises(
        WorkflowError, match=r"ノード「下書き」: 生成AIの出力から answer を読めません"
    ):
        await workflow.run(_request())


async def test_run_rag_check_returns_answer_with_references_when_judge_says_ok() -> (
    None
):
    """根拠チェック: 判定が OK なら、引用元つきの回答が返り、判定のプロンプトに、検索した本文と回答が入ること"""
    provider = SequenceProvider(answers=["精算は5営業日以内です", "OK"])
    search = FakeSearchClient()

    output = await _workflow(rag_check_flow_data(), provider, search).run(_request())

    body = json.loads(output)
    assert body["answer"] == "精算は5営業日以内です"
    assert len(body["references"]) == 2
    assert len(search.calls) == 1
    judge_prompt = provider.received[1].last_user_text()
    assert "出張終了後5営業日以内に申請する" in judge_prompt
    assert "精算は5営業日以内です" in judge_prompt


async def test_run_rag_check_returns_fixed_text_when_judge_says_ng() -> None:
    """根拠チェック: 判定が NG なら、「いいえ」の終了の固定の文が、回答になること（引用元は付かない）"""
    provider = SequenceProvider(answers=["根拠のない回答", "NG"])

    output = await _workflow(rag_check_flow_data(), provider, FakeSearchClient()).run(
        _request()
    )

    assert json.loads(output) == {
        "answer": "根拠となる文書が見つからず、お答えできません",
        "filepaths": [],
        "references": [],
        "imageExplanations": [],
    }
    assert len(provider.received) == 2


async def test_run_branch_contains_ignores_case_and_surrounding_text() -> None:
    """条件分岐の「含む」は、大文字小文字を区別せず、前後に文字があっても「はい」になること"""
    provider = SequenceProvider(answers=["回答", "結論: ok です"])

    output = await _workflow(rag_check_flow_data(), provider, FakeSearchClient()).run(
        _request()
    )

    assert json.loads(output)["answer"] == "回答"


async def test_run_retrieval_variable_joins_contents_with_blank_line() -> None:
    """検索ノードの `{{ret.contexts_text}}` が、引用資料の本文を、空行で区切ってつないだ文字列になること"""
    data = rag_check_flow_data()
    end_ok = next(n for n in data["nodes"] if n["id"] == "end-ok")
    end_ok["config"]["output"] = "{{ret.contexts_text}}"
    provider = SequenceProvider(answers=["回答", "OK"])

    output = await _workflow(data, provider, FakeSearchClient()).run(_request())

    answer = json.loads(output)["answer"]
    first, second = answer.split("\n\n")
    assert "5営業日以内" in first
    assert second == "就業規則の抜粋。"


async def test_run_retrieval_failure_names_retrieval_node() -> None:
    """検索アダプターが失敗したら、検索ノードの名前が付いた失敗になり、生成AI は動かないこと"""

    class _BrokenSearch(FakeSearchClient):
        """検索で失敗する偽の DB。"""

        def search(self, *args: object, **kwargs: object) -> list:  # type: ignore[type-arg]
            """必ず失敗する。

            Parameters
            ----------
            *args : object
                使わない。
            **kwargs : object
                使わない。

            Raises
            ------
            RuntimeError
                常に。
            """
            raise RuntimeError("db down")

    provider = SequenceProvider(answers=["a", "b"])

    with pytest.raises(
        WorkflowError, match=r"^ノード「検索」: 検索アダプタの実行に失敗しました"
    ):
        await _workflow(rag_check_flow_data(), provider, _BrokenSearch()).run(
            _request()
        )

    assert provider.received == []


async def test_run_branch_on_empty_variable_takes_true_side() -> None:
    """演算子 empty は、変数が空のとき（会話履歴がない `{{history}}`）「はい」になること"""
    data = flow_data()
    data["nodes"] = [n for n in data["nodes"] if n["id"] not in ("draft", "polish")]
    data["nodes"][1:1] = [
        # 会話履歴がないとき {{history}} は空の文字列になる
        {"id": "blank", "type": "template", "config": {"text": "{{history}}"}},
        {
            "id": "check",
            "type": "branch",
            "config": {"variable": "blank.text", "operator": "empty"},
        },
        {"id": "end-yes", "type": "end", "config": {"output": "空でした"}},
    ]
    end = next(n for n in data["nodes"] if n["id"] == "end")
    end["config"]["output"] = "空ではありません"
    data["edges"] = [
        {"source": "start", "target": "blank"},
        {"source": "blank", "target": "check"},
        {"source": "check", "target": "end-yes", "sourceHandle": "true"},
        {"source": "check", "target": "end", "sourceHandle": "false"},
    ]

    output = await _workflow(data, SequenceProvider()).run(_request())

    assert json.loads(output)["answer"] == "空でした"


@pytest.mark.parametrize(
    ("operator", "actual", "expected", "result"),
    [
        ("contains", "結論は OK です", "ok", True),
        ("contains", "NG", "OK", False),
        ("equals", " ok \n", "OK", True),
        ("equals", "OK です", "OK", False),
        ("empty", "", "", True),
        ("empty", " \n ", "", True),
        ("empty", "x", "", False),
    ],
)
def test_evaluate_conditions(
    operator: str, actual: str, expected: str, result: bool
) -> None:
    """条件の判定: 含む・等しいは大文字小文字を区別せず、等しいは前後の空白を無視し、empty は空白だけも空とすること"""
    assert _evaluate(operator, actual, expected) is result


def test_evaluate_rejects_unknown_operator() -> None:
    """未対応の演算子は、失敗にすること（検証済みの定義では起きない）"""
    with pytest.raises(WorkflowError, match="未対応の演算子"):
        _evaluate("starts", "a", "b")
