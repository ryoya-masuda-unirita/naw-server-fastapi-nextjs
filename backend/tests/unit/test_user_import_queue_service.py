import json
from unittest.mock import patch

from app.services.user_import_queue_service import UserImportQueueService


class _FakeSqsClient:
    """SQS クライアントのテスト用フェイク"""

    def __init__(self) -> None:
        """送信記録を初期化する。"""
        self.send_message_calls: list[dict] = []

    async def __aenter__(self) -> "_FakeSqsClient":
        """コンテキストに入り、自身を返す。

        Returns
        -------
        _FakeSqsClient
            自身。
        """
        return self

    async def __aexit__(self, *args: object) -> None:
        """コンテキストを抜ける。

        Parameters
        ----------
        *args : object
            例外情報（使用しない）。
        """
        return None

    async def send_message(self, QueueUrl: str, MessageBody: str) -> None:
        """送信内容を記録する。

        Parameters
        ----------
        QueueUrl : str
            送信先のキュー URL。
        MessageBody : str
            送信するメッセージ本文。
        """
        self.send_message_calls.append(
            {"QueueUrl": QueueUrl, "MessageBody": MessageBody}
        )


class _FakeSession:
    """aioboto3 のセッションのテスト用フェイク"""

    def __init__(self, client: _FakeSqsClient) -> None:
        """フェイクのクライアントを保持する。

        Parameters
        ----------
        client : _FakeSqsClient
            返すフェイククライアント。
        """
        self._client = client

    def client(self, service_name: str, **kwargs: object) -> _FakeSqsClient:
        """フェイクの SQS クライアントを返す。

        Parameters
        ----------
        service_name : str
            サービス名（sqs であること）。
        **kwargs : object
            クライアント生成の引数（使用しない）。

        Returns
        -------
        _FakeSqsClient
            フェイクのクライアント。
        """
        assert service_name == "sqs"
        return self._client


class TestUserImportQueueService:
    """ユーザーインポートのキューサービスのテスト"""

    async def test_send_import_message_sends_expected_json_body(self) -> None:
        """SQSへの送信メッセージがimportJobId/tenantId/storageUrlを持つJSONであること"""
        fake_client = _FakeSqsClient()
        with patch(
            "app.services.user_import_queue_service.aioboto3.Session",
            return_value=_FakeSession(fake_client),
        ):
            await UserImportQueueService.send_import_message(
                "job-1", "tenant-1", "s3://bucket/tenant-1/job-1_users.csv"
            )

        assert len(fake_client.send_message_calls) == 1
        sent_body = json.loads(fake_client.send_message_calls[0]["MessageBody"])
        assert sent_body == {
            "importJobId": "job-1",
            "tenantId": "tenant-1",
            "storageUrl": "s3://bucket/tenant-1/job-1_users.csv",
        }
