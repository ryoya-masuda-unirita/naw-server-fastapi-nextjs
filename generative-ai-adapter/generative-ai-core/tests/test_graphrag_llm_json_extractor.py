"""LLM の候補 JSON の検証のテスト。

移植元 `graphrag/ingestion/llm/LlmJsonCandidateExtractorBoundaryTest` を移したもの。
"""

import pytest
from generative_ai_core.graphrag.ingestion import (
    IngestionEntityCandidate,
    IngestionExtraction,
    IngestionRequest,
)
from generative_ai_core.graphrag.ingestion.llm import (
    LlmCandidateExtraction,
    LlmCandidateExtractionRequest,
    LlmCandidateOutputException,
    LlmCandidateRepairContext,
    LlmJsonCandidateExtractor,
)

REJECTED = "LLM_CANDIDATE_OUTPUT_REJECTED"
UNREADABLE = "LLM_CANDIDATE_OUTPUT_UNREADABLE"


def _valid_json(chunk_id: str) -> str:
    """検証を通る候補 JSON を作る。

    Parameters
    ----------
    chunk_id : str
        候補が参照するチャンク ID。

    Returns
    -------
    str
        エンティティ 1 件・エッジ 1 件の JSON。
    """
    return f"""
    {{
      "extraction_run_id": "run-1",
      "entities": [{{
        "candidate_id": "llm-entity",
        "source_chunk_id": "{chunk_id}",
        "entity_type": "FEATURE",
        "label_hash": "label.hash",
        "evidence_id": "ev-entity",
        "verification_status": "candidate",
        "trust_level": "llm_suggested"
      }}],
      "edges": [{{
        "candidate_id": "llm-edge",
        "source_chunk_id": "{chunk_id}",
        "source_entity_id": "det-entity",
        "target_entity_id": "llm-entity",
        "edge_type": "RELATED_TO",
        "evidence_id": "ev-edge",
        "verification_status": "candidate",
        "trust_level": "llm_suggested"
      }}]
    }}
    """


def _request(repair: bool, repair_body: str = "") -> LlmCandidateExtractionRequest:
    """抽出の要求を作る。

    Parameters
    ----------
    repair : bool
        修復の呼び出しにするか。
    repair_body : str
        修復の入力にする候補 JSON。

    Returns
    -------
    LlmCandidateExtractionRequest
        要求。
    """
    return LlmCandidateExtractionRequest(
        IngestionRequest.builder()
        .tenant_id("tenant")
        .source_ref("source")
        .normalized_body("body")
        .build(),
        IngestionExtraction(
            (),
            (IngestionEntityCandidate("det", "det-entity", "FEATURE", "label.det"),),
            (),
        ),
        "chunk-1",
        LlmCandidateRepairContext(repair_body, "REPAIR") if repair else None,
    )


def _extractor(output: str | None) -> LlmJsonCandidateExtractor:
    """決まった出力を返す抽出器を作る。

    Parameters
    ----------
    output : str | None
        LLM の出力。

    Returns
    -------
    LlmJsonCandidateExtractor
        抽出器。
    """
    return LlmJsonCandidateExtractor(lambda request: output)  # type: ignore[arg-type,return-value]


def _capture(output: str, repair: bool = False) -> LlmCandidateOutputException:
    """拒否の例外を捕まえて返す。

    Parameters
    ----------
    output : str
        LLM の出力。
    repair : bool
        修復の呼び出しにするか。

    Returns
    -------
    LlmCandidateOutputException
        送出された例外。
    """
    with pytest.raises(LlmCandidateOutputException) as info:
        _extractor(output).extract(_request(repair, _valid_json("chunk-1")))
    return info.value


def _assert_rejects(output: str | None, code: str, body_expected: bool) -> None:
    """拒否コードと、修復用の候補 JSON の有無を確かめる。

    Parameters
    ----------
    output : str | None
        LLM の出力。
    code : str
        期待する拒否コード。
    body_expected : bool
        修復用の候補 JSON が付くことを期待するか。
    """
    with pytest.raises(LlmCandidateOutputException) as info:
        _extractor(output).extract(_request(False, _valid_json("chunk-1")))
    exception = info.value
    assert exception.failure_code == code
    assert (exception.candidate_json_body() is not None) is body_expected
    for secret in ("jdbc:", "password", "secret"):
        assert secret not in str(exception)


def _assert_repair_rejects(original: str, repair: str, summary: str) -> None:
    """修復の出力が元より増えていれば拒否されることを確かめる。

    Parameters
    ----------
    original : str
        修復の入力にする候補 JSON。
    repair : str
        修復の出力。
    summary : str
        拒否メッセージに含まれるはずの文字列。
    """
    with pytest.raises(LlmCandidateOutputException, match=summary):
        _extractor(repair).extract(_request(True, original))


