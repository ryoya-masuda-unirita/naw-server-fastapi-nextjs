"""Waha! のアダプタ API（WTAddinApi の ColumnInformation・ColumnData）の置き換え。

Waha! 本体はないため、アダプタが使う項目だけを持つ。

- ColumnInformation: ビューの列。`index` はロール（0=ユーザー、1=システム、
  2=アシスタント、3=ファイルパス、4=会話履歴Json、5=コンテクスト、6=RAG Context JSONパス）
- ColumnData: 1 レコードの列の値。文字の列は `s`、FILE の列は `b_ary`（ファイルパスの
  UTF-8）に入る。Waha! はファイルがない FILE の列に `null`（または `…\\null`）を渡す
"""

from dataclasses import dataclass
from enum import IntEnum


class ColumnType(IntEnum):
    """列の種類（文字 / ファイル）。"""

    CHAR = 1
    FILE = 2


@dataclass(frozen=True)
class ColumnInformation:
    """ビューの列の情報（名前・種類・ロールの番号）。"""

    name: str
    col_type: ColumnType
    index: int


@dataclass(frozen=True)
class ColumnData:
    """1 レコードの列の値（文字は `s`、ファイルは `b_ary`）。"""

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


# Waha! がファイルのない FILE 列に渡す値
SKIPPED_FILE_PATH = "null"
