"""版 1・版 2 の保存形式で共通の、検証の部品。"""

import re
from typing import Any

# 保存先のファイル名になるため、安全な文字だけにする
GRAPH_ID_PATTERN = re.compile(r"^[a-z0-9_-]{1,64}$")
MAX_NAME_LENGTH = 100
MAX_SERVICE_ID_LENGTH = 200


class GraphError(ValueError):
    """ワークフローの定義が不正。メッセージに、どのノード・項目かを含める。"""


def text_value(raw: Any, where: str, max_length: int) -> str:
    """1〜max_length 文字の文字列を取り出す。

    Parameters
    ----------
    raw : Any
        JSON の値。
    where : str
        エラーメッセージに出す場所。
    max_length : int
        文字数の上限。

    Returns
    -------
    str
        文字列。

    Raises
    ------
    GraphError
        文字列でない・空・長すぎるとき。
    """
    if not isinstance(raw, str) or not raw.strip() or len(raw) > max_length:
        raise GraphError(f"{where} は 1〜{max_length} 文字の文字列にしてください")
    return raw


def number_value(raw: Any, where: str) -> float:
    """数値を取り出す（真偽値は数値として扱わない）。

    Parameters
    ----------
    raw : Any
        JSON の値。
    where : str
        エラーメッセージに出す場所。

    Returns
    -------
    float
        数値。

    Raises
    ------
    GraphError
        数値でないとき。
    """
    if isinstance(raw, bool) or not isinstance(raw, (int, float)):
        raise GraphError(f"{where} は数値にしてください")
    return float(raw)


def service_ids_value(raw: Any) -> tuple[str, ...]:
    """サービス ID の一覧を読む。

    Parameters
    ----------
    raw : Any
        JSON の `serviceIds`。

    Returns
    -------
    tuple[str, ...]
        サービス ID。

    Raises
    ------
    GraphError
        空・重複・不正な値のとき。
    """
    if not isinstance(raw, list) or not raw:
        raise GraphError("serviceIds は 1 つ以上の配列にしてください")
    ids = tuple(
        text_value(item, f"serviceIds[{i}]", MAX_SERVICE_ID_LENGTH)
        for i, item in enumerate(raw)
    )
    if len(set(ids)) != len(ids):
        raise GraphError("serviceIds に重複があります")
    return ids
