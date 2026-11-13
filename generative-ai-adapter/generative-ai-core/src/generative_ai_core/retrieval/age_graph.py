"""Apache AGE の graph で検索結果の近傍を広げる（移植元 CoreApacheAgeGraphExpansionProvider）。

種（ベクトル検索の上位）ごとに、同じファイルの前後のチャンク（`GRAPH_NEIGHBOR`）、
`NEXT_CHUNK`、業務上の関係（`BUSINESS_RELATIONSHIP`）を Cypher で引く。AGE・graph・権限・
データが足りないときは黙ってベクトルだけの成功にせず、サニタイズした失敗にする。
"""

import json
import logging
import re
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any, Protocol

from psycopg.adapt import Dumper
from psycopg.types import TypeInfo

from generative_ai_core.failure import CoreFailure
from generative_ai_core.retrieval.failure_sanitizer import CoreRetrievalFailureSanitizer
from generative_ai_core.retrieval.graph_support import (
    requires_business_relationship_traversal,
)
from generative_ai_core.retrieval.models import (
    CoreGraphContextCandidate,
    CoreRetrievalRequest,
    CoreVectorSearchResult,
)
from generative_ai_core.vector.target import (
    CoreVectorDbTarget,
    connect,
    ensure_age_session,
)

logger = logging.getLogger(__name__)

_EXTENSION_UNAVAILABLE_MESSAGE = re.compile(
    r"age|extension|ag_catalog|load", re.IGNORECASE
)
_GRAPH_UNAVAILABLE_MESSAGE = re.compile(
    r"graph.*(denied|permission|missing|unavailable|does not exist|not found)",
    re.IGNORECASE,
)
GRAPH_COUNT_SQL = "SELECT COUNT(*) FROM ag_catalog.ag_graph WHERE name = %s"
CANDIDATE_COLUMNS = (
    "(chunkId agtype, vectorRowId agtype, fileId agtype, sequence agtype, "
    "sourceFilePath agtype, sourceEdgeId agtype, sourceEvidenceId agtype, "
    "candidateTrust agtype)"
)
_SEED_MATCH = "MATCH (seedVector:VectorRow {id: $seedId})<-[:HAS_VECTOR]-(seed:Chunk) "
_CANDIDATE_RETURN = (
    "RETURN candidate.id AS chunkId, vector.id AS vectorRowId, "
    "candidate.fileId AS fileId, candidate.sequence AS sequence, "
    "file.path AS sourceFilePath, "
)
SAME_FILE_CYPHER = (
    _SEED_MATCH + "MATCH (file:File)-[:HAS_CHUNK]->(seed) "
    "MATCH (file)-[:HAS_CHUNK]->(candidate:Chunk) "
    "WHERE candidate.sequence >= seed.sequence - 1 "
    "AND candidate.sequence <= seed.sequence + 1 "
    "MATCH (candidate)-[:HAS_VECTOR]->(vector:VectorRow) "
    + _CANDIDATE_RETURN
    + "'' AS sourceEdgeId, '' AS sourceEvidenceId, '' AS candidateTrust"
)
NEXT_CHUNK_CYPHER = (
    _SEED_MATCH + "MATCH (seed)-[:NEXT_CHUNK]-(candidate:Chunk) "
    "MATCH (file:File)-[:HAS_CHUNK]->(candidate) "
    "MATCH (candidate)-[:HAS_VECTOR]->(vector:VectorRow) "
    + _CANDIDATE_RETURN
    + "'' AS sourceEdgeId, '' AS sourceEvidenceId, '' AS candidateTrust"
)
BUSINESS_RELATIONSHIP_CYPHER = (
    _SEED_MATCH + "MATCH (source:BusinessEntity)-[seedRelation:BUSINESS_RELATION]-"
    "(targetEntity:BusinessEntity) "
    "WHERE seedRelation.sourceChunkId = seed.id "
    "MATCH (source)-[business:BUSINESS_RELATION]-(related:BusinessEntity) "
    "MATCH (candidate:Chunk {id: business.sourceChunkId}) "
    "MATCH (file:File)-[:HAS_CHUNK]->(candidate) "
    "MATCH (candidate)-[:HAS_VECTOR]->(vector:VectorRow) "
    + _CANDIDATE_RETURN
    + "business.edgeId AS sourceEdgeId, "
    "business.sourceEvidenceId AS sourceEvidenceId, "
    "business.trustLevel AS candidateTrust"
)


