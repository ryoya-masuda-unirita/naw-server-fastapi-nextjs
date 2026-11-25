import json
from dataclasses import dataclass, field
from typing import Any

import pytest
from generative_ai_core.chat.models import CoreChatRequest, CoreChatResult

from tests.conftest import ScriptedProvider
from tests.studio_support import flow_data
from waha_emulator.sessions import (
    SLOT_ATTACHMENT,
    SLOT_HISTORY,
    SLOT_QUESTION,
    SLOT_TEXTDATA,
    SlotFile,
)
from waha_emulator.studio.engine import FlowWorkflow
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


def _workflow(data: dict[str, Any], provider: ScriptedProvider) -> FlowWorkflow:
    """定義から、偽のプロバイダで動くワークフローを作る。

    Parameters
    ----------
    data : dict[str, Any]
        版 2 の定義。
    provider : ScriptedProvider
        偽のプロバイダ。

    Returns
    -------
    FlowWorkflow
        ワークフロー。
    """
    flow = parse_flow(data)
    return FlowWorkflow(flow, compile_flow(flow, {}), provider.chat_runtime_factory)


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
