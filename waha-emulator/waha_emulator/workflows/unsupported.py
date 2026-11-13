from waha_emulator.workflows.base import WorkflowError, WorkflowRequest


class UnsupportedWorkflow:
    """土台では動かさないワークフロー。`result` で「未対応」の失敗を返す。"""

    def __init__(self, name: str) -> None:
        """ワークフローの表示名を指定して作る。

        Parameters
        ----------
        name : str
            失敗メッセージに出すワークフローの名前。
        """
        self.name = name

    async def run(self, request: WorkflowRequest) -> str:
        """常に「未対応」の失敗にする。

        Parameters
        ----------
        request : WorkflowRequest
            ワークフローの実行要求。

        Returns
        -------
        str
            返らない（常に例外を送出する）。

        Raises
        ------
        WorkflowError
            常に送出する。
        """
        raise WorkflowError(
            f"{self.name}は未対応です（serviceId={request.service_id}）"
        )


LEARNING = UnsupportedWorkflow("学習")
SYNC = UnsupportedWorkflow("学習データの同期")