@dataclass(frozen=True)
class CoreGraphExpansionResult:
    """Graph で広げた結果（候補か失敗）。

    Attributes
    ----------
    candidates : tuple[CoreGraphContextCandidate, ...]
        候補。
    failure : CoreFailure | None
        失敗。
    """

    candidates: Sequence[CoreGraphContextCandidate] = field(default_factory=tuple)
    failure: CoreFailure | None = None

    def __post_init__(self) -> None:
        """候補を不変にする。"""
        object.__setattr__(self, "candidates", tuple(self.candidates or ()))

    @classmethod
    def success(
        cls, candidates: Sequence[CoreGraphContextCandidate]
    ) -> "CoreGraphExpansionResult":
        """成功の結果を作る。

        Parameters
        ----------
        candidates : Sequence[CoreGraphContextCandidate]
            候補。

        Returns
        -------
        CoreGraphExpansionResult
            成功の結果。
        """
        return cls(candidates, None)

    @classmethod
    def of_failure(cls, failure: CoreFailure) -> "CoreGraphExpansionResult":
        """失敗の結果を作る。

        Parameters
        ----------
        failure : CoreFailure
            失敗。

        Returns
        -------
        CoreGraphExpansionResult
            失敗の結果。
        """
        return cls((), failure)

    def failed(self) -> bool:
        """失敗かを返す。

        Returns
        -------
        bool
            失敗なら True。
        """
        return self.failure is not None


class CoreApacheAgeGraphClient(Protocol):
    """AGE の graph への問い合わせ。"""

    def ensure_graph_readable(
        self, target: CoreVectorDbTarget, graph_name: str
    ) -> None:
        """graph が読めることを確かめる。

        Parameters
        ----------
        target : CoreVectorDbTarget
            接続先。
        graph_name : str
            graph 名。
        """
        ...

    def query_candidates(
        self, target: CoreVectorDbTarget, graph_name: str, seed: CoreVectorSearchResult
    ) -> list[CoreGraphContextCandidate]:
        """種に対する近傍の候補を引く。

        Parameters
        ----------
        target : CoreVectorDbTarget
            接続先。
        graph_name : str
            graph 名。
        seed : CoreVectorSearchResult
            種。

        Returns
        -------
        list[CoreGraphContextCandidate]
            候補。
        """
        ...


class AgtypeParameter(str):
    """AGE の `cypher()` の第 3 引数に渡す agtype の値（JSON 文字列）。"""


class _AgtypeDumper(Dumper):
    """`AgtypeParameter` を agtype の型で送る（`cypher()` はパラメータ型を要求する）。"""

    def dump(self, obj: Any) -> bytes:
        """JSON 文字列を UTF-8 にする。

        Parameters
        ----------
        obj : Any
            `AgtypeParameter`。

        Returns
        -------
        bytes
            UTF-8 のバイト列。
        """
        return str(obj).encode("utf-8")


def _string_value(value: object) -> str:
    """agtype の文字列表現から値を取り出す（前後の `"` を外す）。

    Parameters
    ----------
    value : object
        agtype の値（psycopg は文字列で返す）。

    Returns
    -------
    str
        値。None は空文字。
    """
    if value is None:
        return ""
    text = str(value)
    if len(text) >= 2 and text.startswith('"') and text.endswith('"'):
        return text[1:-1].replace('\\"', '"')
    return text


