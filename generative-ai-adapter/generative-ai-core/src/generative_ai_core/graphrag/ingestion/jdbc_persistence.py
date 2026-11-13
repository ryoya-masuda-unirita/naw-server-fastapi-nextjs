"""取り込み結果を PostgreSQL（`graphrag_s02` スキーマ）に保存する（移植元 JdbcIngestionPersistenceAdapter）。

JDBC の `Connection` の代わりに psycopg 3 の接続を受け取る。接続の作成は呼び出し側の
責務で、テストでは偽の接続を渡して SQL を検証する。保存・置き換え・削除は 1 つの
トランザクションで行い、失敗したらロールバックする。
"""

import logging
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Any

import psycopg

from generative_ai_core.graphrag.bootstrap.gateway import (
    GraphRagRuntimeBootstrapper,
    GraphRagRuntimeBootstrapService,
    ready_noop,
)
from generative_ai_core.graphrag.bootstrap.models import (
    GraphRagRuntimeBootstrapRequest,
    GraphRagRuntimeTargetDescriptor,
)
from generative_ai_core.graphrag.ingestion.business_graph import (
    BusinessGraphProjectionService,
    JdbcBusinessGraphProjectionService,
    NoopBusinessGraphProjectionService,
)
from generative_ai_core.graphrag.ingestion.candidates import (
    IngestionEdgeCandidate,
    IngestionEntityCandidate,
    IngestionIdentifier,
    stable_id,
)
from generative_ai_core.graphrag.ingestion.extraction import IngestionExtraction
from generative_ai_core.graphrag.ingestion.graph_setting import (
    DEFAULT_GRAPH_NAME,
    IngestionGraphSetting,
)
from generative_ai_core.graphrag.ingestion.lifecycle import (
    SourceLifecycleRequest,
    SourceLifecycleResult,
    unsafe_lifecycle_text,
)
from generative_ai_core.graphrag.ingestion.llm.models import LlmCandidateOrigin
from generative_ai_core.graphrag.ingestion.persistence import (
    BaseIngestionPersistenceAdapter,
    validate_lifecycle_target,
)
from generative_ai_core.graphrag.ingestion.request import (
    IngestionRequest,
    IngestionRequestBuilder,
)
from generative_ai_core.graphrag.ingestion.result import (
    IngestionChunkDiffSummary,
    IngestionNonGoalProbe,
    IngestionResult,
    IngestionSchemaReadiness,
)

logger = logging.getLogger(__name__)

SCHEMA = "graphrag_s02"
OWNER_USER_ID = "tenant-wide-owner"
AUDIT_USER_ID = "s035-runtime"
REQUIRED_TABLES = (
    "documents",
    "document_versions",
    "chunks",
    "chunk_identifiers",
    "entities",
    "kg_edges",
    "evidence_items",
    "kg_edge_evidence",
    "document_acl_grants",
    "embedding_queue",
    "acl_propagation_outbox",
    "llm_candidate_origins",
)


@dataclass(frozen=True)
class _CurrentState:
    """文書の現行バージョンの状態。"""

    version_id: str
    content_hash: str
    chunk_id: str


