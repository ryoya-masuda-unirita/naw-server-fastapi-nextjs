"""textData JSON が使えないときに App が書く失敗のテスト。

移植元: SecuAiGentTextDataJsonFailureTest

- 移植元の `write(new byte[0], 0)` は空のレコード `[]` を渡す
- 移植元の Gson による RetrievalAnswer の読み込みは `json.loads` の `answer` で代える
- 読めないファイルのテストは、POSIX の権限で読めなくできるときだけ実行する
  （root で動かすときなどは skip する）
"""

import json
import os
import stat
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

import pytest
from generative_ai_adapter.app import App
from generative_ai_adapter.constants import PropertyIds
from generative_ai_adapter.textdata import SecuAiGentTextDataFailure


@dataclass(frozen=True)
class _FailureFixture:
    """不正な textData のパスと、出力に出てはいけない値。

    Attributes
    ----------
    path : Path
        textData JSON のパス。
    raw_values : Sequence[str]
        出力に出てはいけない値。
    """

    path: Path
    raw_values: Sequence[str]


def _write_fixture(directory: Path, json_text: str) -> Path:
    """textData JSON を一時ファイルに書く。

    Parameters
    ----------
    directory : Path
        書く先のディレクトリ。
    json_text : str
        JSON の文字列。

    Returns
    -------
    Path
        書いたファイル。
    """
    index = len(list(directory.glob("secuaigent-textdata-failure-*.json")))
    fixture = directory / f"secuaigent-textdata-failure-{index}.json"
    fixture.write_text(json_text, encoding="utf-8")
    return fixture


def _failure_fixtures(directory: Path) -> list[_FailureFixture]:
    """不正な textData の一覧を作る。

    Parameters
    ----------
    directory : Path
        書く先のディレクトリ。

    Returns
    -------
    list[_FailureFixture]
        ない・壊れた・未知のキー・数値の messageId・不正な streamfilepath・
        禁止のキーの textData。
    """
    missing = directory / "missing-textdata.json"
    broken = _write_fixture(directory, '{"accessToken":"raw-json-token"')
    unknown = _write_fixture(directory, '{"unknownKey":"raw-unknown-value"}')
    non_string_message_id = _write_fixture(directory, '{"messageId":123456789}')
    invalid_stream_file_path = _write_fixture(
        directory, '{"streamfilepath":"C:\\\\temp\\\\bad\\npath.json"}'
    )
    forbidden = _write_fixture(
        directory, '{"secrets":{"apiKey":"raw-forbidden-value"}}'
    )
    return [
        _FailureFixture(missing, [str(missing)]),
        _FailureFixture(broken, [str(broken), "raw-json-token"]),
        _FailureFixture(unknown, [str(unknown), "raw-unknown-value"]),
        _FailureFixture(
            non_string_message_id, [str(non_string_message_id), "123456789"]
        ),
        _FailureFixture(
            invalid_stream_file_path,
            [str(invalid_stream_file_path), "C:\\temp\\bad", "path.json"],
        ),
        _FailureFixture(forbidden, [str(forbidden), "raw-forbidden-value"]),
    ]


def _configured_app(output_type: int) -> App:
    """SecuAiGent の資格情報をプロパティで設定した App を作る。

    Parameters
    ----------
    output_type : int
        出力モード。

    Returns
    -------
    App
        設定した App。
    """
    app = App()
    app.set_property(PropertyIds.URL, "https://property-provider.invalid")
    app.set_property(PropertyIds.API_KEY, "property-login")
    app.set_property(PropertyIds.MODEL_NAME, "property-deploy")
    app.set_property(PropertyIds.TENANT_ID, "property-tenant")
    app.set_property(PropertyIds.VENDOR, "5")
    app.connect(output_type)
    return app


