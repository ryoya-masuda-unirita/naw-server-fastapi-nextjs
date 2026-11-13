"""サービス ID とパラメータからワークフローを選ぶ。"""

from collections.abc import Mapping

from waha_emulator.workflows import unsupported
from waha_emulator.workflows.base import Workflow

# server-local の WahaClient が学習（execute_learning）・同期（execute_sync）で送る
# パラメータ。削除はパラメータなしで呼ばれるため、ここでは見分けられない
LEARNING_PARAMS = frozenset({"splitLength", "filepath"})
SYNC_PARAMS = frozenset({"start", "end"})


class WorkflowRegistry:
    """サービス ID からワークフローを選ぶ。

    ワークフローの設定（WAHA_WORKFLOWS_FILE）の `services` をサービス ID ごとに
    登録し、それ以外は既定（`default`）を使う。
    """

    def __init__(
        self, default: Workflow, by_service_id: Mapping[str, Workflow] | None = None
    ) -> None:
        """既定のワークフローと、サービス ID ごとのワークフローを受け取る。

        Parameters
        ----------
        default : Workflow
            登録のないサービス ID で使うワークフロー。
        by_service_id : Mapping[str, Workflow] | None
            サービス ID ごとのワークフロー。
        """
        self._default = default
        self._by_service_id: dict[str, Workflow] = dict(by_service_id or {})

    def register(self, service_id: str, workflow: Workflow) -> None:
        """サービス ID にワークフローを登録する。

        Parameters
        ----------
        service_id : str
            サービス ID。
        workflow : Workflow
            ワークフロー。
        """
        self._by_service_id[service_id] = workflow

    def resolve(self, service_id: str, params: Mapping[str, str]) -> Workflow:
        """ワークフローを選ぶ（登録 → 学習 → 同期 → 既定の順）。

        Parameters
        ----------
        service_id : str
            execute のサービス ID。
        params : Mapping[str, str]
            execute のクエリパラメータ。

        Returns
        -------
        Workflow
            ワークフロー。
        """
        registered = self._by_service_id.get(service_id)
        if registered is not None:
            return registered
        if LEARNING_PARAMS & params.keys():
            return unsupported.LEARNING
        if SYNC_PARAMS & params.keys():
            return unsupported.SYNC
        return self._default
