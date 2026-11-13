"""vector の入出力・runtime・Graph 分類のテスト。

移植元の次のテストを移した。
- vector/CoreVectorDbDtoTest, CoreVectorDbRuntimeTest, CoreGraphWriteSettingTest
- vector/CoreGraphFailureClassifierTest（補償削除の理由の分類を含む）
- vector/PgVectorCoreVectorDbProviderEndpointTest（エンドポイントの解釈）
- vector/contract/CompensatingDeleteOwnershipScopeTest, CompensatingDeleteOutcomeTest
"""

import math
from typing import Any

import pytest
from generative_ai_core.failure import CoreFailure
from generative_ai_core.vector import (
    CommittedRow,
    CommittedRowIds,
    CompensatingDeleteOutcome,
    CompensatingDeleteOwnershipScope,
    CoreGraphChunkWritePayload,
    CoreGraphFailureClassifier,
    CoreGraphWriteResult,
    CoreGraphWriteSetting,
    CoreGraphWriteStatus,
    CoreVectorDbOperation,
    CoreVectorDbPayload,
    CoreVectorDbRequest,
    CoreVectorDbResult,
    CoreVectorDbRuntime,
    CoreVectorDbTarget,
    CoreVectorSearchMatch,
    RowOutcome,
    parse_endpoint,
)
from generative_ai_core.vector import compensating as comp

ROW_ID = "00000000-0000-0000-0000-000000000001"


def _pg_target() -> CoreVectorDbTarget:
    """テスト用の PostgreSQL の接続先を作る。

    Returns
    -------
    CoreVectorDbTarget
        接続先。
    """
    return CoreVectorDbTarget.pg_vector(
        "localhost", "user", "pass", "db", "vector_store", False
    )


class RecordingProvider:
    """呼ばれた操作を記録するプロバイダ。"""

    def __init__(self) -> None:
        """記録用のリストを用意する。"""
        self.operations: list[CoreVectorDbOperation] = []

    def provider_id(self) -> str:
        """プロバイダ ID を返す。

        Returns
        -------
        str
            ID。
        """
        return "test-vector"

    def execute(self, request: CoreVectorDbRequest) -> CoreVectorDbResult:
        """操作を記録して成功を返す。

        Parameters
        ----------
        request : CoreVectorDbRequest
            要求。

        Returns
        -------
        CoreVectorDbResult
            結果。
        """
        self.operations.append(request.operation)
        if request.operation == CoreVectorDbOperation.SEARCH:
            return CoreVectorDbResult.search_success(
                request.operation,
                [CoreVectorSearchMatch("hit-1", "content", (0.1,), "file-1")],
            )
        return CoreVectorDbResult.ok(request.payload.id, request.operation)


def _request(operation: CoreVectorDbOperation) -> CoreVectorDbRequest:
    """テスト用の要求を作る。

    Parameters
    ----------
    operation : CoreVectorDbOperation
        操作。

    Returns
    -------
    CoreVectorDbRequest
        要求。
    """
    return (
        CoreVectorDbRequest.builder("test-vector", operation)
        .target(_pg_target())
        .payload(CoreVectorDbPayload(ROW_ID, "content", (0.1,), "file-1"))
        .build()
    )


def test_request_defaults_network_and_copies_metadata() -> None:
    """要求はネットワーク設定を既定にし、不正なメタデータを無視すること"""
    request = (
        CoreVectorDbRequest.builder("PostgreSQL", CoreVectorDbOperation.SAVE)
        .target(_pg_target())
        .payload(CoreVectorDbPayload(ROW_ID, "content", (0.1,), "file-1"))
        .metadata(None, "ignored")
        .metadata(" ", "ignored")
        .metadata("null-value", None)
        .metadata("chunk", "1")
        .build()
    )
    assert request.network_setting is not None
    assert request.metadata == {"chunk": "1"}
    assert request.payload.vector == (0.1,)


def test_request_rejects_blank_provider_id() -> None:
    """プロバイダ ID が空の要求は作れないこと"""
    with pytest.raises(ValueError, match="providerId must not be blank"):
        CoreVectorDbRequest(" ")


