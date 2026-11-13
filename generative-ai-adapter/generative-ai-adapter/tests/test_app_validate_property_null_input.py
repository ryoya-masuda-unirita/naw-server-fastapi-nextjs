"""validate_property に None を渡したときのテスト（移植元 ValidatePropertyNullInputTest）。

None は空文字列と同じ結果（同じ戻り値、または同じ型の例外）になることを確かめる。
"""

import pytest
from generative_ai_adapter.app import App
from generative_ai_adapter.constants import PropertyIds


def _assert_none_matches_empty_string(prop_id: int) -> None:
    """None の検証結果が空文字列の検証結果と同じであることを確かめる。

    Parameters
    ----------
    prop_id : int
        プロパティ ID。

    Raises
    ------
    AssertionError
        結果が違うとき。
    """
    app = App()
    try:
        empty_result = app.validate_property(prop_id, "")
    except Exception as e:  # noqa: BLE001 — 空文字列で出た例外の型を None と比べる
        with pytest.raises(Exception) as none_error:
            app.validate_property(prop_id, None)
        assert type(none_error.value) is type(e)
        return
    assert empty_result is True
    assert app.validate_property(prop_id, None) is True


@pytest.mark.parametrize(
    "prop_id",
    [
        PropertyIds.URL,
        PropertyIds.API_KEY,
        PropertyIds.OUTPUT_DIR,
        PropertyIds.PROXY_PORT,
        PropertyIds.PROXY_ID,
        PropertyIds.PROXY_PASS,
        PropertyIds.TIMEOUT_SECONDS,
        PropertyIds.MAX_TOKENS,
        PropertyIds.REASONING_OUTPUT_PATH,
    ],
)
def test_null_matches_empty_string(prop_id: int) -> None:
    """None の検証結果が空文字列と同じであること"""
    _assert_none_matches_empty_string(prop_id)


def test_api_key_allows_opaque_non_whitespace_value() -> None:
    """空白を含まなければ記号を含む API キーも検証を通ること"""
    app = App()
    assert app.validate_property(PropertyIds.API_KEY, "synthetic^%KeyFixture%") is True


@pytest.mark.parametrize(
    "value",
    [
        "",
        "/waha/runtime/textData.json",
        "C:\\fixture\\textData.json",
        "${WAHA_TEXTDATA_PATH}",
    ],
)
def test_text_data_json_file_path_accepts_values_without_filesystem_validation(
    value: str,
) -> None:
    """textData のパスは空・Waha! の変数でもファイルを確かめずに検証を通ること"""
    app = App()
    assert app.validate_property(PropertyIds.TEXT_DATA_JSON_FILE_PATH, value) is True


def test_set_property_null_optional_proxy_port_does_not_throw() -> None:
    """Proxy ポート番号に None を渡しても例外にならないこと"""
    app = App()
    app.set_property(PropertyIds.PROXY_PORT, None)
