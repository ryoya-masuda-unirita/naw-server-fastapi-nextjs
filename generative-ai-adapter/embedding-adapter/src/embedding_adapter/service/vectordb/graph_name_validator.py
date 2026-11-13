"""AGE graph 名の検証（移植元 GraphNameValidator）。"""

import re

MAX_LENGTH = 63
SAFE_IDENTIFIER = re.compile(r"[A-Za-z_][A-Za-z0-9_]{0,62}")
INVALID_GRAPH_NAME_MESSAGE = "AGE graph 名に不正な値が入力されています。英数字とアンダースコアで指定してください。"


class GraphNameValidator:
    """AGE graph 名が安全な識別子かを検証する。"""

    @staticmethod
    def is_valid(graph_name: str | None) -> bool:
        """安全な graph 名か判定する。

        Parameters
        ----------
        graph_name : str | None
            graph 名。

        Returns
        -------
        bool
            63 文字以下の英数字とアンダースコアなら True。
        """
        return (
            graph_name is not None
            and len(graph_name) <= MAX_LENGTH
            and SAFE_IDENTIFIER.fullmatch(graph_name) is not None
        )

    @staticmethod
    def validate(graph_name: str | None) -> str:
        """graph 名を検証し、問題なければそのまま返す。

        Parameters
        ----------
        graph_name : str | None
            graph 名。

        Returns
        -------
        str
            検証済みの graph 名。

        Raises
        ------
        ValueError
            不正な graph 名のとき。
        """
        if graph_name is None or not GraphNameValidator.is_valid(graph_name):
            raise ValueError(INVALID_GRAPH_NAME_MESSAGE)
        return graph_name
