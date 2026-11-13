"""実行できるプロバイダの検証のテスト（移植元 GenerativeProviderCapabilityTest）。

移植元の `@InjectMocks` は、`App._request_schema_factory`・`App._controller` に
MagicMock を入れて代える。未知のベンダー ID は、移植元の "99" が Python 版では
確認用の Echo に割り当てられているため、どちらでも未知の "98" で確かめる。
"""

from unittest.mock import MagicMock

import pytest
from generative_ai_adapter import vendor
from generative_ai_adapter.app import App
from generative_ai_adapter.constants import PropertyIds
from generative_ai_adapter.controller import GenerativeAiController
from generative_ai_adapter.property_validation import WahaPropertyValidationError
from generative_ai_adapter.request_schema_factory import RequestSchemaFactory
from generative_ai_adapter.waha import ColumnInformation, ColumnType

SUPPORTED_PROVIDERS_FRAGMENT = "supported providers: OpenAI, AzureOpenAI"


def test_legacy_provider_fails_closed_before_request_creation_and_model_call() -> None:
    """実行できないプロバイダ（Anthropic）は、リクエストを作る前に止まること"""
    app = App()
    factory = MagicMock(spec=RequestSchemaFactory)
    controller = MagicMock(spec=GenerativeAiController)
    app._request_schema_factory = factory
    app._controller = controller
    app.set_view_name("testViewName")
    app.set_column_information([ColumnInformation("user", ColumnType.CHAR, 0)])
    app.connect(0)
    app.set_property(PropertyIds.MODEL_NAME, "test-model")
    app.set_property(PropertyIds.OUTPUT_DIR, "out")
    app.set_property(PropertyIds.VENDOR, "2")

    with pytest.raises(WahaPropertyValidationError) as exc_info:
        app.write([])

    assert exc_info.value.property_id == PropertyIds.VENDOR
    assert exc_info.value.property_name == "provider"
    assert exc_info.value.reason == "unsupported-provider"
    assert SUPPORTED_PROVIDERS_FRAGMENT in str(exc_info.value)
    assert factory.mock_calls == []
    assert controller.mock_calls == []


@pytest.mark.parametrize("vendor_name", [None, " ", "OpenAI", "AzureOpenAI"])
def test_runnable_and_unset_providers_pass_provider_capability_guard(
    vendor_name: str | None,
) -> None:
    """未設定・実行できるプロバイダは検証を通ること"""
    vendor.validate_runnable_provider(vendor_name)


def test_unknown_provider_id_reports_supported_provider_set() -> None:
    """未知のベンダー ID は実行できるプロバイダの一覧付きで例外になること"""
    with pytest.raises(WahaPropertyValidationError) as exc_info:
        vendor.get_vendor_name("98")

    assert exc_info.value.property_id == PropertyIds.VENDOR
    assert exc_info.value.property_name == "provider"
    assert exc_info.value.reason == "unsupported-provider"
    assert SUPPORTED_PROVIDERS_FRAGMENT in str(exc_info.value)
