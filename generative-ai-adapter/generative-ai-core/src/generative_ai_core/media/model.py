"""前処理の入出力（移植元 CoreMediaPreprocessingRequest・Result・Failure など）。"""

import os
from dataclasses import dataclass, field, replace
from enum import StrEnum
from pathlib import Path

from generative_ai_core.chat.models import (
    CoreGenerationOptions,
    CoreImageExplanationRequest,
    CoreMedia,
)
from generative_ai_core.chat.runtime import CoreChatRuntime
from generative_ai_core.failure import sanitize
from generative_ai_core.network.setting import CoreNetworkSetting

UNSUPPORTED_MIME = "UNSUPPORTED_MIME"
EMPTY_FILE = "EMPTY_FILE"
CORRUPT_FILE = "CORRUPT_FILE"
ENCRYPTED_PDF = "ENCRYPTED_PDF"
RENDERING_FAILURE = "RENDERING_FAILURE"
IMAGE_EXTRACTION_FAILURE = "IMAGE_EXTRACTION_FAILURE"
PARSER_FAILURE = "PARSER_FAILURE"
IMAGE_EXPLANATION_FAILURE = "IMAGE_EXPLANATION_FAILURE"

DEFAULT_MIME_TYPE = "application/octet-stream"
DEFAULT_PROVIDER_ID = "OpenAI"
DEFAULT_SOURCE_NAME = "file"
DEFAULT_IMAGE_SOURCE_HINT = "image"
EMBEDDED_IMAGE_TYPE = 1
PAGE_IMAGE_TYPE = 2


class CoreMediaPreprocessingMode(StrEnum):
    """前処理のモード。"""

    DISABLED = "DISABLED"
    EMBED_ONLY = "EMBED_ONLY"
    FULL_PAGE = "FULL_PAGE"


@dataclass(frozen=True)
class CoreMediaPreprocessingFailure:
    """前処理の失敗（コード・要約・分類）。"""

    code: str
    summary: str
    category: str = ""

    def __post_init__(self) -> None:
        """コード・要約・分類を補い、要約の秘密情報を伏せる。"""
        code = (self.code or "").strip() or PARSER_FAILURE
        object.__setattr__(self, "code", code)
        object.__setattr__(self, "summary", sanitize(self.summary))
        object.__setattr__(self, "category", (self.category or "").strip() or code)

    @classmethod
    def of(cls, code: str, summary: str | None) -> "CoreMediaPreprocessingFailure":
        """コードと要約から失敗を作る。

        Parameters
        ----------
        code : str
            失敗のコード。
        summary : str | None
            失敗の要約。None なら空。

        Returns
        -------
        CoreMediaPreprocessingFailure
            前処理の失敗。
        """
        return cls(code, summary or "", code)


class CoreMediaPreprocessingError(Exception):
    """前処理の途中で失敗した（移植元 CoreMediaPreprocessingException）。"""

    def __init__(self, failure: CoreMediaPreprocessingFailure) -> None:
        """失敗を運ぶ例外を作る。

        Parameters
        ----------
        failure : CoreMediaPreprocessingFailure
            前処理の失敗。
        """
        super().__init__(failure.summary)
        self.failure = failure


@dataclass(frozen=True)
class CoreProcessedImage:
    """前処理で得た添付用の画像。"""

    data: bytes = field(repr=False)
    mime_type: str = DEFAULT_MIME_TYPE
    source_hint: str = DEFAULT_IMAGE_SOURCE_HINT

    def __post_init__(self) -> None:
        """MIME タイプ・出所を補う。"""
        mime_type = (self.mime_type or "").strip() or DEFAULT_MIME_TYPE
        source_hint = (self.source_hint or "").strip() or DEFAULT_IMAGE_SOURCE_HINT
        object.__setattr__(self, "mime_type", mime_type)
        object.__setattr__(self, "source_hint", source_hint)


@dataclass(frozen=True)
class CoreImageExplanationEntry:
    """画像説明の 1 件。"""

    type: int
    caption: str
    source_hint: str = DEFAULT_IMAGE_SOURCE_HINT

    def __post_init__(self) -> None:
        """type・caption を検証し、出所を補う。

        Raises
        ------
        ValueError
            type が 1・2 以外、または caption が空のとき。
        """
        if self.type not in (EMBEDDED_IMAGE_TYPE, PAGE_IMAGE_TYPE):
            raise ValueError("type must be 1 or 2")
        if self.caption is None or not self.caption.strip():
            raise ValueError("caption must not be blank")
        object.__setattr__(self, "caption", self.caption.strip())
        source_hint = (self.source_hint or "").strip() or DEFAULT_IMAGE_SOURCE_HINT
        object.__setattr__(self, "source_hint", source_hint)