class PsycopgApacheAgeGraphClient:
    """psycopg で AGE へ問い合わせる（呼び出しごとに接続する）。"""

    def ensure_graph_readable(
        self, target: CoreVectorDbTarget, graph_name: str
    ) -> None:
        """AGE を使える状態にして、graph があることを確かめる。

        Parameters
        ----------
        target : CoreVectorDbTarget
            接続先。
        graph_name : str
            graph 名。

        Raises
        ------
        RuntimeError
            graph がないとき。
        """
        with connect(target) as connection:
            ensure_age_session(connection)
            row = connection.execute(GRAPH_COUNT_SQL, (graph_name,)).fetchone()
            if row is None or int(row[0]) == 0:
                raise RuntimeError("AGE graph does not exist")

    def query_candidates(
        self, target: CoreVectorDbTarget, graph_name: str, seed: CoreVectorSearchResult
    ) -> list[CoreGraphContextCandidate]:
        """同じファイルの前後・NEXT_CHUNK・業務上の関係を順に引く。

        Parameters
        ----------
        target : CoreVectorDbTarget
            接続先。
        graph_name : str
            graph 名。
        seed : CoreVectorSearchResult
            種。

        Returns
        -------
        list[CoreGraphContextCandidate]
            候補（3 種類を順につなげたもの）。
        """
        candidates: list[CoreGraphContextCandidate] = []
        for cypher, relation_kind in (
            (SAME_FILE_CYPHER, "GRAPH_NEIGHBOR"),
            (NEXT_CHUNK_CYPHER, "NEXT_CHUNK"),
            (BUSINESS_RELATIONSHIP_CYPHER, "BUSINESS_RELATIONSHIP"),
        ):
            candidates.extend(
                self._execute_candidate_query(
                    target, graph_name, cypher, seed, relation_kind
                )
            )
        return candidates

    def _execute_candidate_query(
        self,
        target: CoreVectorDbTarget,
        graph_name: str,
        cypher: str,
        seed: CoreVectorSearchResult,
        relation_kind: str,
    ) -> list[CoreGraphContextCandidate]:
        """Cypher を実行して候補にする。

        Parameters
        ----------
        target : CoreVectorDbTarget
            接続先。
        graph_name : str
            graph 名（検証済みの識別子）。
        cypher : str
            Cypher。
        seed : CoreVectorSearchResult
            種。
        relation_kind : str
            この問い合わせの関係の種類。

        Returns
        -------
        list[CoreGraphContextCandidate]
            候補。
        """
        sql = (
            f"SELECT * FROM cypher('{graph_name}', $$ {cypher} $$, %s) "
            f"AS {CANDIDATE_COLUMNS}"
        )
        params = AgtypeParameter(json.dumps({"seedId": seed.id}))
        with connect(target) as connection:
            ensure_age_session(connection)
            info = TypeInfo.fetch(connection, "agtype")
            if info is not None:
                connection.adapters.register_dumper(
                    AgtypeParameter, _agtype_dumper_class(info.oid)
                )
            rows = connection.execute(sql, (params,)).fetchall()
        return [self._candidate(row, seed, relation_kind) for row in rows]

    @staticmethod
    def _candidate(
        row: tuple[object, ...],
        seed: CoreVectorSearchResult,
        candidate_relation_kind: str,
    ) -> CoreGraphContextCandidate:
        """結果の 1 行を候補にする。

        Parameters
        ----------
        row : tuple[object, ...]
            結果の行。
        seed : CoreVectorSearchResult
            種。
        candidate_relation_kind : str
            この問い合わせの関係の種類。

        Returns
        -------
        CoreGraphContextCandidate
            候補。種自身なら `SEED`。
        """
        chunk_id = _string_value(row[0])
        vector_row_id = _string_value(row[1])
        file_id = _string_value(row[2])
        sequence = int(_string_value(row[3]))
        relation_kind = "SEED" if vector_row_id == seed.id else candidate_relation_kind
        return CoreGraphContextCandidate(
            vector_row_id,
            chunk_id,
            vector_row_id,
            file_id,
            sequence,
            seed.id,
            seed.rank,
            relation_kind,
            _string_value(row[5]),
            _string_value(row[6]),
            _string_value(row[7]),
            _string_value(row[4]),
        )


def _agtype_dumper_class(oid: int) -> type[Dumper]:
    """指定の OID で送る `AgtypeParameter` 用のダンパーを作る。

    Parameters
    ----------
    oid : int
        agtype の OID。

    Returns
    -------
    type[Dumper]
        ダンパー。
    """

    class AgtypeDumper(_AgtypeDumper):
        """OID を固定した agtype のダンパー。"""

    AgtypeDumper.oid = oid
    return AgtypeDumper


