"""ノードと線で組んだワークフローを動かす。"""

from collections.abc import Callable

from generative_ai_adapter.core_mappers import ChatRuntimeFactory
from generative_ai_core.retrieval.runtime import CoreRetrievalRuntime

from waha_emulator.studio.graph import (
    NODE_GENERATIVE_AI,
    NODE_RETRIEVAL,
    GraphDefinition,
)
from waha_emulator.workflow_config import WorkflowDefinition
from waha_emulator.workflows.base import WorkflowError, WorkflowRequest
from waha_emulator.workflows.generative_ai import (
    RETRIEVAL_FAILED_PREFIX,
    RETRIEVAL_OUTPUT_MISSING_MESSAGE,
    GenerativeAiWorkflow,
)


class GraphWorkflow:
    """（検索 →）生成AI の鎖を動かすワークフロー。

    最初の版は、鎖状のグラフを今の生成AIのワークフローに写して動かす
    （ジョブの扱い・ストリーム・アダプターの呼び方は今のまま）。
    """

    def __init__(
        self,
        graph: GraphDefinition,
        definition: WorkflowDefinition,
        chat_runtime_factory: ChatRuntimeFactory | None = None,
        retrieval_runtime_factory: Callable[[], CoreRetrievalRuntime] | None = None,
    ) -> None:
        """定義を受け取る。

        Parameters
        ----------
        graph : GraphDefinition
            ワークフローの定義（失敗理由に使うノードの名前を持つ）。
        definition : WorkflowDefinition
            `compile_graph` で作った、アダプターを動かす定義。
        chat_runtime_factory : ChatRuntimeFactory | None
            core の chat を作る処理（テストでプロバイダを差し替える）。
        retrieval_runtime_factory : Callable[[], CoreRetrievalRuntime] | None
            core の検索を作る処理（テストで差し替える）。
        """
        self.graph = graph
        self._workflow = GenerativeAiWorkflow(
            definition, chat_runtime_factory, retrieval_runtime_factory
        )

    async def run(self, request: WorkflowRequest) -> str:
        """ワークフローを動かし、outputfile の中身を返す。

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
            ノードの実行が失敗したとき（メッセージの頭に、失敗したノードの名前を付ける）。
        """
        try:
            return await self._workflow.run(request)
        except WorkflowError as e:
            message = str(e)
            is_retrieval = message.startswith(RETRIEVAL_FAILED_PREFIX) or (
                message == RETRIEVAL_OUTPUT_MISSING_MESSAGE
            )
            node_type = NODE_RETRIEVAL if is_retrieval else NODE_GENERATIVE_AI
            node = self.graph.node_of_type(node_type)
            label = node.name if node is not None else node_type
            raise WorkflowError(f"ノード「{label}」: {e}") from e
