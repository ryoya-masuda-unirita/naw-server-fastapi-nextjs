"""検索の値オブジェクトのテスト。

移植元 `CoreRetrievalRequest`・`CoreRetrievalResult`・`CoreGraphRagSearchSetting`・
`CoreGraphContextCandidate` の正規化と、`CoreRetrievalResultValidationTest`・
`CoreGraphRagSearchSettingTest`・`CoreRetrievalBranchCoverageTest` の一部を移した。
"""

import pytest
from generative_ai_core.failure import CoreFailure
from generative_ai_core.retrieval.graph_support import (
    CoreGraphSearchResultMerger,
    CoreRetrievalResultValidator,
    requires_business_relationship_traversal,
)
from generative_ai_core.retrieval.models import (
    DEFAULT_GRAPH_NAME,
    CoreGraphContextCandidate,
    CoreGraphRagSearchSetting,
    CoreRetrievalRequest,
    CoreRetrievalResult,
    CoreVectorSearchResult,
)


def test_request_normalizes_fields() -> None:
    """プロバイダ ID と属性の空白を除き、最大件数は 1 以上、Graph 設定は無効で補うこと"""
    request = (
        CoreRetrievalRequest.builder(" PostgreSQL ")
        .query("質問")
        .max_results(0)
        .attribute(" key ", " value ")
        .attribute("", "ignored")
        .attribute("no-value", None)
        .build()
    )

    assert request.provider_id == "PostgreSQL"
    assert request.max_results == 1
    assert request.attributes == {"key": "value"}
    assert not request.graph_setting().enabled
    assert request.graph_setting().provider_name == "PostgreSQL"
    assert request.query_vector == ()


def test_request_requires_provider_id() -> None:
    """プロバイダ ID が空ならエラーになること"""
    with pytest.raises(ValueError, match="providerId must not be blank"):
        CoreRetrievalRequest(provider_id=" ")


def test_graph_setting_requires_safe_identifier() -> None:
    """graph 名は安全な識別子だけで、空なら既定の名前になること"""
    assert CoreGraphRagSearchSetting.enabled_for("", "PostgreSQL").graph_name == (
        DEFAULT_GRAPH_NAME
    )
    with pytest.raises(ValueError, match="safe PostgreSQL identifier"):
        CoreGraphRagSearchSetting.enabled_for("bad-name; drop", "PostgreSQL")


@pytest.mark.parametrize(
    ("provider", "expected"),
    [
        ("PostgreSQL", True),
        ("PGvector", True),
        ("PostgreSQL(PGVector)", True),
        ("Azure", False),
    ],
)
def test_graph_setting_runs_only_for_postgresql(provider: str, expected: bool) -> None:
    """Graph 検索は有効かつ PostgreSQL 系のときだけ実行すること"""
    assert (
        CoreGraphRagSearchSetting.enabled_for("g", provider).should_run_graph_search()
        is expected
    )
    assert not CoreGraphRagSearchSetting.disabled(provider).should_run_graph_search()


def test_result_tsv_quotes_ids_with_tabs_and_newline() -> None:
    """LEGACY_TSV は ID を引用符で囲んでタブで区切り、末尾に改行を付けること"""
    result = CoreRetrievalResult.success(["a", "b"], False)

    assert result.to_quoted_tab_separated_ids() == '"a"\t"b"\n'
    assert CoreRetrievalResult.success([], False).to_quoted_tab_separated_ids() == "\n"


def test_result_hides_stale_deleted_and_not_current_ids() -> None:
    """現行でない・削除された・古いと証拠にある ID は出力しないこと"""
    evidence = {
        "sourceLifecycle.current.b": "false",
        "sourceLifecycle.deleted.c": "TRUE",
        "sourceLifecycle.stale.d": "true",
        "graphEvidence.current.e": "false",
        "graphEvidence.stale.f": "true",
    }
    result = CoreRetrievalResult.success(list("abcdefg"), False, evidence)

    assert result.visible_ordered_ids() == ["a", "g"]


def test_failure_result_has_no_ids() -> None:
    """失敗の結果は ID を持たないこと"""
    result = CoreRetrievalResult.of_failure(CoreFailure.of("X", "summary"))

    assert result.ordered_ids == ()
    assert result.failure is not None


def test_validator_deduplicates_and_trims_ids() -> None:
    """ID の前後の空白を除き、重複を落として順序を保つこと"""
    result = CoreRetrievalResultValidator().validate_success(
        [" a", "b", "a "], True, {"k": "v"}
    )

    assert result.ordered_ids == ("a", "b")
    assert result.graph_expanded
    assert result.evidence == {"k": "v"}


@pytest.mark.parametrize("ids", [None, ["a", None], ["a", " "]])
def test_validator_rejects_null_or_blank_ids(ids: list[str | None] | None) -> None:
    """ID が null・空なら MALFORMED_RESULT になること"""
    result = CoreRetrievalResultValidator().validate_success(ids, False)

    assert result.failure is not None
    assert result.failure.code == "MALFORMED_RESULT"


def test_vector_search_result_requires_id_and_clamps_rank() -> None:
    """ベクトル検索の結果は ID が必須で、順位は 0 未満にならないこと"""
    assert CoreVectorSearchResult(" id ", "c", -3).rank == 0
    assert CoreVectorSearchResult(" id ", "c", -3).id == "id"
    with pytest.raises(ValueError, match="id must not be blank"):
        CoreVectorSearchResult(" ")


def test_graph_candidate_defaults() -> None:
    """関係の種類と信頼度が空なら既定値になること"""
    candidate = CoreGraphContextCandidate("ctx", relation_kind=" ", candidate_trust="")

    assert candidate.relation_kind == "GRAPH_NEIGHBOR"
    assert candidate.candidate_trust == "unknown"
    assert not candidate.is_evidence_linked_business_relationship()


def test_merger_orders_by_seed_rank_relation_sequence_then_appends_seeds() -> None:
    """Graph の候補を種の順位・関係の種類・順番で並べ、続けて種を足すこと"""
    seeds = [CoreVectorSearchResult("s1", "", 1), CoreVectorSearchResult("s2", "", 2)]
    candidates = [
        CoreGraphContextCandidate(
            "n2", source_seed_rank=1, sequence=2, relation_kind="NEXT_CHUNK"
        ),
        CoreGraphContextCandidate(
            "b1",
            source_seed_rank=1,
            sequence=9,
            relation_kind="BUSINESS_RELATIONSHIP",
        ),
        CoreGraphContextCandidate(
            "n1", source_seed_rank=1, sequence=1, relation_kind="NEXT_CHUNK"
        ),
        CoreGraphContextCandidate(
            "x", source_seed_rank=2, sequence=1, relation_kind="NEXT_CHUNK"
        ),
    ]

    merged = CoreGraphSearchResultMerger().merge(seeds, candidates)

    assert merged == ["b1", "n1", "n2", "x", "s1", "s2"]
    assert CoreGraphSearchResultMerger().merge(seeds, []) == ["s1", "s2"]


@pytest.mark.parametrize(
    ("query", "expected"),
    [
        ("影響を教えて", True),
        ("dependency graph", True),
        ("経費の申請方法", False),
        ("", False),
    ],
)
def test_business_relationship_query_detection(query: str, expected: bool) -> None:
    """関係・依存・影響・原因などを含む質問を業務上の関係をたどる質問と判定すること"""
    request = CoreRetrievalRequest.builder("PostgreSQL").query(query).build()

    assert requires_business_relationship_traversal(request) is expected
    assert not requires_business_relationship_traversal(None)
