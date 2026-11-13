"""PostgreSQL（pgvector）のベクトル検索の SQL（移植元 CorePostgreSqlRetrievalProvider の
`CorePostgreSqlSearchClient`・`JdbcCorePostgreSqlSearchClient`）。

`public.<テーブル>` の `embedding <=> クエリのベクトル` の近い順に上位を返す。Graph 検索
（`current_only`）のときは `graphrag_s02` の現行の文書・チャンクと結び付け、グラフ根拠の
パスも引く。
"""

import math
from collections.abc import Callable, Sequence
from typing import Any, Protocol

from generative_ai_core.retrieval.models import (
    CoreRetrievalRequest,
    CoreVectorSearchResult,
)
from generative_ai_core.vector.target import (
    CoreVectorDbTarget,
    connect,
    safe_identifier,
)

DEFAULT_TENANT_ID = "tenant-default"
TENANT_ID_ATTRIBUTE = "s04.tenantId"
FILEPATH_COLUMN_SQL = (
    "SELECT EXISTS (SELECT 1 FROM information_schema.columns "
    "WHERE table_schema = 'public' AND table_name = %s AND column_name = 'filepath')"
)
_GRAPH_JOIN = (
    " JOIN LATERAL (SELECT c.chunk_id, graph_evidence.path_text graph_path_text "
    "FROM graphrag_s02.documents d "
    "JOIN graphrag_s02.chunks c ON c.tenant_id = d.tenant_id "
    "AND c.document_id = d.document_id "
    "LEFT JOIN LATERAL (SELECT source_entity.canonical_label_hash || ' --' "
    "|| e.edge_type || '(' || ei.evidence_id || ')--> ' "
    "|| target_entity.canonical_label_hash path_text "
    "FROM graphrag_s02.evidence_items ei "
    "JOIN graphrag_s02.kg_edge_evidence kee ON kee.tenant_id = ei.tenant_id "
    "AND kee.evidence_id = ei.evidence_id "
    "JOIN graphrag_s02.kg_edges e ON e.tenant_id = kee.tenant_id "
    "AND e.edge_id = kee.edge_id "
    "JOIN graphrag_s02.entities source_entity "
    "ON source_entity.tenant_id = e.tenant_id "
    "AND source_entity.entity_id = e.source_entity_id "
    "JOIN graphrag_s02.entities target_entity "
    "ON target_entity.tenant_id = e.tenant_id "
    "AND target_entity.entity_id = e.target_entity_id "
    "WHERE ei.tenant_id = c.tenant_id "
    "AND ei.chunk_id = c.chunk_id "
    "ORDER BY ei.selection_rank, ei.evidence_id, e.edge_id LIMIT 1) "
    "graph_evidence ON TRUE "
    "WHERE d.tenant_id = %s "
    "AND v.fileid = d.source_label_sanitized "
    "AND c.content_hash = 'content-' || substring(encode(sha256(convert_to("
    "COALESCE(v.content, ''), 'UTF8')), 'hex') from 1 for 24) "
    "ORDER BY c.chunk_ordinal NULLS LAST, c.chunk_id LIMIT 1) s02_match ON TRUE"
)


class CorePostgreSqlSearchClient(Protocol):
    """PostgreSQL のベクトル検索の問い合わせ。"""

    def search(
        self,
        target: CoreVectorDbTarget,
        query_vector: Sequence[float],
        max_results: int,
        current_only: bool = False,
        tenant_id: str = DEFAULT_TENANT_ID,
    ) -> list[CoreVectorSearchResult]:
        """クエリのベクトルに近い順に上位を返す。

        Parameters
        ----------
        target : CoreVectorDbTarget
            接続先。
        query_vector : Sequence[float]
            クエリのベクトル。
        max_results : int
            最大件数。
        current_only : bool
            Graph 検索用に、現行の文書・チャンクと結び付けるか。
        tenant_id : str
            テナント（`current_only` のとき使う）。

        Returns
        -------
        list[CoreVectorSearchResult]
            検索結果（順位は 1 から）。
        """
        ...


def tenant_id_of(request: CoreRetrievalRequest | None) -> str:
    """リクエストの属性からテナント ID を決める（なければ既定）。

    Parameters
    ----------
    request : CoreRetrievalRequest | None
        検索リクエスト。

    Returns
    -------
    str
        テナント ID。
    """
    if request is None:
        return DEFAULT_TENANT_ID
    tenant_id = request.attributes.get(TENANT_ID_ATTRIBUTE, DEFAULT_TENANT_ID)
    return tenant_id.strip() if tenant_id and tenant_id.strip() else DEFAULT_TENANT_ID


