"""通常 chat の必須プロパティの検証のテスト（移植元 GenerativeRequiredPropertyValidationTest）。

移植元の `@InjectMocks` は、`App._request_schema_factory`・`App._controller` に
MagicMock を入れて代える。検証で止まり、どちらも呼ばれないことを確かめる。
"""

from unittest.mock import MagicMock

import pytest
from generative_ai_adapter.app import App
from generative_ai_adapter.constants import PropertyIds
from generative_ai_adapter.controller import GenerativeAiController
from generative_ai_adapter.property_validation import WahaPropertyValidationError
from generative_ai_adapter.request_schema_factory import RequestSchemaFactory
from generative_ai_adapter.waha import ColumnInformation, ColumnType


def _normal_answer_app() -> tuple[App, MagicMock, MagicMock]:
    """通常 chat（出力モード 0）に設定し、factory・controller をモックにした App を作る。

    Returns
    -------
    tuple[App, MagicMock, MagicMock]
        App、RequestSchemaFactory のモック、controller のモック。
    """
    app = App()
    factory = MagicMock(spec=RequestSchemaFactory)
    controller = MagicMock(spec=GenerativeAiController)
    app._request_schema_factory = factory
    app._controller = controller
    app.set_view_name("testViewName")
    app.set_column_information([ColumnInformation("user", ColumnType.CHAR, 0)])
    app.connect(0)
    return app, factory, controller


def _assert_missing(
    app: App,
    factory: MagicMock,
    controller: MagicMock,
    property_id: int,
    property_name: str,
) -> None:
    """write が「必須のプロパティがない」で止まり、factory・controller を呼ばないことを確かめる。

    Parameters
    ----------
    app : App
        確かめる App。
    factory : MagicMock
        RequestSchemaFactory のモック。
    controller : MagicMock
        controller のモック。
    property_id : int
        ないはずのプロパティ ID。
    property_name : str
        ないはずの項目名。

    Raises
    ------
    AssertionError
        結果が違うとき。
    """
    with pytest.raises(WahaPropertyValidationError) as exc_info:
        app.write([])
    assert exc_info.value.property_id == property_id
    assert exc_info.value.property_name == property_name
    assert exc_info.value.reason == "missing"
    assert factory.mock_calls == []
    assert controller.mock_calls == []


def test_normal_answer_requires_model_before_request_creation_and_model_call() -> None:
    """モデル名が空白なら、リクエストを作る前に missing で止まること"""
    app, factory, controller = _normal_answer_app()
    app.set_property(PropertyIds.OUTPUT_DIR, "out")
    app.set_property(PropertyIds.MODEL_NAME, " ")
    _assert_missing(app, factory, controller, PropertyIds.MODEL_NAME, "model")


def test_normal_answer_requires_unset_model_before_request_creation() -> None:
    """モデル名が未設定なら、リクエストを作る前に missing で止まること"""
    app, factory, controller = _normal_answer_app()
    app.set_property(PropertyIds.OUTPUT_DIR, "out")
    _assert_missing(app, factory, controller, PropertyIds.MODEL_NAME, "model")


def test_normal_answer_requires_output_directory_before_request_creation() -> None:
    """出力先が空白なら、リクエストを作る前に missing で止まること"""
    app, factory, controller = _normal_answer_app()
    app.set_property(PropertyIds.MODEL_NAME, "test-model")
    app.set_property(PropertyIds.OUTPUT_DIR, " ")
    _assert_missing(app, factory, controller, PropertyIds.OUTPUT_DIR, "outputDir")
