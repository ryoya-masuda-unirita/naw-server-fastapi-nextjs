import copy
from collections.abc import AsyncIterator
from pathlib import Path

import httpx
import pytest

from tests.conftest import make_settings, running_emulator
from tests.studio_support import graph_data

ADMIN = "/admin/workflows"


@pytest.fixture
async def admin(tmp_path: Path) -> AsyncIterator[httpx.AsyncClient]:
    """保存先を指定して起動したエミュレーターにつないだクライアント。

    Parameters
    ----------
    tmp_path : Path
        保存先。

    Yields
    ------
    httpx.AsyncClient
        クライアント。
    """
    async with running_emulator(make_settings(WAHA_STUDIO_DIR=str(tmp_path))) as (
        _,
        client,
    ):
        yield client


async def test_admin_api_is_disabled_without_studio_dir() -> None:
    """保存先を設定しないと、管理用 API が載らず 404 になること"""
    async with running_emulator() as (_, client):
        response = await client.get(ADMIN)

    assert response.status_code == 404


async def test_create_then_get_and_list(admin: httpx.AsyncClient) -> None:
    """作成すると 201 で定義が返り、取得・一覧で読めること"""
    created = await admin.post(ADMIN, json=graph_data("wf-1"))
    fetched = await admin.get(f"{ADMIN}/wf-1")
    listed = await admin.get(ADMIN)

    assert created.status_code == 201
    assert fetched.status_code == 200
    assert fetched.json()["id"] == "wf-1"
    assert listed.json() == [
        {"id": "wf-1", "name": "ワークフロー wf-1", "serviceIds": ["wf-1"]}
    ]


async def test_create_invalid_definition_returns_400_with_reason(
    admin: httpx.AsyncClient,
) -> None:
    """不正な定義は 400 になり、理由が detail に入ること"""
    data = graph_data("wf-1")
    data["edges"] = []

    response = await admin.post(ADMIN, json=data)

    assert response.status_code == 400
    assert "つなぎ方が不正" in response.json()["detail"]


async def test_create_duplicate_returns_409(admin: httpx.AsyncClient) -> None:
    """id の重複とサービス ID の重複は 409 になること"""
    await admin.post(ADMIN, json=graph_data("wf-1", service_ids=["svc"]))

    same_id = await admin.post(ADMIN, json=graph_data("wf-1", service_ids=["x"]))
    same_service = await admin.post(ADMIN, json=graph_data("wf-2", service_ids=["svc"]))

    assert same_id.status_code == 409
    assert same_service.status_code == 409


async def test_validate_endpoint_does_not_save(admin: httpx.AsyncClient) -> None:
    """検証は ok を返すだけで保存せず、不正は 400 になること（{id} のパスと衝突しないこと）"""
    ok = await admin.post(f"{ADMIN}/validate", json=graph_data("wf-1"))
    broken = copy.deepcopy(graph_data("wf-1"))
    broken["nodes"] = []
    bad = await admin.post(f"{ADMIN}/validate", json=broken)
    listed = await admin.get(ADMIN)

    assert ok.status_code == 200
    assert ok.json() == {"ok": True}
    assert bad.status_code == 400
    assert listed.json() == []


async def test_get_unknown_returns_404(admin: httpx.AsyncClient) -> None:
    """ないワークフローの取得・更新・削除は 404 になること"""
    get = await admin.get(f"{ADMIN}/none")
    put = await admin.put(f"{ADMIN}/none", json=graph_data("none"))
    delete = await admin.delete(f"{ADMIN}/none")

    assert (get.status_code, put.status_code, delete.status_code) == (404, 404, 404)


async def test_update_and_delete(admin: httpx.AsyncClient) -> None:
    """更新で内容が変わり、削除で消えること"""
    await admin.post(ADMIN, json=graph_data("wf-1"))
    changed = graph_data("wf-1", service_ids=["renamed"])

    updated = await admin.put(f"{ADMIN}/wf-1", json=changed)
    deleted = await admin.delete(f"{ADMIN}/wf-1")
    after = await admin.get(f"{ADMIN}/wf-1")

    assert updated.status_code == 200
    assert updated.json()["serviceIds"] == ["renamed"]
    assert deleted.status_code == 204
    assert after.status_code == 404


