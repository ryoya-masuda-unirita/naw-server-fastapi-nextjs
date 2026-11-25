import logging
from pathlib import Path
from typing import Any

import pytest

from tests.studio_support import graph_data
from waha_emulator.studio.graph import GraphDefinition, GraphError
from waha_emulator.studio.graph_workflow import GraphWorkflow
from waha_emulator.studio.service import (
    MASK,
    StudioConflictError,
    StudioNotFoundError,
    StudioService,
    mask_secrets,
)
from waha_emulator.studio.store import GraphStore
from waha_emulator.workflow_config import WorkflowDefinition
from waha_emulator.workflows.base import Workflow
from waha_emulator.workflows.registry import WorkflowRegistry


class _Fixed:
    """設定ファイルの定義の代わりに置く、決まった名前のワークフロー。"""

    def __init__(self, name: str) -> None:
        """名前を受け取る。

        Parameters
        ----------
        name : str
            ワークフローの名前。
        """
        self.name = name

    async def run(self, request: Any) -> str:
        """使わない。

        Parameters
        ----------
        request : Any
            使わない。

        Returns
        -------
        str
            名前。
        """
        return self.name


def _factory(graph: GraphDefinition, definition: WorkflowDefinition) -> Workflow:
    """テスト用に、定義から GraphWorkflow を作る。

    Parameters
    ----------
    graph : GraphDefinition
        ワークフローの定義。
    definition : WorkflowDefinition
        アダプターを動かす定義。

    Returns
    -------
    Workflow
        ワークフロー。
    """
    return GraphWorkflow(graph, definition)


def _service(
    tmp_path: Path, environ: dict[str, str] | None = None
) -> tuple[StudioService, WorkflowRegistry]:
    """保存場所・レジストリ・管理を作る。

    Parameters
    ----------
    tmp_path : Path
        保存先。
    environ : dict[str, str] | None
        環境変数。

    Returns
    -------
    tuple[StudioService, WorkflowRegistry]
        管理と、そのレジストリ。
    """
    registry = WorkflowRegistry(_Fixed("default"), {"shared": _Fixed("config")})
    service = StudioService(GraphStore(tmp_path), registry, _factory, environ or {})
    return service, registry


def _resolved(registry: WorkflowRegistry, service_id: str) -> Workflow:
    """サービス ID に当たるワークフローを返す。

    Parameters
    ----------
    registry : WorkflowRegistry
        レジストリ。
    service_id : str
        サービス ID。

    Returns
    -------
    Workflow
        ワークフロー。
    """
    return registry.resolve(service_id, {})


def test_service_create_registers_service_ids(tmp_path: Path) -> None:
    """作成した直後に、サービス ID でそのワークフローが選ばれること"""
    service, registry = _service(tmp_path)

    service.create(graph_data("wf-1", service_ids=["a", "b"]))

    assert isinstance(_resolved(registry, "a"), GraphWorkflow)
    assert isinstance(_resolved(registry, "b"), GraphWorkflow)
    assert service.list_workflows() == [
        {"id": "wf-1", "name": "ワークフロー wf-1", "serviceIds": ["a", "b"]}
    ]


def test_service_create_rejects_invalid_definition(tmp_path: Path) -> None:
    """不正な定義は保存も登録もしないこと"""
    service, registry = _service(tmp_path)
    data = graph_data("wf-1")
    data["edges"] = []

    with pytest.raises(GraphError):
        service.create(data)

    assert service.list_workflows() == []
    assert list(tmp_path.iterdir()) == []
    assert not isinstance(_resolved(registry, "wf-1"), GraphWorkflow)


def test_service_rejects_duplicate_id(tmp_path: Path) -> None:
    """同じ id で作ると競合になり、元の定義が変わらないこと"""
    service, _ = _service(tmp_path)
    service.create(graph_data("wf-1"))

    with pytest.raises(StudioConflictError, match="wf-1"):
        service.create(graph_data("wf-1", service_ids=["other"]))

    assert service.get("wf-1")["serviceIds"] == ["wf-1"]


def test_service_rejects_duplicate_service_id(tmp_path: Path) -> None:
    """他のワークフローと同じサービス ID は競合になり、保存も登録も変わらないこと"""
    service, registry = _service(tmp_path)
    service.create(graph_data("wf-1", service_ids=["svc"]))

    with pytest.raises(StudioConflictError, match="svc"):
        service.create(graph_data("wf-2", service_ids=["svc"]))

    assert [p.name for p in tmp_path.iterdir()] == ["wf-1.json"]
    assert service.list_workflows() == [
        {"id": "wf-1", "name": "ワークフロー wf-1", "serviceIds": ["svc"]}
    ]
    assert isinstance(_resolved(registry, "svc"), GraphWorkflow)


def test_service_update_replaces_service_ids(tmp_path: Path) -> None:
    """更新で外したサービス ID が呼べなくなり、増やしたものが呼べること"""
    service, registry = _service(tmp_path)
    service.create(graph_data("wf-1", service_ids=["old"]))

    service.update("wf-1", graph_data("wf-1", service_ids=["new"]))

    assert _resolved(registry, "old") is registry.resolve("none", {})
    assert isinstance(_resolved(registry, "new"), GraphWorkflow)


