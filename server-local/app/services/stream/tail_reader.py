import json
from dataclasses import dataclass, field
from enum import StrEnum
from pathlib import Path

from app.schemas.sse import DATA_PREFIX, EVENT_DELIMITER


class TerminalType(StrEnum):
    COMPLETED = "COMPLETED"
    ERROR = "ERROR"


@dataclass(frozen=True)
class ReadResult:
    chunks: list[str] = field(default_factory=list)
    new_offset: int = 0
    terminal_reached: bool = False
    terminal_type: TerminalType | None = None


class StreamFileTailReader:
    """移植元 StreamFileTailReader の移植。

    Waha! が追記していくストリームファイルを、前回読んだバイト位置から読み進める。
    Waha! は空行区切りの SSE 形式と、`data:` 行のみの 1 行形式の両方を書くため、
    両方をイベントとして取り出す。
    """

    def __init__(self, initial_offset: int = 0) -> None:
        self.offset = initial_offset
        self._buffer = ""
        # マルチバイト文字の途中で読み切った場合に備え、デコード途中のバイトを持ち越す
        self._pending_bytes = b""

    def read_new(self, path: Path) -> ReadResult:
        if not path.exists():
            return ReadResult(new_offset=self.offset)
        file_length = path.stat().st_size
        if file_length <= self.offset:
            return ReadResult(new_offset=self.offset)

        with path.open("rb") as f:
            f.seek(self.offset)
            data = f.read(file_length - self.offset)
        self.offset += len(data)
        self._buffer += self._decode(data)
        return self._extract_complete_events()

    def _decode(self, data: bytes) -> str:
        raw = self._pending_bytes + data
        try:
            text = raw.decode("utf-8")
            self._pending_bytes = b""
            return text
        except UnicodeDecodeError as e:
            # 末尾の不完全な文字だけを次回に回し、それ以外の壊れたバイトは置換する
            if e.start >= len(raw) - 3 and e.reason == "unexpected end of data":
                self._pending_bytes = raw[e.start :]
                return raw[: e.start].decode("utf-8", errors="replace")
            self._pending_bytes = b""
            return raw.decode("utf-8", errors="replace")

    def _extract_complete_events(self) -> ReadResult:
        chunks: list[str] = []
        terminal_type: TerminalType | None = None

        while (index := self._buffer.find(EVENT_DELIMITER)) >= 0:
            end = index + len(EVENT_DELIMITER)
            block = self._buffer[:end]
            self._buffer = self._buffer[end:]
            chunks.append(block)
            terminal_type = _detect_terminal_type(block) or terminal_type

        # 空行で区切られていない 1 行形式（`data:{...}\n`）も 1 イベントとして扱う。
        # 改行で終わっていない最後の行は書き込み途中の可能性があるので残す。
        line_start = 0
        while (newline := self._buffer.find("\n", line_start)) >= 0:
            line = self._buffer[line_start:newline]
            line_start = newline + 1
            if not line.startswith(DATA_PREFIX):
                continue
            block = line + EVENT_DELIMITER
            chunks.append(block)
            terminal_type = _detect_terminal_type(block) or terminal_type
        self._buffer = self._buffer[line_start:]

        return ReadResult(
            chunks=chunks,
            new_offset=self.offset,
            terminal_reached=terminal_type is not None,
            terminal_type=terminal_type,
        )


def _detect_terminal_type(event_block: str) -> TerminalType | None:
    for line in event_block.split("\n"):
        if not line.startswith(DATA_PREFIX):
            continue
        payload = line[len(DATA_PREFIX) :].strip()
        if not payload:
            continue
        try:
            node = json.loads(payload)
        except json.JSONDecodeError:
            # 書き込み途中・JSON 以外のペイロードは終端判定の対象外
            continue
        event_type = node.get("type") if isinstance(node, dict) else None
        if not isinstance(event_type, str):
            continue
        if event_type == "completed":
            return TerminalType.COMPLETED
        if event_type == "error":
            return TerminalType.ERROR
        return None
    return None


def extract_data_payload(event_block: str) -> str | None:
    """イベントブロックの最初の `data:` 行のペイロードを取り出す。"""
    for line in event_block.split("\n"):
        if line.startswith(DATA_PREFIX):
            return line[len(DATA_PREFIX) :].strip()
    return None
