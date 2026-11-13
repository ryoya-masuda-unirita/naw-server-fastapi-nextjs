from waha_emulator.workflows.base import WorkflowError, WorkflowRequest


class UnsupportedWorkflow:
    """土台では動かさないワークフロー。`result` で「未対応」の失敗を返す。"""

    def __init__(self, name: str) -> None:
        self.name = name

    async def run(self, request: WorkflowRequest) -> str:
        raise WorkflowError(
            f"{self.name}は未対応です（serviceId={request.service_id}）"
        )


LEARNING = UnsupportedWorkflow("学習")
SYNC = UnsupportedWorkflow("学習データの同期")
