"""プロバイダの ID・資格情報・設定（移植元 CoreProviderId・CoreCredential・
RuntimeProviderConfiguration・CoreProviderCapabilityStatus）。"""

import re
from collections.abc import Mapping
from dataclasses import dataclass, field
from enum import Enum, StrEnum

from generative_ai_core.failure import CoreFailure, sanitize
from generative_ai_core.network.setting import CoreNetworkSetting

_DIGITS = re.compile(r"\d+")
_NON_ALNUM = re.compile(r"[^a-z0-9]")


def _normalize_name(value: str) -> str:
    """プロバイダ名を比較用に正規化する。

    英小文字と数字以外を取り除き、小文字にそろえる。

    Parameters
    ----------
    value : str
        正規化する名前。

    Returns
    -------
    str
        英小文字と数字だけの名前。
    """
    return _NON_ALNUM.sub("", value.lower())


class CoreProviderId(Enum):
    """プロバイダ。値は (vendorId, 正式名, 別名...)。"""

    OpenAI = (0, "OpenAI")
    AzureOpenAI = (1, "AzureOpenAI", "azure", "azureopenai")
    Anthropic = (2, "Anthropic")
    VertexAI = (3, "VertexAI", "vertex", "vertexai")
    GoogleAIStudio = (4, "GoogleAIStudio", "google", "gemini", "googleaistudio")
    SecuAiGent = (5, "SecuAiGent", "secuaigent")
    # Python 版だけの確認用プロバイダ。キーなしで動き、質問をそのまま返す
    # （移植元にはない。Waha! エミュレーターの動作確認のために置く）
    Echo = (99, "Echo", "echo")

    @property
    def vendor_id(self) -> int:
        """ベンダー ID を返す。

        Returns
        -------
        int
            ベンダー ID（数値）。
        """
        vendor_id: int = self.value[0]
        return vendor_id

    @property
    def canonical_name(self) -> str:
        """正式名を返す。

        Returns
        -------
        str
            プロバイダの正式名。
        """
        name: str = self.value[1]
        return name

    def __str__(self) -> str:
        """正式名を文字列表現にする。

        Returns
        -------
        str
            プロバイダの正式名。
        """
        return self.canonical_name

    @classmethod
    def from_vendor_id(cls, vendor_id: int) -> "CoreProviderId":
        """ベンダー ID からプロバイダを引く。

        Parameters
        ----------
        vendor_id : int
            ベンダー ID。

        Returns
        -------
        CoreProviderId
            ベンダー ID に対応するプロバイダ。

        Raises
        ------
        ValueError
            対応するプロバイダがない場合。
        """
        for provider in cls:
            if provider.vendor_id == vendor_id:
                return provider
        raise ValueError(f"Unsupported provider vendor id: {vendor_id}")

    @classmethod
    def parse(cls, provider_id: str | None) -> "CoreProviderId":
        """名前・別名・vendorId（数字）から引く（移植元 CoreProviderId.from）。

        Parameters
        ----------
        provider_id : str | None
            プロバイダの名前、別名、または vendorId を表す数字の文字列。

        Returns
        -------
        CoreProviderId
            対応するプロバイダ。

        Raises
        ------
        ValueError
            空または未対応の場合。
        """
        if provider_id is None or not provider_id.strip():
            raise ValueError("providerId must not be blank")
        trimmed = provider_id.strip()
        if _DIGITS.fullmatch(trimmed):
            return cls.from_vendor_id(int(trimmed))
        normalized = _normalize_name(trimmed)
        for provider in cls:
            names = {provider.name, provider.canonical_name, *provider.value[2:]}
            if normalized in {_normalize_name(name) for name in names}:
                return provider
        raise ValueError(f"Unsupported provider: {provider_id}")


class CredentialKind(StrEnum):
    """資格情報の種別。"""

    API_KEY = "API_KEY"
    BEARER_TOKEN = "BEARER_TOKEN"
    CREDENTIALS_URI = "CREDENTIALS_URI"
    CREDENTIAL_REFERENCE = "CREDENTIAL_REFERENCE"


