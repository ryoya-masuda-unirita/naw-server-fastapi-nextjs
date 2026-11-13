from collections.abc import Mapping
from dataclasses import dataclass
from typing import Protocol

from waha_emulator.sessions import SlotFile
from waha_emulator.stream_file import StreamFile


class WorkflowError(Exception):
    """ワークフローの失敗。メッセージをそのまま `/result` の失敗理由にする。"""


@dataclass(frozen=True)
class WorkflowRequest:
    service_id: str
    # execute のクエリパラメータ（sessionid を除く）
    params: Mapping[str, str]
    # アップロードされた入力スロット
    inputs: Mapping[str, SlotFile]
    # streamfilepath が指定されたときだけ開いて渡す
    stream: StreamFile | None


class Workflow(Protocol):
    async def run(self, request: WorkflowRequest) -> str:
        """ワークフローを実行し、outputfile の中身を返す。"""
        ...
