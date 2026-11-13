"""派生リソース名の対象の種類（移植元 CoreDerivedResourceTargetKind）。"""

import re
from enum import Enum


class CoreDerivedResourceTargetKind(Enum):
    """テーブル名から派生させるリソースの種類。

    値は (契約名, 最大長, 区切り文字, 有効な名前のパターン)。
    """

    AGE_GRAPH = ("age-graph", 63, "_", re.compile(r"[a-z_][a-z0-9_]{0,62}"))
    POSTGRES_INDEX = ("postgres-index", 63, "_", re.compile(r"[a-z_][a-z0-9_]{0,62}"))
    AZURE_SEARCH_INDEX = (
        "azure-search-index",
        128,
        "-",
        re.compile(r"[a-z0-9][a-z0-9-]{0,126}[a-z0-9]"),
    )

    @property
    def contract_name(self) -> str:
        """契約上の名前。

        Returns
        -------
        str
            エラーメッセージなどに使う名前。
        """
        return str(self.value[0])

    @property
    def max_length(self) -> int:
        """派生名の最大長。

        Returns
        -------
        int
            最大の文字数。
        """
        return int(self.value[1])

    @property
    def separator(self) -> str:
        """派生名の単語の区切り文字。

        Returns
        -------
        str
            区切り文字。
        """
        return str(self.value[2])

    def is_valid(self, value: str | None) -> bool:
        """名前がこの種類の規則に合うか判定する。

        Parameters
        ----------
        value : str | None
            判定する名前。

        Returns
        -------
        bool
            規則に全体一致すれば True。
        """
        return value is not None and self.value[3].fullmatch(value) is not None
