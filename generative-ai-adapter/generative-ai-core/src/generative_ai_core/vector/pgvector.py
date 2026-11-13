"""PostgreSQL（pgvector）のプロバイダ（移植元 PgVectorCoreVectorDbProvider）。

SQL は移植元のものをそのまま使う（`?` のプレースホルダーは `jdbc.JdbcTemplate` が
psycopg の形式に変換する）。
"""

import math
import uuid
from collections.abc import Sequence

from generative_ai_core.failure import CoreFailure
from generative_ai_core.vector.compensating_constants import (
    LAYER_GRAPH_RAG,
    LAYER_VECTOR,
    METADATA_COMPENSATING_LAYER,
    REASON_ALREADY_ABSENT,
)
from generative_ai_core.vector.graph import (
    CoreAgeGraphWriteService,
    CoreGraphFailureClassifier,
)
from generative_ai_core.vector.jdbc import (
    ConnectionFactory,
    JdbcTemplate,
    default_connection_factory,
)
from generative_ai_core.vector.model import (
    CoreGraphWriteResult,
    CoreVectorDbOperation,
    CoreVectorDbRequest,
    CoreVectorDbResult,
    CoreVectorSearchMatch,
)
from generative_ai_core.vector.schema import (
    PgVectorSchemaInitializer,
    qualified_table_name,
    safe_identifier,
)

PROVIDER_ID = "PostgreSQL"
FILE_UNIQUE_ID_DELETE_RESULT_ID = "fileUniqueId-delete"
DEFAULT_SEARCH_LIMIT = "3"

_CHUNK_TABLES_CLEANUP_ORDER = (
    "answer_claim_evidence",
    "kg_edge_evidence",
)


def search_limit(request: CoreVectorDbRequest) -> int:
    """検索件数の上限を metadata の `limit` から読む。

    Parameters
    ----------
    request : CoreVectorDbRequest
        要求。

    Returns
    -------
    int
        1 以上の件数（未指定は 3）。

    Raises
    ------
    ValueError
        数値でないとき。
    """
    value = request.metadata.get("limit", DEFAULT_SEARCH_LIMIT)
    try:
        return max(1, int(value))
    except ValueError as e:
        raise ValueError("Search limit must be numeric") from e


