"""プロバイダの設定の変換のテスト。

移植元 service/core/AdapterCoreRuntimeConfigurationMapperTest。移植元の
AdapterCoreRuntimeConfigurationMapper は、Python 版では
`to_runtime_provider_configuration` 関数。IllegalArgumentException は ValueError。
"""

import pytest
from generative_ai_adapter.core_mappers import to_runtime_provider_configuration
from generative_ai_adapter.domain import AccessCredential, ProxySetting
from generative_ai_core.network.setting import ProxyMode
from generative_ai_core.provider.model import CoreProviderId, CredentialKind

SECUAIGENT_URL = "https://secuaigent.example.invalid"


def _secuaigent_credential(
    test_url: str = "legacy-test-url-fixture",
) -> AccessCredential:
    """SecuAiGent の資格情報（テナント ID なし）を作る。

    Parameters
    ----------
    test_url : str, optional
        移植元の testUrl（テナント ID には使わない）。

    Returns
    -------
    AccessCredential
        SecuAiGent・deploy-fixture の資格情報。
    """
    return AccessCredential(
        url=SECUAIGENT_URL,
        test_url=test_url,
        api_key="login-key-fixture",
        model_name="deploy-fixture",
        vendor_name="SecuAiGent",
    )


def test_maps_access_credential_and_proxy_setting_to_runtime_configuration() -> None:
    """資格情報とプロキシ設定をプロバイダの設定にし、秘密を文字列に出さないこと"""
    credential = AccessCredential(
        url="https://provider.example.invalid",
        test_url="https://provider.example.invalid/test",
        api_key="credential-marker",
        model_name="gpt-4o-mini",
        vendor_name="OpenAI",
        timeout_seconds=240,
    )
    proxy = ProxySetting(
        use_proxy=1,
        proxy_host="proxy.example",
        proxy_port=8080,
        use_proxy_cred=True,
        proxy_id="proxy-user",
        proxy_pass="marker-value",
        insecure_ssl_enabled=True,
    )

    configuration = to_runtime_provider_configuration(credential, proxy)

    assert configuration.provider_id == CoreProviderId.OpenAI
    assert configuration.model_name == "gpt-4o-mini"
    assert configuration.endpoint == "https://provider.example.invalid"
    assert configuration.credential.value == "credential-marker"
    assert "credential-marker" not in str(configuration)
    network = configuration.network_setting
    assert "marker-value" not in str(network.proxy_setting)
    assert network.timeout_seconds == 240
    assert network.insecure_ssl_enabled is True
    assert network.proxy_setting.mode == ProxyMode.MANUAL
    assert network.proxy_setting.credentials_configured is True


def test_maps_secuaigent_credential_and_tenant_id_attributes() -> None:
    """SecuAiGent のテナント ID・messageId・追加プロンプト・ライブラリ生成を属性に入れること"""
    credential = _secuaigent_credential()
    credential.tenant_id = "tenant-fixture"
    credential.secuaigent_message_id = "message-fixture"
    credential.secuaigent_additional_prompt = "prompt-fixture"
    credential.secuaigent_create_library = True

    configuration = to_runtime_provider_configuration(credential, ProxySetting())

    assert configuration.provider_id == CoreProviderId.SecuAiGent
    assert configuration.model_name == "deploy-fixture"
    assert configuration.endpoint == SECUAIGENT_URL
    assert configuration.credential.value == "login-key-fixture"
    assert configuration.credential.kind == CredentialKind.API_KEY
    assert configuration.attributes["secuaigent.tenantId"] == "tenant-fixture"
    assert configuration.attributes["secuaigent.messageId"] == "message-fixture"
    assert configuration.attributes["secuaigent.additionalPrompt"] == "prompt-fixture"
    assert configuration.attributes["secuaigent.createLibrary"] == "true"


def test_maps_secuaigent_access_token_as_bearer_without_overwriting_login_key() -> None:
    """アクセストークンがあれば Bearer にし、ログインキーは書き換えないこと"""
    credential = _secuaigent_credential()
    credential.tenant_id = "tenant-fixture"
    credential.secuaigent_access_token = "access-token-fixture"

    configuration = to_runtime_provider_configuration(credential, ProxySetting())

    assert configuration.credential.kind == CredentialKind.BEARER_TOKEN
    assert configuration.credential.value == "access-token-fixture"
    assert credential.api_key == "login-key-fixture"


def test_skips_blank_secuaigent_optional_attributes() -> None:
    """空白の messageId・追加プロンプト、未設定のライブラリ生成は属性に入れないこと"""
    credential = _secuaigent_credential()
    credential.tenant_id = "tenant-fixture"
    credential.secuaigent_message_id = "  "
    credential.secuaigent_additional_prompt = ""

    configuration = to_runtime_provider_configuration(credential, ProxySetting())

    assert configuration.attributes["secuaigent.tenantId"] == "tenant-fixture"
    for key in (
        "secuaigent.messageId",
        "secuaigent.additionalPrompt",
        "secuaigent.createLibrary",
    ):
        assert key not in configuration.attributes


def test_maps_secuaigent_tenant_id_from_tenant_id_field_not_test_url() -> None:
    """テナント ID は testUrl ではなく tenantId の項目から取ること"""
    credential = _secuaigent_credential("wrong-tenant-via-test-url")
    credential.tenant_id = "correct-tenant-fixture"

    configuration = to_runtime_provider_configuration(credential, ProxySetting())

    assert configuration.attributes["secuaigent.tenantId"] == "correct-tenant-fixture"


@pytest.mark.parametrize("tenant_id", ["", None, "   "])
def test_requires_tenant_id_for_secuaigent_mapping(tenant_id: str | None) -> None:
    """SecuAiGent でテナント ID が空・None・空白なら ValueError になること"""
    credential = _secuaigent_credential()
    credential.tenant_id = tenant_id

    with pytest.raises(ValueError):
        to_runtime_provider_configuration(credential, ProxySetting())


def test_rejects_missing_access_credential_before_core_runtime_creation() -> None:
    """資格情報がなければ ValueError になること"""
    with pytest.raises(ValueError):
        to_runtime_provider_configuration(None, None)
