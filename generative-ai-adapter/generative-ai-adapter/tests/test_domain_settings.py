"""接続設定の値オブジェクトのテスト。

移植元: domain/AccessCredentialTest・domain/ChatGPTParameterTest・domain/ProxySettingTest。
Java の getter・setter の組は、Python ではコンストラクタ引数と属性の代入・参照で確かめる。
"""

from generative_ai_adapter.domain import (
    AccessCredential,
    ChatGPTParameter,
    ProxySetting,
)

URL = "https://example.com"
TEST_URL = "https://test.example.com"


def test_access_credential_constructor_keeps_values() -> None:
    """コンストラクタで URL・テスト URL・API キー・モデル名を受け取れること"""
    credential = AccessCredential(
        url=URL, test_url=TEST_URL, api_key="apiKey", model_name="modelName"
    )

    assert credential.url == URL
    assert credential.test_url == TEST_URL
    assert credential.api_key == "apiKey"
    assert credential.model_name == "modelName"


def test_access_credential_setters_update_values() -> None:
    """既定値で作った後に URL・テスト URL・API キー・モデル名を設定できること"""
    credential = AccessCredential()

    credential.url = URL
    credential.test_url = TEST_URL
    credential.api_key = "apiKey"
    credential.model_name = "modelName"

    assert credential.url == URL
    assert credential.test_url == TEST_URL
    assert credential.api_key == "apiKey"
    assert credential.model_name == "modelName"


def test_chat_gpt_parameter_default_values_are_none() -> None:
    """既定値の生成パラメータはすべて None であること"""
    parameter = ChatGPTParameter()

    assert parameter.temperature is None
    assert parameter.top_p is None
    assert parameter.frequency_penalty is None
    assert parameter.presence_penalty is None
    assert parameter.max_tokens is None
    assert parameter.stop is None


def test_chat_gpt_parameter_constructor_keeps_values() -> None:
    """コンストラクタで生成パラメータを受け取れること"""
    parameter = ChatGPTParameter(0.8, 0.9, 1.0, 0.5, 100, "STOP", None, None)

    assert parameter.temperature == 0.8
    assert parameter.top_p == 0.9
    assert parameter.frequency_penalty == 1.0
    assert parameter.presence_penalty == 0.5
    assert parameter.max_tokens == 100
    assert parameter.stop == "STOP"


def test_chat_gpt_parameter_setters_update_values() -> None:
    """既定値で作った後に生成パラメータを設定できること"""
    parameter = ChatGPTParameter()

    parameter.temperature = 0.8
    parameter.top_p = 0.9
    parameter.frequency_penalty = 1.0
    parameter.presence_penalty = 0.5
    parameter.max_tokens = 100
    parameter.stop = "STOP"

    assert parameter.temperature == 0.8
    assert parameter.top_p == 0.9
    assert parameter.frequency_penalty == 1.0
    assert parameter.presence_penalty == 0.5
    assert parameter.max_tokens == 100
    assert parameter.stop == "STOP"


def test_proxy_setting_constructor_keeps_values() -> None:
    """コンストラクタでプロキシ設定を受け取れること"""
    proxy = ProxySetting(1, "proxy.example.com", 8080, True, "user", "pass", False)

    assert proxy.use_proxy == 1
    assert proxy.proxy_host == "proxy.example.com"
    assert proxy.proxy_port == 8080
    assert proxy.use_proxy_cred is True
    assert proxy.proxy_id == "user"
    assert proxy.proxy_pass == "pass"
    assert proxy.insecure_ssl_enabled is False


def test_proxy_setting_setters_update_values() -> None:
    """既定値で作った後にプロキシ設定を変更できること"""
    proxy = ProxySetting()

    proxy.use_proxy = 1
    assert proxy.use_proxy == 1
    proxy.proxy_host = "proxy.example.com"
    assert proxy.proxy_host == "proxy.example.com"
    proxy.proxy_port = 8080
    assert proxy.proxy_port == 8080
    proxy.use_proxy_cred = True
    assert proxy.use_proxy_cred is True
    proxy.proxy_id = "user"
    assert proxy.proxy_id == "user"
    proxy.proxy_pass = "pass"
    assert proxy.proxy_pass == "pass"
    proxy.insecure_ssl_enabled = False
    assert proxy.insecure_ssl_enabled is False
