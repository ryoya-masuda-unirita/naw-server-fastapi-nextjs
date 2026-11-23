"""サービス ID とパラメータからワークフローを選ぶ。"""

import re
from collections.abc import Callable, Mapping
from http import HTTPStatus

from waha_emulator.errors import EmulatorError
from waha_emulator.workflows import unsupported
from waha_emulator.workflows.base import Workflow

# server-local の WahaClient が学習（execute_learning）・同期（execute_sync）で送る
# パラメータ。削除はパラメータなしで呼ばれるため、ここでは見分けられない
LEARNING_PARAMS = frozenset({"splitLength", "filepath"})
SYNC_PARAMS = frozenset({"start", "end"})
# ひな形の接尾辞は保存先のテーブル名（SQL）になるため、安全な文字だけにする。
# 大文字は、引用符なしのテーブル名が小文字になり、`HR` と `hr` が同じ保存先になるため認めない
TEMPLATE_NAME_PATTERN = re.compile(r"^[a-z0-9_]{1,40}$")
# ひな形から作ったワークフローを覚えておく数の上限。接尾辞を変えながら呼ばれても、
# 作ったワークフローが増え続けないようにする（超えたら古いものから捨てる）
MAX_TEMPLATE_WORKFLOWS = 256


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
        self._templates: dict[str, Callable[[str], Workflow]] = {}
        self._template_workflows: dict[str, Workflow] = {}

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

    def register_template(
        self, prefix: str, factory: Callable[[str], Workflow]
    ) -> None:
        """サービス ID の前の部分が決まっている「ひな形」を登録する。

        Parameters
        ----------
        prefix : str
            サービス ID の前の部分（例: `kb-learn-`）。後ろが接尾辞になる。
        factory : Callable[[str], Workflow]
            接尾辞からワークフローを作る関数。
        """
        self._templates[prefix] = factory

    def _resolve_template(self, service_id: str) -> Workflow | None:
        """ひな形に当てはまるサービス ID なら、接尾辞を入れたワークフローを返す。

        前の部分が重なるひな形は、長いほうを使う。作ったワークフローは、
        サービス ID に結びつけて使い回す（覚えておく数には上限がある）。

        Parameters
        ----------
        service_id : str
            execute のサービス ID。

        Returns
        -------
        Workflow | None
            ひな形に当てはまれば作ったワークフロー。当てはまらなければ None。

        Raises
        ------
        EmulatorError
            接尾辞が不正なとき（400）。保存先は作らない。
        """
        cached = self._template_workflows.get(service_id)
        if cached is not None:
            return cached
        matched = [
            prefix
            for prefix in self._templates
            if service_id.startswith(prefix) and len(service_id) > len(prefix)
        ]
        if not matched:
            return None
        prefix = max(matched, key=len)
        name = service_id[len(prefix) :]
        if TEMPLATE_NAME_PATTERN.fullmatch(name) is None:
            raise EmulatorError(
                HTTPStatus.BAD_REQUEST,
                "サービス ID の接尾辞が不正です（英小文字・数字・_ の 1〜40 文字）",
            )
        workflow = self._templates[prefix](name)
        if len(self._template_workflows) >= MAX_TEMPLATE_WORKFLOWS:
            self._template_workflows.pop(next(iter(self._template_workflows)))
        self._template_workflows[service_id] = workflow
        return workflow

    def resolve(self, service_id: str, params: Mapping[str, str]) -> Workflow:
        """ワークフローを選ぶ（登録 → ひな形 → 学習 → 同期 → 既定の順）。

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
        templated = self._resolve_template(service_id)
        if templated is not None:
            return templated
        if LEARNING_PARAMS & params.keys():
            return unsupported.LEARNING
        if SYNC_PARAMS & params.keys():
            return unsupported.SYNC
        return self._default
