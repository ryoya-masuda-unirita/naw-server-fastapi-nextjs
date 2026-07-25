import asyncio
import csv
import io
import json
import logging
import uuid
from datetime import datetime, timedelta, timezone

import aioboto3
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import get_aws_settings
from app.core.file_storage import get_user_import_file_storage
from app.core.security import hash_password
from app.models.group import Group, GroupUser
from app.models.tenant import Tenant
from app.models.user import User, UserRole
from app.models.user_import_job import UserImportJobStatus
from app.repositories.group_user_repository import GroupUserRepository
from app.repositories.password_history_repository import PasswordHistoryRepository
from app.repositories.tenant_repository import TenantRepository
from app.repositories.user_import_job_repository import UserImportJobRepository
from app.repositories.user_repository import UserRepository
from app.services.user_import_service import UserImportService

logger = logging.getLogger(__name__)


class RetryableImportError(Exception):
    """一時的なエラーで、メッセージを削除せずSQSの再配信に任せるべきことを示す例外。"""


class UserImportListener:
    """SQSからユーザーインポートジョブのメッセージを受信し、実処理を行う。

    移植元（Spring Boot）の`UserImportListener`は`@SqsListener`によりアプリと
    同一プロセス内で常駐ポーリングされる。本クラスの`run_forever`はそれに相当する
    ループを担い、`process_import_message`が1メッセージ分の実処理を担う。
    """

    @staticmethod
    async def run_forever(session_maker: async_sessionmaker[AsyncSession]) -> None:
        """SQSをロングポーリングし続け、メッセージを受信するたびに処理する。

        Args:
            session_maker: メッセージ処理ごとに新しいDBセッションを作るためのファクトリ。

        Raises:
            RuntimeError: `AWS_SQS_QUEUE_URL`が未設定の場合。
        """
        aws_settings = get_aws_settings()
        if not aws_settings.aws_sqs_queue_url:
            raise RuntimeError(
                "AWS_SQS_QUEUE_URLが設定されていません。"
                "リスナーを有効にするにはSQSキューURLの設定が必要です。"
            )
        session = aioboto3.Session()
        async with session.client(
            "sqs",
            region_name=aws_settings.aws_region,
            endpoint_url=aws_settings.aws_endpoint_url,
            aws_access_key_id=aws_settings.aws_access_key_id,
            aws_secret_access_key=aws_settings.aws_secret_access_key,
        ) as client:
            while True:
                response = await client.receive_message(
                    QueueUrl=aws_settings.aws_sqs_queue_url,
                    MaxNumberOfMessages=1,
                    WaitTimeSeconds=20,
                )
                for message in response.get("Messages", []):
                    try:
                        async with session_maker() as db_session:
                            await UserImportListener.process_import_message(
                                message["Body"], db_session
                            )
                        await client.delete_message(
                            QueueUrl=aws_settings.aws_sqs_queue_url,
                            ReceiptHandle=message["ReceiptHandle"],
                        )
                    except RetryableImportError as exc:
                        # 一時的なエラー: メッセージを削除せず、可視性タイムアウト経過後の
                        # 再配信に任せる（AWS SQS側のDLQ設定に委ねる）。
                        logger.warning(
                            "インポート処理中に一時的なエラーが発生しました: %s", exc
                        )
                    except Exception:
                        logger.exception(
                            "インポート処理中に予期しないエラーが発生しました"
                        )

    @staticmethod
    async def process_import_message(message_body: str, session: AsyncSession) -> None:
        """SQSメッセージ1件分のユーザーインポート処理を行う。

        Args:
            message_body: SQSメッセージ本文（`importJobId`/`tenantId`/`storageUrl`を
                持つJSON文字列）。
            session: 非同期DBセッション。

        Raises:
            RetryableImportError: ストレージからのダウンロード等、一時的な要因で
                失敗し、リトライが必要な場合。
        """
        message = json.loads(message_body)
        import_job_id = message["importJobId"]
        tenant_id = message["tenantId"]
        storage_url = message["storageUrl"]

        job = await UserImportJobRepository.find_by_id(import_job_id, session)
        if job is None:
            raise ValueError(f"インポートジョブが見つかりません: {import_job_id}")

        if job.tenant_id != tenant_id:
            job.status = UserImportJobStatus.FAILED
            job.error_details = "テナントIDが一致しません"
            job.completed_at = datetime.now(timezone.utc)
            session.add(job)
            await session.commit()
            return

        if job.status in (UserImportJobStatus.COMPLETED, UserImportJobStatus.FAILED):
            # SQSの再配信・二重処理の防止
            return

        job.status = UserImportJobStatus.PROCESSING
        session.add(job)
        await session.commit()

        storage = get_user_import_file_storage()
        try:
            content = await storage.download(storage_url)
        except FileNotFoundError:
            # ストレージにオブジェクトが存在しない（既に処理済み・二重配信・別環境など）。
            # リトライしても復旧しないためFAILEDで終了する。
            job.status = UserImportJobStatus.FAILED
            job.error_details = (
                "ストレージにファイルが存在しません。既に処理済みであるか、"
                "別のプロセスによって削除された可能性があります。"
            )
            job.completed_at = datetime.now(timezone.utc)
            session.add(job)
            await session.commit()
            return
        except Exception as exc:
            raise RetryableImportError(
                f"ストレージからのファイル取得に失敗しました: {exc}"
            ) from exc

        tenant = await TenantRepository.find_by_id(tenant_id, session)
        if tenant is None:
            job.status = UserImportJobStatus.FAILED
            job.error_details = "テナントが見つかりません"
            job.completed_at = datetime.now(timezone.utc)
            session.add(job)
            await session.commit()
            return

        decode_errors: list[str] = []
        text = UserImportService._decode_csv(content, decode_errors)
        if decode_errors:
            # アップロード時点で検証済みのはずだが、万一デコードに失敗した場合は
            # 0件成功のCOMPLETEDとして握り潰さず、FAILEDとして扱う。
            job.status = UserImportJobStatus.FAILED
            job.error_details = "\n".join(decode_errors)
            job.completed_at = datetime.now(timezone.utc)
            session.add(job)
            await session.commit()
            return

        rows = list(csv.DictReader(io.StringIO(text)))
        row_errors = await UserImportListener._process_rows(rows, tenant, session)

        job.status = UserImportJobStatus.COMPLETED
        if row_errors:
            job.error_details = "\n".join(row_errors)
        job.completed_at = datetime.now(timezone.utc)
        session.add(job)
        await session.commit()

        try:
            await storage.delete(storage_url)
        except Exception:
            # ファイル削除の失敗は致命的ではないため、処理は継続する。
            logger.exception("ストレージのファイル削除に失敗しました: %s", storage_url)

    @staticmethod
    async def _process_rows(
        rows: list[dict[str, str]], tenant: Tenant, session: AsyncSession
    ) -> list[str]:
        """検証済みの行データを1行ずつユーザー登録・更新処理にかける。

        Args:
            rows: CSVから読み込んだ行データ一覧（アップロード時点で検証済み）。
            tenant: 対象テナント。
            session: 非同期DBセッション。

        Returns:
            行単位の処理エラー一覧。
        """
        all_group_ids = {
            group_id.strip()
            for row in rows
            for group_id in (row.get("groupIds") or "").split(",")
            if group_id.strip()
        }
        group_map: dict[str, Group] = {}
        if all_group_ids:
            result = await session.execute(
                select(Group).where(
                    Group.tenant_id == tenant.id, Group.id.in_(all_group_ids)
                )
            )
            group_map = {group.id: group for group in result.scalars().all()}

        all_login_ids = {(row.get("login_id") or "").strip() for row in rows}
        user_map = await UserRepository.find_by_login_ids(
            all_login_ids, tenant.id, session
        )

        errors: list[str] = []
        for index, row in enumerate(rows, start=2):
            await UserImportListener._process_row(
                row, tenant, index, group_map, user_map, errors, session
            )
        return errors

    @staticmethod
    async def _process_row(
        row: dict[str, str],
        tenant: Tenant,
        row_number: int,
        group_map: dict[str, Group],
        user_map: dict[str, User],
        errors: list[str],
        session: AsyncSession,
    ) -> None:
        """1行分のユーザー登録・更新・グループ所属の付け替えを行う。

        行内の処理はSAVEPOINTで囲み、この行だけの失敗が他の行の処理結果や
        既にコミット待ちの変更を巻き込まないようにする。
        """
        login_id = (row.get("login_id") or "").strip()
        name = (row.get("name") or "").strip()
        password = (row.get("password") or "").strip()
        role = UserRole((row.get("role") or "").strip().upper())
        create_login_key = (row.get("createLoginKey") or "").strip().lower()

        try:
            async with session.begin_nested():
                user = user_map.get(login_id)
                if user:
                    user.name = name
                    user.role = role
                    if create_login_key == "true":
                        user.login_key = uuid.uuid4().hex
                    elif create_login_key == "false":
                        user.login_key = None
                else:
                    login_key = uuid.uuid4().hex if create_login_key == "true" else None
                    user = User(
                        login_id=login_id,
                        tenant_id=tenant.id,
                        name=name,
                        role=role,
                        login_key=login_key,
                        is_required_password_reset=True,
                    )
                    session.add(user)
                    await session.flush()
                    user_map[login_id] = user
                    expired_at = datetime.now(timezone.utc) + timedelta(
                        days=tenant.pw_validity_period_days
                    )
                    await PasswordHistoryRepository.save(
                        user.id,
                        tenant.id,
                        hash_password(password),
                        session,
                        expired_at=expired_at,
                    )
                session.add(user)
                await session.flush()

                await session.execute(
                    delete(GroupUser).where(
                        GroupUser.tenant_id == tenant.id, GroupUser.user_id == user.id
                    )
                )
                group_ids = row.get("groupIds") or ""
                if group_ids:
                    for group_id in group_ids.split(","):
                        group_id = group_id.strip()
                        if not group_id:
                            continue
                        if group_id not in group_map:
                            errors.append(
                                f"行{row_number}: グループID '{group_id}' は存在しません"
                            )
                            continue
                        GroupUserRepository.add(group_id, tenant.id, user.id, session)
                await session.flush()
        except Exception as exc:
            errors.append(f"行{row_number}: ユーザーの登録に失敗しました: {exc}")


def start_listener_task(
    session_maker: async_sessionmaker[AsyncSession],
) -> asyncio.Task | None:
    """設定に応じてリスナーのバックグラウンドタスクを起動する。

    Args:
        session_maker: メッセージ処理ごとに新しいDBセッションを作るためのファクトリ。

    Returns:
        起動したタスク。`aws_sqs_listener_enabled=false`の場合は起動せず`None`を返す。
    """
    if not get_aws_settings().aws_sqs_listener_enabled:
        return None
    return asyncio.create_task(UserImportListener.run_forever(session_maker))
