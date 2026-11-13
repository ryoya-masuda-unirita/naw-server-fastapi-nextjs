"""共通のユーティリティ（移植元 embedding.util.Util）。"""

import uuid


def create_unique_id() -> str:
    """ランダムな UUID 文字列を作る。

    Returns
    -------
    str
        ハイフン付き小文字の UUID（Java の UUID.randomUUID().toString() と同じ書式）。
    """
    return str(uuid.uuid4())
