"""推論の途中経過ファイルへの追記のテスト（移植元 service/ReasoningOutputSinkTest）。

移植元との違い:

- try-with-resources は try/finally の `close()` にした
- NoSuchFileException → FileNotFoundError、AccessDeniedException → PermissionError、
  IOException → OSError、InterruptedException → InterruptedError に置き換えた
- SecurityException は Python に相当するものがないため、ACCESS_DENIED の確認は
  PermissionError だけで行う
- 割り込みフラグ（Thread.isInterrupted）の復元は Python に相当するものがないため確かめない
- ログは移植元が出すもの（再試行で回復したときの WARNING）だけを確かめる。Python 版が
  追加で出す INFO（opened・closed）は確かめない
- 移植元の ControlledBufferedWriter は、write・flush・close を持つ `_ControlledWriter` にした
"""

import json
import logging
import threading
import time
from collections.abc import Callable
from io import StringIO
from pathlib import Path
from typing import TextIO, cast

import pytest
from generative_ai_adapter.reasoning_output_sink import (
    ReasoningOutputError,
    ReasoningOutputSink,
)

SINK_LOGGER = "generative_ai_adapter.reasoning_output_sink"
NANOS_PER_MILLI = 1_000_000
CREATOR_DELAY_SECONDS = 0.25
KEPT_LINE = 'data:{"type":"reasoning_delta","text":"kept"}\n'


def _event_fields(line: str) -> tuple[str, str]:
    """`data:` の行から type と text を取り出す。

    Parameters
    ----------
    line : str
        `data:{...}` の行。

    Returns
    -------
    tuple[str, str]
        type と text。
    """
    event = json.loads(line[len("data:") :])
    return str(event["type"]), str(event["text"])


def _assert_terminal_code(
    code: str, action: Callable[[], object]
) -> ReasoningOutputError:
    """固定のコードだけの失敗になり、原因を持たないことを確かめる。

    Parameters
    ----------
    code : str
        期待するメッセージ（固定のコード）。
    action : Callable[[], object]
        失敗する処理。

    Returns
    -------
    ReasoningOutputError
        発生した失敗。
    """
    with pytest.raises(ReasoningOutputError) as info:
        action()
    assert str(info.value) == code
    assert info.value.__cause__ is None
    return info.value


class _Clock:
    """テスト用の単調増加の時刻（ナノ秒）。移植元の AtomicLong の代わり。"""

    def __init__(self) -> None:
        """0 から始める。"""
        self.now = 0

    def __call__(self) -> int:
        """現在の時刻を返す。

        Returns
        -------
        int
            時刻（ナノ秒）。
        """
        return self.now


class _RecordingSleeper:
    """待ち時間を記録し、時刻を進める sleeper。"""

    def __init__(self, clock: _Clock) -> None:
        """進める時刻を受け取る。

        Parameters
        ----------
        clock : _Clock
            進める時刻。
        """
        self.clock = clock
        self.sleeps: list[int] = []

    def __call__(self, milliseconds: int) -> None:
        """待ち時間を記録し、時刻を進める。

        Parameters
        ----------
        milliseconds : int
            待ち時間（ミリ秒）。
        """
        self.sleeps.append(milliseconds)
        self.clock.now += milliseconds * NANOS_PER_MILLI


class _FailingOpen:
    """常に指定の例外で失敗する open の処理。呼ばれた回数を数える。"""

    def __init__(self, failure: Callable[[], OSError]) -> None:
        """投げる例外を作る処理を受け取る。

        Parameters
        ----------
        failure : Callable[[], OSError]
            投げる例外を作る処理。
        """
        self.failure = failure
        self.attempts = 0

    def __call__(self, path: Path) -> TextIO:
        """回数を数えて例外を投げる。

        Parameters
        ----------
        path : Path
            開くパス（使わない）。

        Returns
        -------
        TextIO
            返さない。

        Raises
        ------
        OSError
            受け取った処理で作った例外。
        """
        self.attempts += 1
        raise self.failure()


