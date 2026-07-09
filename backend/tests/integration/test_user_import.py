from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select

from app.core.security import create_access_token, hash_password
from app.main import app
from app.models.group import Group, GroupUser
from app.models.password_history import PasswordHistory
from app.models.tenant import Tenant
from app.models.user import User, UserRole
from app.models.user_import_job import UserImportJob, UserImportJobStatus


@pytest.fixture
async def import_tenant(session):
    tenant = Tenant(
        id="tenant-user-import-test",
        name="User Import Test Tenant",
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
async def other_tenant(session):
    tenant = Tenant(
        id="tenant-user-import-other",
        name="Other User Import Tenant",
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
async def import_admin_user(session, import_tenant):
    user = User(
        id=uuid4(),
        tenant_id=import_tenant.id,
        login_id="import-admin",
        name="Import Admin",
        role=UserRole.ADMIN,
        is_required_password_reset=False,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@pytest.fixture
async def import_normal_user(session, import_tenant):
    user = User(
        id=uuid4(),
        tenant_id=import_tenant.id,
        login_id="import-user",
        name="Import User",
        role=UserRole.USER,
        is_required_password_reset=False,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@pytest.fixture
def admin_headers(import_admin_user, import_tenant):
    token = create_access_token(import_admin_user.login_id, import_tenant.id)
    return {"Authorization": f"Bearer {token}", "X-Tenant-ID": import_tenant.id}


@pytest.fixture
def user_headers(import_normal_user, import_tenant):
    token = create_access_token(import_normal_user.login_id, import_tenant.id)
    return {"Authorization": f"Bearer {token}", "X-Tenant-ID": import_tenant.id}


@pytest.fixture
def client(override_get_session):
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def _csv_file(content: str, filename: str = "users.csv"):
    return {"file": (filename, content.encode(), "text/csv")}


@pytest.mark.asyncio
class TestUserImport:
    async def test_import_users_creates_user_and_job(
        self, client, admin_headers, session
    ):
        csv_content = "login_id,name,password,role,createLoginKey\nnew-import,New Import,Pass123!,USER,true\n"

        async with client as c:
            response = await c.post(
                "/api/admin/users/import",
                headers=admin_headers,
                files=_csv_file(csv_content),
            )
            body = response.json()
            detail = await c.get(
                f"/api/admin/users/import/{body['jobId']}", headers=admin_headers
            )

        assert response.status_code == 200
        assert body["status"] == "COMPLETED"

        created = (
            (await session.execute(select(User).where(User.login_id == "new-import")))
            .scalars()
            .one()
        )
        assert created.name == "New Import"
        assert created.login_key is not None

        password_history_count = (
            await session.execute(
                select(func.count()).where(PasswordHistory.user_id == created.id)
            )
        ).scalar_one()
        assert password_history_count == 1

        assert detail.status_code == 200
        assert detail.json()["status"] == "COMPLETED"
        assert detail.json()["fileName"] == "users.csv"

    async def test_import_users_updates_existing_user_without_password_change(
        self, client, admin_headers, session, import_tenant
    ):
        user = User(
            id=uuid4(),
            tenant_id=import_tenant.id,
            login_id="existing-import",
            name="Before",
            role=UserRole.USER,
            is_required_password_reset=False,
        )
        session.add(user)
        await session.flush()
        session.add(
            PasswordHistory(
                tenant_id=import_tenant.id,
                user_id=user.id,
                password=hash_password("OldPass123!"),
            )
        )
        await session.commit()

        csv_content = (
            "login_id,name,password,role\nexisting-import,After,NewPass123!,ADMIN\n"
        )
        async with client as c:
            response = await c.post(
                "/api/admin/users/import",
                headers=admin_headers,
                files=_csv_file(csv_content),
            )

        assert response.status_code == 200
        await session.refresh(user)
        assert user.name == "After"
        assert user.role == UserRole.ADMIN

        password_history_count = (
            await session.execute(
                select(func.count()).where(PasswordHistory.user_id == user.id)
            )
        ).scalar_one()
        assert password_history_count == 1

    async def test_import_users_replaces_group_memberships(
        self, client, admin_headers, session, import_tenant
    ):
        old_group = Group(tenant_id=import_tenant.id, name="Old Group")
        new_group = Group(tenant_id=import_tenant.id, name="New Group")
        user = User(
            id=uuid4(),
            tenant_id=import_tenant.id,
            login_id="group-import",
            name="Group Import",
            role=UserRole.USER,
            is_required_password_reset=False,
        )
        session.add_all([old_group, new_group, user])
        await session.commit()
        session.add(
            GroupUser(
                group_id=old_group.id,
                tenant_id=import_tenant.id,
                user_id=user.id,
            )
        )
        await session.commit()

        csv_content = (
            "login_id,name,password,role,groupIds\n"
            f"group-import,Group Updated,Pass123!,USER,{new_group.id}\n"
        )
        async with client as c:
            response = await c.post(
                "/api/admin/users/import",
                headers=admin_headers,
                files=_csv_file(csv_content),
            )

        assert response.status_code == 200
        group_ids = (
            (
                await session.execute(
                    select(GroupUser.group_id).where(GroupUser.user_id == user.id)
                )
            )
            .scalars()
            .all()
        )
        assert group_ids == [new_group.id]

    async def test_import_users_returns_failed_job_for_invalid_csv(
        self, client, admin_headers
    ):
        csv_content = "login_id,name,password\nmissing-role,Missing Role,Pass123!\n"

        async with client as c:
            response = await c.post(
                "/api/admin/users/import",
                headers=admin_headers,
                files=_csv_file(csv_content),
            )
            body = response.json()
            detail = await c.get(
                f"/api/admin/users/import/{body['jobId']}", headers=admin_headers
            )

        assert response.status_code == 200
        assert body["status"] == "FAILED"

        assert detail.status_code == 200
        assert "必須カラム 'role' が存在しません" in detail.json()["errorDetails"]

    async def test_general_user_cannot_import_users(self, client, user_headers):
        csv_content = "login_id,name,password,role\nblocked,Blocked,Pass123!,USER\n"

        async with client as c:
            response = await c.post(
                "/api/admin/users/import",
                headers=user_headers,
                files=_csv_file(csv_content),
            )

        assert response.status_code == 403

    async def test_get_import_job_returns_404_for_other_tenant(
        self, client, admin_headers, session, other_tenant
    ):
        job = UserImportJob(
            tenant_id=other_tenant.id,
            status=UserImportJobStatus.COMPLETED,
            file_name="other.csv",
        )
        session.add(job)
        await session.commit()

        async with client as c:
            response = await c.get(
                f"/api/admin/users/import/{job.id}", headers=admin_headers
            )

        assert response.status_code == 404
