"""ワークフローの入出力。"""

from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from waha_emulator.sessions import SlotFile
from waha_emulator.stream_file import StreamFile


class WorkflowError(Exception):
    """ワークフローの失敗。メッセージをそのまま `/result` の失敗理由にする。"""


@dataclass(frozen=True)
class WorkflowRequest:
    """ワークフローの 1 回の実行への入力。

    Attributes
    ----------
    service_id : str
        execute のサービス ID。
    params : Mapping[str, str]
        execute のクエリパラメータ（sessionid を除く）。
    inputs : Mapping[str, SlotFile]
        アップロードされた入力スロット。
    stream : StreamFile | None
        streamfilepath が指定されたときだけ開いて渡す（終端の書き込み用）。
    stream_allowed_dir : Path | None
        ストリームファイルを書いてよいディレクトリ（STREAM_ALLOWED_DIR）。
    """

    service_id: str
    params: Mapping[str, str]
    inputs: Mapping[str, SlotFile]
    stream: StreamFile | None
    stream_allowed_dir: Path | None = None


class Workflow(Protocol):
    """ワークフロー。"""

    async def run(self, request: WorkflowRequest) -> str:
        """ワークフローを実行し、outputfile の中身を返す。

        Parameters
        ----------
        request : WorkflowRequest
            入力。

        Returns
        -------
        str
            outputfile の中身。
        """
        ...
