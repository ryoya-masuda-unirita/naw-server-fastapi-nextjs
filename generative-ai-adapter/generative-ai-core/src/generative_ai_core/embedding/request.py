"""埋め込みのリクエスト（移植元 CoreEmbeddingRequest）。"""

from collections.abc import Mapping
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Self

from generative_ai_core.network.setting import CoreNetworkSetting


class EmbeddingSourceType(StrEnum):
    """埋め込む元の種類（移植元 CoreEmbeddingRequest.Type）。"""

    TEXT = "TEXT"
    FILE = "FILE"


@dataclass(frozen=True)
class EmbeddingSource:
    """埋め込む元（移植元 CoreEmbeddingRequest.Source）。

    Attributes
    ----------
    type : EmbeddingSourceType
        元の種類。
    display_name : str
        表示用の名前（ファイルならパス）。None は空になる。
    text : str
        埋め込む文字列。None は空になる。
    """

    type: EmbeddingSourceType
    display_name: str = ""
    text: str = ""

    def __post_init__(self) -> None:
        """None の項目を空文字列にする。"""
        object.__setattr__(self, "display_name", self.display_name or "")
        object.__setattr__(self, "text", self.text or "")

    @classmethod
    def of_text(cls, text: str | None) -> "EmbeddingSource":
        """文字列を元にする（移植元 Source.text）。

        Parameters
        ----------
        text : str | None
            埋め込む文字列。

        Returns
        -------
        EmbeddingSource
            表示名が `inline-text` の元。
        """
        return cls(EmbeddingSourceType.TEXT, "inline-text", text or "")

    @classmethod
    def of_file(cls, path: str | None, text: str | None) -> "EmbeddingSource":
        """ファイルを元にする（移植元 Source.file）。

        Parameters
        ----------
        path : str | None
            ファイルのパス（表示名になる）。
        text : str | None
            ファイルから取り出した文字列。

        Returns
        -------
        EmbeddingSource
            ファイルの元。
        """
        return cls(EmbeddingSourceType.FILE, path or "", text or "")


@dataclass(frozen=True)
class CoreEmbeddingRequest:
    """埋め込みのリクエスト。

    Attributes
    ----------
    provider_id : str
        プロバイダ ID（前後の空白は取り除かれる）。
    network_setting : CoreNetworkSetting
        ネットワーク設定。None は既定になる。
    source : EmbeddingSource
        埋め込む元。
    target_hint : str
        結果の targetId に返す値。None は空になる。
    metadata : Mapping[str, str]
        付加情報（コピーして持つ）。
    """

    provider_id: str
    source: EmbeddingSource
    network_setting: CoreNetworkSetting = field(
        default_factory=CoreNetworkSetting.defaults
    )
    target_hint: str = ""
    metadata: Mapping[str, str] = field(default_factory=dict, hash=False)

    def __post_init__(self) -> None:
        """各項目を検証・正規化する。

        Raises
        ------
        ValueError
            プロバイダ ID が空のとき。
        """
        if self.provider_id is None or not self.provider_id.strip():
            raise ValueError("providerId must not be blank")
        object.__setattr__(self, "provider_id", self.provider_id.strip())
        if self.network_setting is None:
            object.__setattr__(self, "network_setting", CoreNetworkSetting.defaults())
        if self.source is None:
            raise ValueError("source must not be null")
        object.__setattr__(self, "target_hint", self.target_hint or "")
        object.__setattr__(self, "metadata", dict(self.metadata or {}))

    @classmethod
    def builder(cls, provider_id: str) -> "CoreEmbeddingRequestBuilder":
        """ビルダーを作る。

        Parameters
        ----------
        provider_id : str
            プロバイダ ID。

        Returns
        -------
        CoreEmbeddingRequestBuilder
            新しいビルダー。
        """
        return CoreEmbeddingRequestBuilder(provider_id)


class CoreEmbeddingRequestBuilder:
    """CoreEmbeddingRequest のビルダー（移植元 CoreEmbeddingRequest.Builder）。"""

    def __init__(self, provider_id: str) -> None:
        """プロバイダ ID を受け取り、既定値で始める。

        Parameters
        ----------
        provider_id : str
            プロバイダ ID。
        """
        self._provider_id = provider_id
        self._network_setting = CoreNetworkSetting.defaults()
        self._source = EmbeddingSource.of_text("")
        self._target_hint = ""
        self._metadata: dict[str, str] = {}

    def network_setting(self, network_setting: CoreNetworkSetting) -> Self:
        """ネットワーク設定を指定する。

        Parameters
        ----------
        network_setting : CoreNetworkSetting
            ネットワーク設定。

        Returns
        -------
        CoreEmbeddingRequestBuilder
            自分自身。

        Raises
        ------
        ValueError
            None のとき。
        """
        if network_setting is None:
            raise ValueError("networkSetting must not be null")
        self._network_setting = network_setting
        return self

    def source(self, source: EmbeddingSource) -> Self:
        """埋め込む元を指定する。

        Parameters
        ----------
        source : EmbeddingSource
            埋め込む元。

        Returns
        -------
        CoreEmbeddingRequestBuilder
            自分自身。

        Raises
        ------
        ValueError
            None のとき。
        """
        if source is None:
            raise ValueError("source must not be null")
        self._source = source
        return self

    def target_hint(self, target_hint: str | None) -> Self:
        """結果の targetId に返す値を指定する。

        Parameters
        ----------
        target_hint : str | None
            対象のヒント。

        Returns
        -------
        CoreEmbeddingRequestBuilder
            自分自身。
        """
        self._target_hint = target_hint or ""
        return self

    def metadata(self, key: str | None, value: str | None) -> Self:
        """付加情報を足す。キーが空なら無視する。

        Parameters
        ----------
        key : str | None
            キー。
        value : str | None
            値。None は空文字列になる。

        Returns
        -------
        CoreEmbeddingRequestBuilder
            自分自身。
        """
        if key is not None and key.strip():
            self._metadata[key] = value or ""
        return self

    def build(self) -> CoreEmbeddingRequest:
        """リクエストを作る。

        Returns
        -------
        CoreEmbeddingRequest
            作ったリクエスト。
        """
        return CoreEmbeddingRequest(
            self._provider_id,
            self._source,
            self._network_setting,
            self._target_hint,
            self._metadata,
        )
