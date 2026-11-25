"""版 2 のワークフローを動かす実行エンジン。

開始から、線をたどり、ノードを 1 つずつ動かす。ノードの出力は「変数の置き場」に入れ、
あとのノードのテンプレート（`{{ノードID.text}}`）が引く。生成AI・検索の呼び出しは、
今の `GenerativeAiWorkflow`（アダプターを 1 回動かす）を、ノードごとに使う。
条件分岐は、変数を調べて、「はい」「いいえ」のどちらの線をたどるかを決める。
"""

import asyncio
import json
import logging
import tempfile
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field, replace
from pathlib import Path

from generative_ai_adapter.constants import PropertyIds
from generative_ai_adapter.core_mappers import ChatRuntimeFactory
from generative_ai_core.retrieval.runtime import CoreRetrievalRuntime

from waha_emulator.sessions import (
    SLOT_ATTACHMENT,
    SLOT_HISTORY,
    SLOT_QUESTION,
    SlotFile,
)
from waha_emulator.studio.flow import (
    HANDLE_FALSE,
    HANDLE_TRUE,
    NODE_BRANCH,
    NODE_END,
    NODE_LLM,
    NODE_RETRIEVAL,
    NODE_TEMPLATE,
    OPERATOR_CONTAINS,
    OPERATOR_EMPTY,
    OPERATOR_EQUALS,
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
NO_END_MESSAGE = "終了ノードに着く前に、線がなくなりました"
RUN_DIR_PREFIX = "waha-flow-"
CONTEXTS_KEY = "contexts"
CONTENT_KEY = "content"
CONTEXTS_SEPARATOR = "\n\n"
CONTEXTS_VARIABLE_SUFFIX = ".contexts_text"
CONTEXTS_UNREADABLE_MESSAGE = "検索の出力（RAG Context JSON）を読めません"


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


@dataclass
class _RunState:
    """1 回の実行の途中の状態（変数の置き場・生成AI の出力（生）・検索の出力ファイル）。

    Attributes
    ----------
    variables : dict[str, str]
        変数の置き場（`question`・`ノードID.text` など → 値）。
    run_dir : Path
        この実行の作業ディレクトリ（検索の出力を置く。実行が終わると消える）。
    raw_outputs : dict[str, str]
        生成AI ノードの出力（生）。ノード ID → outputfile の中身。
    context_files : dict[str, Path]
        検索ノードが書いた RAG Context JSON。ノード ID → パス。
    """

    variables: dict[str, str]
    run_dir: Path
    raw_outputs: dict[str, str] = field(default_factory=dict)
    context_files: dict[str, Path] = field(default_factory=dict)


def _evaluate(operator: str, actual: str, expected: str) -> bool:
    """条件分岐の条件を調べる（大文字小文字は区別しない）。

    Parameters
    ----------
    operator : str
        演算子（`contains`・`equals`・`empty`）。
    actual : str
        調べる変数の値。
    expected : str
        比べる値（`empty` では使わない。そのままの文字列で、`{{...}}` は展開しない。
        前後の空白は無視する）。

    Returns
    -------
    bool
        条件に合えば True（「はい」）。

    Raises
    ------
    WorkflowError
        未対応の演算子のとき（検証済みの定義では起きない）。
    """
    if operator == OPERATOR_EMPTY:
        return not actual.strip()
    if operator == OPERATOR_CONTAINS:
        return expected.strip().lower() in actual.lower()
    if operator == OPERATOR_EQUALS:
        return actual.strip().lower() == expected.strip().lower()
    raise WorkflowError(f"未対応の演算子です: {operator}")


def _contexts_text(path: Path) -> str:
    """RAG Context JSON の、引用資料の本文を、1 つの文字列にまとめる。

    Parameters
    ----------
    path : Path
        検索ノードが書いた RAG Context JSON。

    Returns
    -------
    str
        各引用資料の本文（`content`）を、空行で区切ってつないだもの。

    Raises
    ------
    WorkflowError
        読めない・形が違うとき。
    """
    try:
        contexts = json.loads(path.read_text(encoding="utf-8"))[CONTEXTS_KEY]
    except (OSError, ValueError, KeyError, TypeError) as e:
        raise WorkflowError(CONTEXTS_UNREADABLE_MESSAGE) from e
    if not isinstance(contexts, list):
        raise WorkflowError(CONTEXTS_UNREADABLE_MESSAGE)
    return CONTEXTS_SEPARATOR.join(
        str(context.get(CONTENT_KEY, ""))
        for context in contexts
        if isinstance(context, dict)
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
        with tempfile.TemporaryDirectory(prefix=RUN_DIR_PREFIX) as directory:
            state = _RunState(variables, Path(directory))
            current = self.flow.next_id(self.flow.start().id)
            # 定義は、輪がなく、すべての道が終了に着くことを、保存の時点で確かめてある
            while current is not None:
                node = self.flow.node(current)
                try:
                    if node.type == NODE_END:
                        return self._finish(node, state)
                    handle = await self._run_node(node, request, state)
                except WorkflowError as e:
                    raise WorkflowError(f"ノード「{node.name}」: {e}") from e
                except KeyError as e:
                    # 検証済みの定義では起きない（変数の参照は、保存の時点で確かめている）
                    raise WorkflowError(
                        f"ノード「{node.name}」: 変数 {e.args[0]} がありません"
                    ) from e
                current = self.flow.next_id(node.id, handle)
        # 終了ノードに着かずに、線が尽きた（検証済みの定義では起きない）
        raise WorkflowError(NO_END_MESSAGE)

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
        self, node: FlowNode, request: WorkflowRequest, state: _RunState
    ) -> str | None:
        """終了以外のノードを 1 つ動かし、出力を変数に入れる。

        Parameters
        ----------
        node : FlowNode
            動かすノード。
        request : WorkflowRequest
            ワークフローへの入力。
        state : _RunState
            1 回の実行の途中の状態（出力を入れる）。

        Returns
        -------
        str | None
            条件分岐では、たどる線の出口（`true`・`false`）。それ以外は None。

        Raises
        ------
        WorkflowError
            ノードが失敗したとき・動かせない種類のとき。
        """
        if node.type == NODE_TEMPLATE:
            state.variables[f"{node.id}{OUTPUT_SUFFIX}"] = render(
                node.config["text"], state.variables
            )
        elif node.type == NODE_RETRIEVAL:
            await self._run_retrieval(node, request, state)
        elif node.type == NODE_LLM:
            await self._run_llm(node, request, state)
        elif node.type == NODE_BRANCH:
            actual = state.variables[node.config["variable"]]
            matched = _evaluate(node.config["operator"], actual, node.config["value"])
            return HANDLE_TRUE if matched else HANDLE_FALSE
        else:  # 検証済みの定義では、ここには来ない
            raise WorkflowError(f"動かせないノードの種類です: {node.type}")
        return None

    async def _run_retrieval(
        self, node: FlowNode, request: WorkflowRequest, state: _RunState
    ) -> None:
        """検索ノードを動かし、引用資料の本文を変数に、RAG Context JSON を作業ディレクトリに残す。

        Parameters
        ----------
        node : FlowNode
            検索ノード。
        request : WorkflowRequest
            ワークフローへの入力。
        state : _RunState
            1 回の実行の途中の状態。

        Raises
        ------
        WorkflowError
            検索アダプターが失敗した・出力を読めないとき。
        """
        query = render(node.config["query"], state.variables)
        node_dir = state.run_dir / node.id
        node_dir.mkdir()
        workflow = GenerativeAiWorkflow(
            self._plans[node.id],
            self._chat_runtime_factory,
            self._retrieval_runtime_factory,
        )
        path = await asyncio.to_thread(workflow.retrieve_into, request, query, node_dir)
        state.context_files[node.id] = path
        state.variables[f"{node.id}{CONTEXTS_VARIABLE_SUFFIX}"] = _contexts_text(path)

    async def _run_llm(
        self, node: FlowNode, request: WorkflowRequest, state: _RunState
    ) -> None:
        """生成AI ノードを動かし、回答を変数に入れる。

        検索ノードを紐づけている（`config.retrieval`）ときは、その検索の RAG Context JSON を、
        引用資料にして、RAG（出力モード 1）で回答させる。

        Parameters
        ----------
        node : FlowNode
            生成AI ノード。
        request : WorkflowRequest
            ワークフローへの入力。
        state : _RunState
            1 回の実行の途中の状態。

        Raises
        ------
        WorkflowError
            生成AI が失敗したとき・出力から回答を読めないとき。
        """
        definition = self._plans[node.id]
        link = node.config.get("retrieval")
        if link is not None:
            contexts = state.context_files[link]
            definition = replace(
                definition,
                rag_context_json=str(contexts),
                properties={
                    **definition.properties,
                    PropertyIds.RAG_CONTEXT_JSON_ALLOW_ROOT: str(contexts.parent),
                },
            )
        prompt = render(node.config["prompt"], state.variables)
        derived = replace(
            request,
            inputs=self._inputs_for(request, prompt, node.config["inheritContext"]),
        )
        workflow = GenerativeAiWorkflow(
            definition, self._chat_runtime_factory, self._retrieval_runtime_factory
        )
        raw = await workflow.run(derived)
        state.raw_outputs[node.id] = raw
        state.variables[f"{node.id}{OUTPUT_SUFFIX}"] = _answer_text(raw, definition)

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

    def _finish(self, node: FlowNode, state: _RunState) -> str:
        """終了ノードの出力を作る。

        出力が、生成AI ノードの `{{ノードID.text}}` 1 つだけなら、そのノードの出力（生）を
        そのまま返す（引用元などを失わない）。そのため、返る形は、そのノードの出力モードによる
        （0・1 は回答の JSON、2 は本文だけ。版 1 の出力モード 2 と同じ）。それ以外は、
        埋めた文字列を回答の JSON にする。

        Parameters
        ----------
        node : FlowNode
            終了ノード。
        state : _RunState
            1 回の実行の途中の状態。

        Returns
        -------
        str
            outputfile の中身。
        """
        output = node.config["output"]
        reference = single_reference(output)
        if reference is not None and reference.endswith(OUTPUT_SUFFIX):
            source_id = reference[: -len(OUTPUT_SUFFIX)]
            if source_id in state.raw_outputs:
                return state.raw_outputs[source_id]
        return _answer_json(render(output, state.variables))
