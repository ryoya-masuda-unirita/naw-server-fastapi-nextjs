"""ワークフローの作成・更新・削除と、サービス ID への登録。"""

import copy
import logging
import os
import re
import threading
from collections.abc import Callable, Mapping
from typing import Any

from waha_emulator.studio.graph import (
    GraphDefinition,
    GraphError,
    compile_graph,
    parse_graph,
)
from waha_emulator.studio.store import GraphStore
from waha_emulator.workflow_config import WorkflowDefinition
from waha_emulator.workflows.base import Workflow
from waha_emulator.workflows.registry import WorkflowRegistry

logger = logging.getLogger(__name__)

MASK = "********"
# 名前がこれらで終わるプロパティの値は、応答で伏せる（`MAX_TOKENS` のような設定値は伏せない）
SECRET_NAME_SUFFIXES = ("API_KEY", "PASSWORD", "SECRET", "TOKEN")
# 値が環境変数の参照 1 つだけのときは、秘密そのものではないので伏せない
ENV_REFERENCE_ONLY = re.compile(r"\$\{[A-Za-z_][A-Za-z0-9_]*\}")

WorkflowFactory = Callable[[GraphDefinition, WorkflowDefinition], Workflow]


class StudioNotFoundError(LookupError):
    """指定したワークフローがない。"""


class StudioConflictError(ValueError):
    """ワークフローの id、またはサービス ID が、他と重なっている。"""


def _is_secret_value(name: str, value: Any) -> bool:
    """伏せる値かを判定する（環境変数の参照だけの値は伏せない）。

    Parameters
    ----------
    name : str
        プロパティの名前。
    value : Any
        プロパティの値。

    Returns
    -------
    bool
        伏せるなら True。
    """
    if not name.upper().endswith(SECRET_NAME_SUFFIXES):
        return False
    return ENV_REFERENCE_ONLY.fullmatch(str(value)) is None


def mask_secrets(data: Mapping[str, Any]) -> dict[str, Any]:
    """定義の中の秘密情報を伏せたコピーを返す。

    Parameters
    ----------
    data : Mapping[str, Any]
        保存してある定義（JSON の値）。

    Returns
    -------
    dict[str, Any]
        API キー・パスワードなどを `********` にした定義。
    """
    masked = copy.deepcopy(dict(data))
    for node in masked.get("nodes", []):
        properties = node.get("properties", {})
        for name, value in properties.items():
            if _is_secret_value(name, value):
                properties[name] = MASK
    return masked


def restore_masked_values(data: Any, stored: Mapping[str, Any]) -> Any:
    """`********` のまま送られた値を、保存済みの値に戻す。

    定義の形が不正（オブジェクトでない・`nodes` が配列でないなど）なときは、
    何もせずそのまま返す（形の誤りは、`parse_graph` が 400 にする）。

    Parameters
    ----------
    data : Any
        送られた定義。
    stored : Mapping[str, Any]
        保存済みの定義。保存済みのものがなければ空。

    Returns
    -------
    Any
        伏せた値を保存済みの値に戻した定義のコピー。

    Raises
    ------
    GraphError
        伏せた値のまま送られたが、引き継ぐ保存済みの値がないとき。
    """
    if not isinstance(data, dict) or not isinstance(data.get("nodes"), list):
        return data
    restored = copy.deepcopy(data)
    stored_nodes = {
        n["id"]: n
        for n in stored.get("nodes", [])
        if isinstance(n, dict) and isinstance(n.get("id"), str)
    }
    for node in restored["nodes"]:
        properties = node.get("properties") if isinstance(node, dict) else None
        if not isinstance(properties, dict):
            continue
        node_id = node.get("id")
        previous = (
            stored_nodes.get(node_id, {}).get("properties", {})
            if isinstance(node_id, str)
            else {}
        )
        for name, value in properties.items():
            if value != MASK:
                continue
            if name not in previous:
                raise GraphError(
                    f"ノード「{node_id}」: {name} は伏せた値のままです。値を入れてください"
                )
            properties[name] = previous[name]
    return restored


