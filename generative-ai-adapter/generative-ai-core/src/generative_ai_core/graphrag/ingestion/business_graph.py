"""受け入れたチャンクのエッジを Apache AGE のグラフへ投影する（移植元 JdbcBusinessGraphProjectionService ほか）。"""

import json
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any, Protocol

import psycopg

from generative_ai_core.graphrag.ingestion.graph_setting import (
    DEFAULT_GRAPH_NAME,
    IngestionGraphSetting,
)
from generative_ai_core.graphrag.ingestion.request import IngestionRequest

LOAD_AGE_SQL = "LOAD 'age'"
SEARCH_PATH_SQL = 'SET search_path = ag_catalog, "$user", public'
BUSINESS_RELATIONSHIP_CYPHER = (
    "MERGE (source:BusinessEntity {tenantId: $tenantId, entityId: $sourceEntityId}) "
    "SET source.entityType = $sourceEntityType, "
    "source.labelHash = $sourceLabelHash, "
    "source.sourceChunkId = $sourceChunkId, "
    "source.candidateOnly = true "
    "MERGE (target:BusinessEntity {tenantId: $tenantId, entityId: $targetEntityId}) "
    "SET target.entityType = $targetEntityType, "
    "target.labelHash = $targetLabelHash, "
    "target.sourceChunkId = $sourceChunkId, "
    "target.candidateOnly = true "
    "MERGE (source)-[relation:BUSINESS_RELATION "
    "{tenantId: $tenantId, edgeId: $edgeId}]->(target) "
    "SET relation.edgeType = $edgeType, "
    "relation.edgeStatus = $edgeStatus, "
    "relation.sourceChunkId = $sourceChunkId, "
    "relation.sourceEvidenceId = $sourceEvidenceId, "
    "relation.trustLevel = $trustLevel, "
    "relation.verificationStatus = $verificationStatus, "
    "relation.classificationRank = $classificationRank, "
    "relation.aclMode = $aclMode, "
    "relation.aclPrincipalIds = $aclPrincipalIds, "
    "relation.aclRevision = $aclRevision, "
    "relation.candidateOnly = true "
    "RETURN relation.edgeId AS edgeId"
)
PROJECTION_ROWS_SQL = (
    "select e.tenant_id, e.edge_id, e.source_entity_id, "
    "src.entity_type as source_entity_type, "
    "src.canonical_label_hash as source_label_hash, "
    "e.target_entity_id, tgt.entity_type as target_entity_type, "
    "tgt.canonical_label_hash as target_label_hash, "
    "e.edge_type, e.edge_status, ev.evidence_id, ev.chunk_id, "
    "coalesce(origin.trust_level, 'deterministic_extracted') as trust_level, "
    "coalesce(origin.verification_status, e.edge_status) as verification_status, "
    "e.classification_rank, e.acl_mode, e.acl_principal_ids, e.acl_revision "
    "from graphrag_s02.kg_edges e "
    "join graphrag_s02.entities src on src.tenant_id = e.tenant_id "
    "and src.entity_id = e.source_entity_id "
    "join graphrag_s02.entities tgt on tgt.tenant_id = e.tenant_id "
    "and tgt.entity_id = e.target_entity_id "
    "join graphrag_s02.kg_edge_evidence kee on kee.tenant_id = e.tenant_id "
    "and kee.edge_id = e.edge_id "
    "join graphrag_s02.evidence_items ev on ev.tenant_id = kee.tenant_id "
    "and ev.evidence_id = kee.evidence_id "
    "left join graphrag_s02.llm_candidate_origins origin "
    "on origin.tenant_id = e.tenant_id and origin.candidate_id = e.edge_id "
    "and origin.source_chunk_id = ev.chunk_id "
    "where e.tenant_id = %s and ev.chunk_id = %s "
    "and e.edge_status <> 'rejected' "
    "order by e.edge_id, ev.evidence_id"
)