def test_payload_preserves_optional_source_file_path() -> None:
    """ペイロードは任意の元ファイルパスを持ち、None は空になること"""
    legacy = CoreVectorDbPayload("id", "content", (0.1,), "file-1")
    with_path = CoreVectorDbPayload(
        "id", "content", (0.1,), "file-1", "C:\\data\\manual.json"
    )
    null_path = CoreVectorDbPayload("id", "content", (0.1,), "file-1", None)  # type: ignore[arg-type]
    assert legacy.source_file_path == ""
    assert with_path.source_file_path == "C:\\data\\manual.json"
    assert null_path.source_file_path == ""
    assert CoreVectorDbPayload(" id ").id == "id"


def test_result_failure_is_sanitized_and_graph_failure_clears_success() -> None:
    """失敗の要約は秘密を伏せ、Graph が失敗なら成功にならないこと"""
    result = CoreVectorDbResult.fail(
        CoreVectorDbOperation.SAVE,
        CoreFailure.of("PROVIDER_FAILURE", "Bearer secret-token"),
    )
    assert not result.success
    assert result.failure is not None
    assert "secret-token" not in result.failure.summary
    graph_failure = CoreVectorDbResult.ok(
        "id",
        CoreVectorDbOperation.DELETE,
        CoreGraphWriteResult.failure(
            CoreGraphWriteStatus.FAILED_WRITE, "file", ["chunk"], "password=secret",
            "GRAPH_DELETE_FAILURE",
        ),
    )  # fmt: skip
    assert not graph_failure.success
    assert graph_failure.graph_result is not None
    assert "secret" not in graph_failure.graph_result.message


def test_search_result_copies_matches() -> None:
    """検索結果は一致した行を保持すること"""
    result = CoreVectorDbResult.search_success(
        CoreVectorDbOperation.SEARCH,
        [CoreVectorSearchMatch("id-1", "content", (0.1,), "file-1")],
    )
    assert result.success
    assert len(result.matches) == 1
    assert result.matches[0].id == "id-1"
    assert result.matches[0].vector == (0.1,)


def test_target_redacts_secrets_in_text() -> None:
    """接続先の文字列表現は API キーとパスワードを出さないこと"""
    target = CoreVectorDbTarget(
        "host", "api-secret", "idx", "user", "pw-secret", "db", "tbl", True
    )
    assert "api-secret" not in str(target)
    assert "pw-secret" not in str(target)
    assert "[REDACTED]" in str(target)


def test_target_required_values_raise_when_blank() -> None:
    """必須項目が空の接続先は取り出し時に例外になること"""
    with pytest.raises(ValueError, match="tableName must not be blank"):
        CoreVectorDbTarget().required_table_name()
    assert CoreVectorDbTarget(endpoint=" e ").required_endpoint() == "e"


def test_graph_write_setting_validates_name_only_when_enabled() -> None:
    """Graph 設定はグラフ名を有効なときだけ検証し、空なら既定名にすること"""
    assert CoreGraphWriteSetting.disabled().graph_name == "secuaigent_core_graph"
    assert CoreGraphWriteSetting(False, "bad-name").graph_name == "bad-name"
    assert CoreGraphWriteSetting.enabled_with(" ").graph_name == "secuaigent_core_graph"
    with pytest.raises(ValueError, match="graphName must match"):
        CoreGraphWriteSetting.enabled_with("bad-name")


def test_graph_chunk_payload_filters_blank_delete_ids() -> None:
    """Graph のチャンク内容は削除 ID の空要素を除くこと"""
    payload = CoreGraphChunkWritePayload.delete_ids([" a ", "", "  "])
    assert payload.delete_vector_row_ids == ("a",)
    assert payload.has_delete_ids()
    assert not payload.has_chunk()
    assert CoreGraphChunkWritePayload.chunk("f", "p", "v", 1, "c", "").has_chunk()


def test_graph_write_result_absent_skipped_categories() -> None:
    """対象不在でスキップした結果は原因分類で判定できること"""
    assert CoreGraphWriteResult.absent_skipped([], "already_absent").is_absent_skipped()
    assert CoreGraphWriteResult.absent_skipped(
        [], "graph_node_unwritten"
    ).is_absent_skipped()
    assert not CoreGraphWriteResult.success("f", ["c"]).is_absent_skipped()
    assert CoreGraphWriteResult.disabled().status == CoreGraphWriteStatus.DISABLED


