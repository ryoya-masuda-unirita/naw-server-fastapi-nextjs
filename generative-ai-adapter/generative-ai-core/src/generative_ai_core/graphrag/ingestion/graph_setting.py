"""AGE のグラフ名の検査（移植元 `retrieval.CoreGraphRagSearchSetting` のうち取り込みが使う部分）。

移植元の `CoreGraphRagSearchSetting`（検索側の設定）は #299（検索アダプタ）の担当領域で、
取り込み側は `enabled(graphName, providerName).graphName()` の検査と
`DEFAULT_GRAPH_NAME` だけを使う。#299 で `generative_ai_core.retrieval` に同名の型が
できたら、この最小の型をそちらに置き換えてよい。
"""

import re
from dataclasses import dataclass

DEFAULT_GRAPH_NAME = "secuaigent_core_graph"
_SAFE_IDENTIFIER = re.compile(r"[A-Za-z_][A-Za-z0-9_]{0,62}")


def normalize_graph_name(graph_name: str | None) -> str:
    """グラフ名を検査して返す（空なら既定）。

    Parameters
    ----------
    graph_name : str | None
        グラフ名。

    Returns
    -------
    str
        安全なグラフ名。

    Raises
    ------
    ValueError
        PostgreSQL の識別子として安全でないとき。
    """
    normalized = (
        DEFAULT_GRAPH_NAME
        if graph_name is None or not graph_name.strip()
        else graph_name.strip()
    )
    if not _SAFE_IDENTIFIER.fullmatch(normalized):
        raise ValueError("graphName must be a safe PostgreSQL identifier")
    return normalized


@dataclass(frozen=True)
class IngestionGraphSetting:
    """取り込みが使うグラフの設定（`CoreGraphRagSearchSetting` の最小版）。"""

    enabled: bool
    graph_name: str
    provider_name: str = ""

    def __post_init__(self) -> None:
        """グラフ名を検査し、プロバイダー名の空白を除く。"""
        object.__setattr__(self, "graph_name", normalize_graph_name(self.graph_name))
        object.__setattr__(self, "provider_name", (self.provider_name or "").strip())

    @classmethod
    def make_enabled(
        cls, graph_name: str | None, provider_name: str | None
    ) -> "IngestionGraphSetting":
        """有効な設定を作る（移植元の `enabled(...)`。項目名と重なるため改名）。

        Parameters
        ----------
        graph_name : str | None
            グラフ名。
        provider_name : str | None
            プロバイダー名。

        Returns
        -------
        IngestionGraphSetting
            有効な設定。
        """
        return cls(True, normalize_graph_name(graph_name), provider_name or "")