def _trim(value: str | None) -> str:
    """前後の空白を除く（None は空文字）。

    Parameters
    ----------
    value : str | None
        文字列。

    Returns
    -------
    str
        整えた文字列。
    """
    return "" if value is None else value.strip()


def _default_text(value: str | None, fallback: str) -> str:
    """空なら既定値にする。

    Parameters
    ----------
    value : str | None
        文字列。
    fallback : str
        既定値。

    Returns
    -------
    str
        整えた文字列。
    """
    normalized = _trim(value)
    return normalized if normalized else fallback


@dataclass(frozen=True)
class BusinessGraphProjectionCommand:
    """AGE に投影する 1 件の Cypher とそのパラメーター。"""

    graph_name: str | None
    cypher: str | None
    parameters: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        """グラフ名を検査し、Cypher・パラメーターの既定値を補う。"""
        object.__setattr__(
            self,
            "graph_name",
            IngestionGraphSetting.make_enabled(
                self.graph_name, "PostgreSQL"
            ).graph_name,
        )
        object.__setattr__(self, "cypher", self.cypher or "")
        object.__setattr__(self, "parameters", dict(self.parameters or {}))

    def age_cypher_sql(self) -> str:
        """`ag_catalog.cypher(...)` を呼ぶ SQL を返す（パラメーターは 1 つ）。

        Returns
        -------
        str
            SQL。
        """
        return (
            f"SELECT * FROM ag_catalog.cypher('{self.graph_name}', $$ "
            f"{self.cypher} $$, %s) AS (edgeId ag_catalog.agtype)"
        )


@dataclass(frozen=True)
class BusinessGraphProjectionRow:
    """投影するエッジ 1 件分の行（エッジ・両端・根拠・ACL）。"""

    tenant_id: str | None
    edge_id: str | None
    source_entity_id: str | None
    source_entity_type: str | None
    source_label_hash: str | None
    target_entity_id: str | None
    target_entity_type: str | None
    target_label_hash: str | None
    edge_type: str | None
    edge_status: str | None
    evidence_id: str | None
    source_chunk_id: str | None
    trust_level: str | None
    verification_status: str | None
    classification_rank: int
    acl_mode: str | None
    acl_principal_ids: tuple[str, ...] | list[str] | None
    acl_revision: int

    def __post_init__(self) -> None:
        """文字列を整え、空の項目に既定値を補う。"""
        set_ = object.__setattr__
        edge_status = _default_text(self.edge_status, "candidate")
        set_(self, "tenant_id", _trim(self.tenant_id))
        set_(self, "edge_id", _trim(self.edge_id))
        set_(self, "source_entity_id", _trim(self.source_entity_id))
        set_(
            self,
            "source_entity_type",
            _default_text(self.source_entity_type, "UNKNOWN"),
        )
        set_(self, "source_label_hash", _trim(self.source_label_hash))
        set_(self, "target_entity_id", _trim(self.target_entity_id))
        set_(
            self,
            "target_entity_type",
            _default_text(self.target_entity_type, "UNKNOWN"),
        )
        set_(self, "target_label_hash", _trim(self.target_label_hash))
        set_(self, "edge_type", _default_text(self.edge_type, "RELATED_TO"))
        set_(self, "edge_status", edge_status)
        set_(self, "evidence_id", _trim(self.evidence_id))
        set_(self, "source_chunk_id", _trim(self.source_chunk_id))
        set_(
            self,
            "trust_level",
            _default_text(self.trust_level, "deterministic_extracted"),
        )
        set_(
            self,
            "verification_status",
            _default_text(self.verification_status, edge_status),
        )
        set_(self, "acl_mode", _default_text(self.acl_mode, "tenant_wide"))
        set_(self, "acl_principal_ids", tuple(self.acl_principal_ids or ()))

    def has_evidence_linkage(self) -> bool:
        """エッジ・両端・根拠・チャンクがすべてそろっているか。

        Returns
        -------
        bool
            そろっていれば True。
        """
        return all(
            (
                self.edge_id,
                self.source_entity_id,
                self.target_entity_id,
                self.evidence_id,
                self.source_chunk_id,
            )
        )


