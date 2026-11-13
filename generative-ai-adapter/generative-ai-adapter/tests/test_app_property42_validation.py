"""推論出力先ファイルパス（プロパティ 42）のテスト（移植元 Property42ValidationTest）。

検証は移植元どおり Windows のパスの形を求める（Python 版でもそのまま保つ）。
"""

import pytest
from generative_ai_adapter.app import App
from generative_ai_adapter.constants import PropertyIds

VALID_REASONING_PATH = "Z:\\fixture\\reasoning\\output.txt"


def test_accepts_empty_reasoning_output_path() -> None:
    """空の推論出力先は検証を通ること"""
    app = App()
    assert app.validate_property(PropertyIds.REASONING_OUTPUT_PATH, "") is True


def test_accepts_valid_windows_reasoning_output_path() -> None:
    """Windows のファイルパスは検証を通ること"""
    app = App()
    assert (
        app.validate_property(PropertyIds.REASONING_OUTPUT_PATH, VALID_REASONING_PATH)
        is True
    )


def test_rejects_invalid_reasoning_output_path() -> None:
    """パスの形でない推論出力先は例外になること"""
    app = App()
    with pytest.raises(RuntimeError):
        app.validate_property(PropertyIds.REASONING_OUTPUT_PATH, "invalid-path")


def test_set_property_skips_empty_optional_value() -> None:
    """空の推論出力先は無視されること"""
    app = App()
    app.set_property(PropertyIds.REASONING_OUTPUT_PATH, "")
    assert app.reasoning_output_path is None


def test_set_property_stores_valid_reasoning_output_path() -> None:
    """推論出力先のパスがそのまま入ること"""
    app = App()
    app.set_property(PropertyIds.REASONING_OUTPUT_PATH, VALID_REASONING_PATH)
    assert app.reasoning_output_path == VALID_REASONING_PATH
