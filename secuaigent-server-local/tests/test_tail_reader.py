from pathlib import Path

from app.services.stream.tail_reader import StreamFileTailReader, TerminalType


def test_line_delimited_format(tmp_path: Path) -> None:
    """空行のない 1 行形式（data: 行のみ）もイベントとして取り出すこと"""
    file = tmp_path / "stream.sse"
    file.write_text(
        'data:{"type":"reasoning_delta","text":"Hello"}\n'
        'data:{"type":"reasoning_delta","text":" world"}\n'
        'data:{"type":"completed"}\n',
        encoding="utf-8",
    )
    result = StreamFileTailReader().read_new(file)
    assert len(result.chunks) == 3
    assert result.terminal_reached
    assert result.terminal_type == TerminalType.COMPLETED


def test_complete_events_and_completed(tmp_path: Path) -> None:
    """空行区切りのイベントを取り出し、追記分だけを読んで completed を検出すること"""
    file = tmp_path / "stream.sse"
    file.write_text('data:{"type":"reasoning_delta","text":"Hello"}\n\n')
    reader = StreamFileTailReader()
    first = reader.read_new(file)
    assert len(first.chunks) == 1
    assert not first.terminal_reached
    assert "reasoning_delta" in first.chunks[0]

    with file.open("a") as f:
        f.write('data:{"type":"completed"}\n\n')
    second = reader.read_new(file)
    assert second.chunks == ['data:{"type":"completed"}\n\n']
    assert second.terminal_type == TerminalType.COMPLETED
    assert second.new_offset == file.stat().st_size


def test_buffers_incomplete_event(tmp_path: Path) -> None:
    """書き込み途中のイベントはバッファに残し、続きが来たら取り出すこと"""
    file = tmp_path / "stream.sse"
    file.write_text('data:{"type":"reasoning_delta","text":"Hel')
    reader = StreamFileTailReader()
    assert reader.read_new(file).chunks == []
    with file.open("a") as f:
        f.write('lo"}\n\n')
    result = reader.read_new(file)
    assert result.chunks == ['data:{"type":"reasoning_delta","text":"Hello"}\n\n']


def test_detects_error_event(tmp_path: Path) -> None:
    """error イベントを終端（ERROR）として検出すること"""
    file = tmp_path / "stream.sse"
    file.write_text('data:{"type":"error","message":"boom"}\n\n')
    result = StreamFileTailReader().read_new(file)
    assert result.terminal_reached
    assert result.terminal_type == TerminalType.ERROR


def test_missing_file(tmp_path: Path) -> None:
    """ファイルがまだなければ何も返さないこと"""
    result = StreamFileTailReader(initial_offset=5).read_new(tmp_path / "none.txt")
    assert result.chunks == []
    assert result.new_offset == 5
    assert not result.terminal_reached


def test_split_multibyte_character(tmp_path: Path) -> None:
    """マルチバイト文字の途中で読み切っても文字化けしないこと"""
    file = tmp_path / "stream.sse"
    encoded = 'data:{"type":"reasoning_delta","text":"日本語"}\n\n'.encode()
    cut = encoded.index("本".encode()) + 1
    file.write_bytes(encoded[:cut])
    reader = StreamFileTailReader()
    assert reader.read_new(file).chunks == []
    with file.open("ab") as f:
        f.write(encoded[cut:])
    assert reader.read_new(file).chunks == [encoded.decode()]
