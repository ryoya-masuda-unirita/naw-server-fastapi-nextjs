"""ストリームファイル（途中経過）への追記。

server-local はストリームファイルを前回の位置から読み進め、`data:` で始まる 1 行を
1 イベントとして扱う（server-local の StreamFileTailReader）。移植元アダプタ
（ReasoningOutputSink）と同じく `data:` + 1 行の JSON + 改行で書く。
"""

import json
import os
from pathlib import Path
from typing import Any, Self

DATA_PREFIX = "data:"
EVENT_TERMINATOR = "\n"


class StreamFileError(Exception):
    """ストリームファイルを開けない。ジョブの失敗理由として result に出す。"""


class StreamFile:
    def __init__(self, fd: int) -> None:
        self._fd = fd

    @classmethod
    def open(cls, path: str, allowed_dir: Path | None) -> Self:
        """既存のファイルを追記で開く。

        移植元アダプタは作成せずに追記で開き、なければ失敗にする。server-local は
        execute の前にファイルを作っているため、ないのは共有ディレクトリの設定誤り。
        任意の場所にファイルを作らないためにも、作成はしない。
        """
        target = Path(path)
        flags = os.O_WRONLY | os.O_APPEND
        if allowed_dir is not None:
            # 確かめたパスとは別のファイルを開かないよう、解決後のパスで開く。
            # 確かめた後にシンボリックリンクへ差し替えられても辿らない
            target = target.resolve()
            flags |= os.O_NOFOLLOW
            if not target.is_relative_to(allowed_dir.resolve()):
                raise StreamFileError(
                    f"streamfilepath が許可されたディレクトリの外です: {path}"
                )
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
        """1 イベントを 1 回の write で書く（server-local が途中の行を読まないように）。"""
        payload = json.dumps(event, ensure_ascii=False, separators=(",", ":"))
        data = f"{DATA_PREFIX}{payload}{EVENT_TERMINATOR}".encode()
        written = 0
        while written < len(data):
            written += os.write(self._fd, data[written:])

    def close(self) -> None:
        os.close(self._fd)