class JdbcIngestionPersistenceAdapter(BaseIngestionPersistenceAdapter):
    """PostgreSQL に取り込み結果・ライフサイクルを保存する。"""

    def __init__(
        self,
        connection: "psycopg.Connection[Any] | None",
        graph_name: str | None = DEFAULT_GRAPH_NAME,
        runtime_bootstrapper: GraphRagRuntimeBootstrapper | None = None,
        business_graph_projection_service: BusinessGraphProjectionService | None = None,
    ) -> None:
        """接続・グラフ名・準備と投影の部品を受け取る。

        Parameters
        ----------
        connection : psycopg.Connection | None
            PostgreSQL の接続。None だとスキーマ未接続として拒否する。
            移植元の JDBC の既定に合わせ、自動コミットの接続を渡す
            （保存の間だけこのクラスが自動コミットを切る）。
        graph_name : str | None
            AGE のグラフ名。省略時は `secuaigent_core_graph`。
        runtime_bootstrapper : GraphRagRuntimeBootstrapper | None
            ランタイムの準備。省略時は接続を使う標準の準備（接続なしなら何もしない）。
        business_graph_projection_service : BusinessGraphProjectionService | None
            AGE への投影。省略時は接続を使う標準の投影（接続なしなら何もしない）。
        """
        self._connection = connection
        self._runtime_bootstrapper: GraphRagRuntimeBootstrapper = (
            runtime_bootstrapper
            or (
                ready_noop
                if connection is None
                else GraphRagRuntimeBootstrapService.jdbc(connection)
            )
        )
        self._graph_name = IngestionGraphSetting.make_enabled(
            graph_name, "PostgreSQL"
        ).graph_name
        self._projection: BusinessGraphProjectionService = (
            business_graph_projection_service
            or (
                NoopBusinessGraphProjectionService()
                if connection is None
                else JdbcBusinessGraphProjectionService.from_connection(
                    connection, self._graph_name
                )
            )
        )

    def _conn(self) -> "psycopg.Connection[Any]":
        """接続を返す（接続がないときは失敗にする）。

        Returns
        -------
        psycopg.Connection
            PostgreSQL の接続。

        Raises
        ------
        RuntimeError
            接続がないとき。
        """
        if self._connection is None:
            raise RuntimeError("connection is missing")
        return self._connection

    def _execute(self, sql: str, params: tuple[object, ...] = ()) -> int:
        """SQL を実行して影響した行数を返す。

        Parameters
        ----------
        sql : str
            SQL（`%s` でバインドする）。
        params : tuple[object, ...]
            バインドする値。

        Returns
        -------
        int
            影響した行数。
        """
        with self._conn().cursor() as cursor:
            cursor.execute(sql, params)
            return cursor.rowcount

    def _fetch_one(
        self, sql: str, params: tuple[object, ...]
    ) -> tuple[Any, ...] | None:
        """SQL を実行して先頭の 1 行を返す。

        Parameters
        ----------
        sql : str
            SQL。
        params : tuple[object, ...]
            バインドする値。

        Returns
        -------
        tuple[Any, ...] | None
            先頭の行。なければ None。
        """
        with self._conn().cursor() as cursor:
            cursor.execute(sql, params)
            row = cursor.fetchone()
            return None if row is None else tuple(row)

    @contextmanager
    def _transaction(self) -> Iterator[None]:
        """トランザクションを張る。成功でコミット、失敗でロールバックする。

        自動コミットの接続なら、この間だけ切って元に戻す（移植元の setAutoCommit 相当）。

        Yields
        ------
        None
            トランザクションの中。
        """
        connection = self._conn()
        original_autocommit = connection.autocommit
        if original_autocommit:
            connection.autocommit = False
        try:
            yield
            connection.commit()
        except BaseException:
            connection.rollback()
            raise
        finally:
            if original_autocommit and not connection.closed:
                connection.autocommit = True

    def _rollback(self) -> None:
        """トランザクションを取り消す（検査で失敗して打ち切るとき）。"""
        self._conn().rollback()

    def schema_readiness(self) -> IngestionSchemaReadiness:
        """ランタイムを準備し、取り込みに必要なテーブル・列があるか確かめる。

        Returns
        -------
        IngestionSchemaReadiness
            スキーマの状態。
        """
        if self._connection is None or self._connection.closed:
            return IngestionSchemaReadiness.missing("SCHEMA_CONNECTION_MISSING")
        readiness = self._runtime_bootstrapper(
            GraphRagRuntimeBootstrapRequest.create_if_missing(
                GraphRagRuntimeTargetDescriptor.sanitized(
                    "PostgreSQL", f"provider=PostgreSQL;schema={SCHEMA}"
                ),
                self._graph_name,
            )
        )
        if not readiness.ready:
            return IngestionSchemaReadiness(
                False, readiness.status, readiness.failure_code or "unknown_sanitized"
            )
        for table in REQUIRED_TABLES:
            if not self._table_exists(table):
                return IngestionSchemaReadiness.missing("SCHEMA_TABLE_MISSING")
        if not self._column_exists("document_versions", "is_current") or (
            not self._column_exists("chunks", "is_current")
        ):
            return IngestionSchemaReadiness.incompatible("SCHEMA_S03_OVERLAY_MISSING")
        return IngestionSchemaReadiness.available()

    def persist(
        self, request: IngestionRequest, extraction: IngestionExtraction
    ) -> IngestionResult:
        """取り込み結果を 1 つのトランザクションで保存する。

        Parameters
        ----------
        request : IngestionRequest
            取り込みの要求。
        extraction : IngestionExtraction
            抽出した候補。

        Returns
        -------
        IngestionResult
            保存の結果。同じ内容の再取り込みは冪等として件数 0。
        """
        with self._transaction():
            self._set_tenant_context(request.tenant_id)
            return self._persist_in_transaction(request, extraction)

    def replace_source(self, request: SourceLifecycleRequest) -> SourceLifecycleResult:
        """取り込み元の内容ハッシュを新しいバージョンに置き換える。

        Parameters
        ----------
        request : SourceLifecycleRequest
            置き換えの要求。

        Returns
        -------
        SourceLifecycleResult
            結果。
        """
        failure = validate_lifecycle_target(request)
        if failure is not None:
            return failure
        if request.new_content_hash is None:
            return SourceLifecycleResult.failure(
                request, "LIFECYCLE_CONTENT_HASH_REQUIRED"
            )
        if request.new_content_hash_looks_unsafe():
            return SourceLifecycleResult.failure(
                request, "LIFECYCLE_CONTENT_HASH_UNSAFE"
            )
        tenant_id = request.tenant_id
        source_ref = request.source_ref
        new_hash = request.new_content_hash
        assert tenant_id is not None and source_ref is not None  # 検査済み
        with self._transaction():
            self._set_tenant_context(tenant_id)
            source_key = f"{tenant_id}:{source_ref}"
            document_id = stable_id("doc", source_key)
            current = self._current_state(tenant_id, document_id)
            current_failure = self._validate_current_state(request, current)
            if current_failure is not None:
                self._rollback()
                return current_failure
            assert current is not None
            if self._duplicate_report_only(tenant_id, document_id, new_hash):
                self._rollback()
                return SourceLifecycleResult.failure(
                    request, "LIFECYCLE_CONTENT_HASH_COLLISION"
                )
            if current.content_hash == new_hash:
                self._rollback()
                return SourceLifecycleResult.failure(
                    request, "LIFECYCLE_CONTENT_HASH_UNCHANGED"
                )
            replacement = (
                IngestionRequestBuilder()
                .tenant_id(tenant_id)
                .source_ref(source_ref)
                .display_name(source_ref)
                .normalized_body(new_hash)
                .build()
            )
            version_id = stable_id("version", f"{source_key}:{new_hash}")
            chunk_id = stable_id("chunk", f"{version_id}:0:{new_hash}")
            self._mark_stale("document_versions", tenant_id, document_id)
            self._mark_stale("chunks", tenant_id, document_id)
            self._insert_version(replacement, document_id, version_id, new_hash)
            self._insert_chunk(replacement, document_id, version_id, chunk_id, new_hash)
            self._insert_embedding_queue(replacement, chunk_id, new_hash)
            return SourceLifecycleResult.replace_succeeded(
                current.version_id, version_id
            )

    def delete_source(self, request: SourceLifecycleRequest) -> SourceLifecycleResult:
        """取り込み元の現行バージョンとチャンクを古い扱いにする（論理削除）。

        Parameters
        ----------
        request : SourceLifecycleRequest
            削除の要求。

        Returns
        -------
        SourceLifecycleResult
            結果。
        """
        failure = validate_lifecycle_target(request)
        if failure is not None:
            return failure
        if request.deletion_reason is None or unsafe_lifecycle_text(
            request.deletion_reason
        ):
            return SourceLifecycleResult.failure(
                request, "LIFECYCLE_DELETE_REASON_REQUIRED"
            )
        tenant_id = request.tenant_id
        assert tenant_id is not None  # 検査済み
        with self._transaction():
            self._set_tenant_context(tenant_id)
            document_id = stable_id("doc", f"{tenant_id}:{request.source_ref}")
            current = self._current_state(tenant_id, document_id)
            current_failure = self._validate_current_state(request, current)
            if current_failure is not None:
                self._rollback()
                return current_failure
            assert current is not None
            self._mark_stale("document_versions", tenant_id, document_id)
            self._mark_stale("chunks", tenant_id, document_id)
            return SourceLifecycleResult.delete_succeeded(current.version_id)

    def _set_tenant_context(self, tenant_id: str | None) -> None:
        """行レベルセキュリティ用に、テナント ID をセッション設定に入れる。

        Parameters
        ----------
        tenant_id : str | None
            テナント ID。
        """
        self._execute(
            "select set_config('app.tenant_id', %s, false), "
            "set_config('graphrag.tenant_id', %s, false)",
            (tenant_id, tenant_id),
        )

    def _persist_in_transaction(
        self, request: IngestionRequest, extraction: IngestionExtraction
    ) -> IngestionResult:
        """トランザクションの中で文書・バージョン・チャンクなどを保存する。

        Parameters
        ----------
        request : IngestionRequest
            取り込みの要求。
        extraction : IngestionExtraction
            抽出した候補。

        Returns
        -------
        IngestionResult
            保存の結果。
        """
        tenant_id = request.tenant_id
        assert tenant_id is not None  # 受け入れ判定済み
        source_key = f"{tenant_id}:{request.source_ref}"
        document_id = stable_id("doc", source_key)
        content_hash = stable_id("content", request.normalized_body)
        current = self._current_state(tenant_id, document_id)
        if current is not None and current.content_hash == content_hash:
            return self._accepted(
                request,
                extraction,
                document_id,
                current.version_id,
                current.chunk_id,
                content_hash,
                True,
                self._duplicate_report_only(tenant_id, document_id, content_hash),
                0,
                0,
                0,
                0,
                0,
                IngestionChunkDiffSummary.none(content_hash),
            )
        stale_versions = self._mark_stale("document_versions", tenant_id, document_id)
        stale_chunks = self._mark_stale("chunks", tenant_id, document_id)
        documents_created = self._insert_document(request, document_id)
        version_id = stable_id("version", f"{source_key}:{content_hash}")
        chunk_id = stable_id("chunk", f"{version_id}:0:{content_hash}")
        self._insert_version(request, document_id, version_id, content_hash)
        self._insert_chunk(request, document_id, version_id, chunk_id, content_hash)
        identifiers = self._insert_identifiers(
            request, chunk_id, extraction.identifiers
        )
        entities = self._insert_entities(request, extraction.entities)
        edges = self._insert_edges(request, extraction.edges)
        evidence = self._insert_evidence(
            request, chunk_id, extraction.edges
        ) + self._insert_llm_candidate_origins(
            request, extraction.llm_candidate_origins
        )
        self._projection.project_accepted_chunk(request, chunk_id)
        queue = self._insert_embedding_queue(request, chunk_id, content_hash)
        acl = self._insert_acl_materialization(request, document_id)
        outbox = self._insert_acl_outbox(request, document_id)
        diff = (
            IngestionChunkDiffSummary.initial(content_hash)
            if current is None
            else IngestionChunkDiffSummary.replacement(
                current.content_hash, content_hash
            )
        )
        return self._accepted(
            request,
            extraction,
            document_id,
            version_id,
            chunk_id,
            content_hash,
            False,
            self._duplicate_report_only(tenant_id, document_id, content_hash),
            documents_created,
            1,
            1,
            stale_versions,
            stale_chunks,
            diff,
        ).with_counts(identifiers, entities, edges, evidence, queue, outbox, acl)

    def _validate_current_state(
        self, request: SourceLifecycleRequest, current: _CurrentState | None
    ) -> SourceLifecycleResult | None:
        """現行バージョンがあり、期待したバージョンと一致するか検査する。

        Parameters
        ----------
        request : SourceLifecycleRequest
            要求。
        current : _CurrentState | None
            現行の状態。

        Returns
        -------
        SourceLifecycleResult | None
            不正なら失敗の結果。正しければ None。
        """
        if current is None:
            return SourceLifecycleResult.failure(
                request, "LIFECYCLE_SOURCE_NOT_CURRENT"
            )
        if current.version_id != request.expected_source_version:
            return SourceLifecycleResult.failure(request, "LIFECYCLE_STALE_VERSION")
        return None

    def _accepted(
        self,
        request: IngestionRequest,
        extraction: IngestionExtraction,
        document_id: str,
        version_id: str,
        chunk_id: str,
        content_hash: str,
        idempotent: bool,
        duplicate_report_only: bool,
        documents_created: int,
        versions_created: int,
        chunks_created: int,
        stale_versions: int,
        stale_chunks: int,
        diff: IngestionChunkDiffSummary,
    ) -> IngestionResult:
        """受け入れの結果を作る（件数は後で実際の挿入数に置き換える）。

        Parameters
        ----------
        request : IngestionRequest
            取り込みの要求。
        extraction : IngestionExtraction
            抽出した候補。
        document_id : str
            文書 ID。
        version_id : str
            バージョン ID。
        chunk_id : str
            チャンク ID。
        content_hash : str
            内容のハッシュ。
        idempotent : bool
            冪等（変更なし）か。
        duplicate_report_only : bool
            別の文書と同じ内容か（報告のみ）。
        documents_created : int
            作成した文書数。
        versions_created : int
            作成したバージョン数。
        chunks_created : int
            作成したチャンク数。
        stale_versions : int
            古くした版数。
        stale_chunks : int
            古くしたチャンク数。
        diff : IngestionChunkDiffSummary
            チャンク差分の要約。

        Returns
        -------
        IngestionResult
            受け入れの結果。
        """
        identifiers = 0 if idempotent else len(extraction.identifiers)
        entities = 0 if idempotent else len(extraction.entities)
        edges = 0 if idempotent else len(extraction.edges)
        pending = 0 if idempotent else 1
        acl = 0 if idempotent else 1
        return IngestionResult(
            accepted=True,
            status="ACCEPTED",
            tenant_id=request.tenant_id,
            source_ref=request.source_ref,
            document_id=document_id,
            document_version_id=version_id,
            chunk_id=chunk_id,
            content_hash=content_hash,
            idempotent=idempotent,
            duplicate_report_only=duplicate_report_only,
            documents_created=documents_created,
            versions_created=versions_created,
            chunks_created=chunks_created,
            identifiers_created=identifiers,
            entities_created=entities,
            edges_created=edges,
            evidence_created=max(0, edges + len(extraction.llm_candidate_origins)),
            embedding_queue_rows_created=pending,
            projection_events_created=edges,
            outbox_rows_created=pending,
            acl_materialization_rows_created=acl,
            stale_versions=stale_versions,
            stale_chunks=stale_chunks,
            schema_readiness="ready",
            chunk_diff_summary=diff,
            non_goal_execution=IngestionNonGoalProbe.zero(),
            evidence_links=(
                f"document:{document_id}",
                f"version:{version_id}",
                f"chunk:{chunk_id}",
            ),
        )

    def _table_exists(self, table: str) -> bool:
        """`graphrag_s02` にテーブルがあるか。

        Parameters
        ----------
        table : str
            テーブル名。

        Returns
        -------
        bool
            あれば True。
        """
        return (
            self._fetch_one(
                "select 1 from information_schema.tables "
                "where table_schema = %s and table_name = %s",
                (SCHEMA, table),
            )
            is not None
        )

    def _column_exists(self, table: str, column: str) -> bool:
        """`graphrag_s02` のテーブルに列があるか。

        Parameters
        ----------
        table : str
            テーブル名。
        column : str
            列名。

        Returns
        -------
        bool
            あれば True。
        """
        return (
            self._fetch_one(
                "select 1 from information_schema.columns where table_schema = %s "
                "and table_name = %s and column_name = %s",
                (SCHEMA, table, column),
            )
            is not None
        )

    def _current_state(self, tenant_id: str, document_id: str) -> _CurrentState | None:
        """文書の現行バージョンとチャンクを読む。

        Parameters
        ----------
        tenant_id : str
            テナント ID。
        document_id : str
            文書 ID。

        Returns
        -------
        _CurrentState | None
            現行の状態。なければ None。
        """
        row = self._fetch_one(
            "select v.version_id, v.content_hash, c.chunk_id "
            "from graphrag_s02.document_versions v "
            "join graphrag_s02.chunks c on c.tenant_id = v.tenant_id "
            "and c.document_id = v.document_id and c.version_id = v.version_id "
            "where v.tenant_id = %s and v.document_id = %s and v.is_current = true "
            "and c.is_current = true order by c.chunk_ordinal asc limit 1",
            (tenant_id, document_id),
        )
        if row is None:
            return None
        return _CurrentState(row[0], row[1], row[2])

    def _duplicate_report_only(
        self, tenant_id: str, document_id: str, content_hash: str
    ) -> bool:
        """別の文書に同じ内容のバージョンがあるか。

        Parameters
        ----------
        tenant_id : str
            テナント ID。
        document_id : str
            文書 ID。
        content_hash : str
            内容のハッシュ。

        Returns
        -------
        bool
            あれば True。
        """
        return (
            self._fetch_one(
                "select 1 from graphrag_s02.document_versions where tenant_id = %s "
                "and document_id <> %s and content_hash = %s limit 1",
                (tenant_id, document_id, content_hash),
            )
            is not None
        )

    def _mark_stale(self, table: str, tenant_id: str, document_id: str) -> int:
        """文書の現行行を古い扱いにする。

        Parameters
        ----------
        table : str
            テーブル名（`document_versions` か `chunks`）。
        tenant_id : str
            テナント ID。
        document_id : str
            文書 ID。

        Returns
        -------
        int
            古くした行数。
        """
        return self._execute(
            f"update graphrag_s02.{table} set is_current = false "
            "where tenant_id = %s and document_id = %s and is_current = true",
            (tenant_id, document_id),
        )

    def _insert_document(self, request: IngestionRequest, document_id: str) -> int:
        """文書を登録する（あれば何もしない）。

        Parameters
        ----------
        request : IngestionRequest
            取り込みの要求。
        document_id : str
            文書 ID。

        Returns
        -------
        int
            登録した行数。
        """
        return self._execute(
            "insert into graphrag_s02.documents (tenant_id, document_id, owner_user_id, "
            "audit_user_id, source_label_sanitized, classification_rank, acl_mode, "
            "acl_principal_ids, acl_revision) values (%s, %s, %s, %s, %s, %s, %s, "
            "%s::text[], %s) on conflict do nothing",
            (
                request.tenant_id,
                document_id,
                OWNER_USER_ID,
                AUDIT_USER_ID,
                request.display_name,
                request.classification_rank,
                request.acl_mode,
                list(request.acl_principals or ()),
                request.acl_revision,
            ),
        )

    def _insert_version(
        self,
        request: IngestionRequest,
        document_id: str,
        version_id: str,
        content_hash: str,
    ) -> None:
        """文書のバージョンを登録する。

        Parameters
        ----------
        request : IngestionRequest
            取り込みの要求。
        document_id : str
            文書 ID。
        version_id : str
            バージョン ID。
        content_hash : str
            内容のハッシュ。
        """
        self._execute(
            "insert into graphrag_s02.document_versions (tenant_id, document_id, "
            "version_id, version_ordinal, content_hash, owner_user_id, audit_user_id, "
            "classification_rank, acl_mode, acl_principal_ids, acl_revision, is_current) "
            "values (%s, %s, %s, (select coalesce(max(version_ordinal), 0) + 1 "
            "from graphrag_s02.document_versions where tenant_id = %s and document_id = %s), "
            "%s, %s, %s, %s, %s, %s::text[], %s, true)",
            (
                request.tenant_id,
                document_id,
                version_id,
                request.tenant_id,
                document_id,
                content_hash,
                OWNER_USER_ID,
                AUDIT_USER_ID,
                request.classification_rank,
                request.acl_mode,
                list(request.acl_principals or ()),
                request.acl_revision,
            ),
        )

    def _insert_chunk(
        self,
        request: IngestionRequest,
        document_id: str,
        version_id: str,
        chunk_id: str,
        content_hash: str,
    ) -> None:
        """チャンクを登録する（順序 0 の 1 件）。

        Parameters
        ----------
        request : IngestionRequest
            取り込みの要求。
        document_id : str
            文書 ID。
        version_id : str
            バージョン ID。
        chunk_id : str
            チャンク ID。
        content_hash : str
            内容のハッシュ。
        """
        self._execute(
            "insert into graphrag_s02.chunks (tenant_id, document_id, version_id, "
            "chunk_id, chunk_ordinal, content_hash, owner_user_id, audit_user_id, "
            "classification_rank, acl_mode, acl_principal_ids, acl_revision, is_current) "
            "values (%s, %s, %s, %s, 0, %s, %s, %s, %s, %s, %s::text[], %s, true)",
            (
                request.tenant_id,
                document_id,
                version_id,
                chunk_id,
                content_hash,
                OWNER_USER_ID,
                AUDIT_USER_ID,
                request.classification_rank,
                request.acl_mode,
                list(request.acl_principals or ()),
                request.acl_revision,
            ),
        )

    def _insert_identifiers(
        self,
        request: IngestionRequest,
        chunk_id: str,
        identifiers: tuple[IngestionIdentifier, ...],
    ) -> int:
        """識別子を登録する。

        Parameters
        ----------
        request : IngestionRequest
            取り込みの要求。
        chunk_id : str
            チャンク ID。
        identifiers : tuple[IngestionIdentifier, ...]
            識別子の候補。

        Returns
        -------
        int
            登録した行数。
        """
        inserted = 0
        for identifier in identifiers:
            inserted += self._execute(
                "insert into graphrag_s02.chunk_identifiers (tenant_id, "
                "chunk_identifier_id, chunk_id, identifier_type, identifier_hash) "
                "values (%s, %s, %s, %s, %s) on conflict do nothing",
                (
                    request.tenant_id,
                    stable_id(
                        "chunk-identifier",
                        f"{chunk_id}:{identifier.identifier_type}:"
                        f"{identifier.identifier_hash}",
                    ),
                    chunk_id,
                    identifier.identifier_type,
                    identifier.identifier_hash,
                ),
            )
        return inserted

    def _insert_entities(
        self, request: IngestionRequest, entities: tuple[IngestionEntityCandidate, ...]
    ) -> int:
        """エンティティを登録する。

        Parameters
        ----------
        request : IngestionRequest
            取り込みの要求。
        entities : tuple[IngestionEntityCandidate, ...]
            エンティティの候補。

        Returns
        -------
        int
            登録した行数。
        """
        inserted = 0
        for entity in entities:
            inserted += self._execute(
                "insert into graphrag_s02.entities (tenant_id, entity_id, entity_type, "
                "canonical_label_hash, classification_rank, acl_mode, acl_principal_ids, "
                "acl_revision) values (%s, %s, %s, %s, %s, %s, %s::text[], %s) "
                "on conflict do nothing",
                (
                    request.tenant_id,
                    entity.entity_id,
                    entity.entity_type,
                    entity.label_hash,
                    request.classification_rank,
                    request.acl_mode,
                    list(request.acl_principals or ()),
                    request.acl_revision,
                ),
            )
        return inserted

    def _insert_edges(
        self, request: IngestionRequest, edges: tuple[IngestionEdgeCandidate, ...]
    ) -> int:
        """エッジを候補として登録する。

        Parameters
        ----------
        request : IngestionRequest
            取り込みの要求。
        edges : tuple[IngestionEdgeCandidate, ...]
            エッジの候補。

        Returns
        -------
        int
            登録した行数。
        """
        inserted = 0
        for edge in edges:
            inserted += self._execute(
                "insert into graphrag_s02.kg_edges (tenant_id, edge_id, source_entity_id, "
                "target_entity_id, edge_type, edge_status, classification_rank, acl_mode, "
                "acl_principal_ids, acl_revision) "
                "values (%s, %s, %s, %s, %s, 'candidate', %s, %s, %s::text[], %s) "
                "on conflict do nothing",
                (
                    request.tenant_id,
                    edge.edge_id,
                    edge.source_entity_id,
                    edge.target_entity_id,
                    edge.edge_type,
                    request.classification_rank,
                    request.acl_mode,
                    list(request.acl_principals or ()),
                    request.acl_revision,
                ),
            )
        return inserted

    def _insert_evidence(
        self,
        request: IngestionRequest,
        chunk_id: str,
        edges: tuple[IngestionEdgeCandidate, ...],
    ) -> int:
        """エッジごとの根拠と、エッジとのひも付けを登録する。

        Parameters
        ----------
        request : IngestionRequest
            取り込みの要求。
        chunk_id : str
            チャンク ID。
        edges : tuple[IngestionEdgeCandidate, ...]
            エッジの候補。

        Returns
        -------
        int
            登録した根拠の行数。
        """
        inserted = 0
        for edge in edges:
            evidence_id = stable_id("evidence", f"{chunk_id}:{edge.edge_id}")
            inserted += self._execute(
                "insert into graphrag_s02.evidence_items (tenant_id, evidence_id, chunk_id, "
                "evidence_kind, owner_user_id, audit_user_id, classification_rank, "
                "acl_mode, acl_principal_ids, acl_revision) "
                "values (%s, %s, %s, 'ingestion', %s, %s, %s, %s, %s::text[], %s) "
                "on conflict do nothing",
                (
                    request.tenant_id,
                    evidence_id,
                    chunk_id,
                    OWNER_USER_ID,
                    AUDIT_USER_ID,
                    request.classification_rank,
                    request.acl_mode,
                    list(request.acl_principals or ()),
                    request.acl_revision,
                ),
            )
            self._execute(
                "insert into graphrag_s02.kg_edge_evidence (tenant_id, edge_id, "
                "evidence_id, evidence_role) values (%s, %s, %s, 'supporting') "
                "on conflict do nothing",
                (request.tenant_id, edge.edge_id, evidence_id),
            )
        return inserted

    def _insert_llm_candidate_origins(
        self, request: IngestionRequest, origins: tuple[LlmCandidateOrigin, ...]
    ) -> int:
        """LLM 候補の由来を登録する。

        Parameters
        ----------
        request : IngestionRequest
            取り込みの要求。
        origins : tuple[LlmCandidateOrigin, ...]
            LLM 候補の由来。

        Returns
        -------
        int
            登録した行数。
        """
        inserted = 0
        for origin in origins:
            inserted += self._execute(
                "insert into graphrag_s02.llm_candidate_origins (tenant_id, candidate_id, "
                "candidate_kind, source_chunk_id, extraction_run_id, verification_status, "
                "trust_level, sanitized_evidence_id, classification_rank, acl_mode, "
                "acl_principal_ids, acl_revision) "
                "values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::text[], %s) "
                "on conflict do nothing",
                (
                    request.tenant_id,
                    origin.candidate_id,
                    origin.candidate_kind,
                    origin.source_chunk_id,
                    origin.extraction_run_id,
                    origin.verification_status,
                    origin.trust_level,
                    origin.sanitized_evidence_id,
                    request.classification_rank,
                    request.acl_mode,
                    list(request.acl_principals or ()),
                    request.acl_revision,
                ),
            )
        return inserted

    def _insert_embedding_queue(
        self, request: IngestionRequest, chunk_id: str, content_hash: str
    ) -> int:
        """埋め込みキューに登録する。

        Parameters
        ----------
        request : IngestionRequest
            取り込みの要求。
        chunk_id : str
            チャンク ID。
        content_hash : str
            内容のハッシュ。

        Returns
        -------
        int
            登録した行数。
        """
        return self._execute(
            "insert into graphrag_s02.embedding_queue (tenant_id, queue_id, chunk_id, "
            "content_hash, queue_status, acl_revision) values (%s, %s, %s, %s, 'pending', %s) "
            "on conflict do nothing",
            (
                request.tenant_id,
                stable_id("queue", chunk_id),
                chunk_id,
                content_hash,
                request.acl_revision,
            ),
        )

    def _insert_acl_materialization(
        self, request: IngestionRequest, document_id: str
    ) -> int:
        """文書の ACL 付与を登録する。

        Parameters
        ----------
        request : IngestionRequest
            取り込みの要求。
        document_id : str
            文書 ID。

        Returns
        -------
        int
            登録した行数。
        """
        return self._execute(
            "insert into graphrag_s02.document_acl_grants (tenant_id, grant_id, "
            "document_id, acl_mode, acl_principal_ids, classification_rank, acl_revision, "
            "is_current) values (%s, %s, %s, %s, %s::text[], %s, %s, true) "
            "on conflict do nothing",
            (
                request.tenant_id,
                stable_id("grant", f"{document_id}:{request.acl_revision}"),
                document_id,
                request.acl_mode,
                list(request.acl_principals or ()),
                request.classification_rank,
                request.acl_revision,
            ),
        )

    def _insert_acl_outbox(self, request: IngestionRequest, document_id: str) -> int:
        """ACL 伝播のアウトボックスに登録する。

        Parameters
        ----------
        request : IngestionRequest
            取り込みの要求。
        document_id : str
            文書 ID。

        Returns
        -------
        int
            登録した行数。
        """
        return self._execute(
            "insert into graphrag_s02.acl_propagation_outbox (tenant_id, outbox_id, "
            "document_id, acl_revision, outbox_status) values (%s, %s, %s, %s, 'pending') "
            "on conflict do nothing",
            (
                request.tenant_id,
                stable_id("acl-outbox", f"{document_id}:{request.acl_revision}"),
                document_id,
                request.acl_revision,
            ),
        )
