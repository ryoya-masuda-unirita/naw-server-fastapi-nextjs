import json
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from sqlalchemy import select

from app.models.group import Group, GroupUser
from app.models.password_history import PasswordHistory
from app.models.tenant import Tenant
from app.models.user import User, UserRole
from app.models.user_import_job import UserImportJob, UserImportJobStatus
from app.services.user_import_listener import RetryableImportError, UserImportListener
from sqlalchemy.ext.asyncio import AsyncSession


@pytest.fixture
async def listener_tenant(session: AsyncSession) -> Tenant:
    """テスト用テナント"""
    tenant = Tenant(
        id="tenant-listener-test",
        name="Listener Test Tenant",
        owner="admin",
        pw_policy_min_length=8,
        pw_policy_use_uppercase=True,
        pw_policy_use_lowercase=True,
        pw_policy_use_digits=True,
        pw_policy_use_symbols=True,
        pw_policy_valid_symbols="!@#$",
        pw_validity_period_days=90,
        pw_histories_limit=3,
    )
    session.add(tenant)
    await session.commit()
    await session.refresh(tenant)
    return tenant


@pytest.fixture
async def listener_job(session: AsyncSession, listener_tenant: Tenant) -> UserImportJob:
    """処理待ち（PENDING）のインポートジョブ"""
    job = UserImportJob(
        tenant_id=listener_tenant.id,
        status=UserImportJobStatus.PENDING,
        file_name="users.csv",
        storage_url="s3://test-bucket/tenant-listener-test/job_users.csv",
    )
    session.add(job)
    await session.commit()
    await session.refresh(job)
    return job


def _message_body(job: UserImportJob, tenant_id: str | None = None) -> str:
    """リスナーに渡す SQS メッセージ本文を作る

    Parameters
    ----------
    job : UserImportJob
        対象のインポートジョブ
    tenant_id : str | None
        メッセージに入れるテナントID。None の場合はジョブのテナントID

    Returns
    -------
    str
        JSON 形式のメッセージ本文
    """
    return json.dumps(
        {
            "importJobId": job.id,
            "tenantId": tenant_id or job.tenant_id,
            "storageUrl": job.storage_url,
        }
    )