def test_extracts_only_safe_candidates_linked_to_the_current_chunk() -> None:
    """安全な候補だけを取り出し、由来が現在のチャンクに結びつくこと"""
    extraction = _extractor(_valid_json("chunk-1")).extract(_request(False))
    assert [e.entity_id for e in extraction.entities] == ["llm-entity"]
    assert [e.edge_id for e in extraction.edges] == ["llm-edge"]
    assert [o.source_chunk_id for o in extraction.origins] == ["chunk-1", "chunk-1"]


def test_unreadable_and_forbidden_output_fails_closed() -> None:
    """読めない出力・禁止キーや内部 URL を含む出力は読めない扱いで拒否されること"""
    _assert_rejects(None, UNREADABLE, False)
    _assert_rejects(" ", UNREADABLE, False)
    _assert_rejects("{", UNREADABLE, False)
    _assert_rejects(
        '{"extraction_run_id":"run-1","provider_response":"x","entities":[],"edges":[]}',
        UNREADABLE,
        True,
    )
    _assert_rejects(
        _valid_json("chunk-1").replace("label.hash", "jdbc:internal"), UNREADABLE, True
    )


def test_unsafe_candidate_shape_returns_sanitized_repair_body() -> None:
    """安全でない候補の形は、伏せ字にした修復用 JSON 付きで拒否されること"""
    exception = _capture(
        """
        {"extraction_run_id": "run-1",
         "entities": {"candidate_id":"llm-entity","source_chunk_id":"chunk-1",
           "entity_type":"bad-type","label_hash":"label.hash","evidence_id":"ev-1",
           "verification_status":"candidate","trust_level":"llm_suggested",
           "extra_field":"C:\\\\Users\\\\private\\\\file.txt"},
         "edges": "not-array"}
        """
    )
    assert exception.failure_code == REJECTED
    body = exception.candidate_json_body()
    assert body is not None
    assert "llm-entity" in body and "redacted" in body
    for leaked in ("extra_field", "C:\\", "not-array"):
        assert leaked not in body


def test_repair_attempt_cannot_add_candidates_or_evidence() -> None:
    """修復の出力が元の候補・根拠を増やすと拒否されること"""
    original = _valid_json("chunk-1")
    _assert_repair_rejects(
        '{"extraction_run_id":"run-1","entities":[],"edges":[]}',
        original,
        "repair output adds entity candidates",
    )
    _assert_repair_rejects(
        original,
        original.replace(
            '"candidate_id": "llm-entity"', '"candidate_id": "llm-entity-added"'
        ),
        "adds entity candidate",
    )
    _assert_repair_rejects(
        original,
        original.replace(
            '"candidate_id": "llm-edge"', '"candidate_id": "llm-edge-added"'
        ),
        "adds edge candidate",
    )
    _assert_repair_rejects(
        original,
        original.replace('"evidence_id": "ev-edge"', '"evidence_id": "ev-added"'),
        "adds evidence candidate",
    )
    _assert_repair_rejects("not-json", original, "repair input candidate JSON")


@pytest.mark.parametrize(
    ("old", "new"),
    [
        ('"extraction_run_id": "run-1",', ""),
        ('"evidence_id": "ev-entity",', ""),
        ('"entity_type": "FEATURE"', '"entity_type": "feature"'),
        ('"candidate_id": "llm-edge"', '"candidate_id": "llm-entity"'),
        ('"target_entity_id": "llm-entity"', '"target_entity_id": "missing-entity"'),
        ('"target_entity_id": "llm-entity"', '"target_entity_id": "det-entity"'),
        ('"verification_status": "candidate"', '"verification_status": "accepted"'),
        ('"trust_level": "llm_suggested"', '"trust_level": "trusted"'),
        ('"label_hash": "label.hash"', '"label_hash": "raw prompt from C:/Users/x"'),
    ],
)
def test_candidate_validation_rejects_invalid_values(old: str, new: str) -> None:
    """欠落・不正な型・重複・自己ループ・未知の参照・昇格は拒否されること"""
    _assert_rejects(_valid_json("chunk-1").replace(old, new), REJECTED, True)


def test_candidate_validation_rejects_cross_chunk_evidence() -> None:
    """別チャンクを根拠にした候補は拒否されること"""
    _assert_rejects(_valid_json("other-chunk"), REJECTED, True)


def test_forbidden_nested_keys_are_unreadable_and_sanitizer_drops_unsafe_shapes() -> (
    None
):
    """ネストした禁止キーは読めない扱いになり、修復用 JSON は安全でない値を落とすこと"""
    _assert_rejects(
        """
        {"extraction_run_id": "run-1",
         "entities": [{"candidate_id":"llm-1","source_chunk_id":"chunk-1",
           "entity_type":"FEATURE","label_hash":"label.hash","evidence_id":"ev-1",
           "verification_status":"candidate","trust_level":"llm_suggested",
           "debug": {"chunk_text":"raw provider response"}}],
         "edges": []}
        """,
        UNREADABLE,
        True,
    )
    exception = _capture(
        """
        {"extraction_run_id": "run-1", "entities": "not-array",
         "edges": [{"candidate_id":"llm-edge","edge_type":"not-safe-type",
           "evidence_id":"C:\\\\Users\\\\secret.txt"}]}
        """
    )
    body = exception.candidate_json_body()
    assert body is not None
    assert '"entities":[]' in body and '"edge_type":"redacted"' in body
    for leaked in ("C:\\", "secret.txt", "not-array"):
        assert leaked not in body