def test_runtime_executes_all_operations_through_registered_provider() -> None:
    """runtime は登録したプロバイダで保存・更新・検索・削除を実行すること"""
    provider = RecordingProvider()
    runtime = CoreVectorDbRuntime([provider])
    delete = (
        CoreVectorDbRequest.builder("test-vector", CoreVectorDbOperation.DELETE)
        .target(
            CoreVectorDbTarget.azure_ai_search("https://example.invalid", "key", "idx")
        )
        .payload(CoreVectorDbPayload.delete(ROW_ID))
        .build()
    )
    assert runtime.execute(_request(CoreVectorDbOperation.SAVE)).success
    assert runtime.execute(_request(CoreVectorDbOperation.UPDATE)).success
    search = runtime.execute(_request(CoreVectorDbOperation.SEARCH))
    assert search.success
    assert [m.id for m in search.matches] == ["hit-1"]
    assert runtime.execute(delete).success
    assert provider.operations == [
        CoreVectorDbOperation.SAVE,
        CoreVectorDbOperation.UPDATE,
        CoreVectorDbOperation.SEARCH,
        CoreVectorDbOperation.DELETE,
    ]


def test_runtime_unsupported_provider_fails() -> None:
    """未登録のプロバイダ ID は UNSUPPORTED_PROVIDER の失敗になること"""
    runtime = CoreVectorDbRuntime([RecordingProvider()])
    result = runtime.execute(
        CoreVectorDbRequest.builder("missing-provider", CoreVectorDbOperation.SEARCH)
        .target(_pg_target())
        .payload(CoreVectorDbPayload("", "query", (0.1,), ""))
        .build()
    )
    assert not result.success
    assert result.failure is not None
    assert result.failure.code == "UNSUPPORTED_PROVIDER"


@pytest.mark.parametrize(
    ("vector", "code"),
    [
        ((), "EMPTY_VECTOR"),
        ((math.nan,), "MALFORMED_VECTOR"),
        ((math.inf,), "MALFORMED_VECTOR"),
        ((-math.inf,), "MALFORMED_VECTOR"),
    ],
)
def test_runtime_rejects_bad_query_vector_before_provider_call(
    vector: tuple[float, ...], code: str
) -> None:
    """空・非有限のベクトルはプロバイダを呼ぶ前に失敗になること"""
    provider = RecordingProvider()
    result = CoreVectorDbRuntime([provider]).execute(
        CoreVectorDbRequest.builder("test-vector", CoreVectorDbOperation.SEARCH)
        .target(_pg_target())
        .payload(CoreVectorDbPayload("query", "query", vector, ""))
        .build()
    )
    assert result.failure is not None
    assert result.failure.code == code
    assert provider.operations == []


def test_runtime_rejects_blank_ids_before_provider_call() -> None:
    """空の ID は保存では CONFIGURATION_FAILURE、削除では TARGET_NOT_FOUND になること"""
    provider = RecordingProvider()
    runtime = CoreVectorDbRuntime([provider])
    save = runtime.execute(
        CoreVectorDbRequest.builder("test-vector", CoreVectorDbOperation.SAVE)
        .target(_pg_target())
        .payload(CoreVectorDbPayload(" ", "content", (0.1,), "file-1"))
        .build()
    )
    delete = runtime.execute(
        CoreVectorDbRequest.builder("test-vector", CoreVectorDbOperation.DELETE)
        .target(_pg_target())
        .payload(CoreVectorDbPayload.delete(" "))
        .build()
    )
    assert save.failure is not None
    assert save.failure.code == "CONFIGURATION_FAILURE"
    assert delete.failure is not None
    assert delete.failure.code == "TARGET_NOT_FOUND"
    assert provider.operations == []


def test_runtime_graph_only_operation_is_disabled_for_non_postgresql() -> None:
    """Graph だけの操作は PostgreSQL 以外では無効の成功を返すこと"""
    provider = RecordingProvider()
    result = CoreVectorDbRuntime([provider]).execute(
        CoreVectorDbRequest.builder("test-vector", CoreVectorDbOperation.GRAPH_WRITE)
        .payload(CoreVectorDbPayload.delete("x"))
        .build()
    )
    assert result.success
    assert result.graph_result is not None
    assert result.graph_result.status == CoreGraphWriteStatus.DISABLED
    assert provider.operations == []


class RaisingProvider:
    """指定した例外を投げるプロバイダ。"""

    def __init__(self, error: Exception) -> None:
        """投げる例外を保持する。

        Parameters
        ----------
        error : Exception
            投げる例外。
        """
        self.error = error

    def provider_id(self) -> str:
        """プロバイダ ID を返す。

        Returns
        -------
        str
            ID。
        """
        return "raising"

    def execute(self, request: CoreVectorDbRequest) -> CoreVectorDbResult:
        """例外を投げる。

        Parameters
        ----------
        request : CoreVectorDbRequest
            要求。

        Returns
        -------
        CoreVectorDbResult
            返らない。

        Raises
        ------
        Exception
            保持している例外。
        """
        raise self.error


