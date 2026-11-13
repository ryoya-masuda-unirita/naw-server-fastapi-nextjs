"""CoreDelegatingVectorStoreService のテスト。

移植元 embedding-adapter/src/test の service/core/CoreDelegatingVectorStoreService 関連
（保存・更新・削除の core への委譲、Graph Candidate の拒否、補償削除、削除のテナント
メタデータ）のうち、取り込みの結果ごとの流れを偽の runtime・取り込みで確かめる。
"""

from typing import Any

import pytest
from embedding_adapter.domain import Embedding, VectorDBConfig
from embedding_adapter.model import AbstractEmbeddingModel
from embedding_adapter.output import JobOutputRunContext
from embedding_adapter.service.core.ingestion_shim import CoreIngestionShim
from embedding_adapter.service.core.vector_store import (
    CoreDelegatingVectorStoreService,
)
from generative_ai_core.graphrag.ingestion import IngestionResult
from generative_ai_core.vector import (
    CoreVectorDbOperation,
    CoreVectorDbRequest,
    CoreVectorDbResult,
)

FILE_ID = "file-1"


class FakeModel(AbstractEmbeddingModel):
    """固定のベクトルを返す偽の埋め込みモデル。"""

    def create_embedding(self, text: str | None) -> list[float]:
        """固定のベクトルを返す。

        Parameters
        ----------
        text : str | None
            入力（使わない）。

        Returns
        -------
        list[float]
            ベクトル。
        """
        return [0.5, 0.25]


class RecordingRuntime:
    """受け取ったリクエストを記録して成功を返す偽の core runtime。"""

    def __init__(self) -> None:
        """記録用のリストを作る。"""
        self.requests: list[CoreVectorDbRequest] = []

    def execute(self, request: CoreVectorDbRequest) -> CoreVectorDbResult:
        """リクエストを記録し、成功を返す。

        Parameters
        ----------
        request : CoreVectorDbRequest
            core のベクトルDB 要求。

        Returns
        -------
        CoreVectorDbResult
            成功。
        """
        self.requests.append(request)
        return CoreVectorDbResult.ok("id", request.operation)


class FakeShim(CoreIngestionShim):
    """決めた取り込みの結果を返す偽の入口。"""

    def __init__(self, result: IngestionResult) -> None:
        """返す結果を受け取る。

        Parameters
        ----------
        result : IngestionResult
            save・update が返す結果。
        """
        super().__init__()
        self.result = result

    def save(self, embedding: Embedding) -> IngestionResult:
        """決めた結果を返す。

        Parameters
        ----------
        embedding : Embedding
            保存するチャンク。

        Returns
        -------
        IngestionResult
            決めた結果。
        """
        return self.result

    def update(self, embedding: Embedding) -> IngestionResult:
        """決めた結果を返す。

        Parameters
        ----------
        embedding : Embedding
            更新するチャンク。

        Returns
        -------
        IngestionResult
            決めた結果。
        """
        return self.result


def accepted(**overrides: Any) -> IngestionResult:
    """受理された取り込みの結果を作る。

    Parameters
    ----------
    **overrides : Any
        上書きする項目。

    Returns
    -------
    IngestionResult
        受理の結果。
    """
    values: dict[str, Any] = {
        "accepted": True,
        "tenant_id": "tenant-default",
        "source_ref": FILE_ID,
        "chunk_id": "chunk-1",
    }
    values.update(overrides)
    return IngestionResult(**values)


def make_store(
    result: IngestionResult, tenant_id: str | None = None
) -> tuple[CoreDelegatingVectorStoreService, RecordingRuntime]:
    """偽の runtime と取り込みを差したストアを作る。

    Parameters
    ----------
    result : IngestionResult
        取り込みが返す結果。
    tenant_id : str | None
        ストアのテナント ID の補い。

    Returns
    -------
    tuple[CoreDelegatingVectorStoreService, RecordingRuntime]
        ストアと記録用 runtime。
    """
    runtime = RecordingRuntime()
    store = CoreDelegatingVectorStoreService(
        VectorDBConfig(vendor_name="PostgreSQL(PGVector)", table_name="docs"),
        None,
        FakeModel(),
        None,
        runtime=runtime,  # type: ignore[arg-type]
        ingestion_shim=FakeShim(result),
    )
    store.use_tenant_id_if_unset(tenant_id)
    return store, runtime