@dataclass(frozen=True)
class CoreMediaPreprocessingResult:
    """前処理の結果（成功か失敗）。"""

    text: str = ""
    attachment: CoreProcessedImage | None = None
    mime_type: str = DEFAULT_MIME_TYPE
    image_explanations: tuple[CoreImageExplanationEntry, ...] = ()
    failure: CoreMediaPreprocessingFailure | None = None

    def __post_init__(self) -> None:
        """テキスト・MIME タイプ・画像説明を補う。"""
        object.__setattr__(self, "text", self.text or "")
        mime_type = (self.mime_type or "").strip() or DEFAULT_MIME_TYPE
        object.__setattr__(self, "mime_type", mime_type)
        object.__setattr__(self, "image_explanations", tuple(self.image_explanations))

    @classmethod
    def success(
        cls,
        text: str,
        attachment: CoreProcessedImage | None,
        mime_type: str,
        image_explanations: tuple[CoreImageExplanationEntry, ...] = (),
    ) -> "CoreMediaPreprocessingResult":
        """成功の結果を作る。

        Parameters
        ----------
        text : str
            抽出したテキスト。
        attachment : CoreProcessedImage | None
            添付用の画像。なければ None。
        mime_type : str
            判定した MIME タイプ。
        image_explanations : tuple[CoreImageExplanationEntry, ...]
            画像説明の列。

        Returns
        -------
        CoreMediaPreprocessingResult
            成功の結果。
        """
        return cls(text, attachment, mime_type, image_explanations, None)

    @classmethod
    def from_failure(
        cls, failure: CoreMediaPreprocessingFailure
    ) -> "CoreMediaPreprocessingResult":
        """失敗の結果を作る。

        Parameters
        ----------
        failure : CoreMediaPreprocessingFailure
            前処理の失敗。

        Returns
        -------
        CoreMediaPreprocessingResult
            失敗の結果。
        """
        return cls("", None, DEFAULT_MIME_TYPE, (), failure)


def _failure(code: str, summary: str) -> CoreMediaPreprocessingError:
    """失敗を運ぶ例外を作る。

    Parameters
    ----------
    code : str
        失敗のコード。
    summary : str
        失敗の要約。

    Returns
    -------
    CoreMediaPreprocessingError
        前処理の例外。
    """
    return CoreMediaPreprocessingError(CoreMediaPreprocessingFailure.of(code, summary))


@dataclass(frozen=True)
class CoreMediaPreprocessingRequest:
    """前処理のリクエスト。"""

    file_path: Path
    source_name: str = ""
    mode: CoreMediaPreprocessingMode = CoreMediaPreprocessingMode.DISABLED
    detected_mime_type: str = ""
    provider_id: str = DEFAULT_PROVIDER_ID
    network_setting: CoreNetworkSetting = field(
        default_factory=CoreNetworkSetting.defaults
    )
    image_explanation_runtime: CoreChatRuntime | None = field(
        default=None, repr=False, compare=False
    )

    def __post_init__(self) -> None:
        """パスを正規化し、名前・MIME タイプ・プロバイダ ID を補う。"""
        # 移植元 toAbsolutePath().normalize()（シンボリックリンクは解決しない）
        file_path = Path(os.path.normpath(Path(self.file_path).absolute()))
        object.__setattr__(self, "file_path", file_path)
        source_name = (self.source_name or "").strip() or (
            file_path.name or DEFAULT_SOURCE_NAME
        )
        object.__setattr__(self, "source_name", source_name)
        object.__setattr__(
            self, "detected_mime_type", (self.detected_mime_type or "").strip()
        )
        provider_id = (self.provider_id or "").strip() or DEFAULT_PROVIDER_ID
        object.__setattr__(self, "provider_id", provider_id)

    def with_detected_mime_type(
        self, mime_type: str
    ) -> "CoreMediaPreprocessingRequest":
        """判定した MIME タイプを入れたコピーを返す。

        Parameters
        ----------
        mime_type : str
            判定した MIME タイプ。

        Returns
        -------
        CoreMediaPreprocessingRequest
            MIME タイプを入れたリクエスト。
        """
        return replace(self, detected_mime_type=mime_type)

    def explain_image(
        self,
        source_hint: str,
        data: bytes,
        mime_type: str,
        filename: str | None = None,
    ) -> str:
        """画像の説明を core の chat で作る。失敗は IMAGE_EXPLANATION_FAILURE。

        Parameters
        ----------
        source_hint : str
            画像の出所のヒント。
        data : bytes
            画像のバイト列。
        mime_type : str
            画像の MIME タイプ。
        filename : str | None
            ファイル名。省略すると source_hint。

        Returns
        -------
        str
            画像の説明文。

        Raises
        ------
        CoreMediaPreprocessingError
            説明が無効・失敗・空のとき。
        """
        if self.mode == CoreMediaPreprocessingMode.DISABLED:
            raise _failure(IMAGE_EXPLANATION_FAILURE, "Image explanation is disabled.")
        if self.image_explanation_runtime is None:
            raise _failure(
                IMAGE_EXPLANATION_FAILURE, "Image explanation runtime is required."
            )
        result = self.image_explanation_runtime.explain_image(
            CoreImageExplanationRequest(
                self.provider_id,
                self.network_setting,
                "",
                "",
                (
                    CoreMedia(
                        mime_type,
                        source_hint,
                        data,
                        source_hint if filename is None else filename,
                    ),
                ),
                CoreGenerationOptions.empty(),
            )
        )
        if result.failure is not None:
            raise _failure(
                IMAGE_EXPLANATION_FAILURE,
                f"Core image explanation failed [{result.failure.code}]: "
                f"{result.failure.summary}",
            )
        if not result.explanation_present:
            raise _failure(
                IMAGE_EXPLANATION_FAILURE,
                "Core image explanation returned no explanation.",
            )
        if not result.explanation.strip():
            raise _failure(
                IMAGE_EXPLANATION_FAILURE,
                "Core image explanation returned blank explanation.",
            )
        return f"{source_hint}の内容は次の通り:\n{result.explanation.strip()}".strip()