@pytest.mark.asyncio
class TestUserImportListener:
    """ユーザーインポートリスナーのテスト"""

    async def test_process_import_message_completes_job_on_success(
        self,
        session: AsyncSession,
        listener_tenant: Tenant,
        listener_job: UserImportJob,
    ) -> None:
        """正常なメッセージでユーザーが登録されジョブがCOMPLETEDになること"""
        csv_content = (
            "login_id,name,password,role\nnew-import,New Import,Pass123!,USER\n"
        )
        fake_storage = AsyncMock()
        fake_storage.download.return_value = csv_content.encode()

        with patch(
            "app.services.user_import_listener.get_user_import_file_storage",
            return_value=fake_storage,
        ):
            await UserImportListener.process_import_message(
                _message_body(listener_job), session
            )

        await session.refresh(listener_job)
        assert listener_job.status == UserImportJobStatus.COMPLETED

        user = (
            (await session.execute(select(User).where(User.login_id == "new-import")))  # type: ignore[arg-type]
            .scalars()
            .one()
        )
        assert user.name == "New Import"
        assert user.login_key_hash is None
        fake_storage.delete.assert_awaited_once_with(listener_job.storage_url)

    async def test_process_import_message_fails_job_on_tenant_id_mismatch(
        self, session: AsyncSession, listener_job: UserImportJob
    ) -> None:
        """テナントIDが一致しない場合ジョブがFAILEDになること"""
        await UserImportListener.process_import_message(
            _message_body(listener_job, tenant_id="other-tenant"), session
        )

        await session.refresh(listener_job)
        assert listener_job.status == UserImportJobStatus.FAILED
        assert listener_job.error_details == "テナントIDが一致しません"

    async def test_process_import_message_skips_already_finished_job(
        self, session: AsyncSession, listener_job: UserImportJob
    ) -> None:
        """既にCOMPLETED/FAILEDのジョブはスキップされること"""
        listener_job.status = UserImportJobStatus.COMPLETED
        session.add(listener_job)
        await session.commit()

        fake_storage = AsyncMock()
        with patch(
            "app.services.user_import_listener.get_user_import_file_storage",
            return_value=fake_storage,
        ):
            await UserImportListener.process_import_message(
                _message_body(listener_job), session
            )

        fake_storage.download.assert_not_awaited()

    async def test_process_import_message_raises_for_retryable_storage_error(
        self, session: AsyncSession, listener_job: UserImportJob
    ) -> None:
        """ストレージ取得失敗時はRetryableImportErrorを送出しジョブはPROCESSINGのままであること"""
        fake_storage = AsyncMock()
        fake_storage.download.side_effect = TimeoutError("network error")

        with patch(
            "app.services.user_import_listener.get_user_import_file_storage",
            return_value=fake_storage,
        ):
            with pytest.raises(RetryableImportError):
                await UserImportListener.process_import_message(
                    _message_body(listener_job), session
                )

        await session.refresh(listener_job)
        assert listener_job.status == UserImportJobStatus.PROCESSING

    async def test_process_import_message_fails_job_when_storage_object_missing(
        self, session: AsyncSession, listener_job: UserImportJob
    ) -> None:
        """ストレージにオブジェクトが存在しない場合はリトライせずFAILEDにすること"""
        fake_storage = AsyncMock()
        fake_storage.download.side_effect = FileNotFoundError(listener_job.storage_url)

        with patch(
            "app.services.user_import_listener.get_user_import_file_storage",
            return_value=fake_storage,
        ):
            await UserImportListener.process_import_message(
                _message_body(listener_job), session
            )

        await session.refresh(listener_job)
        assert listener_job.status == UserImportJobStatus.FAILED
        fake_storage.delete.assert_not_awaited()

    async def test_process_import_message_fails_job_on_undecodable_content(
        self, session: AsyncSession, listener_job: UserImportJob
    ) -> None:
        """CSVの文字コードがデコードできない場合、0件成功で握り潰さずFAILEDにすること"""
        fake_storage = AsyncMock()
        # UTF-8/Shift-JISのいずれでもデコードできないバイト列
        fake_storage.download.return_value = b"\xff\xfe\x00\x81"

        with patch(
            "app.services.user_import_listener.get_user_import_file_storage",
            return_value=fake_storage,
        ):
            await UserImportListener.process_import_message(
                _message_body(listener_job), session
            )

        await session.refresh(listener_job)
        assert listener_job.status == UserImportJobStatus.FAILED
        assert "文字コード" in listener_job.error_details  # type: ignore[operator]

    async def test_process_import_message_records_row_error_and_continues(
        self,
        session: AsyncSession,
        listener_tenant: Tenant,
        listener_job: UserImportJob,
    ) -> None:
        """1行のグループID不正エラーが他の行の処理を止めないこと"""
        group = Group(tenant_id=listener_tenant.id, name="Listener Group")
        session.add(group)
        await session.commit()
        await session.refresh(group)

        csv_content = (
            "login_id,name,password,role,groupIds\n"
            "listener-ok,Listener Ok,Pass123!,USER,\n"
            "listener-bad,Listener Bad,Pass123!,USER,not-a-real-group\n"
        )
        fake_storage = AsyncMock()
        fake_storage.download.return_value = csv_content.encode()

        with patch(
            "app.services.user_import_listener.get_user_import_file_storage",
            return_value=fake_storage,
        ):
            await UserImportListener.process_import_message(
                _message_body(listener_job), session
            )

        await session.refresh(listener_job)
        assert listener_job.status == UserImportJobStatus.COMPLETED
        assert "行3" in listener_job.error_details  # type: ignore[operator]

        ok_user = (
            (await session.execute(select(User).where(User.login_id == "listener-ok")))  # type: ignore[arg-type]
            .scalars()
            .one_or_none()
        )
        assert ok_user is not None

        bad_user = (
            (await session.execute(select(User).where(User.login_id == "listener-bad")))  # type: ignore[arg-type]
            .scalars()
            .one_or_none()
        )
        assert bad_user is not None

    async def test_process_import_message_replaces_group_memberships(
        self,
        session: AsyncSession,
        listener_tenant: Tenant,
        listener_job: UserImportJob,
    ) -> None:
        """CSVのgroupIdsで既存のグループ所属がCSV指定の内容に置き換わること"""
        old_group = Group(tenant_id=listener_tenant.id, name="Old Group")
        new_group = Group(tenant_id=listener_tenant.id, name="New Group")
        user = User(
            id=uuid4(),
            tenant_id=listener_tenant.id,
            login_id="group-import",
            name="Group Import",
            role=UserRole.USER,
            is_required_password_reset=False,
        )
        session.add_all([old_group, new_group, user])
        await session.commit()
        session.add(
            GroupUser(
                group_id=old_group.id, tenant_id=listener_tenant.id, user_id=user.id
            )
        )
        await session.commit()

        csv_content = (
            "login_id,name,password,role,groupIds\n"
            f"group-import,Group Updated,Pass123!,USER,{new_group.id}\n"
        )
        fake_storage = AsyncMock()
        fake_storage.download.return_value = csv_content.encode()

        with patch(
            "app.services.user_import_listener.get_user_import_file_storage",
            return_value=fake_storage,
        ):
            await UserImportListener.process_import_message(
                _message_body(listener_job), session
            )

        group_ids = (
            (
                await session.execute(
                    select(GroupUser.group_id).where(GroupUser.user_id == user.id)  # type: ignore[call-overload]
                )
            )
            .scalars()
            .all()
        )
        assert group_ids == [new_group.id]

    async def test_process_import_message_updates_existing_user_without_password_change(
        self,
        session: AsyncSession,
        listener_tenant: Tenant,
        listener_job: UserImportJob,
    ) -> None:
        """既存ユーザーの更新時は名前・ロールのみ更新されパスワード履歴は増えないこと"""
        from app.core.security import hash_password

        user = User(
            id=uuid4(),
            tenant_id=listener_tenant.id,
            login_id="existing-import",
            name="Before",
            role=UserRole.USER,
            is_required_password_reset=False,
        )
        session.add(user)
        await session.flush()
        session.add(
            PasswordHistory(
                tenant_id=listener_tenant.id,
                user_id=user.id,
                password=hash_password("OldPass123!"),
            )
        )
        await session.commit()

        csv_content = (
            "login_id,name,password,role\nexisting-import,After,NewPass123!,ADMIN\n"
        )
        fake_storage = AsyncMock()
        fake_storage.download.return_value = csv_content.encode()

        with patch(
            "app.services.user_import_listener.get_user_import_file_storage",
            return_value=fake_storage,
        ):
            await UserImportListener.process_import_message(
                _message_body(listener_job), session
            )

        await session.refresh(user)
        assert user.name == "After"
        assert user.role == UserRole.ADMIN

        from sqlalchemy import func

        password_history_count = (
            await session.execute(
                select(func.count()).where(PasswordHistory.user_id == user.id)  # type: ignore[arg-type]
            )
        ).scalar_one()
        assert password_history_count == 1