def chunk(content: str = "本文") -> Embedding:
    """チャンクを作る。

    Parameters
    ----------
    content : str
        本文。

    Returns
    -------
    Embedding
        ID・ベクトルなしのチャンク。
    """
    return Embedding(
        content=content, file_unique_id=FILE_ID, source_file_path="/in/a.txt"
    )


def test_add_saves_row_with_generated_id_and_vector() -> None:
    """保存は ID とベクトルを補って core に SAVE を渡し、行 ID を返すこと"""
    store, runtime = make_store(accepted())

    row_id = store.add(chunk())

    assert row_id
    [request] = runtime.requests
    assert request.operation == CoreVectorDbOperation.SAVE
    assert request.payload.id == row_id
    assert list(request.payload.vector) == [0.5, 0.25]
    assert request.payload.file_unique_id == FILE_ID


def test_add_raises_when_ingestion_is_rejected() -> None:
    """取り込みが拒否されたら、コードとスキーマの状態を含む RuntimeError になること"""
    rejected = IngestionResult.rejected(
        None, "SCHEMA_NOT_READY", "no schema", "missing"
    )
    store, runtime = make_store(rejected)

    with pytest.raises(RuntimeError, match="failureCode=SCHEMA_NOT_READY"):
        store.add(chunk())
    assert runtime.requests == []


def test_add_skips_chunk_after_source_was_rejected() -> None:
    """同じファイルが拒否済みなら、後続のチャンクは保存せず空の ID を返すこと"""
    store, runtime = make_store(accepted())
    context = JobOutputRunContext.enabled()
    context.mark_learnable_reject("/in/a.txt")
    store.set_job_output_run_context(context)

    assert store.add(chunk()) == ""
    assert runtime.requests == []


def test_learnable_reject_stops_before_saving_and_marks_source_rejected() -> None:
    """Graph Candidate の学習可能な拒否は保存せず、そのファイルを拒否済みにすること"""
    result = accepted().with_learnable_reject(
        "LLM_CANDIDATE_OUTPUT_REJECTED", "bad candidate"
    )
    store, runtime = make_store(result)
    context = JobOutputRunContext.enabled()
    store.set_job_output_run_context(context)

    assert store.add(chunk()) == ""

    assert all(r.operation != CoreVectorDbOperation.SAVE for r in runtime.requests)
    assert context.is_rejected("/in/a.txt")


def test_delete_sends_tenant_and_file_id_metadata() -> None:
    """削除はテナント ID とファイル ID をメタデータに付けて core に渡すこと"""
    store, runtime = make_store(accepted(), tenant_id="tenant-a")

    store.delete(f"  {FILE_ID} ")

    [request] = runtime.requests
    assert request.operation == CoreVectorDbOperation.DELETE
    assert request.payload.file_unique_id == FILE_ID
    assert request.metadata["tenantId"] == "tenant-a"
    assert request.metadata["graphRagSourceRef"] == FILE_ID


def test_delete_without_tenant_sends_empty_tenant() -> None:
    """テナント ID が補われていないと、空のテナントを渡すこと（core が失敗にする）"""
    store, runtime = make_store(accepted())
    store.delete(FILE_ID)
    assert runtime.requests[0].metadata["tenantId"] == ""


def test_tenant_fallback_does_not_override_existing_tenant() -> None:
    """テナント ID の補いは、すでに値があれば上書きしないこと"""
    store, runtime = make_store(accepted(), tenant_id="first")
    store.use_tenant_id_if_unset("second")
    store.delete(FILE_ID)
    assert runtime.requests[0].metadata["tenantId"] == "first"


def test_delete_rejects_blank_file_id() -> None:
    """空のファイル ID の削除は ValueError になること"""
    store, _ = make_store(accepted())
    with pytest.raises(ValueError, match="fileUniqueId must not be blank"):
        store.delete("  ")


def test_update_sends_update_operation() -> None:
    """更新は core に UPDATE を渡すこと"""
    store, runtime = make_store(accepted())
    store.update(chunk())
    assert runtime.requests[-1].operation == CoreVectorDbOperation.UPDATE