async def test_update_with_mismatched_id_returns_400(admin: httpx.AsyncClient) -> None:
    """本文の id とパスの id が違う更新は 400 になること"""
    await admin.post(ADMIN, json=graph_data("wf-1"))

    response = await admin.put(f"{ADMIN}/wf-1", json=graph_data("wf-2"))

    assert response.status_code == 400


async def test_responses_mask_secrets(admin: httpx.AsyncClient) -> None:
    """作成・取得の応答で、API キーが伏せられること"""
    properties = {
        "VENDOR": "Echo",
        "URL": "http://echo.invalid",
        "API_KEY": "real-secret",
        "MODEL_NAME": "echo",
    }

    created = await admin.post(ADMIN, json=graph_data("wf-1", properties=properties))
    fetched = await admin.get(f"{ADMIN}/wf-1")

    assert "real-secret" not in created.text
    assert "real-secret" not in fetched.text


@pytest.mark.parametrize("body", [[], {"nodes": 5}, {"id": [1]}])
async def test_malformed_body_returns_400_not_500(
    admin: httpx.AsyncClient, body: object
) -> None:
    """形が壊れた本文は、作成・更新・検証のどれでも 500 でなく 400 になること"""
    await admin.post(ADMIN, json=graph_data("wf-1"))

    post = await admin.post(ADMIN, json=body)
    put = await admin.put(f"{ADMIN}/wf-1", json=body)
    validate = await admin.post(f"{ADMIN}/validate", json=body)

    assert (post.status_code, put.status_code, validate.status_code) == (400, 400, 400)


async def test_property_catalog_lists_names_for_both_nodes(
    admin: httpx.AsyncClient,
) -> None:
    """プロパティ名の候補が、生成AI・検索ごとに返り、秘密の名前に印が付くこと"""
    response = await admin.get("/admin/property-catalog")

    body = response.json()
    generative = {e["name"]: e["secret"] for e in body["generativeAi"]}
    retrieval = {e["name"]: e["secret"] for e in body["retrieval"]}
    assert response.status_code == 200
    assert generative["API_KEY"] is True
    assert generative["MODEL_NAME"] is False
    assert retrieval["VDB_PASSWORD"] is True
    assert "VDB_TABLE_NAME" in retrieval


async def test_property_catalog_excludes_reserved_names(
    admin: httpx.AsyncClient,
) -> None:
    """エミュレーターがジョブごとに決める名前は、候補に入らないこと"""
    body = (await admin.get("/admin/property-catalog")).json()

    generative = {e["name"] for e in body["generativeAi"]}
    retrieval = {e["name"] for e in body["retrieval"]}
    assert not generative & {
        "OUTPUT_DIR",
        "REASONING_OUTPUT_PATH",
        "TEXT_DATA_JSON_FILE_PATH",
    }
    assert not retrieval & {"OUTPUT_DIR", "TEXT_DATA_JSON_FILE_PATH"}


async def test_every_catalog_name_is_accepted_by_validation(
    admin: httpx.AsyncClient,
) -> None:
    """候補に出る名前は、検証で未知のプロパティとして弾かれないこと（候補と検証が食い違わない）"""
    body = (await admin.get("/admin/property-catalog")).json()
    unknown = "未知のプロパティ"

    for node_type, key in (
        ("generative-ai", "generativeAi"),
        ("retrieval", "retrieval"),
    ):
        for entry in body[key]:
            data = graph_data("wf-1", retrieval=node_type == "retrieval")
            node = next(n for n in data["nodes"] if n["type"] == node_type)
            node["properties"][entry["name"]] = "x"
            response = await admin.post("/admin/workflows/validate", json=data)
            detail = response.json().get("detail", "")
            assert unknown not in detail, (node_type, entry["name"], detail)
