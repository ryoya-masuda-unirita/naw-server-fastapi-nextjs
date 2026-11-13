"""textData JSON（プロパティ 43）の厳密な読み込みのテスト。

移植元: textdata/SecuAiGentTextDataFileLoaderTest。

- 移植元の SecuAiGentTextDataFileLoader は Python では `textdata.load_text_data_document`
  に当たる。読み込んだ内容は core の CoreSecuAiGentTextDataDocument で、Optional の項目は
  None で「なし」を表す
- `load(null)` は Python の `load_text_data_document(file_path: str)` が None を受けない
  ため、core の CoreSecuAiGentTextDataLoader で確かめる
"""

from collections.abc import Callable
from pathlib import Path

import pytest
from generative_ai_adapter.textdata import (
    SecuAiGentTextDataFailure,
    load_text_data_document,
)
from generative_ai_core.provider.clients.secuaigent.text_data import (
    CoreSecuAiGentTextDataLoader,
)

CODE = "SECUAIGENT_TEXTDATA_INVALID"


def _assert_rejected(
    fixture: Path, *, not_contains: tuple[str, ...] = ()
) -> SecuAiGentTextDataFailure:
    """textData の読み込みが固定のメッセージの失敗になることを確かめる。

    Parameters
    ----------
    fixture : Path
        textData JSON のファイル。
    not_contains : tuple[str, ...], optional
        メッセージに含まれてはいけない文字列。

    Returns
    -------
    SecuAiGentTextDataFailure
        発生した失敗。
    """
    with pytest.raises(SecuAiGentTextDataFailure) as error:
        load_text_data_document(str(fixture))
    message = str(error.value)
    assert CODE in message
    assert str(fixture) not in message
    for text in not_contains:
        assert text not in message
    return error.value


def test_loads_allowed_s1_document_strictly(
    tmp_path: Path,
    write_text_data_fixture: Callable[[Path, str], Path],
    text_data_json: dict[str, str],
) -> None:
    """許可されたキーの textData をすべて読めること"""
    fixture = write_text_data_fixture(tmp_path, text_data_json["valid_generative"])

    document = load_text_data_document(str(fixture))

    assert document.url == "https://json-provider.invalid"
    assert document.access_token == "access-token-fixture"
    assert document.tenant_id == "tenant-fixture"
    assert document.deploy_name == "json-deploy"
    assert document.message_id == "msg-fixture"
    assert document.additional_prompt == "prompt-fixture"
    assert document.temperature == 0.2
    assert document.max_tokens == 1024
    assert document.reasoning_effort == "high"
    assert document.verbosity == "low"
    assert document.create_library is True


def test_rejects_duplicate_keys_before_object_conversion(
    tmp_path: Path, write_text_data_fixture: Callable[[Path, str], Path]
) -> None:
    """キーが重複していれば失敗にすること"""
    fixture = write_text_data_fixture(
        tmp_path, '{"deployName":"first","deployName":"second"}'
    )

    _assert_rejected(fixture)


@pytest.mark.parametrize(
    "text",
    [
        '{"messages":[]}',
        '{"attachmentFiles":[]}',
        '{"credential":{"apiKey":"redacted"}}',
        '{"apiKey":"redacted"}',
        '{"proxyPassword":"redacted"}',
        '{"unexpectedCredential":"redacted"}',
        '{"credential":{"url":"https://json-provider.invalid","extra":"redacted"}}',
    ],
)
def test_rejects_unknown_forbidden_and_credential_shaped_keys_with_sanitized_failure(
    tmp_path: Path, write_text_data_fixture: Callable[[Path, str], Path], text: str
) -> None:
    """未知・禁止・資格情報らしいキーを、値を出さない失敗にすること"""
    fixture = write_text_data_fixture(tmp_path, text)

    _assert_rejected(fixture, not_contains=("redacted",))


def test_rejects_bearer_prefixed_access_token_with_sanitized_failure(
    tmp_path: Path, write_text_data_fixture: Callable[[Path, str], Path]
) -> None:
    """Bearer 付きのアクセストークンを、値を出さない失敗にすること"""
    fixture = write_text_data_fixture(
        tmp_path, '{"accessToken":"Bearer redacted-token"}'
    )

    _assert_rejected(fixture, not_contains=("Bearer", "redacted-token"))


def test_rejects_broken_json_with_sanitized_failure(
    tmp_path: Path, write_text_data_fixture: Callable[[Path, str], Path]
) -> None:
    """壊れた JSON を、パスを出さない失敗にすること"""
    fixture = write_text_data_fixture(tmp_path, "{not-json}")

    _assert_rejected(fixture)


@pytest.mark.parametrize(
    "text",
    [
        "// comment\n{}",
        "{'deployName':'single-quote'}",
        '{deployName:"unquoted-name"}',
        '{"deployName":"trailing-comma",}',
        '{"temperature":NaN}',
        '{"temperature":Infinity}',
    ],
)
def test_rejects_json_syntax_extensions_with_sanitized_failure(
    tmp_path: Path, write_text_data_fixture: Callable[[Path, str], Path], text: str
) -> None:
    """厳密な JSON でない書き方（コメント・単引用符・NaN など）を失敗にすること"""
    fixture = write_text_data_fixture(tmp_path, text)

    _assert_rejected(fixture)


