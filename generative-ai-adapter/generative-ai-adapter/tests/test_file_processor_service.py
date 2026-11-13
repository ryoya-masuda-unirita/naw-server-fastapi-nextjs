"""FileProcessorService のテスト（移植元 service/FileProcessorServiceTest）。

- 移植元はテキストと画像だけを扱う。Office・PDF の前処理は Python 版にない
- 移植元は ImageExplanationClient のモックを渡す（このときプロバイダは "OpenAI" に固定）。
  Python 版はコンストラクタの `chat_runtime_factory` に、IMAGE_EXPLANATION を記録する
  runtime を返す工場を渡す。工場はプロバイダの設定から呼ばれるため、画像説明を有効に
  するテストでは OpenAI の資格情報（`core_credential`）を使う
"""

import struct
import zlib
from pathlib import Path

import pytest
from generative_ai_adapter.constants import ImageExplanationMode
from generative_ai_adapter.domain import AccessCredential, ProxySetting
from generative_ai_adapter.request_schema_factory import FileProcessorService
from generative_ai_core.chat.models import (
    CoreImageExplanationRequest,
    CoreImageExplanationResult,
)
from generative_ai_core.chat.runtime import CoreChatRuntime
from generative_ai_core.provider.model import Capability, RuntimeProviderConfiguration
from generative_ai_core.provider.runtime import CoreProviderRuntime, ExecutionContext

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
IMAGE_SIZE = 2
BLUE = b"\x00\x00\xff"
BLACK = b"\x00\x00\x00"


class _ImageExplanationRecorder:
    """画像説明のリクエストを記録し、決まった説明を返す（ImageExplanationClient の代わり）。"""

    def __init__(self, caption: str) -> None:
        """返す説明を受け取る。

        Parameters
        ----------
        caption : str
            返す説明。
        """
        self.caption = caption
        self.factory_calls = 0
        self.requests: list[CoreImageExplanationRequest] = []

    def factory(self, configuration: RuntimeProviderConfiguration) -> CoreChatRuntime:
        """IMAGE_EXPLANATION だけを登録した runtime を返す。

        Parameters
        ----------
        configuration : RuntimeProviderConfiguration
            プロバイダの設定。

        Returns
        -------
        CoreChatRuntime
            画像説明を記録する runtime。
        """
        self.factory_calls += 1
        return CoreChatRuntime(
            CoreProviderRuntime.builder()
            .register(
                configuration.provider_id.canonical_name,
                Capability.IMAGE_EXPLANATION,
                CoreImageExplanationRequest,
                self._explain,
            )
            .build()
        )

    def _explain(
        self, request: CoreImageExplanationRequest, context: ExecutionContext
    ) -> CoreImageExplanationResult:
        """リクエストを記録して説明を返す。

        Parameters
        ----------
        request : CoreImageExplanationRequest
            画像説明のリクエスト。
        context : ExecutionContext
            実行の文脈（使わない）。

        Returns
        -------
        CoreImageExplanationResult
            決まった説明。
        """
        self.requests.append(request)
        return CoreImageExplanationResult.success(self.caption)


def _png_chunk(kind: bytes, data: bytes) -> bytes:
    """PNG のチャンクを作る。

    Parameters
    ----------
    kind : bytes
        チャンクの種類。
    data : bytes
        チャンクのデータ。

    Returns
    -------
    bytes
        長さ・種類・データ・CRC をつなげたもの。
    """
    crc = zlib.crc32(kind + data) & 0xFFFFFFFF
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", crc)


def _png_file(directory: Path) -> Path:
    """左上だけ青い 2x2 の PNG を書く（移植元 pngFile）。

    Parameters
    ----------
    directory : Path
        書く先のディレクトリ。

    Returns
    -------
    Path
        書いた `test.png`。
    """
    header = struct.pack(">IIBBBBB", IMAGE_SIZE, IMAGE_SIZE, 8, 2, 0, 0, 0)
    rows = b"\x00" + BLUE + BLACK + b"\x00" + BLACK + BLACK
    data = (
        PNG_SIGNATURE
        + _png_chunk(b"IHDR", header)
        + _png_chunk(b"IDAT", zlib.compress(rows))
        + _png_chunk(b"IEND", b"")
    )
    path = directory / "test.png"
    path.write_bytes(data)
    return path


