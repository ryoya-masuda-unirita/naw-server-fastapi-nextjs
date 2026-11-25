"""ノードと線で組んだワークフローの保存場所（1 ワークフロー = 1 つの JSON ファイル）。

検証用の道具のため、データベースは持たない。人が読めて、差分が見え、
コピーや巻き戻しが簡単なことを優先する。
"""

import json
import logging
import os
import tempfile
from pathlib import Path
from typing import Any

from waha_emulator.studio.graph import GRAPH_ID_PATTERN

logger = logging.getLogger(__name__)

FILE_SUFFIX = ".json"
TEMP_PREFIX = ".tmp-"
JSON_INDENT = 2


class GraphStore:
    """保存ディレクトリのワークフローを読み書きする。"""

    def __init__(self, directory: Path) -> None:
        """保存ディレクトリを指定して作る（なければ作る）。

        Parameters
        ----------
        directory : Path
            保存ディレクトリ。
        """
        self._directory = directory
        self._directory.mkdir(parents=True, exist_ok=True)

    def _path(self, graph_id: str) -> Path:
        """ワークフローの ID から、保存先のパスを作る。

        Parameters
        ----------
        graph_id : str
            ワークフローの ID。

        Returns
        -------
        Path
            保存先のパス。

        Raises
        ------
        ValueError
            ID が安全な形でないとき（パスの組み立てに使うため、ここでも確かめる）。
        """
        if GRAPH_ID_PATTERN.fullmatch(graph_id) is None:
            raise ValueError(f"ワークフローの id が不正です: {graph_id}")
        return self._directory / f"{graph_id}{FILE_SUFFIX}"

    def exists(self, graph_id: str) -> bool:
        """保存されているかを返す。

        Parameters
        ----------
        graph_id : str
            ワークフローの ID。

        Returns
        -------
        bool
            保存されていれば True。
        """
        return self._path(graph_id).is_file()

    def load_all(self) -> list[tuple[str, Any]]:
        """保存されているワークフローを、ID の順にすべて読む。

        読めない・JSON でないファイルは、警告ログを出して読み飛ばす
        （他のワークフローは動かす）。

        Returns
        -------
        list[tuple[str, Any]]
            （ファイル名から取ったワークフローの ID、JSON の値）。
        """
        loaded: list[tuple[str, Any]] = []
        for path in sorted(self._directory.glob(f"*{FILE_SUFFIX}")):
            if path.name.startswith(TEMP_PREFIX):
                continue
            try:
                loaded.append((path.stem, json.loads(path.read_text(encoding="utf-8"))))
            except (OSError, ValueError) as e:
                logger.warning("Workflow file skipped: file=%s, error=%s", path.name, e)
        return loaded

    def write(self, graph_id: str, data: dict[str, Any]) -> None:
        """ワークフローを保存する。

        一時ファイルに書いてから置き換えるため、途中で止まっても元のファイルは壊れない。

        Parameters
        ----------
        graph_id : str
            ワークフローの ID。
        data : dict[str, Any]
            保存する JSON の値。

        Raises
        ------
        OSError
            書き込みに失敗したとき（元のファイルは残る）。
        """
        path = self._path(graph_id)
        fd, temp_name = tempfile.mkstemp(
            prefix=TEMP_PREFIX, suffix=FILE_SUFFIX, dir=self._directory
        )
        temp_path = Path(temp_name)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=JSON_INDENT)
                f.write("\n")
            os.replace(temp_path, path)
        except BaseException:
            temp_path.unlink(missing_ok=True)
            raise

    def delete(self, graph_id: str) -> None:
        """ワークフローの保存を消す。なければ何もしない。

        Parameters
        ----------
        graph_id : str
            ワークフローの ID。
        """
        self._path(graph_id).unlink(missing_ok=True)
