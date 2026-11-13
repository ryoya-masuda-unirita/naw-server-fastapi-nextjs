"""ネットワーク設定を当てた HTTP 送信。

移植元は Apache HttpClient（CoreHttpTransportFactory・CoreProviderNetworkAdapter）・
Reactor Netty（Azure SDK）を使い分けているが、Python では httpx に揃える。
プロキシ・SSL 検証・タイムアウトの当て方は移植元と同じにする。
"""

import logging
from collections.abc import Callable, Iterator, Mapping
from dataclasses import dataclass
from typing import Any
from urllib.parse import quote

import httpx

from generative_ai_core.network.setting import (
    CoreNetworkSetting,
    CoreProxySetting,
    ProxyMode,
)

logger = logging.getLogger(__name__)

PROXY_SCHEME = "http"

# 応答の状態コードと、本文の行を順に返すイテレーターを受け取る
StreamingBodyHandler = Callable[[int, Iterator[str]], None]


@dataclass(frozen=True)
class CoreHttpResponse:
    """HTTP 応答の状態コードと本文。"""

    status_code: int
    body: str = ""


def _proxy_url(proxy: CoreProxySetting) -> str:
    """手動プロキシの URL を作る。認証情報はユーザー名があるときだけ付ける。

    Parameters
    ----------
    proxy : CoreProxySetting
        手動プロキシの設定。

    Returns
    -------
    str
        プロキシの URL。
    """
    credentials = ""
    if proxy.credentials_configured and proxy.username:
        credentials = (
            f"{quote(proxy.username, safe='')}:{quote(proxy.password, safe='')}@"
        )
    # IPv6 のアドレスは URL では角括弧で囲む
    host = proxy.host
    if ":" in host and not host.startswith("["):
        host = f"[{host}]"
    return f"{PROXY_SCHEME}://{credentials}{host}:{proxy.port}"


def client_options(setting: CoreNetworkSetting | None) -> dict[str, Any]:
    """httpx.Client に渡す設定を作る。

    Parameters
    ----------
    setting : CoreNetworkSetting | None
        ネットワーク設定。None なら既定。

    Returns
    -------
    dict[str, Any]
        httpx.Client のキーワード引数。
    """
    network = setting or CoreNetworkSetting.defaults()
    proxy = network.proxy_setting
    options: dict[str, Any] = {
        "timeout": httpx.Timeout(float(network.timeout_seconds)),
        "verify": not network.insecure_ssl_enabled,
        "trust_env": proxy.mode == ProxyMode.SYSTEM,
    }
    if proxy.mode == ProxyMode.MANUAL:
        options["proxy"] = _proxy_url(proxy)
    return options


def describe(setting: CoreNetworkSetting | None) -> str:
    """ネットワーク設定の要約を作る。

    Parameters
    ----------
    setting : CoreNetworkSetting | None
        ネットワーク設定。None なら既定。

    Returns
    -------
    str
        秘密情報を含まない要約。
    """
    network = setting or CoreNetworkSetting.defaults()
    proxy = network.proxy_setting
    proxy_evidence = {
        ProxyMode.NONE: "no-proxy",
        ProxyMode.MANUAL: "manual-proxy",
        ProxyMode.SYSTEM: "system-proxy",
    }[proxy.mode]
    credentials = "present" if proxy.credentials_configured else "absent"
    insecure = "true" if network.insecure_ssl_enabled else "false"
    return (
        f"{proxy_evidence},proxy-credentials={credentials},insecure-ssl={insecure},"
        f"timeout={network.timeout_seconds}"
    )


def validate_proxy_credentials(proxy: CoreProxySetting) -> None:
    """手動プロキシの認証情報が、両方あるかどちらもないかを検証する。

    Parameters
    ----------
    proxy : CoreProxySetting
        プロキシ設定。

    Raises
    ------
    ValueError
        ユーザー名とパスワードの片方だけがあるとき。
    """
    if proxy.mode != ProxyMode.MANUAL or not proxy.credentials_configured:
        return
    if (not proxy.username.strip()) != (not proxy.password.strip()):
        raise ValueError(
            "SECUAIGENT_VALIDATION_FAILURE: manual proxy credentials must be both "
            "present or both absent"
        )


class CoreHttpTransport:
    """ネットワーク設定を当てた HTTP 送信。送信ごとにクライアントを作って閉じる。"""

    def __init__(self, setting: CoreNetworkSetting | None) -> None:
        """ネットワーク設定から httpx の設定を作って持つ。

        Parameters
        ----------
        setting : CoreNetworkSetting | None
            ネットワーク設定。
        """
        self._options = client_options(setting)

    def post(
        self, url: str, headers: Mapping[str, str], body: bytes
    ) -> CoreHttpResponse:
        """POST を送り、本文をまとめて受け取る。

        Parameters
        ----------
        url : str
            送信先の URL。
        headers : Mapping[str, str]
            HTTP ヘッダー。
        body : bytes
            リクエスト本文。

        Returns
        -------
        CoreHttpResponse
            状態コードと本文。
        """
        with httpx.Client(**self._options) as client:
            response = client.post(url, headers=dict(headers), content=body)
            return CoreHttpResponse(response.status_code, response.text)

    def post_streaming(
        self,
        url: str,
        headers: Mapping[str, str],
        body: bytes,
        handler: StreamingBodyHandler,
    ) -> None:
        """POST を送り、応答の本文を行ごとに handler へ渡す。

        Parameters
        ----------
        url : str
            送信先の URL。
        headers : Mapping[str, str]
            HTTP ヘッダー。
        body : bytes
            リクエスト本文。
        handler : StreamingBodyHandler
            状態コードと本文の行を受け取る関数。
        """
        with (
            httpx.Client(**self._options) as client,
            client.stream("POST", url, headers=dict(headers), content=body) as response,
        ):
            handler(response.status_code, response.iter_lines())


def create_transport(setting: CoreNetworkSetting | None) -> CoreHttpTransport:
    """検証済みの設定で送信を作る。

    Parameters
    ----------
    setting : CoreNetworkSetting | None
        ネットワーク設定。None なら既定。

    Returns
    -------
    CoreHttpTransport
        作った送信。

    Raises
    ------
    ValueError
        手動プロキシの認証情報が不正なとき。
    """
    network = setting or CoreNetworkSetting.defaults()
    validate_proxy_credentials(network.proxy_setting)
    return CoreHttpTransport(network)
