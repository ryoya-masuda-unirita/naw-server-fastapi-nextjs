"""ネットワーク設定の変換のテスト（移植元 service/core/AdapterCoreNetworkMapperTest）。

移植元の AdapterCoreNetworkMapper は、Python 版では `to_core_network_setting` 関数。
"""

from generative_ai_adapter.core_mappers import to_core_network_setting
from generative_ai_adapter.domain import AccessCredential, ProxySetting
from generative_ai_core.network.setting import DEFAULT_TIMEOUT_SECONDS, ProxyMode


def test_maps_no_proxy_flag_to_core_no_proxy_and_default_timeout() -> None:
    """プロキシなし（0）は NONE、タイムアウトは core の既定値になること"""
    setting = to_core_network_setting(ProxySetting(use_proxy=0), AccessCredential())

    assert setting.proxy_setting.mode == ProxyMode.NONE
    assert setting.insecure_ssl_enabled is False
    assert setting.timeout_seconds == DEFAULT_TIMEOUT_SECONDS


def test_maps_none_proxy_and_credential_to_core_defaults() -> None:
    """プロキシ設定・資格情報が None なら core の既定値になること"""
    setting = to_core_network_setting(None, None)

    assert setting.proxy_setting.mode == ProxyMode.NONE
    assert setting.insecure_ssl_enabled is False
    assert setting.timeout_seconds == DEFAULT_TIMEOUT_SECONDS


def test_maps_unsupported_proxy_mode_to_no_proxy() -> None:
    """未知のプロキシ設定（99）は NONE になること"""
    setting = to_core_network_setting(ProxySetting(use_proxy=99), AccessCredential())

    assert setting.proxy_setting.mode == ProxyMode.NONE


def test_extracts_manual_proxy_credential_presence_insecure_ssl_and_timeout() -> None:
    """手動プロキシのホスト・ポート・認証の有無・SSL・タイムアウトを渡すこと"""
    credential = AccessCredential(timeout_seconds=60)
    proxy_setting = ProxySetting(
        use_proxy=1,
        proxy_host="proxy.example",
        proxy_port=8080,
        use_proxy_cred=True,
        proxy_id="proxyUser",
        proxy_pass="marker-value",
        insecure_ssl_enabled=True,
    )

    setting = to_core_network_setting(proxy_setting, credential)

    assert setting.proxy_setting.mode == ProxyMode.MANUAL
    assert setting.proxy_setting.host == "proxy.example"
    assert setting.proxy_setting.port == 8080
    assert setting.proxy_setting.credentials_configured is True
    assert setting.insecure_ssl_enabled is True
    assert setting.timeout_seconds == 60
    assert "marker-value" not in str(setting.proxy_setting)


def test_extracts_system_proxy_mode_without_credentials_or_host_leak() -> None:
    """システムプロキシ（2）は認証なしの SYSTEM になること"""
    credential = AccessCredential(timeout_seconds=86400)

    setting = to_core_network_setting(ProxySetting(use_proxy=2), credential)

    assert setting.proxy_setting.mode == ProxyMode.SYSTEM
    assert setting.proxy_setting.credentials_configured is False
    assert setting.timeout_seconds == 86400
