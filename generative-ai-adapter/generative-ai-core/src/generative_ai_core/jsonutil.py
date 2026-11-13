"""JSON の数値を書かれたとおりの表記で読む。

移植元は Gson で数値を読み、`getAsString()` の表記（`1`・`1.0`・`01` の区別）で
参照 ID が正しいかを判定している。Python の json は数値を int・float に変えて
表記が失われるため、数値を RawNumber として読む。
"""

import json
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class RawNumber:
    """JSON の数値を、書かれたままの表記で持つ。"""

    text: str


def loads_with_raw_numbers(text: str) -> Any:
    """数値を RawNumber にして読む。NaN・Infinity も RawNumber にする。

    Parameters
    ----------
    text : str
        JSON の文字列。

    Returns
    -------
    Any
        読み込んだ値。数値は RawNumber。

    Raises
    ------
    json.JSONDecodeError
        JSON として読めないとき。
    """
    return json.loads(
        text,
        parse_int=RawNumber,
        parse_float=RawNumber,
        parse_constant=RawNumber,
    )