def _fixed_clock_after_first(later: int) -> Callable[[], int]:
    """1 回目は 0、2 回目以降は `later` を返す時刻を作る。

    Parameters
    ----------
    later : int
        2 回目以降の時刻（ナノ秒）。

    Returns
    -------
    Callable[[], int]
        時刻を返す処理。
    """
    calls = [0]

    def clock() -> int:
        """呼ばれた回数に応じて時刻を返す。

        Returns
        -------
        int
            時刻（ナノ秒）。
        """
        calls[0] += 1
        return 0 if calls[0] == 1 else later

    return clock


def _no_sleep(milliseconds: int) -> None:
    """待たない sleeper。

    Parameters
    ----------
    milliseconds : int
        待ち時間（使わない）。
    """


def _fixed_delay() -> int:
    """常に 100 ms を返す待ち時間。

    Returns
    -------
    int
        100。
    """
    return 100


class _ControlledWriter:
    """write・flush・close を失敗させられる書き込み先（移植元 ControlledBufferedWriter）。"""

    def __init__(self) -> None:
        """失敗なしで作る。"""
        self.pending = ""
        self.flushed = ""
        self.write_failure: str | None = None
        self.flush_failure: str | None = None
        self.close_failure: str | None = None

    def write(self, value: str) -> int:
        """書き込み待ちに足す。

        Parameters
        ----------
        value : str
            書く文字列。

        Returns
        -------
        int
            書いた文字数。

        Raises
        ------
        OSError
            write を失敗させているとき。
        """
        if self.write_failure is not None:
            raise OSError(self.write_failure)
        self.pending += value
        return len(value)

    def flush(self) -> None:
        """書き込み待ちを確定する。

        Raises
        ------
        OSError
            flush を失敗させているとき。
        """
        if self.flush_failure is not None:
            raise OSError(self.flush_failure)
        self.flushed += self.pending
        self.pending = ""

    def close(self) -> None:
        """flush して閉じる。

        Raises
        ------
        OSError
            close・flush を失敗させているとき。
        """
        if self.close_failure is not None:
            raise OSError(self.close_failure)
        self.flush()


def test_writes_mixed_typed_callbacks_as_canonical_lines_in_global_order(
    tmp_path: Path,
) -> None:
    """種類の違うコールバックを届いた順に正規の行で追記すること"""
    reasoning_file = tmp_path / "reasoning.txt"
    reasoning_file.write_text("seed\n", encoding="utf-8")
    reasoning = 'reason "quoted"\n雪'
    title = "title\\slash"
    content = "content\t’"

    sink = ReasoningOutputSink.open(str(reasoning_file))
    try:
        callbacks = sink.callbacks()
        callbacks.on_reasoning_delta(reasoning)
        callbacks.on_library_title_delta(title)
        callbacks.on_library_title_delta("   ")
        callbacks.on_library_content_delta(content)
        callbacks.on_library_content_delta(cast(str, None))
    finally:
        sink.close()

    raw = reasoning_file.read_text(encoding="utf-8")
    assert raw == (
        "seed\n"
        'data:{"type":"reasoning_delta","text":"reason \\"quoted\\"\\n雪"}\n'
        'data:{"type":"library_title_delta","text":"title\\\\slash"}\n'
        'data:{"type":"library_title_delta","text":"   "}\n'
        'data:{"type":"library_content_delta","text":"content\\t’"}\n'
    )
    event_lines = raw.split("\n")[1:5]
    assert [_event_fields(line)[0] for line in event_lines] == [
        "reasoning_delta",
        "library_title_delta",
        "library_title_delta",
        "library_content_delta",
    ]
    assert [_event_fields(line)[1] for line in event_lines] == [
        reasoning,
        title,
        "   ",
        content,
    ]


