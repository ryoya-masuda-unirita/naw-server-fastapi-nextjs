"""任意の生成パラメータの受け渡しのテスト（移植元 GenerativeOptionalParameterMappingTest）。

移植元の `createRequestSchema(model, parameter)` は、Python 版では列なしで
`create_request_schema(model, [], [], parameter)` を呼んで代える。
"""

from generative_ai_adapter.app import App
from generative_ai_adapter.constants import ImageExplanationMode, PropertyIds
from generative_ai_adapter.domain import AccessCredential, ProxySetting
from generative_ai_adapter.request_schema_factory import RequestSchemaFactory


def test_property_ids19_to22_flow_into_request_schema_creation() -> None:
    """プロパティ 19〜22 がリクエストの生成パラメータに入ること"""
    app = App()
    app.set_property(PropertyIds.FREQUENCY_PENALTY, "0.15")
    app.set_property(PropertyIds.PRESENCE_PENALTY, "0.35")
    app.set_property(PropertyIds.TOP_P, "0.75")
    app.set_property(PropertyIds.STOP, "STOP")

    schema = RequestSchemaFactory(
        AccessCredential(), ProxySetting(), ImageExplanationMode.DISABLED
    ).create_request_schema("safe-model", [], [], app.chat_gpt_parameter)

    assert schema.frequency_penalty == 0.15
    assert schema.presence_penalty == 0.35
    assert schema.top_p == 0.75
    assert schema.stop == "STOP"