def test_rejects_invalid_path_syntax_with_sanitized_failure_and_no_cause() -> None:
    """不正なパスを、パスを出さず原因も持たない失敗にすること"""
    raw_path = "invalid\u0000secret-runtime-path.json"

    with pytest.raises(SecuAiGentTextDataFailure) as error:
        load_text_data_document(raw_path)

    message = str(error.value)
    assert CODE in message
    assert raw_path not in message
    assert "secret-runtime-path" not in message
    assert error.value.__cause__ is None


def test_blank_path_keeps_existing_property_behavior_by_returning_empty_document() -> (
    None
):
    """パスが空なら空の textData を返すこと"""
    assert CoreSecuAiGentTextDataLoader().load(None) == load_text_data_document("   ")
    assert load_text_data_document("").url is None


def test_accepts_null_optional_fields_as_absent(
    tmp_path: Path, write_text_data_fixture: Callable[[Path, str], Path]
) -> None:
    """任意の項目の null を「なし」として読むこと"""
    fixture = write_text_data_fixture(
        tmp_path,
        """
        {
          "credential": null,
          "deployName": null,
          "messageId": null,
          "additionalPrompt": null,
          "temperature": null,
          "maxTokens": null,
          "reasoning_effort": null,
          "verbosity": null,
          "createLibrary": null
        }
        """,
    )

    document = load_text_data_document(str(fixture))

    assert document.access_token is None
    assert document.deploy_name is None
    assert document.create_library is None


@pytest.mark.parametrize("text", ["[]", '"text"', "{} {}"])
def test_rejects_non_object_root_and_trailing_tokens(
    tmp_path: Path, write_text_data_fixture: Callable[[Path, str], Path], text: str
) -> None:
    """オブジェクトでないルート・後ろに余計なトークンがある JSON を失敗にすること"""
    fixture = write_text_data_fixture(tmp_path, text)

    _assert_rejected(fixture)


@pytest.mark.parametrize(
    "text",
    [
        '{"credential":"not-object"}',
        '{"credential":{"url":"one","url":"two"}}',
        '{"credential":{"url":1}}',
    ],
)
def test_rejects_invalid_credential_shapes(
    tmp_path: Path, write_text_data_fixture: Callable[[Path, str], Path], text: str
) -> None:
    """credential の形が不正なら失敗にすること"""
    fixture = write_text_data_fixture(tmp_path, text)

    _assert_rejected(fixture)


@pytest.mark.parametrize(
    "text",
    [
        '{"deployName":""}',
        '{"deployName":1}',
        '{"messageId":1}',
        '{"additionalPrompt":1}',
        '{"temperature":"0.2"}',
        '{"temperature":-0.1}',
        '{"temperature":1.1}',
        '{"maxTokens":"1024"}',
        '{"maxTokens":0}',
        '{"maxTokens":1.5}',
        '{"createLibrary":"true"}',
        '{"reasoning_effort":""}',
        '{"verbosity":""}',
    ],
)
def test_rejects_invalid_generative_value_types_and_ranges(
    tmp_path: Path, write_text_data_fixture: Callable[[Path, str], Path], text: str
) -> None:
    """生成パラメータの型・範囲が不正なら失敗にすること"""
    fixture = write_text_data_fixture(tmp_path, text)

    _assert_rejected(fixture)


def test_loads_lower_case_stream_file_path_as_optional_string(
    tmp_path: Path, write_text_data_fixture: Callable[[Path, str], Path]
) -> None:
    """小文字の streamfilepath を文字列として読むこと"""
    fixture = write_text_data_fixture(
        tmp_path, '{"streamfilepath":"C:\\\\fixture\\\\secuaigent-textdata.json"}'
    )

    document = load_text_data_document(str(fixture))

    assert document.stream_file_path == "C:\\fixture\\secuaigent-textdata.json"


@pytest.mark.parametrize(
    "text",
    [
        "{}",
        '{"streamfilepath":null}',
        '{"streamfilepath":""}',
        '{"streamfilepath":"   "}',
    ],
)
def test_loads_unset_stream_file_path_as_empty_optional(
    tmp_path: Path, write_text_data_fixture: Callable[[Path, str], Path], text: str
) -> None:
    """streamfilepath がない・null・空白なら「なし」として読むこと"""
    fixture = write_text_data_fixture(tmp_path, text)

    document = load_text_data_document(str(fixture))

    assert document.stream_file_path is None


def test_rejects_present_invalid_stream_file_path_without_raw_value(
    tmp_path: Path, write_text_data_fixture: Callable[[Path, str], Path]
) -> None:
    """制御文字を含む streamfilepath を、値を出さない失敗にすること"""
    raw_path = "C:\\temp\\bad\npath.json"
    escaped = raw_path.replace("\\", "\\\\").replace("\n", "\\n")
    fixture = write_text_data_fixture(tmp_path, f'{{"streamfilepath":"{escaped}"}}')

    _assert_rejected(fixture, not_contains=(raw_path, "bad"))


@pytest.mark.parametrize(
    "text",
    [
        '{"streamfilepath":[]}',
        '{"streamfilepath":{}}',
        '{"streamfilepath":1}',
        '{"streamfilepath":true}',
        '{"streamfilepath":"C:\\\\temp\\\\bad\\npath.json"}',
    ],
)
def test_rejects_present_invalid_stream_file_path_matrix_without_fallback(
    tmp_path: Path, write_text_data_fixture: Callable[[Path, str], Path], text: str
) -> None:
    """不正な型・値の streamfilepath を「なし」に戻さず失敗にすること"""
    fixture = write_text_data_fixture(tmp_path, text)

    _assert_rejected(fixture, not_contains=("C:\\temp\\bad", "path.json"))
