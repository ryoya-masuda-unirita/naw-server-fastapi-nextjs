"""Waha! のアダプタ API（WTAddinApi の ColumnInformation・ColumnData）の置き換え。

Waha! 本体はないため、検索アダプタが使う項目だけを持つ。生成AIアダプタ（`generative_ai_adapter.waha`）
と同じ形だが、アダプタ同士を依存させない（移植元も各アダプタが Waha! の API だけに依存する）
ため、ここにも置く。

- ColumnInformation: ビューの列。`index` はロール、`col_type` は文字（CHAR）かファイル（FILE）
- ColumnData: 1 レコードの列の値。文字の列は `s`、FILE の列は `b_ary`（ファイルパスの UTF-8）
"""

from dataclasses import dataclass
from enum import IntEnum


class ColumnType(IntEnum):
    """列の種類（文字 / ファイル）。"""

    CHAR = 1
    FILE = 2


@dataclass(frozen=True)
class ColumnInformation:
    """ビューの列の情報（名前・種類・ロールの番号）。

    Attributes
    ----------
    name : str
        列の名前。
    col_type : ColumnType
        列の種類。
    index : int
        ロールの番号。
    """

    name: str
    col_type: ColumnType
    index: int = 0


@dataclass(frozen=True)
class ColumnData:
    """1 レコードの列の値（文字は `s`、ファイルは `b_ary`）。

    Attributes
    ----------
    s : str | None
        文字の列の値。
    b_ary : bytes | None
        FILE の列の値（ファイルパスの UTF-8）。
    """

    s: str | None = None
    b_ary: bytes | None = None

    @classmethod
    def char(cls, value: str | None) -> "ColumnData":
        """文字の列の値を作る。

        Parameters
        ----------
        value : str | None
            列の文字列。

        Returns
        -------
        ColumnData
            `s` に値を持つデータ。
        """
        return cls(s=value)

    @classmethod
    def file(cls, path: str) -> "ColumnData":
        """FILE の列の値を作る。

        Parameters
        ----------
        path : str
            ファイルパス。UTF-8 でバイト列にする。

        Returns
        -------
        ColumnData
            `b_ary` にパスを持つデータ。
        """
        return cls(b_ary=path.encode("utf-8"))