def test_preserves_whitespace_only_typed_callbacks_and_skips_empty_values(
    tmp_path: Path,
) -> None:
    """空白だけの差分は順に書き、空・None の差分は書かないこと"""
    reasoning_file = tmp_path / "reasoning.txt"
    reasoning_file.touch()

    sink = ReasoningOutputSink.open(str(reasoning_file))
    try:
        callbacks = sink.callbacks()
        callbacks.on_reasoning_delta("A")
        callbacks.on_library_title_delta(" ")
        callbacks.on_library_content_delta("\t")
        callbacks.on_reasoning_delta("\n")
        callbacks.on_library_title_delta("B")
        callbacks.on_reasoning_delta(cast(str, None))
        callbacks.on_library_title_delta("")
        callbacks.on_library_content_delta(cast(str, None))
    finally:
        sink.close()

    lines = reasoning_file.read_text(encoding="utf-8").split("\n")[:-1]
    assert len(lines) == 5
    assert [_event_fields(line)[0] for line in lines] == [
        "reasoning_delta",
        "library_title_delta",
        "library_content_delta",
        "reasoning_delta",
        "library_title_delta",
    ]
    texts = [_event_fields(line)[1] for line in lines]
    assert texts == ["A", " ", "\t", "\n", "B"]
    assert "".join(texts) == "A \t\nB"


def test_appends_reasoning_deltas_in_order_without_truncating_pre_created_file(
    tmp_path: Path, sse_lines: Callable[..., str]
) -> None:
    """事前に作られたファイルを切り詰めず、差分を順に追記すること"""
    reasoning_file = tmp_path / "reasoning.txt"
    reasoning_file.write_text("seed", encoding="utf-8")

    sink = ReasoningOutputSink.open(str(reasoning_file))
    try:
        sink.append_delta("alpha")
        sink.append_delta("beta")
    finally:
        sink.close()

    assert reasoning_file.read_text(encoding="utf-8") == "seed" + sse_lines(
        "alpha", "beta"
    )


def test_escapes_special_characters_in_sse_json(
    tmp_path: Path, sse_lines: Callable[..., str]
) -> None:
    """改行・引用符・Unicode を JSON としてエスケープして書くこと"""
    reasoning_file = tmp_path / "reasoning.txt"
    reasoning_file.touch()
    delta = "line1\nline2"
    quoted = 'quote " and unicode ’'

    sink = ReasoningOutputSink.open(str(reasoning_file))
    try:
        sink.append_delta(delta)
        sink.append_delta(quoted)
    finally:
        sink.close()

    assert reasoning_file.read_text(encoding="utf-8") == sse_lines(delta, quoted)


@pytest.mark.parametrize("skipped", ["", None])
def test_skips_empty_or_none_delta_without_writing_sse_lines(
    tmp_path: Path, sse_lines: Callable[..., str], skipped: str | None
) -> None:
    """空・None の差分は行を書かないこと"""
    reasoning_file = tmp_path / "reasoning.txt"
    reasoning_file.touch()

    sink = ReasoningOutputSink.open(str(reasoning_file))
    try:
        sink.append_delta(skipped)
        sink.append_delta("visible")
    finally:
        sink.close()

    assert reasoning_file.read_text(encoding="utf-8") == sse_lines("visible")


def test_fails_when_reasoning_file_was_not_pre_created(tmp_path: Path) -> None:
    """事前に作られていないファイルは開けず失敗すること"""
    missing = tmp_path / "missing.txt"

    with pytest.raises(ReasoningOutputError):
        ReasoningOutputSink.open(str(missing))


def test_recovers_when_pre_created_target_becomes_visible_after_initial_open_failure(
    tmp_path: Path, sse_lines: Callable[..., str]
) -> None:
    """最初に開けなくても、後からファイルが作られれば再試行で開けること"""
    target = tmp_path / "appears-after-open.txt"
    creator_failure: list[BaseException] = []

    def create_later() -> None:
        """少し待ってからファイルを作る。"""
        try:
            time.sleep(CREATOR_DELAY_SECONDS)
            target.touch(exist_ok=False)
        except OSError as e:
            creator_failure.append(e)

    creator = threading.Thread(target=create_later)
    creator.start()
    try:
        sink = ReasoningOutputSink.open(str(target))
        try:
            sink.append_delta("recovered")
        finally:
            sink.close()
    finally:
        creator.join()

    assert creator_failure == []
    assert target.read_text(encoding="utf-8") == sse_lines("recovered")