def test_service_update_unknown_id_is_not_found(tmp_path: Path) -> None:
    """ないワークフローの更新は、見つからないエラーになること"""
    service, _ = _service(tmp_path)

    with pytest.raises(StudioNotFoundError):
        service.update("none", graph_data("none"))


def test_service_update_rejects_id_mismatch(tmp_path: Path) -> None:
    """本文の id がパスの id と違うと弾き、元の定義が残ること"""
    service, _ = _service(tmp_path)
    service.create(graph_data("wf-1"))

    with pytest.raises(GraphError, match="id が"):
        service.update("wf-1", graph_data("wf-2"))

    assert service.get("wf-1")["id"] == "wf-1"


def test_service_update_keeps_old_on_invalid_definition(tmp_path: Path) -> None:
    """不正な定義での更新は、元の保存と登録を変えないこと"""
    service, registry = _service(tmp_path)
    service.create(graph_data("wf-1", service_ids=["svc"]))
    broken = graph_data("wf-1", service_ids=["svc2"])
    broken["edges"] = []

    with pytest.raises(GraphError):
        service.update("wf-1", broken)

    assert service.get("wf-1")["serviceIds"] == ["svc"]
    assert isinstance(_resolved(registry, "svc"), GraphWorkflow)


def test_service_delete_falls_back_to_config(tmp_path: Path) -> None:
    """削除すると、設定ファイルの同じサービス ID の定義に戻ること"""
    service, registry = _service(tmp_path)
    config_workflow = _resolved(registry, "shared")
    service.create(graph_data("wf-1", service_ids=["shared"]))
    assert isinstance(_resolved(registry, "shared"), GraphWorkflow)

    service.delete("wf-1")

    assert _resolved(registry, "shared") is config_workflow
    assert list(tmp_path.iterdir()) == []


def test_service_delete_unknown_id_is_not_found(tmp_path: Path) -> None:
    """ないワークフローの削除は、見つからないエラーになること"""
    service, _ = _service(tmp_path)

    with pytest.raises(StudioNotFoundError):
        service.delete("none")


def test_service_masks_secrets_and_keeps_masked_on_update(tmp_path: Path) -> None:
    """取得で API キーが伏せられ、伏せた値のまま更新しても保存済みの値が残ること"""
    service, _ = _service(tmp_path)
    properties = {
        "VENDOR": "Echo",
        "URL": "http://echo.invalid",
        "API_KEY": "real-secret",
        "MODEL_NAME": "echo",
    }
    created = service.create(graph_data("wf-1", properties=properties))
    gen = next(n for n in service.get("wf-1")["nodes"] if n["id"] == "gen")
    assert created["nodes"][1]["properties"]["API_KEY"] == MASK
    assert gen["properties"]["API_KEY"] == MASK
    assert gen["properties"]["URL"] == "http://echo.invalid"

    masked = service.get("wf-1")
    masked["name"] = "改名"
    service.update("wf-1", masked)

    stored = (tmp_path / "wf-1.json").read_text(encoding="utf-8")
    assert "real-secret" in stored
    assert "改名" in stored


def test_service_does_not_mask_environment_reference(tmp_path: Path) -> None:
    """`${名前}` だけの値は、秘密ではないので伏せないこと"""
    service, _ = _service(tmp_path, {"KEY": "k"})
    properties = {
        "VENDOR": "Echo",
        "URL": "http://echo.invalid",
        "API_KEY": "${KEY}",
        "MODEL_NAME": "echo",
    }

    service.create(graph_data("wf-1", properties=properties))

    gen = next(n for n in service.get("wf-1")["nodes"] if n["id"] == "gen")
    assert gen["properties"]["API_KEY"] == "${KEY}"


def test_service_update_rejects_masked_value_without_stored_one(
    tmp_path: Path,
) -> None:
    """伏せた値のまま送られたが、引き継ぐ保存済みの値がないと弾くこと"""
    service, _ = _service(tmp_path)
    service.create(graph_data("wf-1"))
    data = graph_data("wf-1")
    for node in data["nodes"]:
        if node["id"] == "gen":
            node["properties"]["PROXY_PASSWORD"] = MASK

    with pytest.raises(GraphError, match="伏せた値のまま"):
        service.update("wf-1", data)


def test_service_validate_does_not_save(tmp_path: Path) -> None:
    """検証だけでは、保存も登録もしないこと。重複は検証でも分かること"""
    service, registry = _service(tmp_path)
    service.create(graph_data("wf-1", service_ids=["svc"]))

    service.validate(graph_data("wf-2"))
    with pytest.raises(StudioConflictError):
        service.validate(graph_data("wf-2", service_ids=["svc"]))

    assert [p.name for p in tmp_path.iterdir()] == ["wf-1.json"]
    assert not isinstance(_resolved(registry, "wf-2"), GraphWorkflow)


