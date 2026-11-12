from pathlib import Path

import pytest

from waha_emulator.stream_file import StreamFile, StreamFileError


def test_write_event_appends_single_line(tmp_path: Path) -> None:
    """`data:` の直後に空白を入れず、1 行の JSON で追記すること（日本語はそのまま）"""
    path = tmp_path / "stream.txt"
    path.write_text("先頭\n", encoding="utf-8")

    stream = StreamFile.open(str(path), None)
    stream.write_event({"type": "text_delta", "text": "改行\nを含む"})
    stream.close()

    assert path.read_text(encoding="utf-8") == (
        '先頭\ndata:{"type":"text_delta","text":"改行\\nを含む"}\n'
    )


def test_open_requires_existing_file(tmp_path: Path) -> None:
    """ファイルがなければ作らずにエラーにすること"""
    path = tmp_path / "missing.txt"

    with pytest.raises(StreamFileError, match="ありません"):
        StreamFile.open(str(path), None)
    assert not path.exists()


@pytest.mark.parametrize("relative", ["../outside.txt", "sub/../../outside.txt"])
def test_open_rejects_path_outside_allowed_dir(tmp_path: Path, relative: str) -> None:
    """許可ディレクトリの外（`..` で出るものを含む）はエラーにすること"""
    allowed = tmp_path / "allowed"
    (allowed / "sub").mkdir(parents=True)
    (tmp_path / "outside.txt").touch()

    with pytest.raises(StreamFileError, match="外"):
        StreamFile.open(str(allowed / relative), allowed)


def test_open_allows_path_inside_allowed_dir(tmp_path: Path) -> None:
    """許可ディレクトリの中のファイルは開けること"""
    path = tmp_path / "stream.txt"
    path.touch()

    StreamFile.open(str(path), tmp_path).close()