def test_initial_open_success_does_not_sample_or_sleep_or_emit_recovery_warning(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """初回で開ければ待ち時間を選ばず、待たず、回復の警告を出さないこと"""
    attempts: list[Path] = []
    samples: list[int] = []
    sleeps: list[int] = []

    def open_attempt(path: Path) -> TextIO:
        """回数を数えて書き込み先を返す。

        Parameters
        ----------
        path : Path
            開くパス。

        Returns
        -------
        TextIO
            メモリ上の書き込み先。
        """
        attempts.append(path)
        return StringIO()

    def retry_delay() -> int:
        """回数を数えて 50 ms を返す。

        Returns
        -------
        int
            50。
        """
        samples.append(1)
        return 50

    with caplog.at_level(logging.DEBUG, logger=SINK_LOGGER):
        sink = ReasoningOutputSink.open(
            "initial-success.txt", open_attempt, lambda: 0, sleeps.append, retry_delay
        )
        sink.close()

    assert len(attempts) == 1
    assert samples == []
    assert sleeps == []
    assert [r for r in caplog.records if r.levelno >= logging.WARNING] == []


def test_retries_with_independent_jitter_and_logs_cumulative_requested_wait(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """再試行ごとに待ち時間を選び直し、回復時に待ち時間の合計を警告に出すこと"""
    attempts = [0]
    samples = [0]
    clock = _Clock()
    sleeper = _RecordingSleeper(clock)

    def open_attempt(path: Path) -> TextIO:
        """2 回目までは失敗し、3 回目で書き込み先を返す。

        Parameters
        ----------
        path : Path
            開くパス。

        Returns
        -------
        TextIO
            メモリ上の書き込み先。

        Raises
        ------
        FileNotFoundError
            2 回目まで。
        """
        attempts[0] += 1
        if attempts[0] < 3:
            raise FileNotFoundError("C:\\secret\\jitter-recovery-target.txt")
        return StringIO()

    def retry_delay() -> int:
        """1 回目は 50 ms、それ以降は 150 ms を返す。

        Returns
        -------
        int
            待ち時間（ミリ秒）。
        """
        samples[0] += 1
        return 50 if samples[0] == 1 else 150

    with caplog.at_level(logging.DEBUG, logger=SINK_LOGGER):
        sink = ReasoningOutputSink.open(
            "jitter-recovery-target.txt", open_attempt, clock, sleeper, retry_delay
        )
        sink.close()

    assert attempts[0] == 3
    assert samples[0] == 2
    assert sleeper.sleeps == [50, 150]
    assert clock.now == 200_000_000
    warnings = [r for r in caplog.records if r.levelno >= logging.WARNING]
    assert [r.levelno for r in warnings] == [logging.WARNING]
    assert [r.getMessage() for r in warnings] == [
        "REASONING_OUTPUT_OPEN_RECOVERED attempts=3, approximate_wait_ms=200"
    ]


def test_does_not_sleep_sampled_jitter_delay_that_cannot_fully_fit_deadline() -> None:
    """選んだ待ち時間が期限に収まらなければ待たずに失敗すること"""
    opener = _FailingOpen(lambda: FileNotFoundError("jitter-deadline-secret"))
    samples: list[int] = []
    sleeps: list[int] = []

    def retry_delay() -> int:
        """回数を数えて 150 ms を返す。

        Returns
        -------
        int
            150。
        """
        samples.append(1)
        return 150

    _assert_terminal_code(
        "REASONING_OUTPUT_NOT_FOUND",
        lambda: ReasoningOutputSink.open(
            "jitter-deadline-target.txt",
            opener,
            _fixed_clock_after_first(1_900_000_000),
            sleeps.append,
            retry_delay,
        ),
    )

    assert opener.attempts == 1
    assert len(samples) == 1
    assert sleeps == []


def test_caps_retries_at_twenty_when_short_jitter_delays_leave_deadline_remaining() -> (
    None
):
    """短い待ち時間で期限が残っていても再試行は 20 回までであること"""
    opener = _FailingOpen(lambda: FileNotFoundError("jitter-retry-cap-secret"))
    clock = _Clock()
    sleeper = _RecordingSleeper(clock)
    samples: list[int] = []

    def retry_delay() -> int:
        """回数を数えて 50 ms を返す。

        Returns
        -------
        int
            50。
        """
        samples.append(1)
        return 50

    _assert_terminal_code(
        "REASONING_OUTPUT_NOT_FOUND",
        lambda: ReasoningOutputSink.open(
            "jitter-retry-cap-target.txt", opener, clock, sleeper, retry_delay
        ),
    )

    assert opener.attempts == 21
    assert len(samples) == 20
    assert sleeper.sleeps == [50] * 20
    assert clock.now == 1_000_000_000


def test_exhausts_at_twenty_retries_within_two_second_deadline() -> None:
    """2 秒の期限内で 20 回再試行して、パスを含まないコードで失敗すること"""
    opener = _FailingOpen(lambda: FileNotFoundError("C:\\secret\\missing-target.txt"))
    clock = _Clock()
    sleeper = _RecordingSleeper(clock)

    failure = _assert_terminal_code(
        "REASONING_OUTPUT_NOT_FOUND",
        lambda: ReasoningOutputSink.open(
            "missing-target.txt", opener, clock, sleeper, _fixed_delay
        ),
    )

    assert "secret" not in str(failure)
    assert "missing-target.txt" not in str(failure)
    assert opener.attempts == 21
    assert sleeper.sleeps == [100] * 20
    assert clock.now == 2_000_000_000


def test_does_not_sleep_past_monotonic_deadline() -> None:
    """期限を過ぎる待ちはせずに失敗すること"""
    opener = _FailingOpen(lambda: FileNotFoundError("deadline-secret"))
    sleeps: list[int] = []

    _assert_terminal_code(
        "REASONING_OUTPUT_NOT_FOUND",
        lambda: ReasoningOutputSink.open(
            "deadline-target.txt",
            opener,
            _fixed_clock_after_first(1_950_000_000),
            sleeps.append,
            _fixed_delay,
        ),
    )

    assert opener.attempts == 1
    assert sleeps == []


def test_does_not_attempt_another_open_after_sleep_overshoots_deadline() -> None:
    """待ちが期限を超えたら、もう開こうとしないこと"""
    opener = _FailingOpen(lambda: FileNotFoundError("overshoot-secret"))
    clock = _Clock()
    sleeps: list[int] = []

    def overshoot(milliseconds: int) -> None:
        """期限を超えた時刻まで進める。

        Parameters
        ----------
        milliseconds : int
            待ち時間。
        """
        sleeps.append(milliseconds)
        clock.now = 2_001_000_000

    _assert_terminal_code(
        "REASONING_OUTPUT_NOT_FOUND",
        lambda: ReasoningOutputSink.open(
            "overshoot-target.txt", opener, clock, overshoot, _fixed_delay
        ),
    )

    assert opener.attempts == 1
    assert len(sleeps) == 1


@pytest.mark.parametrize("path", [None, "   ", "\x00invalid-secret"])
def test_exposes_invalid_path_code_without_cause(path: str | None) -> None:
    """空・NUL を含むパスは INVALID_PATH だけの失敗になること"""
    _assert_terminal_code(
        "REASONING_OUTPUT_INVALID_PATH", lambda: ReasoningOutputSink.open(path)
    )


@pytest.mark.parametrize(
    ("code", "failure"),
    [
        (
            "REASONING_OUTPUT_NOT_FOUND",
            FileNotFoundError("C:\\secret\\missing-code.txt"),
        ),
        (
            "REASONING_OUTPUT_ACCESS_DENIED",
            PermissionError("C:\\secret\\denied-code.txt"),
        ),
        ("REASONING_OUTPUT_NOT_APPENDABLE", OSError("C:\\secret\\append-code.txt")),
    ],
)
def test_exposes_only_exact_sanitized_terminal_codes_without_cause(
    code: str, failure: OSError
) -> None:
    """開けなかった原因ごとに固定のコードだけの失敗になること"""
    opener = _FailingOpen(lambda: failure)

    raised = _assert_terminal_code(
        code,
        lambda: ReasoningOutputSink.open(
            "terminal-code.txt", opener, lambda: 0, _no_sleep, _fixed_delay
        ),
    )

    assert "secret" not in str(raised)


def test_raises_retry_interrupted_when_retry_sleep_is_interrupted() -> None:
    """再試行の待ちが割り込まれたら RETRY_INTERRUPTED だけの失敗になること"""
    opener = _FailingOpen(lambda: FileNotFoundError("interrupt-secret"))

    def interrupted(milliseconds: int) -> None:
        """割り込まれたことにする。

        Parameters
        ----------
        milliseconds : int
            待ち時間（使わない）。

        Raises
        ------
        InterruptedError
            常に。
        """
        raise InterruptedError("interrupt-secret")

    _assert_terminal_code(
        "REASONING_OUTPUT_RETRY_INTERRUPTED",
        lambda: ReasoningOutputSink.open(
            "interrupt-target.txt", opener, lambda: 0, interrupted, _fixed_delay
        ),
    )


def test_classifies_directory_open_failure_as_not_appendable(tmp_path: Path) -> None:
    """ディレクトリを指定したら NOT_APPENDABLE だけの失敗になること"""
    directory = tmp_path / "directory"
    directory.mkdir()

    _assert_terminal_code(
        "REASONING_OUTPUT_NOT_APPENDABLE",
        lambda: ReasoningOutputSink.open(str(directory)),
    )


def test_preserves_flushed_line_when_next_typed_callback_write_fails() -> None:
    """次の書き込みが失敗しても、flush 済みの行は残ること"""
    writer = _ControlledWriter()
    sink = ReasoningOutputSink(cast(TextIO, writer))
    sink.append_delta("kept")
    writer.write_failure = "credential-sentinel.invalid"

    with pytest.raises(ReasoningOutputError) as info:
        sink.callbacks().on_library_title_delta("not-flushed")
    sink.close()

    assert str(info.value) == "reasoning output write failed"
    assert "credential-sentinel.invalid" not in str(info.value)
    assert writer.flushed == KEPT_LINE


def test_preserves_flushed_line_when_next_typed_callback_flush_fails() -> None:
    """次の flush が失敗しても、flush 済みの行は残ること"""
    writer = _ControlledWriter()
    sink = ReasoningOutputSink(cast(TextIO, writer))
    sink.append_delta("kept")
    writer.flush_failure = "internal.example.invalid"

    with pytest.raises(ReasoningOutputError) as info:
        sink.callbacks().on_library_content_delta("not-committed")
    sink.close()

    assert str(info.value) == "reasoning output write failed"
    assert "internal.example.invalid" not in str(info.value)
    assert writer.flushed == KEPT_LINE


def test_close_failure_does_not_overwrite_primary_write_failure_or_flushed_line() -> (
    None
):
    """close の失敗で、書き込みの失敗や flush 済みの行が上書きされないこと"""
    writer = _ControlledWriter()
    sink = ReasoningOutputSink(cast(TextIO, writer))
    sink.append_delta("kept")
    writer.write_failure = "write-sentinel.invalid"
    writer.close_failure = "close-sentinel.invalid"

    with pytest.raises(ReasoningOutputError) as info:
        sink.callbacks().on_library_title_delta("not-written")
    sink.close()

    assert str(info.value) == "reasoning output write failed"
    assert "write-sentinel.invalid" not in str(info.value)
    assert "close-sentinel.invalid" not in str(info.value)
    assert writer.flushed == KEPT_LINE


def test_default_open_flushes_a_long_line_with_a_single_write(tmp_path: Path) -> None:
    """既定の開き方では、バッファより長い行でも 1 回の flush（1 回の write）で書かれること"""
    path = tmp_path / "stream.txt"
    path.touch()
    sink = ReasoningOutputSink.open(str(path))
    long_text = "あ" * 100_000  # UTF-8 で約 300 KB（標準のバッファ 8 KB より大きい）

    try:
        sink.append_delta(long_text)
        written = path.read_bytes()
    finally:
        sink.close()

    assert written.endswith(b"\n")
    assert written.count(b"\n") == 1
    assert json.loads(written.decode().removeprefix("data:"))["text"] == long_text