class CoreApacheAgeGraphExpansionProvider:
    """検索結果（種）を AGE の graph で広げる。"""

    def __init__(self, graph_client: CoreApacheAgeGraphClient | None = None) -> None:
        """graph への問い合わせを受け取る。

        Parameters
        ----------
        graph_client : CoreApacheAgeGraphClient | None
            問い合わせ。省略すると psycopg。
        """
        self._graph_client = graph_client or PsycopgApacheAgeGraphClient()
        self._failure_sanitizer = CoreRetrievalFailureSanitizer()

    def expand(
        self,
        request: CoreRetrievalRequest,
        seed_results: Sequence[CoreVectorSearchResult] | None,
    ) -> CoreGraphExpansionResult:
        """種ごとに graph の候補を引く。

        Parameters
        ----------
        request : CoreRetrievalRequest
            検索リクエスト。
        seed_results : Sequence[CoreVectorSearchResult] | None
            種（ベクトル検索の結果）。

        Returns
        -------
        CoreGraphExpansionResult
            候補、または失敗（`GRAPH_DATA_MISSING`・`BUSINESS_GRAPH_DATA_MISSING`・
            `GRAPH_CONFIGURATION_FAILURE`・`GRAPH_UNAVAILABLE`・`GRAPH_QUERY_FAILURE`）。
        """
        seeds = list(seed_results or ())
        business = requires_business_relationship_traversal(request)
        if not seeds and not business:
            return CoreGraphExpansionResult.success([])
        try:
            graph_name = request.graph_setting().graph_name
            target = self._require_target(request)
            self._graph_client.ensure_graph_readable(target, graph_name)
            if not seeds:
                return CoreGraphExpansionResult.of_failure(
                    CoreFailure.of(
                        "BUSINESS_GRAPH_DATA_MISSING",
                        "Business graph relationship projection is missing.",
                    )
                )
            candidates: list[CoreGraphContextCandidate] = []
            for seed in seeds:
                seed_candidates = self._graph_client.query_candidates(
                    target, graph_name, seed
                )
                if not seed_candidates:
                    return CoreGraphExpansionResult.of_failure(
                        CoreFailure.of(
                            "GRAPH_DATA_MISSING",
                            "Graph RAG seed graph data is missing.",
                        )
                    )
                candidates.extend(seed_candidates)
            if business and not any(
                c.is_evidence_linked_business_relationship() for c in candidates
            ):
                return CoreGraphExpansionResult.of_failure(
                    CoreFailure.of(
                        "BUSINESS_GRAPH_DATA_MISSING",
                        "Business graph relationship projection is missing.",
                    )
                )
            return CoreGraphExpansionResult.success(candidates)
        except ValueError:
            return CoreGraphExpansionResult.of_failure(
                CoreFailure.of(
                    "GRAPH_CONFIGURATION_FAILURE", "Graph RAG configuration is invalid."
                )
            )
        except Exception as e:  # noqa: BLE001 — 移植元と同じく失敗の結果にして返す
            return CoreGraphExpansionResult.of_failure(self._to_failure(e))

    def _to_failure(self, error: Exception) -> CoreFailure:
        """例外を Graph の失敗にする。

        Parameters
        ----------
        error : Exception
            例外。

        Returns
        -------
        CoreFailure
            AGE・拡張・graph が使えない系なら `GRAPH_UNAVAILABLE`、それ以外は
            `GRAPH_QUERY_FAILURE`。
        """
        message = str(error)
        if _EXTENSION_UNAVAILABLE_MESSAGE.search(
            message
        ) or _GRAPH_UNAVAILABLE_MESSAGE.search(message):
            return self._failure_sanitizer.graph_unavailable(error)
        return self._failure_sanitizer.graph_query_failure(error)

    @staticmethod
    def _require_target(request: CoreRetrievalRequest) -> CoreVectorDbTarget:
        """ベクトルDB の接続先を取り出す。

        Parameters
        ----------
        request : CoreRetrievalRequest
            検索リクエスト。

        Returns
        -------
        CoreVectorDbTarget
            接続先。

        Raises
        ------
        ValueError
            接続先がないとき。
        """
        if request.vector_db_target is None:
            raise ValueError("vectorDbTarget is required")
        return request.vector_db_target


__all__ = [
    "CoreApacheAgeGraphClient",
    "CoreApacheAgeGraphExpansionProvider",
    "CoreGraphExpansionResult",
    "PsycopgApacheAgeGraphClient",
]
