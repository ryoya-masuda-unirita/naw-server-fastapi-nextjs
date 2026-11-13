"""Waha! のアダプタ API（WTAddinApi の ColumnInformation・ColumnData）の置き換え。

Waha! 本体はないため、埋め込みアダプタが使う項目だけを持つ。埋め込みアダプタの列は
ID（文字）・入力ファイル（FILE）・分割文字数（DECIMAL_NUMBER）の 3 つ。
"""

from dataclasses import dataclass
from enum import IntEnum


class ColumnType(IntEnum):
    """列の種類。"""

    CHAR = 1
    FILE = 2
    DECIMAL_NUMBER = 3


@dataclass(frozen=True)
class ColumnInformation:
    """ビューの列の情報。

    Attributes
    ----------
    name : str
        列の名前。
    col_type : ColumnType
        列の種類。
    """

    name: str
    col_type: ColumnType


@dataclass(frozen=True)
class ColumnData:
    """1 レコードの列の値（文字・数値は `s`、ファイルは `b_ary`）。

    Attributes
    ----------
    s : str | None
        文字・数値の列の文字列。
    b_ary : bytes | None
        FILE の列の値（ファイルパスの UTF-8）。
    """

    s: str | None = None
    b_ary: bytes | None = None

    @classmethod
    def char(cls, value: str | None) -> "ColumnData":
        """文字（または数値）の列の値を作る。

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