@dataclass(frozen=True)
class CoreCredential:
    """プロバイダへの資格情報。値はログに出さない。

    Attributes
    ----------
    kind : CredentialKind
        資格情報の種別。
    value : str
        資格情報の値（前後の空白は取り除かれる）。
    display_name : str
        表示用の名前。
    """

    kind: CredentialKind
    value: str = field(repr=False)
    display_name: str = ""

    def __post_init__(self) -> None:
        """値と表示名の前後の空白を取り除く。

        Raises
        ------
        ValueError
            値が空の場合。
        """
        if self.value is None or not self.value.strip():
            raise ValueError("credential value must not be blank")
        object.__setattr__(self, "value", self.value.strip())
        object.__setattr__(self, "display_name", (self.display_name or "").strip())

    @classmethod
    def api_key(cls, value: str | None, display_name: str = "") -> "CoreCredential":
        """API キーの資格情報を作る。

        Parameters
        ----------
        value : str | None
            API キー。
        display_name : str, default ""
            表示用の名前。

        Returns
        -------
        CoreCredential
            API キーの資格情報。
        """
        return cls(CredentialKind.API_KEY, value or "", display_name)

    @classmethod
    def bearer_token(cls, value: str | None) -> "CoreCredential":
        """Bearer トークンの資格情報を作る。

        Parameters
        ----------
        value : str | None
            Bearer トークン。

        Returns
        -------
        CoreCredential
            Bearer トークンの資格情報。
        """
        return cls(CredentialKind.BEARER_TOKEN, value or "", "")

    def __str__(self) -> str:
        """値を伏せた文字列表現にする。

        Returns
        -------
        str
            値を `[REDACTED]` にした文字列。
        """
        return (
            f"CoreCredential[kind={self.kind}, value=[REDACTED], "
            f"displayName={self.display_name}]"
        )


class Capability(StrEnum):
    """プロバイダが提供する機能の種類。"""

    CHAT = "CHAT"
    RAG = "RAG"
    IMAGE_EXPLANATION = "IMAGE_EXPLANATION"
    EMBEDDING = "EMBEDDING"
    RETRIEVAL = "RETRIEVAL"
    GRAPH_RAG = "GRAPH_RAG"


DEFAULT_CAPABILITIES = (Capability.CHAT, Capability.RAG, Capability.IMAGE_EXPLANATION)


def _require_text(value: str | None, field_name: str) -> str:
    """空でない文字列を取り出す。

    Parameters
    ----------
    value : str | None
        検査する文字列。
    field_name : str
        エラーメッセージに使う項目名。

    Returns
    -------
    str
        前後の空白を取り除いた文字列。

    Raises
    ------
    ValueError
        値が空の場合。
    """
    if value is None or not value.strip():
        raise ValueError(f"{field_name} must not be blank")
    return value.strip()


@dataclass(frozen=True)
class RuntimeProviderConfiguration:
    """プロバイダ 1 つ分の実行時設定。

    Attributes
    ----------
    provider_id : CoreProviderId
        プロバイダ。
    model_name : str
        モデル名。
    endpoint : str
        エンドポイント。
    credential : CoreCredential
        資格情報。
    network_setting : CoreNetworkSetting
        ネットワーク設定。
    attributes : Mapping[str, str]
        プロバイダ固有の追加属性。
    capabilities : tuple[Capability, ...]
        使う機能。空なら既定の機能になる。
    """

    provider_id: CoreProviderId
    model_name: str
    endpoint: str
    credential: CoreCredential
    network_setting: CoreNetworkSetting = field(
        default_factory=CoreNetworkSetting.defaults
    )
    attributes: Mapping[str, str] = field(default_factory=dict, hash=False)
    capabilities: tuple[Capability, ...] = ()

    def __post_init__(self) -> None:
        """各項目を検証・正規化する。

        Raises
        ------
        ValueError
            モデル名・エンドポイント・属性キーが空、または資格情報がない場合。
        """
        object.__setattr__(
            self, "model_name", _require_text(self.model_name, "modelName")
        )
        object.__setattr__(self, "endpoint", _require_text(self.endpoint, "endpoint"))
        if self.credential is None:
            raise ValueError("credential must not be null")
        normalized = {
            _require_text(key, "attribute key"): (value or "").strip()
            for key, value in (self.attributes or {}).items()
        }
        object.__setattr__(self, "attributes", normalized)
        capabilities = tuple(dict.fromkeys(self.capabilities)) or DEFAULT_CAPABILITIES
        object.__setattr__(self, "capabilities", capabilities)

    def __str__(self) -> str:
        """資格情報を伏せた文字列表現にする。

        Returns
        -------
        str
            ログに出しても安全な文字列。
        """
        endpoint = sanitize(f"endpoint={self.endpoint}")
        return (
            f"RuntimeProviderConfiguration[providerId={self.provider_id}, "
            f"modelName={self.model_name}, endpoint={endpoint}, "
            f"credential={self.credential}, attributes={dict(self.attributes)}]"
        )


