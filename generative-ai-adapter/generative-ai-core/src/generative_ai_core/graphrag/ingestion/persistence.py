"""取り込み結果の永続化の境界と、メモリ上の実装（移植元 IngestionPersistenceAdapter・InMemory…）。"""

import threading
from dataclasses import dataclass
from typing import Protocol

from generative_ai_core.graphrag.ingestion.candidates import stable_id
from generative_ai_core.graphrag.ingestion.extraction import IngestionExtraction
from generative_ai_core.graphrag.ingestion.lifecycle import (
    SourceLifecycleRequest,
    SourceLifecycleResult,
    unsafe_lifecycle_text,
)
from generative_ai_core.graphrag.ingestion.request import IngestionRequest
from generative_ai_core.graphrag.ingestion.result import (
    IngestionChunkDiffSummary,
    IngestionNonGoalProbe,
    IngestionResult,
    IngestionSchemaReadiness,
)


class IngestionPersistenceAdapter(Protocol):
    """取り込み結果を保存するもの。

    `schema_readiness`・`replace_source`・`delete_source` は、実装しなければ
    移植元の既定（準備完了・「未対応」の失敗）と同じ扱いにするため、
    `BaseIngestionPersistenceAdapter` を継承すると楽にできる。
    """

    def schema_readiness(self) -> IngestionSchemaReadiness:
        """保存先のスキーマが使えるかを返す。

        Returns
        -------
        IngestionSchemaReadiness
            スキーマの状態。
        """
        ...

    def persist(
        self, request: IngestionRequest, extraction: IngestionExtraction
    ) -> IngestionResult:
        """取り込み結果を保存する。

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
        ...

    def replace_source(self, request: SourceLifecycleRequest) -> SourceLifecycleResult:
        """取り込み元の内容を置き換える。

        Parameters
        ----------
        request : SourceLifecycleRequest
            置き換えの要求。

        Returns
        -------
        SourceLifecycleResult
            結果。
        """
        ...

    def delete_source(self, request: SourceLifecycleRequest) -> SourceLifecycleResult:
        """取り込み元を削除する。

        Parameters
        ----------
        request : SourceLifecycleRequest
            削除の要求。

        Returns
        -------
        SourceLifecycleResult
            結果。
        """
        ...


class BaseIngestionPersistenceAdapter:
    """移植元のインターフェースの既定メソッド（default）を持つ基底クラス。"""

    def schema_readiness(self) -> IngestionSchemaReadiness:
        """既定では準備完了を返す。

        Returns
        -------
        IngestionSchemaReadiness
            準備完了。
        """
        return IngestionSchemaReadiness.available()

    def persist(
        self, request: IngestionRequest, extraction: IngestionExtraction
    ) -> IngestionResult:
        """サブクラスで実装する。

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

        Raises
        ------
        NotImplementedError
            サブクラスが実装していないとき。
        """
        raise NotImplementedError

    def replace_source(self, request: SourceLifecycleRequest) -> SourceLifecycleResult:
        """既定では「未対応」の失敗を返す。

        Parameters
        ----------
        request : SourceLifecycleRequest
            置き換えの要求。

        Returns
        -------
        SourceLifecycleResult
            LIFECYCLE_UNSUPPORTED の失敗。
        """
        return SourceLifecycleResult.failure(request, "LIFECYCLE_UNSUPPORTED")

    def delete_source(self, request: SourceLifecycleRequest) -> SourceLifecycleResult:
        """既定では「未対応」の失敗を返す。

        Parameters
        ----------
        request : SourceLifecycleRequest
            削除の要求。

        Returns
        -------
        SourceLifecycleResult
            LIFECYCLE_UNSUPPORTED の失敗。
        """
        return SourceLifecycleResult.failure(request, "LIFECYCLE_UNSUPPORTED")


@dataclass(frozen=True)
class _MemoryDocument:
    """メモリ上の現行文書。"""

    document_id: str
    version_id: str
    chunk_id: str
    content_hash: str


def _evidence_links(
    document_id: str, version_id: str, chunk_id: str
) -> tuple[str, ...]:
    """根拠リンク（文書・バージョン・チャンク）を作る。

    Parameters
    ----------
    document_id : str
        文書 ID。
    version_id : str
        バージョン ID。
    chunk_id : str
        チャンク ID。

    Returns
    -------
    tuple[str, ...]
        `document:`・`version:`・`chunk:` の 3 件。
    """
    return (f"document:{document_id}", f"version:{version_id}", f"chunk:{chunk_id}")


def validate_lifecycle_target(
    request: SourceLifecycleRequest | None,
) -> SourceLifecycleResult | None:
    """ライフサイクル要求の対象指定が正しいか検査する（メモリ・JDBC 共通）。

    Parameters
    ----------
    request : SourceLifecycleRequest | None
        要求。

    Returns
    -------
    SourceLifecycleResult | None
        不正なら失敗の結果。正しければ None。
    """
    if (
        request is None
        or request.tenant_id is None
        or request.source_ref is None
        or request.expected_source_version is None
    ):
        return SourceLifecycleResult.failure(request, "LIFECYCLE_TARGET_REQUIRED")
    if request.source_ref_looks_path_only():
        return SourceLifecycleResult.failure(request, "LIFECYCLE_PATH_ONLY_SOURCE_REF")
    if request.source_ref_looks_ambiguous():
        return SourceLifecycleResult.failure(request, "LIFECYCLE_AMBIGUOUS_SOURCE_REF")
    return None


class InMemoryIngestionPersistenceAdapter(BaseIngestionPersistenceAdapter):
    """メモリ上だけに保存する実装（DB を使わない既定・テスト用）。"""

    def __init__(self) -> None:
        """空の状態で作る。"""
        self._lock = threading.RLock()
        self._current_documents: dict[str, _MemoryDocument] = {}
        self._source_by_content_hash: dict[str, str] = {}

    def persist(
        self, request: IngestionRequest, extraction: IngestionExtraction
    ) -> IngestionResult:
        """取り込み結果をメモリに保存する。

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
        with self._lock:
            source_key = f"{request.tenant_id}:{request.source_ref}"
            document_id = stable_id("doc", source_key)
            content_hash = stable_id("content", request.normalized_body)
            current = self._current_documents.get(source_key)
            if current is not None and current.content_hash == content_hash:
                return self._accepted(
                    request,
                    extraction,
                    current.document_id,
                    current.version_id,
                    current.chunk_id,
                    content_hash,
                    True,
                    False,
                    0,
                    0,
                    0,
                    0,
                    0,
                    IngestionChunkDiffSummary.none(content_hash),
                )
            owner = self._source_by_content_hash.get(content_hash)
            duplicate_report_only = owner is not None and owner != source_key
            documents_created = 1 if current is None else 0
            stale = 0 if current is None else 1
            version_id = stable_id("version", f"{source_key}:{content_hash}")
            chunk_id = stable_id("chunk", f"{version_id}:0:{content_hash}")
            self._current_documents[source_key] = _MemoryDocument(
                document_id, version_id, chunk_id, content_hash
            )
            self._source_by_content_hash.setdefault(content_hash, source_key)
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
                duplicate_report_only,
                documents_created,
                1,
                1,
                stale,
                stale,
                diff,
            )

    def replace_source(self, request: SourceLifecycleRequest) -> SourceLifecycleResult:
        """取り込み元の内容ハッシュを置き換える。

        Parameters
        ----------
        request : SourceLifecycleRequest
            置き換えの要求。

        Returns
        -------
        SourceLifecycleResult
            結果。
        """
        with self._lock:
            failure = self._validate_current(request)
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
            source_key = f"{request.tenant_id}:{request.source_ref}"
            current = self._current_documents[source_key]
            owner = self._source_by_content_hash.get(request.new_content_hash)
            if owner is not None and owner != source_key:
                return SourceLifecycleResult.failure(
                    request, "LIFECYCLE_CONTENT_HASH_COLLISION"
                )
            if current.content_hash == request.new_content_hash:
                return SourceLifecycleResult.failure(
                    request, "LIFECYCLE_CONTENT_HASH_UNCHANGED"
                )
            version_id = stable_id(
                "version", f"{source_key}:{request.new_content_hash}"
            )
            chunk_id = stable_id("chunk", f"{version_id}:0:{request.new_content_hash}")
            self._current_documents[source_key] = _MemoryDocument(
                current.document_id, version_id, chunk_id, request.new_content_hash
            )
            if self._source_by_content_hash.get(current.content_hash) == source_key:
                del self._source_by_content_hash[current.content_hash]
            self._source_by_content_hash.setdefault(
                request.new_content_hash, source_key
            )
            return SourceLifecycleResult.replace_succeeded(
                current.version_id, version_id
            )

    def delete_source(self, request: SourceLifecycleRequest) -> SourceLifecycleResult:
        """取り込み元を現行から外す。

        Parameters
        ----------
        request : SourceLifecycleRequest
            削除の要求。

        Returns
        -------
        SourceLifecycleResult
            結果。
        """
        with self._lock:
            failure = self._validate_current(request)
            if failure is not None:
                return failure
            if request.deletion_reason is None or unsafe_lifecycle_text(
                request.deletion_reason
            ):
                return SourceLifecycleResult.failure(
                    request, "LIFECYCLE_DELETE_REASON_REQUIRED"
                )
            source_key = f"{request.tenant_id}:{request.source_ref}"
            current = self._current_documents.pop(source_key)
            if self._source_by_content_hash.get(current.content_hash) == source_key:
                del self._source_by_content_hash[current.content_hash]
            return SourceLifecycleResult.delete_succeeded(current.version_id)

    def _validate_current(
        self, request: SourceLifecycleRequest
    ) -> SourceLifecycleResult | None:
        """対象指定と、現行バージョンの一致を検査する。

        Parameters
        ----------
        request : SourceLifecycleRequest
            要求。

        Returns
        -------
        SourceLifecycleResult | None
            不正なら失敗の結果。正しければ None。
        """
        failure = validate_lifecycle_target(request)
        if failure is not None:
            return failure
        current = self._current_documents.get(
            f"{request.tenant_id}:{request.source_ref}"
        )
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
        chunk_diff_summary: IngestionChunkDiffSummary,
    ) -> IngestionResult:
        """受け入れの結果を作る（冪等のときは作成数を 0 にする）。

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
            別の取り込み元と同じ内容か（報告のみ）。
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
        chunk_diff_summary : IngestionChunkDiffSummary
            チャンク差分の要約。

        Returns
        -------
        IngestionResult
            受け入れの結果。
        """
        identifiers = 0 if idempotent else len(extraction.identifiers)
        entities = 0 if idempotent else len(extraction.entities)
        edges = 0 if idempotent else len(extraction.edges)
        evidence = (
            0 if idempotent else max(1, edges + len(extraction.llm_candidate_origins))
        )
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
            evidence_created=evidence,
            embedding_queue_rows_created=pending,
            projection_events_created=edges,
            outbox_rows_created=pending,
            acl_materialization_rows_created=acl,
            stale_versions=stale_versions,
            stale_chunks=stale_chunks,
            schema_readiness="ready",
            chunk_diff_summary=chunk_diff_summary,
            non_goal_execution=IngestionNonGoalProbe.zero(),
            evidence_links=_evidence_links(document_id, version_id, chunk_id),
        )
