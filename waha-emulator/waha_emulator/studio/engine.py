"""版 2 のワークフローを動かす実行エンジン。

開始から、線をたどり、ノードを 1 つずつ動かす。ノードの出力は「変数の置き場」に入れ、
あとのノードのテンプレート（`{{ノードID.text}}`）が引く。生成AI の呼び出しは、
今の `GenerativeAiWorkflow`（アダプターを 1 回動かす）を、ノードごとに使う。
"""

import json
import logging
from collections.abc import Callable, Mapping
from dataclasses import replace

from generative_ai_adapter.core_mappers import ChatRuntimeFactory
from generative_ai_core.retrieval.runtime import CoreRetrievalRuntime

from waha_emulator.sessions import (
    SLOT_ATTACHMENT,
    SLOT_HISTORY,
    SLOT_QUESTION,
    SlotFile,
)
from waha_emulator.studio.flow import (
    MAX_NODES,
    NODE_END,
    NODE_LLM,
    NODE_TEMPLATE,
    OUTPUT_SUFFIX,
    VARIABLE_HISTORY,
    VARIABLE_QUESTION,
    FlowDefinition,
    FlowNode,
    render,
    single_reference,
)
from waha_emulator.workflow_config import (
    PLAIN_ANSWER_OUTPUT_TYPE,
    WorkflowDefinition,
)
from waha_emulator.workflows.base import WorkflowError, WorkflowRequest
from waha_emulator.workflows.generative_ai import (
    QUESTION_MISSING_MESSAGE,
    GenerativeAiWorkflow,
)

logger = logging.getLogger(__name__)

PROMPT_FILENAME = "question.txt"
TEXT_CONTENT_TYPE = "text/plain"
ANSWER_KEY = "answer"
NOT_UTF8_MESSAGE = "{name} が UTF-8 ではありません"
ANSWER_UNREADABLE_MESSAGE = "生成AIの出力から answer を読めません"
STEP_LIMIT_MESSAGE = "ノードの実行回数が上限（{limit}）を超えました"


def _decode(slot: SlotFile, name: str) -> str:
    """スロットのファイルを、UTF-8 の文字列にする。

    Parameters
    ----------
    slot : SlotFile
        スロットのファイル。
    name : str
        エラーメッセージに出すスロット名。

    Returns
    -------
    str
        文字列。

    Raises
    ------
    WorkflowError
        UTF-8 でないとき。
    """
    try:
        return slot.data.decode("utf-8")
    except UnicodeDecodeError as e:
        raise WorkflowError(NOT_UTF8_MESSAGE.format(name=name)) from e


def _answer_text(raw: str, definition: WorkflowDefinition) -> str:
    """生成AI の出力（生）から、回答の文字列を取り出す。

    Parameters
    ----------
    raw : str
        outputfile の中身（出力モード 2 は本文、0 は JSON）。
    definition : WorkflowDefinition
        その生成AI ノードを動かした定義（出力モードを持つ）。

    Returns
    -------
    str
        回答の文字列。

    Raises
    ------
    WorkflowError
        出力モード 0 の JSON から、`answer` を読めないとき。
    """
    if definition.output_type == PLAIN_ANSWER_OUTPUT_TYPE:
        return raw
    try:
        answer = json.loads(raw)[ANSWER_KEY]
    except (ValueError, KeyError, TypeError) as e:
        raise WorkflowError(ANSWER_UNREADABLE_MESSAGE) from e
    if not isinstance(answer, str):
        raise WorkflowError(ANSWER_UNREADABLE_MESSAGE)
    return answer


def _answer_json(answer: str) -> str:
    """回答の文字列から、チャットの回答の JSON（outputfile の形）を作る。

    Parameters
    ----------
    answer : str
        回答の文字列。

    Returns
    -------
    str
        `answer`・`filepaths`・`references`・`imageExplanations` を持つ JSON。
    """
    return json.dumps(
        {
            "answer": answer,
            "filepaths": [],
            "references": [],
            "imageExplanations": [],
        },
        ensure_ascii=False,
    )


