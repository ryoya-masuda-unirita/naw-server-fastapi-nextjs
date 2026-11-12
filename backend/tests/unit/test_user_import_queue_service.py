import json
from unittest.mock import patch

from app.services.user_import_queue_service import UserImportQueueService


class _FakeSqsClient:
    def __init__(self) -> None:
        self.send_message_calls: list[dict] = []

    async def __aenter__(self) -> "_FakeSqsClient":
        return self

    async def __aexit__(self, *args: object) -> None:
        return None

    async def send_message(self, QueueUrl: str, MessageBody: str) -> None:
        self.send_message_calls.append(
            {"QueueUrl": QueueUrl, "MessageBody": MessageBody}
        )


class _FakeSession:
    def __init__(self, client: _FakeSqsClient) -> None:
        self._client = client

    def client(self, service_name: str, **kwargs: object) -> _FakeSqsClient:
        assert service_name == "sqs"
        return self._client


class TestUserImportQueueService:
    async def test_send_import_message_sends_expected_json_body(self):
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
