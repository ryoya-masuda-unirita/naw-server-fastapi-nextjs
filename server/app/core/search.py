def escape_like_pattern(value: str) -> str:
    """LIKE検索のワイルドカード文字（% _ \\）をエスケープし前後に%を付与する。

    Parameters
    ----------
    value : str
        エスケープ対象の検索文字列。

    Returns
    -------
    str
        LIKE検索にそのまま使用できるエスケープ済みパターン文字列。
    """
    escaped = value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"
