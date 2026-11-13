"""推論の途中経過ファイルへの追記（移植元 ReasoningOutputSink）。

プロパティ 42（または SecuAiGent の textData の streamfilepath）のファイルに、
`reasoning_delta`・`library_title_delta`・`library_content_delta` を届いた順に
`data:{"type":"...","text":"..."}` + 改行で追記し、1 行ごとに flush する。

- ファイルは作らない（Waha! が事前に作る前提）。開けなければ再試行し、だめなら
  固定のコードだけの失敗にする（パス・OS のメッセージを出さない）
- 書き込み・flush の失敗は再試行しない（回答は書かれない）。close の失敗は無視する
"""

import json
import logging
import os
import random
import time
from collections.abc import Callable
from pathlib import Path
from typing import TextIO

logger = logging.getLogger(__name__)

MIN_RETRY_DELAY_MILLIS = 50
MAX_RETRY_DELAY_MILLIS = 150
MAX_RETRIES = 20
RETRY_DEADLINE_NANOS = 2_000 * 1_000_000
NANOS_PER_MILLI = 1_000_000
MILLIS_PER_SECOND = 1000

INVALID_PATH = "REASONING_OUTPUT_INVALID_PATH"
NOT_FOUND = "REASONING_OUTPUT_NOT_FOUND"
ACCESS_DENIED = "REASONING_OUTPUT_ACCESS_DENIED"
NOT_APPENDABLE = "REASONING_OUTPUT_NOT_APPENDABLE"
RETRY_INTERRUPTED = "REASONING_OUTPUT_RETRY_INTERRUPTED"
WRITE_FAILED_MESSAGE = "reasoning output write failed"

TYPE_REASONING = "reasoning_delta"
TYPE_LIBRARY_TITLE = "library_title_delta"
TYPE_LIBRARY_CONTENT = "library_content_delta"

OpenAttempt = Callable[[Path], TextIO]
Sleeper = Callable[[int], None]


class ReasoningOutputError(RuntimeError):
    """途中経過ファイルを開けない・書けない。メッセージは固定のコードだけ。"""


def _open_append(path: Path) -> TextIO:
    """既存のファイルを UTF-8 の追記で開く（作らない）。

    Parameters
    ----------
    path : Path
        ファイルのパス。

    Returns
    -------
    TextIO
        書き込み用のファイル。

    Raises
    ------
    OSError
        開けないとき。
    """
    fd = os.open(path, os.O_WRONLY | os.O_APPEND)
    return os.fdopen(fd, "w", encoding="utf-8", newline="")


def _sleep_millis(millis: int) -> None:
    """ミリ秒だけ待つ。

    Parameters
    ----------
    millis : int
        待つミリ秒。
    """
    time.sleep(millis / MILLIS_PER_SECOND)


def _random_delay() -> int:
    """再試行までの待ち時間（両端を含む 50〜150 ms）を選ぶ。

    Returns
    -------
    int
        待ち時間（ミリ秒）。
    """
    return random.randint(MIN_RETRY_DELAY_MILLIS, MAX_RETRY_DELAY_MILLIS)


def _parse_path(path: str | None) -> Path:
    """パスを確かめる。

    Parameters
    ----------
    path : str | None
        パスの文字列。

    Returns
    -------
    Path
        パス。

    Raises
    ------
    ReasoningOutputError
        空・NUL を含むとき（INVALID_PATH）。
    """
    if path is None or not path.strip() or "\x00" in path:
        raise ReasoningOutputError(INVALID_PATH)
    return Path(path)


def _terminal_code_for(
    path: Path, failure: BaseException | None
) -> ReasoningOutputError:
    """開けなかった原因から固定のコードを選ぶ。

    Parameters
    ----------
    path : Path
        ファイルのパス。
    failure : BaseException | None
        最後の失敗。

    Returns
    -------
    ReasoningOutputError
        固定のコードの失敗。
    """
    try:
        if path.is_dir():
            return ReasoningOutputError(NOT_APPENDABLE)
    except OSError:
        pass
    if isinstance(failure, FileNotFoundError):
        return ReasoningOutputError(NOT_FOUND)
    if isinstance(failure, PermissionError):
        return ReasoningOutputError(ACCESS_DENIED)
    return ReasoningOutputError(NOT_APPENDABLE)