def _run_write(
    directory: Path,
    text_data_path: Path,
    output_type: int,
    library_generation_off: bool = False,
) -> Path:
    """textData を設定して before_execute・write を呼ぶ。

    Parameters
    ----------
    directory : Path
        出力先のディレクトリ。
    text_data_path : Path
        textData JSON のパス。
    output_type : int
        出力モード。
    library_generation_off : bool, optional
        ライブラリ生成をオフ（プロパティ 49 = "1"）にするか。

    Returns
    -------
    Path
        出力ファイル。
    """
    app = _configured_app(output_type)
    app.set_property(PropertyIds.TEXT_DATA_JSON_FILE_PATH, str(text_data_path))
    if library_generation_off:
        app.set_property(PropertyIds.SECUAIGENT_LIBRARY_GENERATION, "1")
    output = directory / f"answer-{output_type}-{text_data_path.name}.txt"
    app.set_property(PropertyIds.OUTPUT_DIR, str(directory))
    app.set_view_name(output.name)

    app.before_execute()
    if library_generation_off:
        assert app._controller is None
    app.write([])
    return output


def _assert_failure_text(text: str | None, raw_values: Sequence[str]) -> None:
    """失敗のコードを含み、資格情報・入力の値を含まないことを確かめる。

    Parameters
    ----------
    text : str | None
        出力の文字列。
    raw_values : Sequence[str]
        出てはいけない値。
    """
    assert text is not None
    assert SecuAiGentTextDataFailure.code in text
    assert "property-login" not in text
    assert "property-provider.invalid" not in text
    assert "property-tenant" not in text
    for raw_value in raw_values:
        assert raw_value not in text


def _make_unreadable(fixture: Path) -> None:
    """ファイルを読めなくする。読めてしまう環境なら skip する。

    Parameters
    ----------
    fixture : Path
        読めなくするファイル。
    """
    if os.name != "posix":
        pytest.skip("POSIX の権限が使えない")
    fixture.chmod(0)
    if os.access(fixture, os.R_OK):
        fixture.chmod(stat.S_IRUSR | stat.S_IWUSR)
        pytest.skip("権限を外してもファイルを読める")


def test_output_type2_plain_failure_matrix_is_sanitized_and_does_not_fallback(
    tmp_path: Path,
) -> None:
    """出力モード 2 で、不正な textData の失敗を値を出さずに書くこと"""
    for fixture in _failure_fixtures(tmp_path):
        output = _run_write(tmp_path, fixture.path, 2)

        _assert_failure_text(output.read_text(encoding="utf-8"), fixture.raw_values)


def test_retrieval_answer_json_failure_matrix_is_sanitized_and_does_not_fallback(
    tmp_path: Path,
) -> None:
    """RetrievalAnswer JSON で、不正な textData の失敗を値を出さずに書くこと"""
    for fixture in _failure_fixtures(tmp_path):
        output = _run_write(tmp_path, fixture.path, 1)
        answer = json.loads(output.read_text(encoding="utf-8"))["answer"]

        _assert_failure_text(answer, fixture.raw_values)


def test_off_still_rejects_invalid_nonblank_text_data_before_provider_invocation(
    tmp_path: Path,
) -> None:
    """ライブラリ生成オフでも、不正な textData はプロバイダを呼ぶ前に失敗にすること"""
    for fixture in _failure_fixtures(tmp_path):
        output = _run_write(tmp_path, fixture.path, 2, library_generation_off=True)

        _assert_failure_text(output.read_text(encoding="utf-8"), fixture.raw_values)


def test_unreadable_file_failure_is_sanitized_when_supported_by_filesystem(
    tmp_path: Path,
) -> None:
    """読めない textData の失敗をパスを出さずに書くこと"""
    fixture = _write_fixture(tmp_path, '{"deployName":"unreadable-deploy"}')
    _make_unreadable(fixture)
    try:
        output = _run_write(tmp_path, fixture, 2)

        _assert_failure_text(output.read_text(encoding="utf-8"), [str(fixture)])
    finally:
        fixture.chmod(stat.S_IRUSR | stat.S_IWUSR)


def test_unreadable_file_retrieval_answer_json_failure_is_sanitized(
    tmp_path: Path,
) -> None:
    """読めない textData の失敗を RetrievalAnswer JSON に値を出さずに書くこと"""
    fixture = _write_fixture(tmp_path, '{"deployName":"unreadable-json-deploy"}')
    _make_unreadable(fixture)
    try:
        output = _run_write(tmp_path, fixture, 1)
        answer = json.loads(output.read_text(encoding="utf-8"))["answer"]

        _assert_failure_text(answer, [str(fixture), "unreadable-json-deploy"])
    finally:
        fixture.chmod(stat.S_IRUSR | stat.S_IWUSR)
