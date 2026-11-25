"""ノードのプロパティ名の候補（画面が、入れられる名前を選ばせるために使う）。"""

from typing import Any

from generative_ai_adapter.constants import PropertyIds
from retrieval_adapter.constants import RetrievalPropertyIds

from waha_emulator.studio.service import is_secret_name
from waha_emulator.workflow_config import (
    RESERVED_PROPERTIES,
    RETRIEVAL_RESERVED_PROPERTIES,
)


def _entries(names: dict[str, int], reserved: frozenset[str]) -> list[dict[str, Any]]:
    """プロパティ名の一覧を、画面向けの形にする。

    エミュレーターがジョブごとに決める名前は、書けないため入れない。

    Parameters
    ----------
    names : dict[str, int]
        アダプターのプロパティの名前 → ID。
    reserved : frozenset[str]
        書けない名前。

    Returns
    -------
    list[dict[str, Any]]
        名前順の `{"name": 名前, "secret": 秘密情報か}`。
    """
    return [
        {"name": name, "secret": is_secret_name(name)}
        for name in sorted(names)
        if name not in reserved
    ]


def property_catalog() -> dict[str, list[dict[str, Any]]]:
    """生成AI・検索のノードに書けるプロパティ名の候補を返す。

    Returns
    -------
    dict[str, list[dict[str, Any]]]
        `generativeAi`（生成AI ノード）と `retrieval`（検索ノード）の候補。
    """
    return {
        "generativeAi": _entries(PropertyIds.by_name(), RESERVED_PROPERTIES),
        "retrieval": _entries(
            RetrievalPropertyIds.by_name(), RETRIEVAL_RESERVED_PROPERTIES
        ),
    }
