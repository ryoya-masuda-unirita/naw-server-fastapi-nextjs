"""移植元 CoreNetworkSettingTest・CoreHttpTransportFactoryTest の移植。

移植元はローカルの HTTP サーバーに送るが、Python 版は respx で HTTP をモックする。
"""

from collections.abc import Iterator

import httpx
import pytest
import respx
from generative_ai_core.network.setting import (
    CoreNetworkSetting,
    CoreProxySetting,
    ProxyMode,
)
from generative_ai_core.network.transport import create_transport

ENDPOINT = "http://transport.example.invalid/"


def test_exposes_proxy_ssl_timeout_without_storing_proxy_secret_in_text() -> None:
    """プロキシ・SSL・タイムアウトを持ち、文字列表現に認証情報を出さないこと"""
    proxy = CoreProxySetting.manual("proxy.example", 8080, "proxyUser", "proxyPass")
    setting = CoreNetworkSetting(proxy, True, 240)

    assert setting.proxy_setting == proxy
    assert setting.insecure_ssl_enabled
    assert setting.timeout_seconds == 240
    assert proxy.credentials_configured
    assert proxy.username == "proxyUser"
    assert proxy.password == "proxyPass"
    assert "credentials=present" in str(proxy)
    assert "proxyUser" not in str(proxy)
    assert "proxyPass" not in str(proxy)


def test_represents_no_proxy_manual_credential_presence_and_system_proxy() -> None:
    """プロキシなし・手動・システムの各モードと認証情報の有無を表すこと"""
    assert CoreProxySetting.none().mode == ProxyMode.NONE
    assert not CoreProxySetting.none().credentials_configured
    # 移植元 manual(host, port, credentialsConfigured) は認証情報がなければ false に直す
    assert not CoreProxySetting(
        ProxyMode.MANUAL, "proxy.example", 8080, False
    ).credentials_configured
    assert not CoreProxySetting(
        ProxyMode.MANUAL, "proxy.example", 8080, True
    ).credentials_configured
    assert CoreProxySetting.system().mode == ProxyMode.SYSTEM
    assert "proxy.example" not in str(CoreProxySetting.system())


def test_validates_timeout_and_manual_proxy_port_range() -> None:
    """タイムアウトの範囲と手動プロキシのポート範囲を検証すること"""
    assert CoreNetworkSetting.defaults().timeout_seconds == 180
    assert (
        CoreNetworkSetting.from_seconds(CoreProxySetting.none(), False, None)
        == CoreNetworkSetting.defaults()
    )
    assert (
        CoreNetworkSetting.from_seconds(
            CoreProxySetting.system(), True, 60
        ).timeout_seconds
        == 60
    )

    with pytest.raises(ValueError):
        CoreNetworkSetting(CoreProxySetting.none(), False, 59)
    with pytest.raises(ValueError):
        CoreProxySetting(ProxyMode.MANUAL, "proxy.example", 65536)


def test_post_and_post_streaming_use_core_network_setting(
    respx_mock: respx.MockRouter,
) -> None:
    """post・post_streaming が送った本文と応答を受け渡すこと"""
    received: list[httpx.Request] = []

    def respond(request: httpx.Request) -> httpx.Response:
        """リクエストを記録して固定の本文を返す。

        Parameters
        ----------
        request : httpx.Request
            受け取ったリクエスト。

        Returns
        -------
        httpx.Response
            `stream-body` を返す応答。
        """
        received.append(request)
        return httpx.Response(200, text="stream-body")

    respx_mock.post(ENDPOINT).mock(side_effect=respond)
    transport = create_transport(None)

    response = transport.post(ENDPOINT, {"Content-Type": "text/plain"}, b"request-body")
    streamed: list[str] = []

    def handle(status_code: int, lines: Iterator[str]) -> None:
        """状態コードを確かめ、本文の行を記録する。

        Parameters
        ----------
        status_code : int
            応答の状態コード。
        lines : Iterator[str]
            本文の行。
        """
        assert status_code == 200
        streamed.extend(lines)

    transport.post_streaming(ENDPOINT, {}, b"", handle)

    assert response.status_code == 200
    assert response.body == "stream-body"
    assert "".join(streamed) == "stream-body"
    assert received[0].headers["Content-Type"] == "text/plain"
    assert received[0].content == b"request-body"
    assert received[1].content == b""


def test_proxy_validation_rejects_half_configured_credentials() -> None:
    """手動プロキシの認証情報が片方だけなら送信を作れないこと"""
    assert (
        create_transport(CoreNetworkSetting(CoreProxySetting.system(), False, 60))
        is not None
    )
    assert (
        create_transport(
            CoreNetworkSetting(
                CoreProxySetting.manual("proxy.example", 8080, "", ""), False, 60
            )
        )
        is not None
    )
    with pytest.raises(ValueError, match="manual proxy credentials"):
        create_transport(
            CoreNetworkSetting(
                CoreProxySetting.manual("proxy.example", 8080, "", "password"),
                False,
                60,
            )
        )