def test_runtime_maps_exceptions_to_failures() -> None:
    """プロバイダの例外は設定不正または実行失敗の結果になること"""
    config = CoreVectorDbRuntime(
        [RaisingProvider(ValueError("tableName bad"))]
    ).execute(_request_for("raising"))
    provider = CoreVectorDbRuntime([RaisingProvider(RuntimeError("boom"))]).execute(
        _request_for("raising")
    )
    assert config.failure is not None
    assert config.failure.code == "CONFIGURATION_FAILURE"
    assert provider.failure is not None
    assert provider.failure.code == "PROVIDER_FAILURE"


def _request_for(provider_id: str) -> CoreVectorDbRequest:
    """指定したプロバイダ ID の保存要求を作る。

    Parameters
    ----------
    provider_id : str
        プロバイダ ID。

    Returns
    -------
    CoreVectorDbRequest
        要求。
    """
    return (
        CoreVectorDbRequest.builder(provider_id, CoreVectorDbOperation.SAVE)
        .payload(CoreVectorDbPayload(ROW_ID, "c", (0.1,), "f"))
        .build()
    )


def test_classifier_classifies_and_sanitizes_graph_failure() -> None:
    """権限エラーは GRAPH_PERMISSION_DENIED になり、秘密を伏せること"""
    result = CoreGraphFailureClassifier().classify(
        CoreVectorDbOperation.GRAPH_WRITE,
        "file",
        "chunk",
        RuntimeError(
            "permission denied for jdbc:postgresql://internal.example/db password=secret"
        ),
    )
    assert result.status == CoreGraphWriteStatus.FAILED_EXTENSION_UNAVAILABLE
    assert result.cause_category == "GRAPH_PERMISSION_DENIED"
    assert "secret" not in result.message
    assert "internal.example" not in result.message


def test_classifier_known_categories() -> None:
    """既知の失敗メッセージが期待する分類になること"""
    classifier = CoreGraphFailureClassifier()
    write = CoreVectorDbOperation.GRAPH_WRITE

    def category(
        op: CoreVectorDbOperation, chunk: str | None, error: Exception | None
    ) -> str:
        """分類結果の原因分類を返す。

        Parameters
        ----------
        op : CoreVectorDbOperation
            操作。
        chunk : str | None
            ベクトル行 ID。
        error : Exception | None
            例外。

        Returns
        -------
        str
            原因分類。
        """
        return classifier.classify(op, "file", chunk, error).cause_category

    assert (
        category(write, "chunk", RuntimeError("malformed graph result"))
        == "GRAPH_MALFORMED_RESULT"
    )
    assert (
        category(write, "chunk", RuntimeError("graph does not exist"))
        == "GRAPH_UNAVAILABLE"
    )
    assert (
        category(write, "chunk", RuntimeError("AGE extension missing"))
        == "GRAPH_AGE_UNAVAILABLE"
    )
    assert category(CoreVectorDbOperation.DELETE, " ", None) == "GRAPH_DELETE_FAILURE"
    assert category(write, None, RuntimeError()) == "GRAPH_WRITE_FAILURE"
    assert classifier.classify(write, "f", " ", None).chunk_ids == ()


def test_compensating_reasons_preserve_graph_failure_categories() -> None:
    """補償削除の層の理由が Graph の失敗分類を保つこと"""
    assert (
        comp._graph_benign_reason(
            CoreGraphWriteResult.absent_skipped(["c"], "graph_node_unwritten")
        )
        == "graph_node_unwritten"
    )
    assert comp._graph_benign_reason(None) == "already_absent"

    def failed(category: str) -> CoreGraphWriteResult:
        """指定した原因分類の失敗結果を作る。

        Parameters
        ----------
        category : str
            原因分類。

        Returns
        -------
        CoreGraphWriteResult
            失敗結果。
        """
        return CoreGraphWriteResult.failure(
            CoreGraphWriteStatus.FAILED_EXTENSION_UNAVAILABLE,
            "file",
            ["chunk"],
            "m",
            category,
        )

    assert (
        comp._graph_failure_reason(None, failed("GRAPH_PERMISSION_DENIED"))
        == "graph_permission_denied"
    )
    assert (
        comp._graph_failure_reason(None, failed("GRAPH_UNAVAILABLE"))
        == "graph_unavailable"
    )
    assert (
        comp._graph_failure_reason(None, failed("GRAPH_DELETE_FAILURE"))
        == "graph_delete_failure"
    )
    assert (
        comp._graph_failure_reason(
            CoreFailure.of("GRAPH_AGE_UNAVAILABLE", "missing"), None
        )
        == "graph_unavailable"
    )
    assert (
        comp._graph_failure_reason(
            CoreFailure.of("GRAPH_MALFORMED_RESULT", "bad"), None
        )
        == "provider_failure"
    )