class BusinessGraphProjectionService(Protocol):
    """受け入れたチャンクのエッジをグラフに投影するもの。"""

    def project_accepted_chunk(self, request: IngestionRequest, chunk_id: str) -> int:
        """チャンクのエッジを投影する。

        Parameters
        ----------
        request : IngestionRequest
            取り込みの要求。
        chunk_id : str
            チャンク ID。

        Returns
        -------
        int
            投影したエッジの数。
        """
        ...


class NoopBusinessGraphProjectionService:
    """何も投影しない実装（移植元 `BusinessGraphProjectionService.noop()`）。"""

    def project_accepted_chunk(self, request: IngestionRequest, chunk_id: str) -> int:
        """何もせず 0 を返す。

        Parameters
        ----------
        request : IngestionRequest
            取り込みの要求。
        chunk_id : str
            チャンク ID。

        Returns
        -------
        int
            常に 0。
        """
        return 0


BusinessGraphProjectionReader = Callable[[str, str], list[BusinessGraphProjectionRow]]
"""テナント ID・チャンク ID から投影する行を読む関数。"""

BusinessGraphProjectionExecutor = Callable[[BusinessGraphProjectionCommand], None]
"""投影の 1 件を実行する関数。"""


def _text_list(value: object) -> tuple[str, ...]:
    """text[] の値を文字列の組にする（空要素は除く）。

    Parameters
    ----------
    value : object
        DB から読んだ配列。

    Returns
    -------
    tuple[str, ...]
        文字列の組。
    """
    if not isinstance(value, (list, tuple)):
        return ()
    return tuple(str(item) for item in value if item is not None and str(item).strip())


def jdbc_projection_reader(
    connection: "psycopg.Connection[Any]",
) -> BusinessGraphProjectionReader:
    """DB から投影する行を読む関数を作る。

    Parameters
    ----------
    connection : psycopg.Connection
        PostgreSQL の接続。

    Returns
    -------
    BusinessGraphProjectionReader
        行を読む関数。
    """

    def read(tenant_id: str, chunk_id: str) -> list[BusinessGraphProjectionRow]:
        """チャンクに根拠のあるエッジを読む。

        Parameters
        ----------
        tenant_id : str
            テナント ID。
        chunk_id : str
            チャンク ID。

        Returns
        -------
        list[BusinessGraphProjectionRow]
            投影する行。
        """
        with connection.cursor() as cursor:
            cursor.execute(PROJECTION_ROWS_SQL, (tenant_id, chunk_id))
            rows = cursor.fetchall()
        return [
            BusinessGraphProjectionRow(
                row[0],
                row[1],
                row[2],
                row[3],
                row[4],
                row[5],
                row[6],
                row[7],
                row[8],
                row[9],
                row[10],
                row[11],
                row[12],
                row[13],
                int(row[14]),
                row[15],
                _text_list(row[16]),
                int(row[17]),
            )
            for row in rows
        ]

    return read


def jdbc_age_executor(
    connection: "psycopg.Connection[Any]",
) -> BusinessGraphProjectionExecutor:
    """AGE に Cypher を実行する関数を作る。

    Parameters
    ----------
    connection : psycopg.Connection
        PostgreSQL の接続。

    Returns
    -------
    BusinessGraphProjectionExecutor
        Cypher を実行する関数。
    """

    def execute(command: BusinessGraphProjectionCommand) -> None:
        """AGE のセッションを用意して Cypher を実行する。

        Parameters
        ----------
        command : BusinessGraphProjectionCommand
            実行する投影。
        """
        with connection.cursor() as cursor:
            cursor.execute(LOAD_AGE_SQL)
            cursor.execute(SEARCH_PATH_SQL)
            # AGE のパラメーターは agtype として渡す。JSON 文字列を型未指定の
            # パラメーター（unknown）で渡すと、サーバー側で agtype として解釈される
            cursor.execute(
                command.age_cypher_sql(),
                (json.dumps(command.parameters, ensure_ascii=False),),
            )
            cursor.fetchall()

    return execute


