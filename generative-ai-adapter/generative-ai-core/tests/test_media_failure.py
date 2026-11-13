"""移植元 CoreMediaPreprocessingFailureTest の移植。

移植元はリフレクションで private の `classifyIo`・`validate` を呼ぶ。Python 版も
同名の内部関数（`_classify_io`・`CoreMediaPreprocessingRuntime._validate`）を直接呼ぶ。
"""

from collections.abc import Callable
from pathlib import Path

import pytest
from generative_ai_core.chat.models import (
    CoreImageExplanationRequest,
    CoreImageExplanationResult,
)
from generative_ai_core.chat.runtime import CoreChatRuntime
from generative_ai_core.failure import CoreFailure
from generative_ai_core.media import (
    CORRUPT_FILE,
    EMPTY_FILE,
    PARSER_FAILURE,
    UNSUPPORTED_MIME,
    CoreMediaPreprocessingError,
    CoreMediaPreprocessingFailure,
    CoreMediaPreprocessingMode,
    CoreMediaPreprocessingRequest,
    CoreMediaPreprocessingResult,
    CoreMediaPreprocessingRuntime,
)
from generative_ai_core.media.model import (
    ENCRYPTED_PDF,
    IMAGE_EXTRACTION_FAILURE,
    RENDERING_FAILURE,
)
from generative_ai_core.media.runtime import _classify_io
from generative_ai_core.provider.model import Capability
from generative_ai_core.provider.runtime import CoreProviderRuntime, ExecutionContext

IMAGE_DATA = b"\x01"
IMAGE_MIME = "image/png"

RequestFactory = Callable[[CoreImageExplanationResult], CoreMediaPreprocessingRequest]


@pytest.fixture
def request_with_image_runtime(tmp_path: Path) -> RequestFactory:
    """固定の画像説明の結果を返す runtime を持つリクエストの工場を返す。

    Parameters
    ----------
    tmp_path : Path
        テスト用の一時ディレクトリ。

    Returns
    -------
    RequestFactory
        返したい結果を受け取り、FULL_PAGE のリクエストを返す関数。
    """

    def build(result: CoreImageExplanationResult) -> CoreMediaPreprocessingRequest:
        """リクエストを作る。

        Parameters
        ----------
        result : CoreImageExplanationResult
            runtime が返す画像説明の結果。

        Returns
        -------
        CoreMediaPreprocessingRequest
            FULL_PAGE で runtime を持つリクエスト。
        """

        def handle(
            request: object, context: ExecutionContext
        ) -> CoreImageExplanationResult:
            """固定の結果を返す。

            Parameters
            ----------
            request : object
                画像説明のリクエスト。
            context : ExecutionContext
                実行の文脈。

            Returns
            -------
            CoreImageExplanationResult
                固定の結果。
            """
            return result

        runtime = CoreChatRuntime(
            CoreProviderRuntime.builder()
            .register(
                "OpenAI",
                Capability.IMAGE_EXPLANATION,
                CoreImageExplanationRequest,
                handle,
            )
            .build()
        )
        return CoreMediaPreprocessingRequest(
            tmp_path / "image.png",
            mode=CoreMediaPreprocessingMode.FULL_PAGE,
            image_explanation_runtime=runtime,
        )

    return build


def test_empty_file_returns_secret_safe_failure(tmp_path: Path) -> None:
    """空のファイルが秘密を含まない EMPTY_FILE の失敗になること"""
    file = tmp_path / "empty.txt"
    file.write_bytes(b"")

    result = CoreMediaPreprocessingRuntime().preprocess(
        CoreMediaPreprocessingRequest(file, source_name="api_key=sk-secret")
    )

    assert result.failure is not None
    assert result.failure.code == EMPTY_FILE
    assert "sk-secret" not in result.failure.summary


def test_missing_file_returns_corrupt_file_failure(tmp_path: Path) -> None:
    """存在しないファイルが CORRUPT_FILE の失敗になること"""
    result = CoreMediaPreprocessingRuntime().preprocess(
        CoreMediaPreprocessingRequest(tmp_path / "missing.txt")
    )

    assert result.failure is not None
    assert result.failure.code == CORRUPT_FILE


def test_unsupported_binary_returns_unsupported_mime_failure(tmp_path: Path) -> None:
    """扱えないバイナリが UNSUPPORTED_MIME の失敗になること"""
    file = tmp_path / "binary.bin"
    file.write_bytes(bytes([1, 2, 3, 4]))

    result = CoreMediaPreprocessingRuntime().preprocess(
        CoreMediaPreprocessingRequest(file)
    )

    assert result.failure is not None
    assert result.failure.code == UNSUPPORTED_MIME


