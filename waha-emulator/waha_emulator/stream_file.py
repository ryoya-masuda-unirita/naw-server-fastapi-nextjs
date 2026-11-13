"""ストリームファイル（途中経過）への追記。

server-local はストリームファイルを前回の位置から読み進め、`data:` で始まる 1 行を
1 イベントとして扱う（server-local の StreamFileTailReader）。途中経過
（reasoning_delta など）は生成AIアダプタ（ReasoningOutputSink）が書き、エミュレーターは
ジョブの終端（`completed`・`error`）だけを同じ形式（`data:` + 1 行の JSON + 改行）で書く。
"""

import json
import os
from pathlib import Path
from typing import Any, Self

DATA_PREFIX = "data:"
EVENT_TERMINATOR = "\n"


class StreamFileError(Exception):
    """ストリームファイルを開けない。ジョブの失敗理由として result に出す。"""


def resolve_allowed(path: str, allowed_dir: Path | None) -> Path:
    """書き込んでよい場所かを確かめ、開くパスを返す。

    `allowed_dir` があれば、シンボリックリンクを解決した後のパスがその中にあることを
    確かめ、解決後のパスを返す（確かめたものとは別のファイルを開かないため）。

    Parameters
    ----------
    path : str
        ストリームファイルのパス。
    allowed_dir : Path | None
        書き込んでよいディレクトリ。None なら確かめない。

    Returns
    -------
    Path
        開くパス。

    Raises
    ------
    StreamFileError
        許可されたディレクトリの外のとき。
    """
    target = Path(path)
    if allowed_dir is None:
        return target
    resolved = target.resolve()
    if not resolved.is_relative_to(allowed_dir.resolve()):
        raise StreamFileError(
            f"streamfilepath が許可されたディレクトリの外です: {path}"
        )
    return resolved


class StreamFile:
    """追記で開いたストリームファイル。"""

    def __init__(self, fd: int) -> None:
        """開いたファイル記述子で作る。

        Parameters
        ----------
        fd : int
            追記で開いたファイル記述子。
        """
        self._fd = fd

    @classmethod
    def open(cls, path: str, allowed_dir: Path | None) -> Self:
        """既存のファイルを追記で開く。

        移植元アダプタは作成せずに追記で開き、なければ失敗にする。server-local は
        execute の前にファイルを作っているため、ないのは共有ディレクトリの設定誤り。
        任意の場所にファイルを作らないためにも、作成はしない。

        Parameters
        ----------
        path : str
            ストリームファイルのパス。
        allowed_dir : Path | None
            書き込んでよいディレクトリ。

        Returns
        -------
        Self
            開いたストリームファイル。

        Raises
        ------
        StreamFileError
            許可されたディレクトリの外・ファイルがない・開けないとき。
        """
        target = resolve_allowed(path, allowed_dir)
        flags = os.O_WRONLY | os.O_APPEND
        if allowed_dir is not None:
            # 確かめた後にシンボリックリンクへ差し替えられても辿らない
            flags |= os.O_NOFOLLOW
        try:
            fd = os.open(target, flags)
        except FileNotFoundError as e:
            raise StreamFileError(
                f"streamfilepath のファイルがありません: {path}"
            ) from e
        except OSError as e:
            raise StreamFileError(
                f"streamfilepath のファイルを開けません: {path}: {e.strerror}"
            ) from e
        return cls(fd)

    def write_event(self, event: dict[str, Any]) -> None:
        """1 イベントを 1 回の write で書く（server-local が途中の行を読まないように）。

        Parameters
        ----------
        event : dict[str, Any]
            書くイベント（`type` を持つ JSON のオブジェクト）。
        """
        payload = json.dumps(event, ensure_ascii=False, separators=(",", ":"))
        data = f"{DATA_PREFIX}{payload}{EVENT_TERMINATOR}".encode()
        written = 0
        while written < len(data):
            written += os.write(self._fd, data[written:])

    def close(self) -> None:
        """閉じる。"""
        os.close(self._fd)