class JdbcBusinessGraphProjectionService:
    """DB のエッジ・根拠を読み、AGE の `BUSINESS_RELATION` として投影する。"""

    def __init__(
        self,
        reader: BusinessGraphProjectionReader,
        executor: BusinessGraphProjectionExecutor,
        graph_name: str | None = DEFAULT_GRAPH_NAME,
    ) -> None:
        """読み取りと実行の関数を受け取る。

        Parameters
        ----------
        reader : BusinessGraphProjectionReader
            投影する行を読む関数。
        executor : BusinessGraphProjectionExecutor
            投影を実行する関数。
        graph_name : str | None
            AGE のグラフ名。
        """
        self._reader = reader
        self._executor = executor
        self._graph_name = IngestionGraphSetting.make_enabled(
            graph_name, "PostgreSQL"
        ).graph_name

    @classmethod
    def from_connection(
        cls,
        connection: "psycopg.Connection[Any]",
        graph_name: str | None = DEFAULT_GRAPH_NAME,
    ) -> "JdbcBusinessGraphProjectionService":
        """接続から作る。

        Parameters
        ----------
        connection : psycopg.Connection
            PostgreSQL の接続。
        graph_name : str | None
            AGE のグラフ名。

        Returns
        -------
        JdbcBusinessGraphProjectionService
            サービス。
        """
        return cls(
            jdbc_projection_reader(connection),
            jdbc_age_executor(connection),
            graph_name,
        )

    def project_accepted_chunk(self, request: IngestionRequest, chunk_id: str) -> int:
        """チャンクの根拠付きエッジを AGE に投影する。

        Parameters
        ----------
        request : IngestionRequest
            取り込みの要求。
        chunk_id : str
            チャンク ID。

        Returns
        -------
        int
            投影したエッジの数。根拠の連鎖が欠けた行は飛ばす。
        """
        if (
            request is None
            or not (request.tenant_id and request.tenant_id.strip())
            or not (chunk_id and chunk_id.strip())
        ):
            return 0
        projected = 0
        for row in self._reader(request.tenant_id, chunk_id):
            if not row.has_evidence_linkage():
                continue
            self._executor(self._command(row, self._graph_name))
            projected += 1
        return projected

    @staticmethod
    def _command(
        row: BusinessGraphProjectionRow, graph_name: str
    ) -> BusinessGraphProjectionCommand:
        """行から投影の Cypher とパラメーターを作る。

        Parameters
        ----------
        row : BusinessGraphProjectionRow
            投影する行。
        graph_name : str
            AGE のグラフ名。

        Returns
        -------
        BusinessGraphProjectionCommand
            投影のコマンド。
        """
        parameters: dict[str, Any] = {
            "tenantId": row.tenant_id,
            "edgeId": row.edge_id,
            "sourceEntityId": row.source_entity_id,
            "sourceEntityType": row.source_entity_type,
            "sourceLabelHash": row.source_label_hash,
            "targetEntityId": row.target_entity_id,
            "targetEntityType": row.target_entity_type,
            "targetLabelHash": row.target_label_hash,
            "edgeType": row.edge_type,
            "edgeStatus": row.edge_status,
            "sourceChunkId": row.source_chunk_id,
            "sourceEvidenceId": row.evidence_id,
            "trustLevel": row.trust_level,
            "verificationStatus": row.verification_status,
            "classificationRank": row.classification_rank,
            "aclMode": row.acl_mode,
            "aclPrincipalIds": list(row.acl_principal_ids or ()),
            "aclRevision": row.acl_revision,
            "candidateOnly": True,
        }
        return BusinessGraphProjectionCommand(
            graph_name, BUSINESS_RELATIONSHIP_CYPHER, parameters
        )