def test_repair_attempt_accepts_original_bounds_and_sanitizes_primitives() -> None:
    """修復の出力が元の範囲内なら受け入れ、配列内のプリミティブは無視して整えること"""
    original = _valid_json("chunk-1")
    assert len(_extractor(original).extract(_request(True, original)).origins) == 2
    with_primitives = original.replace(
        '"entities": [{', '"entities": [true, {'
    ).replace('"edges": [{', '"edges": [false, {')
    assert (
        len(_extractor(original).extract(_request(True, with_primitives)).origins) == 2
    )
    exception = _capture(
        '{"extraction_run_id":"run-1","entities":[{"candidate_id":null,'
        '"source_chunk_id":"chunk-1","entity_type":"FEATURE","label_hash":"label.hash",'
        '"evidence_id":"ev-entity","verification_status":"candidate",'
        '"trust_level":"llm_suggested"},true],"edges":[{"candidate_id":"llm-edge",'
        '"source_chunk_id":"chunk-1","source_entity_id":"det-entity",'
        '"target_entity_id":"llm-entity","edge_type":"RELATED_TO","evidence_id":42,'
        '"verification_status":"candidate","trust_level":"llm_suggested"}]}'
    )
    body = exception.candidate_json_body()
    assert body is not None
    assert '"entity_type":"FEATURE"' in body
    assert '"candidate_id":"llm-edge"' in body
    assert '"evidence_id":"42"' in body
    assert 'candidate_id":null' not in body


def test_missing_candidate_arrays_still_produce_safe_output() -> None:
    """edges の配列がなくても、エンティティだけの安全な出力になること"""
    output = """
    {"extraction_run_id": "run-1",
     "entities": [{"candidate_id":"llm-entity","source_chunk_id":"chunk-1",
       "entity_type":"FEATURE","label_hash":"label.hash","evidence_id":"ev-entity",
       "verification_status":"candidate","trust_level":"llm_suggested"}]}
    """
    extraction = _extractor(output).extract(_request(False))
    assert len(extraction.entities) == 1
    assert extraction.edges == ()
    assert len(extraction.origins) == 1


def test_repair_body_redacts_overlong_and_unsafe_allowed_values() -> None:
    """許可した項目でも、長すぎる値・パスは redacted になること"""
    long_id = "a" * 129
    exception = _capture(
        f"""
        {{"extraction_run_id":"run-1",
         "entities":[{{"candidate_id":"{long_id}","source_chunk_id":"chunk-1",
           "entity_type":"FEATURE","label_hash":"label.hash",
           "evidence_id":"C:\\\\Users\\\\private\\\\evidence.txt",
           "verification_status":"candidate","trust_level":"llm_suggested"}}],
         "edges":null}}
        """
    )
    body = exception.candidate_json_body()
    assert body is not None
    assert '"candidate_id":"redacted"' in body and '"evidence_id":"redacted"' in body
    for leaked in ("C:\\", "private", long_id):
        assert leaked not in body


@pytest.mark.parametrize(
    "output",
    [
        (
            '{"extraction_run_id":"run-1","entities":[{"candidate_id":"llm-1",'
            '"source_chunk_id":"chunk-1","entity_type":"FEATURE","label_hash":"label.hash",'
            '"evidence_id":"ev-1","verification_status":"candidate",'
            '"trust_level":"llm_suggested","notes":["safe","raw provider response"]}],'
            '"edges":[]}'
        ),
        (
            '{"extraction_run_id":"run-1","entities":[{"candidate_id":"llm-1",'
            '"source_chunk_id":"chunk-1","entity_type":"FEATURE","label_hash":"label.hash",'
            '"evidence_id":null,"verification_status":"candidate",'
            '"trust_level":"llm_suggested"}],"edges":[]}'
        ),
        '{"extraction_run_id":"run-1","entities":[],"edges":{}}',
    ],
)
def test_forbidden_primitive_and_missing_values_stay_fail_closed(output: str) -> None:
    """禁止された値・根拠なし・配列でない項目は拒否されること"""
    _assert_rejects(output, REJECTED, True)


def test_empty_extraction_is_equal_to_the_empty_result() -> None:
    """候補なしの抽出結果は empty() と同じであること"""
    assert LlmCandidateExtraction.empty() == LlmCandidateExtraction((), (), ())
