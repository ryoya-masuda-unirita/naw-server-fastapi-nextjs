"""Office・PDF プロセッサの共通部品（移植元 ProcessorSupport）。"""

import io
from pathlib import Path

from PIL import Image

from generative_ai_core.media.model import (
    CoreMediaPreprocessingError,
    CoreMediaPreprocessingFailure,
)


def has_extension(path: Path, extension: str) -> bool:
    """ファイル名が拡張子で終わるか判定する（大文字小文字は問わない）。

    Parameters
    ----------
    path : Path
        ファイルのパス。
    extension : str
        拡張子（`.pdf` など）。

    Returns
    -------
    bool
        終わっていれば True。
    """
    return path.name.lower().endswith(extension.lower())


def failure(code: str, summary: str | None) -> CoreMediaPreprocessingError:
    """失敗を運ぶ例外を作る。

    Parameters
    ----------
    code : str
        失敗のコード。
    summary : str | None
        失敗の要約。

    Returns
    -------
    CoreMediaPreprocessingError
        前処理の例外。
    """
    return CoreMediaPreprocessingError(CoreMediaPreprocessingFailure.of(code, summary))


def png_bytes(image: Image.Image, failure_code: str) -> bytes:
    """PIL の画像を PNG のバイト列にする。

    Parameters
    ----------
    image : Image.Image
        PIL の画像。
    failure_code : str
        書き出しに失敗したときの失敗コード。

    Returns
    -------
    bytes
        PNG のバイト列。

    Raises
    ------
    CoreMediaPreprocessingError
        PNG にできないとき。
    """
    output = io.BytesIO()
    try:
        image.save(output, format="PNG")
    except (OSError, ValueError, KeyError) as e:
        raise failure(failure_code, str(e)) from e
    return output.getvalue()
