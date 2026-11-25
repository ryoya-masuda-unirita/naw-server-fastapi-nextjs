"""ノードと線で組んだワークフローのテストで使う定義の作成。"""

import itertools
from typing import Any

from waha_emulator.workflow_config import ECHO_PROPERTIES

RETRIEVAL_PROPERTIES = {
    **ECHO_PROPERTIES,
    "VDB_VENDOR": "PostgreSQL(PGVector)",
    "VDB_URL": "db.invalid:5432",
    "VDB_USER_NAME": "user",
    "VDB_PASSWORD": "password",
    "VDB_DATABASE_NAME": "appdb",
    "VDB_TABLE_NAME": "vectors",
    "SEARCH_COUNT": "2",
}


def graph_data(
    graph_id: str = "wf-1",
    *,
    service_ids: list[str] | None = None,
    retrieval: bool = False,
    properties: dict[str, str] | None = None,
) -> dict[str, Any]:
    """鎖（開始 →（検索 →）生成AI → 終了）の定義を作る。

    Parameters
    ----------
    graph_id : str
        ワークフローの ID。
    service_ids : list[str] | None
        サービス ID。None なら ID と同じ名前 1 つ。
    retrieval : bool
        True なら検索ノードを入れる。
    properties : dict[str, str] | None
        生成AI ノードのプロパティ。None なら echo。

    Returns
    -------
    dict[str, Any]
        保存の形（JSON の値）の定義。
    """
    nodes: list[dict[str, Any]] = [
        {"id": "start", "type": "start", "position": {"x": 0, "y": 0}}
    ]
    order = ["start"]
    if retrieval:
        nodes.append(
            {
                "id": "ret",
                "type": "retrieval",
                "name": "検索",
                "position": {"x": 200, "y": 0},
                "properties": dict(RETRIEVAL_PROPERTIES),
            }
        )
        order.append("ret")
    nodes.append(
        {
            "id": "gen",
            "type": "generative-ai",
            "name": "生成AI",
            "position": {"x": 400, "y": 0},
            "properties": dict(properties or ECHO_PROPERTIES),
        }
    )
    nodes.append({"id": "end", "type": "end", "position": {"x": 600, "y": 0}})
    order += ["gen", "end"]
    return {
        "version": 1,
        "id": graph_id,
        "name": f"ワークフロー {graph_id}",
        "serviceIds": service_ids or [graph_id],
        "nodes": nodes,
        "edges": [{"source": a, "target": b} for a, b in itertools.pairwise(order)],
    }


def flow_data(
    flow_id: str = "polish",
    *,
    service_ids: list[str] | None = None,
    properties: dict[str, str] | None = None,
) -> dict[str, Any]:
    """版 2 の、推敲のワークフロー（開始 → 下書き → 推敲 → 終了）の定義を作る。

    Parameters
    ----------
    flow_id : str
        ワークフローの ID。
    service_ids : list[str] | None
        サービス ID。None なら ID と同じ名前 1 つ。
    properties : dict[str, str] | None
        生成AI ノードの接続のプロパティ。None なら echo。

    Returns
    -------
    dict[str, Any]
        保存の形（JSON の値）の定義。
    """
    connection = dict(properties or ECHO_PROPERTIES)
    return {
        "version": 2,
        "id": flow_id,
        "name": f"推敲 {flow_id}",
        "serviceIds": service_ids or [flow_id],
        "nodes": [
            {"id": "start", "type": "start", "position": {"x": 0, "y": 0}},
            {
                "id": "draft",
                "type": "llm",
                "name": "下書き",
                "position": {"x": 280, "y": 0},
                "config": {
                    "prompt": "{{question}} に回答してください",
                    "outputType": 2,
                    "properties": dict(connection),
                },
            },
            {
                "id": "polish",
                "type": "llm",
                "name": "推敲",
                "position": {"x": 560, "y": 0},
                "config": {
                    "prompt": "次の下書きの誤りを直してください:\n{{draft.text}}",
                    "properties": dict(connection),
                },
            },
            {
                "id": "end",
                "type": "end",
                "name": "終了",
                "position": {"x": 840, "y": 0},
                "config": {"output": "{{polish.text}}"},
            },
        ],
        "edges": [
            {"source": "start", "target": "draft"},
            {"source": "draft", "target": "polish"},
            {"source": "polish", "target": "end"},
        ],
    }
