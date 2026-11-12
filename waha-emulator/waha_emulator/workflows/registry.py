from collections.abc import Mapping

from waha_emulator.workflows import unsupported
from waha_emulator.workflows.base import Workflow

# server-local の WahaClient が学習（execute_learning）・同期（execute_sync）で送る
# パラメータ。削除はパラメータなしで呼ばれるため、ここでは見分けられない
LEARNING_PARAMS = frozenset({"splitLength", "filepath"})
SYNC_PARAMS = frozenset({"start", "end"})


class WorkflowRegistry:
    """サービス ID からワークフローを選ぶ。

    後続の Issue でアダプタを差し込むときは、サービス ID ごとに register する。
    """

    def __init__(
        self, default: Workflow, by_service_id: Mapping[str, Workflow] | None = None
    ) -> None:
        self._default = default
        self._by_service_id: dict[str, Workflow] = dict(by_service_id or {})

    def register(self, service_id: str, workflow: Workflow) -> None:
        self._by_service_id[service_id] = workflow

    def resolve(self, service_id: str, params: Mapping[str, str]) -> Workflow:
        registered = self._by_service_id.get(service_id)
        if registered is not None:
            return registered
        if LEARNING_PARAMS & params.keys():
            return unsupported.LEARNING
        if SYNC_PARAMS & params.keys():
            return unsupported.SYNC
        return self._default