class ReasoningOutputSink:
    """途中経過ファイルへの追記。`callbacks()` を core の chat に渡す。"""

    def __init__(self, writer: TextIO) -> None:
        """開いたファイルで作る。

        Parameters
        ----------
        writer : TextIO
            追記で開いたファイル。
        """
        self._writer = writer
        self.written_count = 0

    @classmethod
    def open(
        cls,
        path: str | None,
        open_attempt: OpenAttempt = _open_append,
        nano_time: Callable[[], int] = time.monotonic_ns,
        sleeper: Sleeper = _sleep_millis,
        retry_delay_millis: Callable[[], int] = _random_delay,
    ) -> "ReasoningOutputSink":
        """ファイルを追記で開く。開けなければ再試行する。

        初回はすぐ開き、失敗したら 50〜150 ms 待って最大 20 回・2 秒以内まで試す。
        待ち時間が期限に収まらなければ待たずに失敗にする。

        Parameters
        ----------
        path : str | None
            ファイルのパス。
        open_attempt : OpenAttempt
            開く処理（テストで差し替える）。
        nano_time : Callable[[], int]
            単調増加の時刻（ナノ秒。テストで差し替える）。
        sleeper : Sleeper
            待つ処理（テストで差し替える）。
        retry_delay_millis : Callable[[], int]
            待ち時間を選ぶ処理（テストで差し替える）。

        Returns
        -------
        'ReasoningOutputSink'
            開いた追記先。

        Raises
        ------
        ReasoningOutputError
            開けないとき（固定のコード）。
        """
        target = _parse_path(path)
        started_at = nano_time()
        last_failure: BaseException | None = None
        cumulative_wait = 0
        attempts = 1
        while True:
            if attempts > 1 and nano_time() - started_at > RETRY_DEADLINE_NANOS:
                raise _terminal_code_for(target, last_failure)
            try:
                sink = cls(open_attempt(target))
            except ValueError as e:
                raise ReasoningOutputError(INVALID_PATH) from e
            except OSError as e:
                last_failure = e
                if attempts > MAX_RETRIES:
                    raise _terminal_code_for(target, e) from None
                delay = retry_delay_millis()
                elapsed = nano_time() - started_at
                if elapsed > RETRY_DEADLINE_NANOS - delay * NANOS_PER_MILLI:
                    raise _terminal_code_for(target, e) from None
                try:
                    sleeper(delay)
                except InterruptedError:
                    raise ReasoningOutputError(RETRY_INTERRUPTED) from None
                cumulative_wait += delay
                attempts += 1
                continue
            if attempts > 1:
                logger.warning(
                    "REASONING_OUTPUT_OPEN_RECOVERED attempts=%d, approximate_wait_ms=%d",
                    attempts,
                    cumulative_wait,
                )
            logger.info("reasoning output opened")
            return sink

    def callbacks(self) -> "ReasoningOutputSink":
        """core に渡すコールバックを返す（このオブジェクト自身）。

        Returns
        -------
        'ReasoningOutputSink'
            on_reasoning_delta などを持つコールバック。
        """
        return self

    def on_reasoning_delta(self, text: str) -> None:
        """推論の途中経過を書く。

        Parameters
        ----------
        text : str
            差分。
        """
        self._append(TYPE_REASONING, text)

    def on_library_title_delta(self, text: str) -> None:
        """ライブラリのタイトルの差分を書く。

        Parameters
        ----------
        text : str
            差分。
        """
        self._append(TYPE_LIBRARY_TITLE, text)

    def on_library_content_delta(self, text: str) -> None:
        """ライブラリの本文の差分を書く。

        Parameters
        ----------
        text : str
            差分。
        """
        self._append(TYPE_LIBRARY_CONTENT, text)

    def append_delta(self, text: str | None) -> None:
        """推論の途中経過を書く（移植元 appendDelta）。

        Parameters
        ----------
        text : str | None
            差分。None・空は書かない。
        """
        self._append(TYPE_REASONING, text)

    def _append(self, event_type: str, text: str | None) -> None:
        """1 行を書いて flush する。

        Parameters
        ----------
        event_type : str
            種類（reasoning_delta など）。
        text : str | None
            差分。None・空は書かない。

        Raises
        ------
        ReasoningOutputError
            書けないとき。
        """
        if not text:
            return
        payload = json.dumps(
            {"type": event_type, "text": text},
            ensure_ascii=False,
            separators=(",", ":"),
        )
        try:
            self._writer.write(f"data:{payload}\n")
            self._writer.flush()
        except OSError as e:
            raise ReasoningOutputError(WRITE_FAILED_MESSAGE) from e
        self.written_count += 1

    def close(self) -> None:
        """閉じる。失敗しても書いた分を残すため無視する。"""
        try:
            self._writer.close()
        except OSError:
            logger.debug("reasoning output close failed", exc_info=True)
        logger.info("reasoning output closed: deltas=%d", self.written_count)