class CapabilityStatusKind(StrEnum):
    """機能の対応状況の種別。"""

    SUPPORTED = "SUPPORTED"
    UNSUPPORTED = "UNSUPPORTED"
    BLOCKED = "BLOCKED"


def _sanitize_optional(value: str | None) -> str:
    """任意の文字列を無害化する。

    Parameters
    ----------
    value : str | None
        無害化する文字列。

    Returns
    -------
    str
        無害化した文字列。空なら空文字列。
    """
    if value is None or not value.strip():
        return ""
    return sanitize(value.strip())


@dataclass(frozen=True)
class CoreProviderCapabilityStatus:
    """プロバイダ × 機能ごとの対応状況。

    Attributes
    ----------
    provider_id : CoreProviderId
        プロバイダ。
    capability : Capability
        機能。
    status : CapabilityStatusKind
        対応状況。
    evidence : str
        根拠。
    reason : str
        未対応の理由。
    follow_up : str
        今後の対応。
    """

    provider_id: CoreProviderId
    capability: Capability
    status: CapabilityStatusKind
    evidence: str = ""
    reason: str = ""
    follow_up: str = ""

    def __post_init__(self) -> None:
        """根拠・理由・今後の対応を無害化する。"""
        object.__setattr__(self, "evidence", _sanitize_optional(self.evidence))
        object.__setattr__(self, "reason", _sanitize_optional(self.reason))
        object.__setattr__(self, "follow_up", _sanitize_optional(self.follow_up))

    @classmethod
    def supported(
        cls,
        provider_id: CoreProviderId,
        capability: Capability,
        evidence: str,
        network_evidence: str | None = None,
    ) -> "CoreProviderCapabilityStatus":
        """対応済みの状況を作る。

        Parameters
        ----------
        provider_id : CoreProviderId
            プロバイダ。
        capability : Capability
            機能。
        evidence : str
            根拠。
        network_evidence : str | None, default None
            ネットワーク設定の根拠。あれば根拠に付け足す。

        Returns
        -------
        CoreProviderCapabilityStatus
            対応済みの状況。
        """
        if network_evidence is not None:
            evidence = f"{evidence}; network={network_evidence}"
        return cls(provider_id, capability, CapabilityStatusKind.SUPPORTED, evidence)

    @classmethod
    def unsupported(
        cls,
        provider_id: CoreProviderId,
        capability: Capability,
        reason: str,
        evidence: str,
        follow_up: str,
    ) -> "CoreProviderCapabilityStatus":
        """未対応の状況を作る。

        Parameters
        ----------
        provider_id : CoreProviderId
            プロバイダ。
        capability : Capability
            機能。
        reason : str
            未対応の理由。
        evidence : str
            根拠。
        follow_up : str
            今後の対応。

        Returns
        -------
        CoreProviderCapabilityStatus
            未対応の状況。
        """
        return cls(
            provider_id,
            capability,
            CapabilityStatusKind.UNSUPPORTED,
            evidence,
            reason,
            follow_up,
        )

    @property
    def is_unsupported(self) -> bool:
        """未対応（または使用不可）かどうかを返す。

        Returns
        -------
        bool
            未対応または使用不可なら True。
        """
        return self.status in (
            CapabilityStatusKind.UNSUPPORTED,
            CapabilityStatusKind.BLOCKED,
        )


UNSUPPORTED_PROVIDER_CAPABILITY = "UNSUPPORTED_PROVIDER_CAPABILITY"


def unsupported_capability_failure(status: CoreProviderCapabilityStatus) -> CoreFailure:
    """未対応の状況から失敗を作る（移植元 CoreUnsupportedCapabilityFailure）。

    Parameters
    ----------
    status : CoreProviderCapabilityStatus
        未対応の状況。

    Returns
    -------
    CoreFailure
        未対応を表す失敗。

    Raises
    ------
    ValueError
        状況が未対応でない場合。
    """
    if not status.is_unsupported:
        raise ValueError("capability status must be unsupported")
    summary = (
        f"{status.provider_id.canonical_name} {status.capability} is unsupported: "
        f"{status.reason}. Evidence: {status.evidence}. Follow-up: {status.follow_up}"
    )
    return CoreFailure.of(UNSUPPORTED_PROVIDER_CAPABILITY, summary)