@pytest.mark.parametrize(
    ("value", "host", "port"),
    [
        ("localhost", "localhost", None),
        ("db.example:6543", "db.example", 6543),
        ("[::1]:5433", "::1", 5433),
        ("[::1]", "[::1]", None),
        ("::1", "::1", None),
        ("host:name", "host:name", None),
    ],
)
def test_parse_endpoint(value: str, host: str, port: int | None) -> None:
    """エンドポイントを host と port に分けられること"""
    endpoint = parse_endpoint(value)
    assert endpoint.host == host
    assert endpoint.port == port


@pytest.mark.parametrize("value", ["db:0", "db:65536", "[::1]:99999"])
def test_parse_endpoint_rejects_out_of_range_port(value: str) -> None:
    """範囲外のポートは例外になること"""
    with pytest.raises(ValueError, match="endpoint port must be between 1 and 65535"):
        parse_endpoint(value)


def _row(**overrides: Any) -> CommittedRow:
    """テスト用のコミット済みの行を作る。

    Parameters
    ----------
    **overrides : Any
        上書きする項目。

    Returns
    -------
    CommittedRow
        行。
    """
    values: dict[str, Any] = {
        "tenant_id": "t1", "source_ref": "s1", "job_id": "j1", "run_id": "r1",
        "provider_id": "PostgreSQL", "database_name": "db", "table_name": "tbl",
        "graph_name": "g", "vector_row_id": "v1", "graph_rag_chunk_id": "c1",
    }  # fmt: skip
    values.update(overrides)
    return CommittedRow(**values)


def test_ownership_scope_matches_only_identical_rows() -> None:
    """所有範囲はすべての項目が一致する行だけを認めること"""
    scope = CompensatingDeleteOwnershipScope(
        "t1", "s1", "j1", "r1", " PostgreSQL ", "db", "tbl", "g"
    )
    assert scope.provider_id == "postgresql"
    assert scope.matches(_row())
    assert not scope.matches(None)
    for field_name in (
        "tenant_id",
        "source_ref",
        "job_id",
        "run_id",
        "database_name",
        "table_name",
        "graph_name",
    ):
        assert not scope.matches(_row(**{field_name: "other"}))


def test_committed_row_ids_chunk_ids_skip_blank() -> None:
    """コミット済みの行の一覧は空でないチャンク ID だけを集めること"""
    rows = CommittedRowIds.of(
        [_row(), _row(graph_rag_chunk_id=""), _row(graph_rag_chunk_id="c2")]
    )
    assert rows.chunk_ids() == frozenset({"c1", "c2"})
    assert CommittedRowIds.empty().is_empty()


def test_outcome_hashes_ids_and_allowlists_reasons() -> None:
    """補償削除の結果は ID をハッシュにし、理由を許可リストで絞ること"""
    assert len(CompensatingDeleteOutcome.safe_hash("secret-id")) == 16
    assert "secret-id" not in CompensatingDeleteOutcome.safe_hash("secret-id")
    assert CompensatingDeleteOutcome.safe_hash(
        None
    ) == CompensatingDeleteOutcome.safe_hash("")
    assert (
        CompensatingDeleteOutcome.sanitize_layer_reason("already_absent")
        == "already_absent"
    )
    assert CompensatingDeleteOutcome.sanitize_layer_reason("jdbc:secret") == ""
    row = RowOutcome(
        vector_layer_reason="jdbc:secret", age_layer_reason="provider_failure"
    )
    assert row.vector_layer_reason == ""
    assert row.age_layer_reason == "provider_failure"
    skipped = CompensatingDeleteOutcome.skipped("CODE", "src", "chunk", -3)
    assert skipped.affected_chunk_count == 0
    assert skipped.row_outcomes == ()
