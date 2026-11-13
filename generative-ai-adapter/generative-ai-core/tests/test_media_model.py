"""移植元 CoreMediaPreprocessingModeTest・CoreMediaPreprocessingDtoTest の移植。

移植元の `CoreMediaPreprocessingMode` は数値コード（`getCode`・`fromString`）を持つが、
Python 版は文字列の StrEnum なので、安定した値の確認に置き換えている。
"""

from pathlib import Path

import pytest
from generative_ai_core.media import (
    PARSER_FAILURE,
    CoreImageExplanationEntry,
    CoreMediaPreprocessingFailure,
    CoreMediaPreprocessingMode,
    CoreMediaPreprocessingRequest,
    CoreMediaPreprocessingResult,
)


def test_mode_has_stable_string_values_and_parses_from_them() -> None:
    """モードが安定した文字列の値を持ち、その値から復元できること"""
    assert CoreMediaPreprocessingMode.DISABLED == "DISABLED"
    assert CoreMediaPreprocessingMode.EMBED_ONLY == "EMBED_ONLY"
    assert CoreMediaPreprocessingMode.FULL_PAGE == "FULL_PAGE"
    assert (
        CoreMediaPreprocessingMode("FULL_PAGE") is CoreMediaPreprocessingMode.FULL_PAGE
    )
    assert [m.value for m in CoreMediaPreprocessingMode] == [
        "DISABLED",
        "EMBED_ONLY",
        "FULL_PAGE",
    ]


def test_mode_rejects_unknown_value() -> None:
    """未知の値からはモードを作れないこと"""
    with pytest.raises(ValueError):
        CoreMediaPreprocessingMode("invalid")


def test_request_normalizes_mode_and_source_name() -> None:
    """リクエストがモードの既定値とソース名の空白除去を正規化すること"""
    request = CoreMediaPreprocessingRequest(
        Path("sample.txt"), source_name=" sample.txt "
    )

    assert request.source_name == "sample.txt"
    assert request.mode == CoreMediaPreprocessingMode.DISABLED


def test_request_defaults_source_name_to_file_name_and_provider_to_openai() -> None:
    """ソース名が空ならファイル名、プロバイダが空なら OpenAI になること"""
    request = CoreMediaPreprocessingRequest(
        Path("dir/sample.txt"), source_name=" ", provider_id=" "
    )

    assert request.source_name == "sample.txt"
    assert request.provider_id == "OpenAI"
    assert request.file_path.is_absolute()


def test_result_uses_defensive_collections_and_no_failure() -> None:
    """結果が防御的なコレクションを持ち、成功時は失敗を持たないこと"""
    result = CoreMediaPreprocessingResult.success("text", None, "text/plain", ())

    assert result.failure is None
    assert result.image_explanations == ()


def test_result_from_failure_has_empty_text_and_default_mime() -> None:
    """失敗の結果が空の本文と既定の MIME を持つこと"""
    failure = CoreMediaPreprocessingFailure.of(PARSER_FAILURE, "bad")
    result = CoreMediaPreprocessingResult.from_failure(failure)

    assert result.failure is failure
    assert result.text == ""
    assert result.attachment is None
    assert result.mime_type == "application/octet-stream"


def test_image_explanation_entry_requires_known_type_and_caption() -> None:
    """画像説明の項目が既知の種別と空でない説明を要求すること"""
    with pytest.raises(ValueError):
        CoreImageExplanationEntry(3, "caption", "source")
    with pytest.raises(ValueError):
        CoreImageExplanationEntry(1, " ", "source")


def test_image_explanation_entry_strips_caption_and_defaults_hint() -> None:
    """画像説明の項目が説明の空白を除き、出典の既定値を補うこと"""
    entry = CoreImageExplanationEntry(2, " caption ", " ")

    assert entry.caption == "caption"
    assert entry.source_hint == "image"


def test_failure_defaults_blank_code_and_sanitizes_summary() -> None:
    """失敗が空のコードを PARSER_FAILURE にし、要約から秘密を除くこと"""
    failure = CoreMediaPreprocessingFailure.of(" ", "api_key=sk-secret")

    assert failure.code == PARSER_FAILURE
    assert failure.category == PARSER_FAILURE
    assert "sk-secret" not in failure.summary
