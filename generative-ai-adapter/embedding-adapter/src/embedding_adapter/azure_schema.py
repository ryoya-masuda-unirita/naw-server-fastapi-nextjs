"""Azure AI Search の検索リクエストのスキーマ（移植元 AzureSchema パッケージ）。"""

import json
from dataclasses import dataclass, field

VECTOR_FIELD_NAME = "contentVector"
VECTOR_KIND = "vector"
SELECT_ID = "id"


@dataclass
class AISearchItem:
    """Azure AI Search の検索結果の 1 件（移植元 AISearchItem）。

    Attributes
    ----------
    id : str | None
        ドキュメント ID。
    content_vector : list[float] | None
        ドキュメントのベクトル。
    """

    id: str | None = None
    content_vector: list[float] | None = None


@dataclass
class VectorQuery:
    """Azure AI Search のベクター検索クエリ（移植元 VectorQuery）。

    Attributes
    ----------
    vector : list[float] | None
        ベクトル。
    k : int
        返す結果の数。
    fields : str | None
        フィールド名。
    kind : str | None
        ベクトルの種類。
    exhaustive : bool
        全件検索するか。
    """

    vector: list[float] | None = None
    k: int = 0
    fields: str | None = None
    kind: str | None = None
    exhaustive: bool = False

    @classmethod
    def of(cls, vector: list[float] | None, k: int) -> "VectorQuery":
        """ベクトルと件数から、移植元の既定値（contentVector・vector・全件検索）で作る。

        Parameters
        ----------
        vector : list[float] | None
            検索するベクトル。
        k : int
            返す結果の数。

        Returns
        -------
        VectorQuery
            ベクター検索クエリ。
        """
        return cls(vector, k, VECTOR_FIELD_NAME, VECTOR_KIND, True)

    def to_dict(self) -> dict[str, object]:
        """Gson と同じく null の項目を出さない辞書にする。

        Returns
        -------
        dict[str, object]
            JSON にする辞書。
        """
        result: dict[str, object] = {}
        if self.vector is not None:
            result["vector"] = self.vector
        result["k"] = self.k
        if self.fields is not None:
            result["fields"] = self.fields
        if self.kind is not None:
            result["kind"] = self.kind
        result["exhaustive"] = self.exhaustive
        return result


@dataclass
class AISearchRequestSchema:
    """Azure AI Search の検索リクエスト（移植元 AISearchRequestSchema）。

    Attributes
    ----------
    count : bool
        ヒット件数を返すか。
    select : str | None
        取得するフィールド。
    vector_queries : list[VectorQuery]
        ベクター検索クエリの配列。
    """

    count: bool = False
    select: str | None = None
    vector_queries: list[VectorQuery] = field(default_factory=list)

    @classmethod
    def of(cls, vector_query: VectorQuery) -> "AISearchRequestSchema":
        """1 つのクエリから、移植元の既定値（count=true・select=id）で作る。

        Parameters
        ----------
        vector_query : VectorQuery
            ベクター検索クエリ。

        Returns
        -------
        AISearchRequestSchema
            検索リクエスト。
        """
        return cls(True, SELECT_ID, [vector_query])

    def to_json_string(self) -> str:
        """JSON 文字列にする（キーは移植元の Gson と同じ camelCase）。

        Returns
        -------
        str
            JSON 文字列。
        """
        body: dict[str, object] = {"count": self.count}
        if self.select is not None:
            body["select"] = self.select
        body["vectorQueries"] = [query.to_dict() for query in self.vector_queries]
        return json.dumps(body, ensure_ascii=False, separators=(",", ":"))