def test_io_failures_are_classified_by_sanitized_message() -> None:
    """入出力の失敗がメッセージの内容で分類されること"""
    assert _classify_io(OSError("encrypted PDF")) == ENCRYPTED_PDF
    assert _classify_io(OSError("render failed")) == RENDERING_FAILURE
    assert _classify_io(OSError("image extraction failed")) == IMAGE_EXTRACTION_FAILURE
    assert _classify_io(OSError("corrupt input")) == CORRUPT_FILE
    assert _classify_io(OSError("invalid input")) == CORRUPT_FILE
    assert _classify_io(OSError("not a pdf")) == CORRUPT_FILE
    assert _classify_io(OSError()) == PARSER_FAILURE


def test_validation_rejects_empty_successful_preprocessing_output(
    tmp_path: Path,
) -> None:
    """成功なのに中身が空の前処理結果を検証が失敗にすること"""
    request = CoreMediaPreprocessingRequest(
        tmp_path / "source.txt", source_name="source"
    )
    empty = CoreMediaPreprocessingResult.success("", None, "text/plain", ())
    failed = CoreMediaPreprocessingResult.from_failure(
        CoreMediaPreprocessingFailure.of(CORRUPT_FILE, "bad")
    )
    validate = CoreMediaPreprocessingRuntime._validate

    assert validate(failed, request) is failed
    empty_validated = validate(empty, request)
    assert empty_validated.failure is not None
    assert empty_validated.failure.code == PARSER_FAILURE
    text_validated = validate(
        CoreMediaPreprocessingResult.success("text", None, "text/plain", ()), request
    )
    assert text_validated.failure is None


def test_explain_image_fails_when_disabled(
    request_with_image_runtime: RequestFactory,
) -> None:
    """DISABLED では画像説明が無効のエラーになること"""
    request = request_with_image_runtime(CoreImageExplanationResult.success("x"))
    disabled = CoreMediaPreprocessingRequest(
        request.file_path, mode=CoreMediaPreprocessingMode.DISABLED
    )

    with pytest.raises(
        CoreMediaPreprocessingError, match="Image explanation is disabled"
    ):
        disabled.explain_image("image", IMAGE_DATA, IMAGE_MIME)


def test_explain_image_fails_without_runtime(tmp_path: Path) -> None:
    """runtime がないと画像説明が runtime 必須のエラーになること"""
    request = CoreMediaPreprocessingRequest(
        tmp_path / "image.png", mode=CoreMediaPreprocessingMode.FULL_PAGE
    )

    with pytest.raises(CoreMediaPreprocessingError, match="runtime is required"):
        request.explain_image("image", IMAGE_DATA, IMAGE_MIME)


def test_explain_image_reports_provider_failure_without_secret(
    request_with_image_runtime: RequestFactory,
) -> None:
    """プロバイダの失敗をコード付きで報告し、秘密を含めないこと"""
    request = request_with_image_runtime(
        CoreImageExplanationResult.from_failure(
            CoreFailure.of("IMAGE_FAIL", "api_key=sk-secret")
        )
    )

    with pytest.raises(CoreMediaPreprocessingError) as info:
        request.explain_image("image", IMAGE_DATA, IMAGE_MIME)

    assert "IMAGE_FAIL" in str(info.value)
    assert "sk-secret" not in str(info.value)


def test_explain_image_fails_when_explanation_absent(
    request_with_image_runtime: RequestFactory,
) -> None:
    """説明がないとき no explanation のエラーになること"""
    request = request_with_image_runtime(
        CoreImageExplanationResult("", None, explanation_present=False)
    )

    with pytest.raises(CoreMediaPreprocessingError, match="no explanation"):
        request.explain_image("image", IMAGE_DATA, IMAGE_MIME)


def test_explain_image_fails_when_explanation_blank(
    request_with_image_runtime: RequestFactory,
) -> None:
    """説明が空白だけのとき blank explanation のエラーになること"""
    request = request_with_image_runtime(CoreImageExplanationResult.success(" "))

    with pytest.raises(CoreMediaPreprocessingError, match="blank explanation"):
        request.explain_image("image", IMAGE_DATA, IMAGE_MIME)


def test_explain_image_returns_prefixed_explanation(
    request_with_image_runtime: RequestFactory,
) -> None:
    """成功時に出典名を前置した説明を返すこと"""
    request = request_with_image_runtime(CoreImageExplanationResult.success("説明"))

    assert (
        request.explain_image("image", IMAGE_DATA, IMAGE_MIME)
        == "imageの内容は次の通り:\n説明"
    )