def vector_literal(vector: Sequence[float]) -> str:
    """pgvector のリテラル（`[0.1,0.2]`）にする。

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
    parts: list[str] = []
    for value in vector:
        if math.isnan(value) or math.isinf(value):
            raise ValueError("vector contains non-finite value")
        parts.append(repr(float(value)))
    return "[" + ",".join(parts) + "]"


def parse_vector(value: str | None) -> tuple[float, ...]:
    """pgvector の文字列表現（`[0.1,0.2]`）を数値の組にする。

    Parameters
    ----------
    value : str | None
        文字列表現。

    Returns
    -------
    tuple[float, ...]
        ベクトル。空なら空。

    Raises
    ------
    ValueError
        数値でない・非有限値を含むとき。
    """
    if value is None or not value.strip():
        return ()
    normalized = value.strip()
    if normalized.startswith("[") and normalized.endswith("]"):
        normalized = normalized[1:-1]
    if not normalized.strip():
        return ()
    result: list[float] = []
    for part in normalized.split(","):
        parsed = float(part.strip())
        if math.isnan(parsed) or math.isinf(parsed):
            raise ValueError("vector contains non-finite value")
        result.append(parsed)
    return tuple(result)


def _nullable_text(value: str | None) -> str | None:
    """空文字・空白だけの値を None にする。

    Parameters
    ----------
    value : str | None
        文字列。

    Returns
    -------
    str | None
        空なら None。
    """
    return None if value is None or not value.strip() else value


def _delete_file_unique_id(request: CoreVectorDbRequest) -> str:
    """削除対象のファイル ID を決める（なければ payload の id）。

    Parameters
    ----------
    request : CoreVectorDbRequest
        要求。

    Returns
    -------
    str
        ファイル ID。

    Raises
    ------
    ValueError
        どちらも空のとき。
    """
    file_unique_id = request.payload.file_unique_id.strip()
    if not file_unique_id:
        file_unique_id = request.payload.id.strip()
    if not file_unique_id:
        raise ValueError("fileUniqueId must not be blank")
    return file_unique_id


class PgVectorCoreVectorDbProvider:
    """PostgreSQL（pgvector）への保存・更新・削除・検索と Graph 書き込み。"""

    def __init__(self, connection_factory: ConnectionFactory | None = None) -> None:
        """接続の作り方を受け取る。

        Parameters
        ----------
        connection_factory : ConnectionFactory | None
            接続を作る関数。テストで差し替える。省略時は psycopg で接続する。
        """
        self._connection_factory = connection_factory or default_connection_factory
        self._graph_failure_classifier = CoreGraphFailureClassifier()

    def provider_id(self) -> str:
        """プロバイダ ID を返す。

        Returns
        -------
        str
            `PostgreSQL`。
        """
        return PROVIDER_ID

    def execute(self, request: CoreVectorDbRequest) -> CoreVectorDbResult:
        """要求を実行する。

        Parameters
        ----------
        request : CoreVectorDbRequest
            要求。

        Returns
        -------
        CoreVectorDbResult
            結果。
        """
        template = JdbcTemplate(request.target, self._connection_factory)
        operation = request.operation
        if operation == CoreVectorDbOperation.GRAPH_WRITE:
            return self._execute_graph_write(request, template)
        if operation == CoreVectorDbOperation.GRAPH_DELETE:
            return self._execute_graph_delete(request, template)
        if operation == CoreVectorDbOperation.SEARCH:
            return self._search(request, template)

        raw_table_name = request.target.required_table_name()
        safe_table_name = safe_identifier(raw_table_name, "tableName")
        table_name = qualified_table_name(safe_table_name)
        if operation == CoreVectorDbOperation.DELETE:
            return self._delete(request, template, table_name)
        if request.target.initialize_schema:
            initialization = self._initialize_schema(request, template, raw_table_name)
            if not initialization.success:
                return initialization
        self._upsert(request, template, table_name, safe_table_name)
        if (
            request.graph_write_setting.enabled
            and request.graph_chunk_payload.has_chunk()
        ):
            graph_write = self._execute_graph_write(request, template)
            if not graph_write.success:
                return graph_write
            return CoreVectorDbResult.ok(
                request.payload.id,
                operation,
                graph_write.graph_result or CoreGraphWriteResult.disabled(),
            )
        return CoreVectorDbResult.ok(request.payload.id, operation)

    def _upsert(
        self,
        request: CoreVectorDbRequest,
        template: JdbcTemplate,
        table_name: str,
        safe_table_name: str,
    ) -> None:
        """1 行を挿入し、同じ id があれば更新する。

        Parameters
        ----------
        request : CoreVectorDbRequest
            要求。
        template : JdbcTemplate
            実行器。
        table_name : str
            修飾済みのテーブル名。
        safe_table_name : str
            検証済みのテーブル名（修飾なし）。
        """
        payload = request.payload
        row_id = uuid.UUID(payload.id)
        literal = vector_literal(payload.vector)
        if request.target.initialize_schema or self._has_filepath_column(
            template, safe_table_name
        ):
            source_file_path = _nullable_text(payload.source_file_path)
            sql = (
                f"INSERT INTO {table_name}"
                " (id, fileid, filepath, content, embedding) VALUES (?, ?, ?, ?, ?::vector) "
                "ON CONFLICT (id) DO UPDATE SET fileid = ?, filepath = ?, content = ?, "
                "embedding = ?::vector"
            )
            template.update(
                sql,
                row_id,
                payload.file_unique_id,
                source_file_path,
                payload.content,
                literal,
                payload.file_unique_id,
                source_file_path,
                payload.content,
                literal,
            )
        else:
            sql = (
                f"INSERT INTO {table_name}"
                " (id, fileid, content, embedding) VALUES (?, ?, ?, ?::vector) "
                "ON CONFLICT (id) DO UPDATE SET fileid = ?, content = ?, "
                "embedding = ?::vector"
            )
            template.update(
                sql,
                row_id,
                payload.file_unique_id,
                payload.content,
                literal,
                payload.file_unique_id,
                payload.content,
                literal,
            )

    def _delete(
        self, request: CoreVectorDbRequest, template: JdbcTemplate, table_name: str
    ) -> CoreVectorDbResult:
        """ファイル ID を指定した削除（ベクトル行・Graph・GraphRAG の各層）。

        Parameters
        ----------
        request : CoreVectorDbRequest
            要求。
        template : JdbcTemplate
            実行器。
        table_name : str
            修飾済みのテーブル名。

        Returns
        -------
        CoreVectorDbResult
            結果。
        """
        operation = request.operation
        layer = request.metadata.get(METADATA_COMPENSATING_LAYER, "").strip()
        vector_only = layer == LAYER_VECTOR
        graph_rag_only = layer == LAYER_GRAPH_RAG
        graph_enabled = request.graph_write_setting.enabled
        file_unique_id = _delete_file_unique_id(request)
        target_ids = (
            self._resolve_vector_row_ids(template, table_name, file_unique_id)
            if graph_enabled and not graph_rag_only
            else []
        )

        chunk_delete = CoreVectorDbResult.ok(FILE_UNIQUE_ID_DELETE_RESULT_ID, operation)
        if not vector_only:
            chunk_delete = self._execute_graph_rag_chunk_delete(request, template)
            if not chunk_delete.success:
                return chunk_delete

        graph_result = chunk_delete.graph_result or CoreGraphWriteResult.disabled()
        if graph_enabled and not graph_rag_only and target_ids:
            graph_delete = self._execute_graph_delete(request, template, target_ids)
            if not graph_delete.success and not self._is_benign_graph_absence(
                graph_delete
            ):
                return graph_delete
            if graph_delete.success:
                graph_result = graph_delete.graph_result or graph_result

        if not graph_rag_only:
            if graph_enabled:
                self._delete_vector_rows_by_ids(template, table_name, target_ids)
            else:
                template.update(
                    f"DELETE FROM {table_name} WHERE fileid = ?", file_unique_id
                )
        if vector_only:
            return CoreVectorDbResult.ok(FILE_UNIQUE_ID_DELETE_RESULT_ID, operation)
        return CoreVectorDbResult.ok(
            FILE_UNIQUE_ID_DELETE_RESULT_ID, operation, graph_result
        )

    def _initialize_schema(
        self, request: CoreVectorDbRequest, template: JdbcTemplate, table_name: str
    ) -> CoreVectorDbResult:
        """スキーマを初期化し、失敗は結果にする。

        Parameters
        ----------
        request : CoreVectorDbRequest
            要求。
        template : JdbcTemplate
            実行器。
        table_name : str
            テーブル名。

        Returns
        -------
        CoreVectorDbResult
            成功か失敗の結果。
        """
        try:
            PgVectorSchemaInitializer(template).initialize(table_name)
            return CoreVectorDbResult.ok(request.payload.id, request.operation)
        except Exception as e:  # noqa: BLE001 — 移植元と同じく失敗の結果にして返す
            return CoreVectorDbResult.fail(
                request.operation,
                CoreFailure.from_exception("PGVECTOR_SCHEMA_INITIALIZATION_FAILED", e),
            )

    def _search(
        self, request: CoreVectorDbRequest, template: JdbcTemplate
    ) -> CoreVectorDbResult:
        """コサイン距離の近い順に検索する。

        Parameters
        ----------
        request : CoreVectorDbRequest
            要求。
        template : JdbcTemplate
            実行器。

        Returns
        -------
        CoreVectorDbResult
            検索結果。
        """
        table_name = qualified_table_name(request.target.required_table_name())
        sql = (
            "SELECT id::text AS id, COALESCE(content, '') AS content, "
            "embedding::text AS embedding, COALESCE(fileid::text, '') AS fileid FROM "
            f"{table_name} ORDER BY embedding <=> ?::vector LIMIT ?"
        )
        rows = template.query(
            sql,
            vector_literal(request.payload.vector),
            search_limit(request),
        )
        matches = [
            CoreVectorSearchMatch(row[0], row[1], parse_vector(row[2]), row[3])
            for row in rows
        ]
        return CoreVectorDbResult.search_success(request.operation, matches)

    def _execute_graph_write(
        self, request: CoreVectorDbRequest, template: JdbcTemplate
    ) -> CoreVectorDbResult:
        """Graph にチャンクを書く。

        Parameters
        ----------
        request : CoreVectorDbRequest
            要求。
        template : JdbcTemplate
            実行器。

        Returns
        -------
        CoreVectorDbResult
            結果。失敗は結果の失敗にする。
        """
        if not request.graph_write_setting.enabled:
            return CoreVectorDbResult.ok(
                request.payload.id,
                request.operation,
                CoreGraphWriteResult.disabled(),
            )
        try:
            graph_result = self._graph_write_service(request, template).write_chunk(
                request.graph_chunk_payload
            )
            return CoreVectorDbResult.ok(
                request.payload.id,
                request.operation,
                graph_result,
            )
        except Exception as e:  # noqa: BLE001 — 移植元と同じく失敗の結果にして返す
            return self._graph_failure(request, e)

    def _execute_graph_delete(
        self,
        request: CoreVectorDbRequest,
        template: JdbcTemplate,
        delete_ids: Sequence[str] | None = None,
    ) -> CoreVectorDbResult:
        """Graph からベクトル行 ID に対応するノードを消す。

        Parameters
        ----------
        request : CoreVectorDbRequest
            要求。
        template : JdbcTemplate
            実行器。
        delete_ids : Sequence[str] | None
            消す ID。省略時は要求の削除 ID（なければ payload の id）。

        Returns
        -------
        CoreVectorDbResult
            結果。失敗は結果の失敗にする。
        """
        if not request.graph_write_setting.enabled:
            return CoreVectorDbResult.ok(
                request.payload.id,
                request.operation,
                CoreGraphWriteResult.disabled(),
            )
        try:
            if delete_ids is None:
                chunk = request.graph_chunk_payload
                delete_ids = (
                    chunk.delete_vector_row_ids
                    if chunk.has_delete_ids()
                    else (request.payload.id,)
                )
            graph_result = self._graph_write_service(request, template).delete_by_ids(
                delete_ids
            )
            return CoreVectorDbResult.ok(
                request.payload.id,
                request.operation,
                graph_result,
            )
        except Exception as e:  # noqa: BLE001 — 移植元と同じく失敗の結果にして返す
            return self._graph_failure(request, e)

    def _resolve_vector_row_ids(
        self, template: JdbcTemplate, table_name: str, file_unique_id: str
    ) -> list[str]:
        """ファイル ID に対応するベクトル行 ID を引く。

        Parameters
        ----------
        template : JdbcTemplate
            実行器。
        table_name : str
            修飾済みのテーブル名。
        file_unique_id : str
            ファイル ID。

        Returns
        -------
        list[str]
            ベクトル行 ID。
        """
        rows = template.query(
            f"SELECT id AS id FROM {table_name} WHERE fileid = ?", file_unique_id
        )
        ids: list[str] = []
        for row in rows:
            if row[0] is not None and str(row[0]).strip():
                ids.append(str(row[0]).strip())
        return ids

    def _delete_vector_rows_by_ids(
        self, template: JdbcTemplate, table_name: str, ids: Sequence[str]
    ) -> None:
        """解決済みのベクトル行 ID の行を消す。

        Parameters
        ----------
        template : JdbcTemplate
            実行器。
        table_name : str
            修飾済みのテーブル名。
        ids : Sequence[str]
            ベクトル行 ID（UUID）。
        """
        if not ids:
            return
        placeholders = ", ".join("?" for _ in ids)
        template.update(
            f"DELETE FROM {table_name} WHERE id IN ({placeholders})",
            *[uuid.UUID(i) for i in ids],
        )

    def _execute_graph_rag_chunk_delete(
        self, request: CoreVectorDbRequest, template: JdbcTemplate
    ) -> CoreVectorDbResult:
        """GraphRAG（graphrag_s02 スキーマ）のチャンク・文書を消す。

        Parameters
        ----------
        request : CoreVectorDbRequest
            要求。
        template : JdbcTemplate
            実行器。

        Returns
        -------
        CoreVectorDbResult
            結果。何も消えなかったときは「不在でスキップ」の結果。
        """
        tenant_id = request.metadata.get("tenantId", "").strip()
        chunk_id = request.metadata.get("graphRagChunkId", "").strip()
        source_ref = request.metadata.get("graphRagSourceRef", "").strip()
        file_unique_id = _delete_file_unique_id(request)
        if not tenant_id:
            return CoreVectorDbResult.fail(
                request.operation,
                CoreFailure.of(
                    "GRAPH_RAG_CHUNK_DELETE_MISSING_TENANT",
                    "tenant metadata is required for graph rag chunk cleanup",
                ),
            )
        try:
            if not chunk_id:
                affected = self._delete_by_file_unique_id(
                    template,
                    request.target.required_table_name(),
                    tenant_id,
                    file_unique_id if not source_ref.strip() else source_ref,
                )
            else:
                affected = self._delete_by_chunk_id(
                    template, tenant_id, chunk_id, source_ref
                )
            if affected == 0:
                return CoreVectorDbResult.ok(
                    FILE_UNIQUE_ID_DELETE_RESULT_ID,
                    request.operation,
                    CoreGraphWriteResult.absent_skipped([], REASON_ALREADY_ABSENT),
                )
            return CoreVectorDbResult.ok(
                FILE_UNIQUE_ID_DELETE_RESULT_ID, request.operation
            )
        except Exception as e:  # noqa: BLE001 — 移植元と同じく失敗の結果にして返す
            return CoreVectorDbResult.fail(
                request.operation,
                CoreFailure.from_exception("GRAPH_RAG_CHUNK_DELETE_FAILED", e),
            )

    def _delete_by_file_unique_id(
        self,
        template: JdbcTemplate,
        raw_table_name: str,
        tenant_id: str,
        file_unique_id: str,
    ) -> int:
        """ファイル ID に紐づく GraphRAG のチャンクをまとめて消す。

        Parameters
        ----------
        template : JdbcTemplate
            実行器。
        raw_table_name : str
            ベクトルテーブル名（修飾前）。
        tenant_id : str
            テナント ID。
        file_unique_id : str
            ファイル ID（文書の source_label_sanitized）。

        Returns
        -------
        int
            影響した行数の合計。
        """
        table_name = qualified_table_name(raw_table_name)
        chunk_predicate = (
            "select c.chunk_id from graphrag_s02.chunks c "
            "join graphrag_s02.documents d on d.tenant_id = c.tenant_id "
            "and d.document_id = c.document_id "
            f"join {table_name} v on v.fileid = d.source_label_sanitized "
            "and c.content_hash = 'content-' || substring(encode(sha256("
            "convert_to(v.content, 'UTF8')), 'hex') from 1 for 24) "
            "where d.tenant_id = ? and d.source_label_sanitized = ?"
        )
        return self._delete_by_chunk_predicate(
            template, tenant_id, file_unique_id, chunk_predicate
        )

    def _delete_by_chunk_predicate(
        self,
        template: JdbcTemplate,
        tenant_id: str,
        file_unique_id: str,
        chunk_predicate: str,
    ) -> int:
        """チャンクを選ぶ副問い合わせで、関連テーブルを順に消す。

        Parameters
        ----------
        template : JdbcTemplate
            実行器。
        tenant_id : str
            テナント ID。
        file_unique_id : str
            ファイル ID。
        chunk_predicate : str
            チャンク ID を返す副問い合わせ（`?` を 2 つ含む）。

        Returns
        -------
        int
            影響した行数の合計。
        """
        evidence = (
            "where tenant_id = ? and evidence_id in ("
            "select evidence_id from graphrag_s02.evidence_items "
            f"where tenant_id = ? and chunk_id in ({chunk_predicate}))"
        )
        affected = 0
        for table in _CHUNK_TABLES_CLEANUP_ORDER:
            affected += template.update(
                f"delete from graphrag_s02.{table} {evidence}",
                tenant_id,
                tenant_id,
                tenant_id,
                file_unique_id,
            )
        for table, column in (
            ("embedding_queue", "chunk_id"),
            ("llm_candidate_origins", "source_chunk_id"),
            ("chunk_embeddings", "chunk_id"),
            ("chunk_identifiers", "chunk_id"),
            ("evidence_items", "chunk_id"),
            ("chunks", "chunk_id"),
        ):
            affected += template.update(
                f"delete from graphrag_s02.{table} where tenant_id = ? "
                f"and {column} in ({chunk_predicate})",
                tenant_id,
                tenant_id,
                file_unique_id,
            )
        affected += self._delete_document_family_if_orphaned(
            template, tenant_id, file_unique_id
        )
        return affected

    def _delete_by_chunk_id(
        self, template: JdbcTemplate, tenant_id: str, chunk_id: str, source_ref: str
    ) -> int:
        """チャンク ID を指定して GraphRAG のチャンクを消す。

        Parameters
        ----------
        template : JdbcTemplate
            実行器。
        tenant_id : str
            テナント ID。
        chunk_id : str
            GraphRAG のチャンク ID。
        source_ref : str
            ソース参照。空でなければチャンクのなくなった文書も消す。

        Returns
        -------
        int
            影響した行数の合計。
        """
        affected = 0
        for table in _CHUNK_TABLES_CLEANUP_ORDER:
            affected += template.update(
                f"delete from graphrag_s02.{table} "
                "where tenant_id = ? and evidence_id in ("
                "select evidence_id from graphrag_s02.evidence_items "
                "where tenant_id = ? and chunk_id = ?)",
                tenant_id,
                tenant_id,
                chunk_id,
            )
        affected += template.update(
            "delete from graphrag_s02.embedding_queue where tenant_id = ? and chunk_id = ?",
            tenant_id,
            chunk_id,
        )
        affected += template.update(
            "delete from graphrag_s02.llm_candidate_origins where tenant_id = ? "
            "and source_chunk_id = ?",
            tenant_id,
            chunk_id,
        )
        for table in (
            "chunk_embeddings",
            "chunk_identifiers",
            "evidence_items",
            "chunks",
        ):
            affected += template.update(
                f"delete from graphrag_s02.{table} where tenant_id = ? and chunk_id = ?",
                tenant_id,
                chunk_id,
            )
        if source_ref.strip():
            affected += self._delete_document_family_if_orphaned(
                template, tenant_id, source_ref
            )
        return affected

    def _delete_document_family_if_orphaned(
        self, template: JdbcTemplate, tenant_id: str, source_ref: str
    ) -> int:
        """チャンクのなくなった文書と、その付随テーブルを消す。

        Parameters
        ----------
        template : JdbcTemplate
            実行器。
        tenant_id : str
            テナント ID。
        source_ref : str
            ソース参照（文書の source_label_sanitized）。

        Returns
        -------
        int
            影響した行数の合計。
        """
        orphan_documents = (
            "select d.document_id from graphrag_s02.documents d "
            "where d.tenant_id = ? and d.source_label_sanitized = ? "
            "and not exists (select 1 from graphrag_s02.chunks c "
            "where c.tenant_id = d.tenant_id and c.document_id = d.document_id)"
        )
        affected = 0
        for table, alias in (
            ("acl_propagation_outbox", "o"),
            ("document_acl_grants", "g"),
            ("document_versions", "v"),
        ):
            affected += template.update(
                f"delete from graphrag_s02.{table} {alias} "
                f"where {alias}.tenant_id = ? and {alias}.document_id in ("
                f"{orphan_documents})",
                tenant_id,
                tenant_id,
                source_ref,
            )
        affected += template.update(
            "delete from graphrag_s02.documents d "
            "where d.tenant_id = ? and d.source_label_sanitized = ? "
            "and not exists (select 1 from graphrag_s02.chunks c "
            "where c.tenant_id = d.tenant_id and c.document_id = d.document_id)",
            tenant_id,
            source_ref,
        )
        return affected

    @staticmethod
    def _is_benign_graph_absence(graph_delete: CoreVectorDbResult) -> bool:
        """Graph の削除結果が「対象がなかっただけ」か。

        Parameters
        ----------
        graph_delete : CoreVectorDbResult
            Graph 削除の結果。

        Returns
        -------
        bool
            不在でスキップした結果なら True。
        """
        return graph_delete.graph_result is not None and (
            graph_delete.graph_result.is_absent_skipped()
        )

    @staticmethod
    def _graph_write_service(
        request: CoreVectorDbRequest, template: JdbcTemplate
    ) -> CoreAgeGraphWriteService:
        """要求のグラフ名で Graph 書き込みサービスを作る。

        Parameters
        ----------
        request : CoreVectorDbRequest
            要求。
        template : JdbcTemplate
            実行器。

        Returns
        -------
        CoreAgeGraphWriteService
            サービス。
        """
        return CoreAgeGraphWriteService(
            template,
            request.graph_write_setting.graph_name,
        )

    def _graph_failure(
        self, request: CoreVectorDbRequest, error: Exception
    ) -> CoreVectorDbResult:
        """Graph の例外を分類して失敗の結果にする。

        Parameters
        ----------
        request : CoreVectorDbRequest
            要求。
        error : Exception
            発生した例外。

        Returns
        -------
        CoreVectorDbResult
            失敗の結果。
        """
        chunk = request.graph_chunk_payload
        graph_result = self._graph_failure_classifier.classify(
            request.operation,
            chunk.file_id,
            chunk.vector_row_id,
            error,
        )
        return CoreVectorDbResult.fail(
            request.operation,
            CoreFailure.of(graph_result.cause_category, graph_result.message),
            graph_result,
        )

    @staticmethod
    def _has_filepath_column(template: JdbcTemplate, table_name: str) -> bool:
        """テーブルに filepath 列があるか。

        Parameters
        ----------
        template : JdbcTemplate
            実行器。
        table_name : str
            検証済みのテーブル名（修飾なし）。

        Returns
        -------
        bool
            あれば True。
        """
        exists = template.query_for_object(
            "SELECT EXISTS (SELECT 1 FROM information_schema.columns "
            "WHERE table_schema = 'public' AND table_name = ? "
            "AND column_name = 'filepath')",
            table_name,
        )
        return exists is True
