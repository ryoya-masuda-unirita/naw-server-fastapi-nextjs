"""generative-ai-core のテストで共有する fixture。

移植元の CoreMediaTestFixtures（pngBytes）と、各テストが個別に持つ
RuntimeProviderConfiguration の組み立てに当たる。pytest は `--import-mode=importlib`
で動くため、テストから conftest を import できない。補助は fixture（関数を返す）で渡す。
"""

import struct
import zlib
from collections.abc import Callable, Mapping

import pytest
from generative_ai_core.network.setting import CoreNetworkSetting
from generative_ai_core.provider.model import (
    Capability,
    CoreCredential,
    CoreProviderId,
    RuntimeProviderConfiguration,
)

DEFAULT_MODEL = "model-a"
DEFAULT_ENDPOINT = "https://provider.example.invalid"
DEFAULT_API_KEY = "sk-test-secret"
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
# 2x2 の RGB 画像（左上だけ青、ほかは白。移植元 CoreMediaTestFixtures.pngBytes と同じ絵）
PNG_SIZE = 2
PNG_BIT_DEPTH = 8
PNG_COLOR_TYPE_RGB = 2
WHITE = b"\xff\xff\xff"
BLUE = b"\x00\x00\xff"


def _png_chunk(kind: bytes, data: bytes) -> bytes:
    """PNG のチャンク（長さ・種類・データ・CRC）を作る。

    Parameters
    ----------
    kind : bytes
        チャンクの種類（`IHDR` など）。
    data : bytes
        チャンクのデータ。

    Returns
    -------
    bytes
        チャンクのバイト列。
    """
    crc = zlib.crc32(kind + data) & 0xFFFFFFFF
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", crc)


def _png() -> bytes:
    """2x2 の PNG 画像を作る。

    Returns
    -------
    bytes
        PNG 画像のバイト列。
    """
    header = struct.pack(
        ">IIBBBBB", PNG_SIZE, PNG_SIZE, PNG_BIT_DEPTH, PNG_COLOR_TYPE_RGB, 0, 0, 0
    )
    # 各行の先頭はフィルタの種類（0 = なし）
    rows = b"\x00" + BLUE + WHITE + b"\x00" + WHITE + WHITE
    return (
        PNG_SIGNATURE
        + _png_chunk(b"IHDR", header)
        + _png_chunk(b"IDAT", zlib.compress(rows))
        + _png_chunk(b"IEND", b"")
    )


@pytest.fixture
def png_bytes() -> bytes:
    """移植元 CoreMediaTestFixtures.pngBytes に当たる PNG 画像を返す。

    Returns
    -------
    bytes
        2x2 の PNG 画像。
    """
    return _png()


@pytest.fixture
def make_configuration() -> Callable[..., RuntimeProviderConfiguration]:
    """移植元の `RuntimeProviderConfiguration.builder(...)...build()` に当たる工場を返す。

    Returns
    -------
    Callable[..., RuntimeProviderConfiguration]
        キーワード引数で値を変えられる設定の工場。
    """

    def build(
        provider_id: CoreProviderId,
        *,
        model_name: str = DEFAULT_MODEL,
        endpoint: str = DEFAULT_ENDPOINT,
        credential: CoreCredential | None = None,
        network_setting: CoreNetworkSetting | None = None,
        attributes: Mapping[str, str] | None = None,
        capabilities: tuple[Capability, ...] = (),
    ) -> RuntimeProviderConfiguration:
        """設定を作る。

        Parameters
        ----------
        provider_id : CoreProviderId
            プロバイダ。
        model_name : str, optional
            モデル名（Azure ではデプロイ名）。
        endpoint : str, optional
            接続先の URL。
        credential : CoreCredential | None, optional
            資格情報。省略時は API キー `sk-test-secret`。
        network_setting : CoreNetworkSetting | None, optional
            ネットワーク設定。省略時は既定値。
        attributes : Mapping[str, str] | None, optional
            プロバイダ固有の属性。
        capabilities : tuple[Capability, ...], optional
            能力。省略時は既定の能力。

        Returns
        -------
        RuntimeProviderConfiguration
            作った設定。
        """
        return RuntimeProviderConfiguration(
            provider_id,
            model_name,
            endpoint,
            credential or CoreCredential.api_key(DEFAULT_API_KEY),
            network_setting or CoreNetworkSetting.defaults(),
            dict(attributes or {}),
            capabilities,
        )

    return build