class StudioService:
    """保存したワークフローを管理し、サービス ID で呼べるようにする。

    更新系は 1 つのロックで直列にする（サービス ID の重複確認がすり抜けないように）。
    """

    def __init__(
        self,
        store: GraphStore,
        registry: WorkflowRegistry,
        workflow_factory: WorkflowFactory,
        environ: Mapping[str, str] | None = None,
    ) -> None:
        """保存場所・レジストリ・ワークフローを作る関数を受け取る。

        Parameters
        ----------
        store : GraphStore
            保存場所。
        registry : WorkflowRegistry
            サービス ID → ワークフローの対応。
        workflow_factory : WorkflowFactory
            定義からワークフローを作る関数。
        environ : Mapping[str, str] | None
            環境変数（`${名前}` の展開に使う）。None なら os.environ。
        """
        self._store = store
        self._registry = registry
        self._factory = workflow_factory
        self._environ = os.environ if environ is None else environ
        self._lock = threading.Lock()
        self._raw: dict[str, dict[str, Any]] = {}
        self._graphs: dict[str, GraphDefinition] = {}

    def load(self) -> None:
        """保存されたワークフローを読み、登録する。

        不正なもの・サービス ID が他と重なるものは、警告ログを出して読み飛ばす。
        """
        with self._lock:
            for graph_id, data in self._store.load_all():
                try:
                    graph, definition = self._build(data)
                    if graph.id != graph_id:
                        raise GraphError(
                            f"id（{graph.id}）がファイル名（{graph_id}）と違います"
                        )
                    self._check_service_ids(graph)
                    workflow = self._factory(graph, definition)
                except (GraphError, StudioConflictError) as e:
                    logger.warning("Workflow skipped: id=%s, error=%s", graph_id, e)
                    continue
                self._activate(graph, workflow, data)

    def list_workflows(self) -> list[dict[str, Any]]:
        """ワークフローの一覧を返す。

        Returns
        -------
        list[dict[str, Any]]
            ID・名前・サービス ID（ID の順）。
        """
        with self._lock:
            return [
                {"id": g.id, "name": g.name, "serviceIds": list(g.service_ids)}
                for _, g in sorted(self._graphs.items())
            ]

    def get(self, graph_id: str) -> dict[str, Any]:
        """ワークフローの定義を、秘密情報を伏せて返す。

        Parameters
        ----------
        graph_id : str
            ワークフローの ID。

        Returns
        -------
        dict[str, Any]
            定義。

        Raises
        ------
        StudioNotFoundError
            ワークフローがないとき。
        """
        with self._lock:
            raw = self._raw.get(graph_id)
            if raw is None:
                raise StudioNotFoundError(graph_id)
            return mask_secrets(raw)

    def validate(self, data: Any) -> None:
        """保存せずに、定義が正しいかを確かめる。

        Parameters
        ----------
        data : Any
            定義（JSON の値）。

        Raises
        ------
        GraphError
            定義が不正なとき。
        StudioConflictError
            サービス ID が、他のワークフローと重なるとき。
        """
        with self._lock:
            graph, _ = self._build(self._resolve_masked(data))
            self._check_service_ids(graph)

    def create(self, data: Any) -> dict[str, Any]:
        """ワークフローを作り、すぐ呼べるようにする。

        Parameters
        ----------
        data : Any
            定義（JSON の値）。

        Returns
        -------
        dict[str, Any]
            作った定義（秘密情報を伏せたもの）。

        Raises
        ------
        GraphError
            定義が不正なとき。
        StudioConflictError
            id・サービス ID が他と重なるとき。
        """
        with self._lock:
            # 作成では引き継ぐ保存済みの値がないため、伏せた値のままの定義は弾く
            checked = restore_masked_values(data, {})
            graph, definition = self._build(checked)
            if graph.id in self._graphs or self._store.exists(graph.id):
                raise StudioConflictError(f"id「{graph.id}」は、すでにあります")
            self._check_service_ids(graph)
            # 失敗しうる処理（ワークフローの組み立て・保存）を、登録を変える前に済ませる
            workflow = self._factory(graph, definition)
            self._store.write(graph.id, checked)
            self._activate(graph, workflow, checked)
            return mask_secrets(checked)

    def update(self, graph_id: str, data: Any) -> dict[str, Any]:
        """ワークフローを更新し、すぐ反映する。

        Parameters
        ----------
        graph_id : str
            更新するワークフローの ID。
        data : Any
            定義（JSON の値）。伏せた値（`********`）は、保存済みの値を引き継ぐ。

        Returns
        -------
        dict[str, Any]
            更新した定義（秘密情報を伏せたもの）。

        Raises
        ------
        StudioNotFoundError
            ワークフローがないとき。
        GraphError
            定義が不正なとき・id が一致しないとき。
        StudioConflictError
            サービス ID が他と重なるとき。
        """
        with self._lock:
            if graph_id not in self._graphs:
                raise StudioNotFoundError(graph_id)
            restored = restore_masked_values(data, self._raw[graph_id])
            graph, definition = self._build(restored)
            if graph.id != graph_id:
                raise GraphError("本文の id が、パスの id と違います")
            self._check_service_ids(graph)
            # 失敗しうる処理（ワークフローの組み立て・保存）を、登録を変える前に済ませる。
            # 途中で失敗しても、元の保存と登録が残る
            workflow = self._factory(graph, definition)
            self._store.write(graph_id, restored)
            self._deactivate(graph_id)
            self._activate(graph, workflow, restored)
            return mask_secrets(restored)

    def delete(self, graph_id: str) -> None:
        """ワークフローを消し、サービス ID の登録を外す。

        Parameters
        ----------
        graph_id : str
            ワークフローの ID。

        Raises
        ------
        StudioNotFoundError
            ワークフローがないとき。
        """
        with self._lock:
            if graph_id not in self._graphs:
                raise StudioNotFoundError(graph_id)
            self._store.delete(graph_id)
            self._deactivate(graph_id)

    def _resolve_masked(self, data: Any) -> Any:
        """検証のとき、伏せた値を保存済みの値に戻す（保存済みのものがあれば）。

        Parameters
        ----------
        data : Any
            定義（JSON の値）。

        Returns
        -------
        Any
            戻した定義。保存済みの定義がなければ、そのまま。
        """
        graph_id = data.get("id") if isinstance(data, dict) else None
        stored = self._raw.get(graph_id, {}) if isinstance(graph_id, str) else {}
        return restore_masked_values(data, stored)

    def _build(self, data: Any) -> tuple[GraphDefinition, WorkflowDefinition]:
        """定義を検証し、アダプターを動かす定義にする。

        Parameters
        ----------
        data : Any
            定義（JSON の値）。

        Returns
        -------
        tuple[GraphDefinition, WorkflowDefinition]
            ワークフローの定義と、アダプターを動かす定義。

        Raises
        ------
        GraphError
            定義が不正なとき。
        """
        graph = parse_graph(data)
        return graph, compile_graph(graph, self._environ)

    def _check_service_ids(self, graph: GraphDefinition) -> None:
        """サービス ID が、他のワークフローと重ならないことを確かめる。

        Parameters
        ----------
        graph : GraphDefinition
            ワークフローの定義。

        Raises
        ------
        StudioConflictError
            他のワークフローが同じサービス ID を使っているとき。
        """
        for other in self._graphs.values():
            if other.id == graph.id:
                continue
            duplicated = set(other.service_ids) & set(graph.service_ids)
            if duplicated:
                raise StudioConflictError(
                    f"サービス ID {sorted(duplicated)} は、ワークフロー「{other.id}」が使っています"
                )

    def _activate(
        self, graph: GraphDefinition, workflow: Workflow, data: dict[str, Any]
    ) -> None:
        """ワークフローを覚え、サービス ID に登録する（失敗しない処理だけ）。

        Parameters
        ----------
        graph : GraphDefinition
            ワークフローの定義。
        workflow : Workflow
            組み立て済みのワークフロー。
        data : dict[str, Any]
            保存した定義（JSON の値）。
        """
        for service_id in graph.service_ids:
            if self._registry.has_registered(service_id):
                logger.warning(
                    "Saved workflow shadows a configured service: id=%s, serviceId=%s",
                    graph.id,
                    service_id,
                )
            self._registry.set_dynamic(service_id, workflow)
        self._graphs[graph.id] = graph
        self._raw[graph.id] = data

    def _deactivate(self, graph_id: str) -> None:
        """ワークフローのサービス ID の登録を外し、覚えているものを消す。

        Parameters
        ----------
        graph_id : str
            ワークフローの ID。
        """
        graph = self._graphs.pop(graph_id)
        self._raw.pop(graph_id, None)
        for service_id in graph.service_ids:
            self._registry.remove_dynamic(service_id)
