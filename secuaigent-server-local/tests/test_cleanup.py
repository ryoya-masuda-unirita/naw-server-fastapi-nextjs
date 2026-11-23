import os
import time
from pathlib import Path

from app.services.stream.cleanup import cleanup_orphan_stream_files

HOUR = 3600


def test_cleanup_deletes_only_old_txt_files(tmp_path: Path) -> None:
    """最終更新が古い *.txt だけを削除し、新しいものや他の拡張子は残すこと"""
    old_txt = tmp_path / "old.txt"
    new_txt = tmp_path / "new.txt"
    old_log = tmp_path / "old.log"
    for file in (old_txt, new_txt, old_log):
        file.write_text("x")
    old_time = time.time() - 25 * HOUR
    os.utime(old_txt, (old_time, old_time))
    os.utime(old_log, (old_time, old_time))

    assert cleanup_orphan_stream_files(str(tmp_path), 24) == 1
    assert not old_txt.exists()
    assert new_txt.exists()
    assert old_log.exists()


def test_cleanup_missing_dir(tmp_path: Path) -> None:
    """出力先がなければ何もしないこと"""
    assert cleanup_orphan_stream_files(str(tmp_path / "none"), 24) == 0