class FlowWorkflow:
    """版 2 のワークフロー（開始から終了まで、ノードを順に動かす）。"""

    def __init__(
        self,
        flow: FlowDefinition,
        plans: Mapping[str, WorkflowDefinition],
        chat_runtime_factory: ChatRuntimeFactory | None = None,
        retrieval_runtime_factory: Callable[[], CoreRetrievalRuntime] | None = None,
    ) -> None:
        """定義を受け取る。

        Parameters
        ----------
        flow : FlowDefinition
            ワークフローの定義。
        plans : Mapping[str, WorkflowDefinition]
            生成AI ノードの ID → アダプターを動かす定義（`compile_flow` の結果）。
        chat_runtime_factory : ChatRuntimeFactory | None
            core の chat を作る処理（テストでプロバイダを差し替える）。
        retrieval_runtime_factory : Callable[[], CoreRetrievalRuntime] | None
            core の検索を作る処理（テストで差し替える）。
        """
        self.flow = flow
        self._plans = plans
        self._chat_runtime_factory = chat_runtime_factory
        self._retrieval_runtime_factory = retrieval_runtime_factory

    async def run(self, request: WorkflowRequest) -> str:
        """開始から終了まで動かし、outputfile の中身を返す。

        Parameters
        ----------
        request : WorkflowRequest
            入力。

        Returns
        -------
        str
            outputfile の中身。

        Raises
        ------
        WorkflowError
            入力が不正・ノードが失敗した・実行回数が上限を超えたとき
            （ノードの失敗は、メッセージの頭に、ノードの名前を付ける）。
        """
        variables = self._initial_variables(request)
        raw_outputs: dict[str, str] = {}
        current = self.flow.next_id(self.flow.start().id)
        for _ in range(MAX_NODES):
            if current is None:
                break
            node = self.flow.node(current)
            try:
                if node.type == NODE_END:
                    return self._finish(node, variables, raw_outputs)
                await self._run_node(node, request, variables, raw_outputs)
            except WorkflowError as e:
                raise WorkflowError(f"ノード「{node.name}」: {e}") from e
            except KeyError as e:
                # 検証済みの定義では起きない（変数の参照は、保存の時点で確かめている）
                raise WorkflowError(
                    f"ノード「{node.name}」: 変数 {e.args[0]} がありません"
                ) from e
            current = self.flow.next_id(node.id)
        raise WorkflowError(STEP_LIMIT_MESSAGE.format(limit=MAX_NODES))

    def _initial_variables(self, request: WorkflowRequest) -> dict[str, str]:
        """開始ノードが持つ変数（質問・会話履歴）を作る。

        Parameters
        ----------
        request : WorkflowRequest
            入力。

        Returns
        -------
        dict[str, str]
            変数の置き場。会話履歴がなければ、空の文字列。

        Raises
        ------
        WorkflowError
            質問がない・UTF-8 でないとき。
        """
        question = request.inputs.get(SLOT_QUESTION)
        if question is None:
            raise WorkflowError(QUESTION_MISSING_MESSAGE)
        history = request.inputs.get(SLOT_HISTORY)
        return {
            VARIABLE_QUESTION: _decode(question, SLOT_QUESTION),
            VARIABLE_HISTORY: "" if history is None else _decode(history, SLOT_HISTORY),
        }

    async def _run_node(
        self,
        node: FlowNode,
        request: WorkflowRequest,
        variables: dict[str, str],
        raw_outputs: dict[str, str],
    ) -> None:
        """生成AI・テンプレートのノードを 1 つ動かし、出力を変数に入れる。

        Parameters
        ----------
        node : FlowNode
            動かすノード。
        request : WorkflowRequest
            ワークフローへの入力。
        variables : dict[str, str]
            変数の置き場（出力を入れる）。
        raw_outputs : dict[str, str]
            生成AI ノードの出力（生）の置き場。
        """
        key = f"{node.id}{OUTPUT_SUFFIX}"
        if node.type == NODE_TEMPLATE:
            variables[key] = render(node.config["text"], variables)
            return
        if node.type != NODE_LLM:  # 検証済みの定義では、ここには来ない
            raise WorkflowError(f"動かせないノードの種類です: {node.type}")
        definition = self._plans[node.id]
        prompt = render(node.config["prompt"], variables)
        derived = replace(
            request,
            inputs=self._inputs_for(request, prompt, node.config["inheritContext"]),
        )
        workflow = GenerativeAiWorkflow(
            definition, self._chat_runtime_factory, self._retrieval_runtime_factory
        )
        raw = await workflow.run(derived)
        raw_outputs[node.id] = raw
        variables[key] = _answer_text(raw, definition)

    def _inputs_for(
        self, request: WorkflowRequest, prompt: str, inherit_context: bool
    ) -> dict[str, SlotFile]:
        """生成AI ノードに渡す入力スロットを作る。

        質問は、埋めたプロンプトに差し替える。会話履歴・添付ファイルは、
        `inheritContext` が true のときだけ渡す（textData は、いつも渡す）。

        Parameters
        ----------
        request : WorkflowRequest
            ワークフローへの入力。
        prompt : str
            埋めたプロンプト。
        inherit_context : bool
            会話履歴・添付ファイルも渡すか。

        Returns
        -------
        dict[str, SlotFile]
            入力スロット。
        """
        inputs = dict(request.inputs)
        inputs[SLOT_QUESTION] = SlotFile(
            PROMPT_FILENAME, TEXT_CONTENT_TYPE, prompt.encode("utf-8")
        )
        if not inherit_context:
            inputs.pop(SLOT_HISTORY, None)
            inputs.pop(SLOT_ATTACHMENT, None)
        return inputs

    def _finish(
        self,
        node: FlowNode,
        variables: Mapping[str, str],
        raw_outputs: Mapping[str, str],
    ) -> str:
        """終了ノードの出力を作る。

        出力が、生成AI ノードの `{{ノードID.text}}` 1 つだけなら、そのノードの出力（生）を
        そのまま返す（引用元などを失わない）。それ以外は、埋めた文字列を回答の JSON にする。

        Parameters
        ----------
        node : FlowNode
            終了ノード。
        variables : Mapping[str, str]
            変数の置き場。
        raw_outputs : Mapping[str, str]
            生成AI ノードの出力（生）の置き場。

        Returns
        -------
        str
            outputfile の中身。
        """
        output = node.config["output"]
        reference = single_reference(output)
        if reference is not None and reference.endswith(OUTPUT_SUFFIX):
            source_id = reference[: -len(OUTPUT_SUFFIX)]
            if source_id in raw_outputs:
                return raw_outputs[source_id]
        return _answer_json(render(output, variables))