def vector_literal(vector: Sequence[float]) -> str:
    """ベクトルを pgvector のリテラル（`[1.0,2.0]`）にする。

    Parameters
    ----------
    vector : Sequence[float]
        ベクトル。

    Returns
    -------
    str
        リテラル。

    Raises
    ------
    ValueError
        NaN・無限大を含むとき。
    """
    values: list[str] = []
    for value in vector:
        if value is None or math.isnan(value) or math.isinf(value):
            raise ValueError("query vector contains non-finite value")
        values.append(repr(float(value)))
    return "[" + ",".join(values) + "]"


def _graph_evidence(identifier: str, path_text: str | None) -> dict[str, str]:
    """Graph の根拠のパスを証拠のキーにする。

    Parameters
    ----------
    identifier : str
        チャンク ID。
    path_text : str | None
        根拠のパス。

    Returns
    -------
    dict[str, str]
        証拠。パスがなければ空。
    """
    if path_text is None or not path_text.strip():
        return {}
    return {
        f"graphEvidence.reasonType.{identifier}": "graph_path",
        f"graphEvidence.pathText.{identifier}": path_text,
        f"graphEvidence.graphDepth.{identifier}": "1",
    }


def _vector_evidence(
    identifier: str,
    file_id: str | None,
    source_file_path: str | None,
    path_text: str | None,
) -> dict[str, str]:
    """1 行の証拠（出典・元ファイル・Graph の根拠）を作る。

    Parameters
    ----------
    identifier : str
        チャンク ID。
    file_id : str | None
        ファイル ID。
    source_file_path : str | None
        元ファイルのパス。
    path_text : str | None
        Graph の根拠のパス。

    Returns
    -------
    dict[str, str]
        証拠。
    """
    evidence: dict[str, str] = {}
    if file_id is not None and file_id.strip():
        evidence[f"sourceRef.{identifier}"] = file_id
    if source_file_path is not None and source_file_path.strip():
        evidence[f"sourceFilePath.{identifier}"] = source_file_path
    evidence.update(_graph_evidence(identifier, path_text))
    return evidence


class PsycopgPostgreSqlSearchClient:
    """psycopg で PostgreSQL のベクトル検索を行う（検索ごとに接続する）。"""

    def __init__(
        self, connect_function: Callable[[CoreVectorDbTarget], Any] | None = None
    ) -> None:
        """接続の作り方を受け取る（テストで差し替える）。

        Parameters
        ----------
        connect_function : Callable[[CoreVectorDbTarget], Any] | None
            接続先から接続を作る関数。省略すると psycopg で接続する。
        """
        self._connect = connect_function or connect

    def search(
        self,
        target: CoreVectorDbTarget,
        query_vector: Sequence[float],
        max_results: int,
        current_only: bool = False,
        tenant_id: str = DEFAULT_TENANT_ID,
    ) -> list[CoreVectorSearchResult]:
        """クエリのベクトルに近い順に上位を返す。

        Parameters
        ----------
        target : CoreVectorDbTarget
            接続先。
        query_vector : Sequence[float]
            クエリのベクトル。
        max_results : int
            最大件数。
        current_only : bool
            Graph 検索用に、現行の文書・チャンクと結び付けるか。
        tenant_id : str
            テナント（`current_only` のとき使う）。

        Returns
        -------
        list[CoreVectorSearchResult]
            検索結果（順位は 1 から）。
        """
        table_name = safe_identifier(target.required_table_name())
        with self._connect(target) as connection:
            exists = connection.execute(FILEPATH_COLUMN_SQL, (table_name,)).fetchone()
            filepath = (
                "v.filepath" if exists and exists[0] else "NULL::text AS filepath"
            )
            graph = (
                ", s02_match.graph_path_text"
                if current_only
                else ", NULL::text AS graph_path_text"
            )
            sql = (
                f"SELECT v.id, v.content, v.fileid, {filepath}{graph} "
                f"FROM public.{table_name} v"
                + (_GRAPH_JOIN if current_only else "")
                + " ORDER BY v.embedding <=> %s::vector LIMIT %s"
            )
            params: list[object] = []
            if current_only:
                params.append(
                    tenant_id.strip()
                    if tenant_id and tenant_id.strip()
                    else DEFAULT_TENANT_ID
                )
            params.append(vector_literal(query_vector))
            params.append(max_results)
            rows = connection.execute(sql, params).fetchall()
        results: list[CoreVectorSearchResult] = []
        for row_number, row in enumerate(rows):
            identifier = str(row[0])
            results.append(
                CoreVectorSearchResult(
                    identifier,
                    row[1] or "",
                    row_number + 1,
                    _vector_evidence(identifier, row[2], row[3], row[4]),
                )
            )
        return results
