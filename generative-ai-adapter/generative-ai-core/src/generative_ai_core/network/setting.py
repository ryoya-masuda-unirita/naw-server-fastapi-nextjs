"""移植元 CoreProxySetting・CoreNetworkSetting。"""

from dataclasses import dataclass, field
from enum import StrEnum

MIN_TIMEOUT_SECONDS = 60
MAX_TIMEOUT_SECONDS = 86400
DEFAULT_TIMEOUT_SECONDS = 180
MAX_PORT = 65535
NO_PORT = -1


class ProxyMode(StrEnum):
    """プロキシの使い方。"""

    NONE = "NONE"
    MANUAL = "MANUAL"
    SYSTEM = "SYSTEM"


@dataclass(frozen=True)
class CoreProxySetting:
    """プロキシ設定。"""

    mode: ProxyMode
    host: str = ""
    port: int = NO_PORT
    credentials_configured: bool = False
    username: str = ""
    # repr にパスワードを出さない（移植元 toString と同じく有無だけ出す）
    password: str = field(default="", repr=False)

    def __post_init__(self) -> None:
        """モードに応じて項目を正規化して検証する。

        Raises
        ------
        ValueError
            手動プロキシでホストが空、またはポートが範囲外のとき。
        """
        host = (self.host or "").strip()
        username = (self.username or "").strip()
        password = self.password or ""
        port = self.port
        credentials_configured = self.credentials_configured
        if self.mode == ProxyMode.MANUAL:
            if not host:
                raise ValueError("manual proxy host must not be blank")
            if port < 0 or port > MAX_PORT:
                raise ValueError("manual proxy port must be between 0 and 65535")
            credentials_configured = bool(username) or bool(password.strip())
        else:
            host = ""
            port = NO_PORT
            credentials_configured = False
            username = ""
            password = ""
        object.__setattr__(self, "host", host)
        object.__setattr__(self, "port", port)
        object.__setattr__(self, "credentials_configured", credentials_configured)
        object.__setattr__(self, "username", username)
        object.__setattr__(self, "password", password)

    @classmethod
    def none(cls) -> "CoreProxySetting":
        """プロキシを使わない設定を作る。

        Returns
        -------
        CoreProxySetting
            NONE モードの設定。
        """
        return cls(ProxyMode.NONE)

    @classmethod
    def system(cls) -> "CoreProxySetting":
        """システムのプロキシを使う設定を作る。

        Returns
        -------
        CoreProxySetting
            SYSTEM モードの設定。
        """
        return cls(ProxyMode.SYSTEM)

    @classmethod
    def manual(
        cls, host: str, port: int, username: str = "", password: str = ""
    ) -> "CoreProxySetting":
        """手動プロキシの設定を作る。

        Parameters
        ----------
        host : str
            ホスト名。
        port : int
            ポート番号。
        username : str
            ユーザー名。
        password : str
            パスワード。

        Returns
        -------
        CoreProxySetting
            MANUAL モードの設定。
        """
        return cls(ProxyMode.MANUAL, host, port, True, username, password)

    def __str__(self) -> str:
        """認証情報の有無だけを出した文字列にする。

        Returns
        -------
        str
            パスワードを含まない表記。
        """
        credentials = "present" if self.credentials_configured else "absent"
        return (
            f"CoreProxySetting[mode={self.mode}, host={self.host}, port={self.port}, "
            f"credentials={credentials}]"
        )


@dataclass(frozen=True)
class CoreNetworkSetting:
    """ネットワーク設定（プロキシ・SSL 検証・タイムアウト）。"""

    proxy_setting: CoreProxySetting = field(default_factory=CoreProxySetting.none)
    insecure_ssl_enabled: bool = False
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS

    def __post_init__(self) -> None:
        """タイムアウトが範囲内か検証する。

        Raises
        ------
        ValueError
            timeout_seconds が範囲外のとき。
        """
        if (
            self.timeout_seconds < MIN_TIMEOUT_SECONDS
            or self.timeout_seconds > MAX_TIMEOUT_SECONDS
        ):
            raise ValueError("timeoutSeconds must be between 60 and 86400")

    @classmethod
    def defaults(cls) -> "CoreNetworkSetting":
        """既定のネットワーク設定を作る。

        Returns
        -------
        CoreNetworkSetting
            既定の設定。
        """
        return cls()

    @classmethod
    def from_seconds(
        cls,
        proxy_setting: CoreProxySetting | None,
        insecure_ssl_enabled: bool,
        timeout_seconds: int | None,
    ) -> "CoreNetworkSetting":
        """未指定を既定値で補ってネットワーク設定を作る。

        Parameters
        ----------
        proxy_setting : CoreProxySetting | None
            プロキシ設定。None ならプロキシなし。
        insecure_ssl_enabled : bool
            SSL 検証を無効にするか。
        timeout_seconds : int | None
            タイムアウト秒。未指定（None・0）なら既定の 180 秒。

        Returns
        -------
        CoreNetworkSetting
            作った設定。
        """
        return cls(
            proxy_setting or CoreProxySetting.none(),
            insecure_ssl_enabled,
            timeout_seconds or DEFAULT_TIMEOUT_SECONDS,
        )
