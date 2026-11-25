import json
import os
from pathlib import Path

import pytest

from tests.studio_support import graph_data
from waha_emulator.studio.store import GraphStore


def test_store_write_then_load_all(tmp_path: Path) -> None:
    """保存したワークフローを、ID の順に読み直せること"""
    store = GraphStore(tmp_path)
    store.write("b", graph_data("b"))
    store.write("a", graph_data("a"))

    loaded = store.load_all()

    assert [graph_id for graph_id, _ in loaded] == ["a", "b"]
    assert loaded[0][1] == graph_data("a")


def test_store_creates_missing_directory(tmp_path: Path) -> None:
    """保存先のディレクトリがなければ作ること"""
    GraphStore(tmp_path / "nested" / "workflows")

    assert (tmp_path / "nested" / "workflows").is_dir()


def test_store_saved_file_is_readable_json(tmp_path: Path) -> None:
    """保存したファイルが、日本語がそのまま読める JSON であること"""
    GraphStore(tmp_path).write("wf-1", graph_data("wf-1"))

    text = (tmp_path / "wf-1.json").read_text(encoding="utf-8")

    assert "ワークフロー wf-1" in text
    assert json.loads(text)["id"] == "wf-1"


def test_store_exists_and_delete(tmp_path: Path) -> None:
    """保存の有無を調べられ、削除できること。なくても削除は失敗しないこと"""
    store = GraphStore(tmp_path)
    store.write("wf-1", graph_data("wf-1"))
    assert store.exists("wf-1")

    store.delete("wf-1")
    store.delete("wf-1")

    assert not store.exists("wf-1")


def test_store_skips_broken_file(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    """壊れたファイルは警告を出して読み飛ばし、他のファイルは読めること"""
    store = GraphStore(tmp_path)
    store.write("ok", graph_data("ok"))
    (tmp_path / "broken.json").write_text("{not json", encoding="utf-8")

    loaded = store.load_all()

    assert [graph_id for graph_id, _ in loaded] == ["ok"]
    assert "broken.json" in caplog.text


def test_store_write_keeps_old_file_on_failure(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """置き換えに失敗しても元のファイルが残り、一時ファイルが残らないこと"""
    store = GraphStore(tmp_path)
    store.write("wf-1", graph_data("wf-1"))

    def fail(src: object, dst: object) -> None:
        raise OSError("disk full")

    monkeypatch.setattr(os, "replace", fail)
    with pytest.raises(OSError, match="disk full"):
        store.write("wf-1", graph_data("wf-1", service_ids=["changed"]))
    monkeypatch.undo()

    assert store.load_all()[0][1]["serviceIds"] == ["wf-1"]
    assert [p.name for p in tmp_path.iterdir()] == ["wf-1.json"]


@pytest.mark.parametrize("graph_id", ["../escape", "A", "a/b", "", "x" * 65])
def test_store_rejects_unsafe_id(tmp_path: Path, graph_id: str) -> None:
    """パスの組み立てに使う ID が安全な形でないと、書き込まないこと"""
    store = GraphStore(tmp_path)

    with pytest.raises(ValueError, match="id が不正"):
        store.write(graph_id, {})
    assert list(tmp_path.iterdir()) == []
