"""埋め込みの結果（移植元 CoreEmbeddingResult）。"""

from collections.abc import Sequence
from dataclasses import dataclass

from generative_ai_core.failure import CoreFailure


@dataclass(frozen=True)
class CoreEmbeddingResult:
    """埋め込みの結果。成功ならベクトル、失敗なら failure を持つ。

    Attributes
    ----------
    target_id : str
        リクエストの targetHint をそのまま返した値。
    vector : tuple[float, ...]
        埋め込みベクトル（コピーして持つ）。
    source_name : str
        元の表示名。
    failure : CoreFailure | None
        失敗。成功なら None（移植元の Optional）。
    """

    target_id: str = ""
    vector: tuple[float, ...] = ()
    source_name: str = ""
    failure: CoreFailure | None = None

    def __post_init__(self) -> None:
        """None の項目を空にし、ベクトルをコピーする。"""
        object.__setattr__(self, "target_id", self.target_id or "")
        object.__setattr__(self, "vector", tuple(self.vector or ()))
        object.__setattr__(self, "source_name", self.source_name or "")

    @classmethod
    def success(
        cls,
        target_id: str | None,
        vector: Sequence[float] | None,
        source_name: str | None,
    ) -> "CoreEmbeddingResult":
        """成功の結果を作る。

        Parameters
        ----------
        target_id : str | None
            対象 ID。
        vector : Sequence[float] | None
            埋め込みベクトル。
        source_name : str | None
            元の表示名。

        Returns
        -------
        CoreEmbeddingResult
            成功の結果。
        """
        return cls(target_id or "", tuple(vector or ()), source_name or "", None)

    @classmethod
    def of_failure(cls, failure: CoreFailure) -> "CoreEmbeddingResult":
        """失敗の結果を作る（移植元 CoreEmbeddingResult.failure）。

        Parameters
        ----------
        failure : CoreFailure
            失敗。

        Returns
        -------
        CoreEmbeddingResult
            ベクトルが空の失敗の結果。
        """
        return cls("", (), "", failure)
