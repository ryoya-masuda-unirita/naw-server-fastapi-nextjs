"""ベンダー（プロパティ 30）の ID と名前（移植元 VendorRegistry）。"""

from generative_ai_adapter import property_validation
from generative_ai_adapter.constants import PropertyIds

# Waha! の properties.xml の ENUM と同じ。"99"（Echo）だけは Python 版の確認用
VENDOR_MAP: dict[str, str] = {
    "0": "OpenAI",
    "1": "AzureOpenAI",
    "2": "Anthropic",
    "3": "VertexAI",
    "4": "GoogleAIStudio",
    "5": "SecuAiGent",
    "99": "Echo",
}
# 実際に呼べるプロバイダ（それ以外は core で「未対応」の失敗になる前に止める）
RUNNABLE_PROVIDERS: tuple[str, ...] = ("OpenAI", "AzureOpenAI", "SecuAiGent", "Echo")
PROPERTY_NAME = "provider"


def supported_provider_names() -> str:
    """実行できるプロバイダの一覧を返す。

    Returns
    -------
    str
        カンマ区切りのプロバイダ名。
    """
    return ", ".join(RUNNABLE_PROVIDERS)


def get_vendor_name(vendor_id: str | None) -> str:
    """ベンダー ID から名前を引く。

    Parameters
    ----------
    vendor_id : str | None
        プロパティ 30 の値（"0"〜"5"、"99"）。

    Returns
    -------
    str
        ベンダー名。

    Raises
    ------
    WahaPropertyValidationError
        未知の ID のとき。
    """
    name = VENDOR_MAP.get(vendor_id or "")
    if name is None:
        raise property_validation.unsupported_provider(
            PropertyIds.VENDOR, PROPERTY_NAME, supported_provider_names()
        )
    return name


def validate_runnable_provider(vendor_name: str | None) -> None:
    """通常 chat で実行できるプロバイダかを確かめる。未設定は通す。

    Parameters
    ----------
    vendor_name : str | None
        ベンダー名。

    Raises
    ------
    WahaPropertyValidationError
        実行できないプロバイダのとき。
    """
    if vendor_name and vendor_name.strip() and vendor_name not in RUNNABLE_PROVIDERS:
        raise property_validation.unsupported_provider(
            PropertyIds.VENDOR, PROPERTY_NAME, supported_provider_names()
        )
