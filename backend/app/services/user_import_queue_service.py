import json

import aioboto3

from app.core.config import get_aws_settings


class UserImportQueueService:
    """ユーザーインポートジョブの受付をSQSに通知するサービス。

    移植元（Spring Boot）の`UserImportQueueService.java`と同じ
    `importJobId`/`tenantId`/`storageUrl`の3項目を持つJSONメッセージを送信する。
    """

    @staticmethod
    async def send_import_message(
        import_job_id: str, tenant_id: str, storage_url: str
    ) -> None:
        """インポートジョブの受付をSQSに送信する。

        Args:
            import_job_id: インポートジョブID。
            tenant_id: テナントID。
            storage_url: アップロード済みCSVの保存先URL。

        Raises:
            RuntimeError: `AWS_SQS_QUEUE_URL`が未設定の場合。
        """
        aws_settings = get_aws_settings()
        if not aws_settings.aws_sqs_queue_url:
            raise RuntimeError(
                "AWS_SQS_QUEUE_URLが設定されていません。"
                "ユーザーインポート機能を使うにはSQSキューURLの設定が必要です。"
            )
        message_body = json.dumps(
            {
                "importJobId": import_job_id,
                "tenantId": tenant_id,
                "storageUrl": storage_url,
            }
        )

        session = aioboto3.Session()
        async with session.client(
            "sqs",
            region_name=aws_settings.aws_region,
            endpoint_url=aws_settings.aws_endpoint_url,
            aws_access_key_id=aws_settings.aws_access_key_id,
            aws_secret_access_key=aws_settings.aws_secret_access_key,
        ) as client:
            await client.send_message(
                QueueUrl=aws_settings.aws_sqs_queue_url, MessageBody=message_body
            )