def test_extract_content_non_existent_file_fails_before_core_delegation() -> None:
    """ないファイルは core に任せる前に FileNotFoundError になること"""
    service = FileProcessorService(AccessCredential(), ProxySetting())

    with pytest.raises(FileNotFoundError):
        service.extract_content("non_existent_file.docx", ImageExplanationMode.DISABLED)


def test_extract_content_text_file_delegates_to_core_media_runtime(
    tmp_path: Path,
) -> None:
    """テキストのファイルを core の前処理で読むこと"""
    text_file = tmp_path / "test.txt"
    text_file.write_text("テストテキスト", encoding="utf-8")
    service = FileProcessorService(AccessCredential(), ProxySetting())

    result = service.extract_content(str(text_file), ImageExplanationMode.DISABLED)

    assert result is not None
    assert result.text is not None
    assert "テストテキスト" in result.text
    assert result.mime_type == "text/plain"


def test_disabled_image_explanation_keeps_binary_attachment_without_core_port(
    tmp_path: Path, core_credential: AccessCredential
) -> None:
    """画像説明が無効なら画像を添付のまま返し、画像説明を呼ばないこと"""
    image_file = _png_file(tmp_path)
    recorder = _ImageExplanationRecorder("unused")
    service = FileProcessorService(core_credential, ProxySetting(), recorder.factory)

    result = service.extract_content(str(image_file), ImageExplanationMode.DISABLED)

    assert result.text is None
    assert result.image_resource is not None
    assert result.mime_type == "image/png"
    assert recorder.factory_calls == 0
    assert recorder.requests == []


def _assert_single_png_request(recorder: _ImageExplanationRecorder) -> None:
    """`test.png` の PNG で画像説明を 1 回呼んだことを確かめる。

    Parameters
    ----------
    recorder : _ImageExplanationRecorder
        記録した画像説明。
    """
    assert len(recorder.requests) == 1
    media = recorder.requests[0].media
    assert len(media) == 1
    assert media[0].source_hint == "test.png"
    assert media[0].mime_type == "image/png"


def test_enabled_image_explanation_uses_injected_core_port(
    tmp_path: Path, core_credential: AccessCredential
) -> None:
    """画像説明が有効なら差し替えた画像説明の結果をテキストにすること"""
    image_file = _png_file(tmp_path)
    recorder = _ImageExplanationRecorder("Core caption")
    service = FileProcessorService(core_credential, ProxySetting(), recorder.factory)

    result = service.extract_content(str(image_file), ImageExplanationMode.EMBED_ONLY)

    assert result.text is not None
    assert "Core caption" in result.text
    _assert_single_png_request(recorder)


def test_full_page_mode_keeps_one_explanation_call_for_one_image(
    tmp_path: Path, core_credential: AccessCredential
) -> None:
    """ページ全体モードでも画像 1 枚なら画像説明を 1 回だけ呼ぶこと"""
    image_file = _png_file(tmp_path)
    recorder = _ImageExplanationRecorder("Core caption")
    service = FileProcessorService(core_credential, ProxySetting(), recorder.factory)

    result = service.extract_content(str(image_file), ImageExplanationMode.FULL_PAGE)

    assert result.text is not None
    assert "test.png" in result.text
    assert "Core caption" in result.text
    _assert_single_png_request(recorder)


def test_enabled_image_explanation_rejects_blank_core_caption(
    tmp_path: Path, core_credential: AccessCredential
) -> None:
    """画像説明が空白だけなら IMAGE_EXPLANATION_FAILURE の失敗になること"""
    image_file = _png_file(tmp_path)
    recorder = _ImageExplanationRecorder("   ")
    service = FileProcessorService(core_credential, ProxySetting(), recorder.factory)

    with pytest.raises(RuntimeError, match="IMAGE_EXPLANATION_FAILURE"):
        service.extract_content(str(image_file), ImageExplanationMode.EMBED_ONLY)