def test_service_validate_accepts_own_service_ids(tmp_path: Path) -> None:
    """保存済みのワークフロー自身のサービス ID は、検証で競合にならないこと"""
    service, _ = _service(tmp_path)
    service.create(graph_data("wf-1", service_ids=["svc"]))

    service.validate(graph_data("wf-1", service_ids=["svc"]))


def test_service_load_registers_saved_workflows(tmp_path: Path) -> None:
    """起動時の読み込みで、保存済みのワークフローが呼べるようになること"""
    first, _ = _service(tmp_path)
    first.create(graph_data("wf-1", service_ids=["svc"]))

    second, registry = _service(tmp_path)
    second.load()

    assert isinstance(_resolved(registry, "svc"), GraphWorkflow)
    assert second.get("wf-1")["id"] == "wf-1"


def test_service_load_skips_invalid_and_duplicates(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    """起動時の読み込みで、不正・ファイル名と id が違う・サービス ID が重なるものを読み飛ばすこと"""
    store = GraphStore(tmp_path)
    store.write("a-ok", graph_data("a-ok", service_ids=["svc"]))
    broken = graph_data("b-broken")
    broken["edges"] = []
    store.write("b-broken", broken)
    store.write("c-mismatch", graph_data("other"))
    store.write("d-dup", graph_data("d-dup", service_ids=["svc"]))
    service, _ = _service(tmp_path)

    with caplog.at_level(logging.WARNING):
        service.load()

    assert [w["id"] for w in service.list_workflows()] == ["a-ok"]
    assert "b-broken" in caplog.text
    assert "c-mismatch" in caplog.text
    assert "d-dup" in caplog.text


@pytest.mark.parametrize(
    "body",
    [
        [],
        "text",
        {"nodes": 5},
        {"nodes": [{"id": [1], "properties": {"API_KEY": "********"}}]},
        {"id": [1]},
    ],
)
def test_service_rejects_malformed_body_with_graph_error(
    tmp_path: Path, body: Any
) -> None:
    """形が壊れた本文は、更新・検証・作成のどれでも、内部エラーでなく定義の不正として弾くこと"""
    service, _ = _service(tmp_path)
    service.create(graph_data("wf-1"))

    with pytest.raises(GraphError):
        service.update("wf-1", body)
    with pytest.raises(GraphError):
        service.validate(body)
    with pytest.raises(GraphError):
        service.create(body)


def test_service_create_rejects_masked_value(tmp_path: Path) -> None:
    """取得の応答（伏せた値）をそのまま作成に送ると、伏せた値を鍵として保存せずに弾くこと"""
    service, _ = _service(tmp_path)
    service.create(graph_data("wf-1"))
    copied = service.get("wf-1")
    copied["id"] = "wf-2"
    copied["serviceIds"] = ["wf-2"]

    with pytest.raises(GraphError, match="伏せた値のまま"):
        service.create(copied)

    assert [p.name for p in tmp_path.iterdir()] == ["wf-1.json"]


def test_service_update_is_atomic_when_workflow_build_fails(tmp_path: Path) -> None:
    """更新でワークフローの組み立てに失敗しても、元の保存・登録・一覧が残ること"""
    registry = WorkflowRegistry(_Fixed("default"))
    calls: list[int] = []

    def flaky(graph: GraphDefinition, definition: WorkflowDefinition) -> Workflow:
        calls.append(1)
        if len(calls) > 1:
            raise RuntimeError("build failed")
        return GraphWorkflow(graph, definition)

    service = StudioService(GraphStore(tmp_path), registry, flaky, {})
    service.create(graph_data("wf-1", service_ids=["svc"]))

    with pytest.raises(RuntimeError, match="build failed"):
        service.update("wf-1", graph_data("wf-1", service_ids=["new"]))

    assert service.get("wf-1")["serviceIds"] == ["svc"]
    assert isinstance(_resolved(registry, "svc"), GraphWorkflow)
    assert not isinstance(_resolved(registry, "new"), GraphWorkflow)
    stored = (tmp_path / "wf-1.json").read_text(encoding="utf-8")
    assert '"svc"' in stored


def test_mask_secrets_by_name_suffix_and_full_reference() -> None:
    """名前が API_KEY などで終わる値だけ伏せ（MAX_TOKENS は伏せない）、参照以外が混ざる値も伏せること"""
    data = graph_data(
        properties={
            "VENDOR": "Echo",
            "URL": "http://echo.invalid",
            "API_KEY": "${PREFIX}sk-real${SUFFIX}",
            "MODEL_NAME": "echo",
            "MAX_TOKENS": "1024",
        }
    )

    gen = next(n for n in mask_secrets(data)["nodes"] if n["id"] == "gen")

    assert gen["properties"]["API_KEY"] == MASK
    assert gen["properties"]["MAX_TOKENS"] == "1024"


def test_service_warns_when_saved_workflow_shadows_config(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    """設定ファイルと同じサービス ID を保存すると、上書きすることを警告ログに出すこと"""
    service, _ = _service(tmp_path)

    with caplog.at_level(logging.WARNING):
        service.create(graph_data("wf-1", service_ids=["shared"]))

    assert "shadows a configured service" in caplog.text
