from datetime import date, datetime, timezone
from pathlib import Path
from uuid import uuid4

import pytest

from app.core.file_storage import FileStorage, LocalFileStorage, get_file_storage
from app.core.security import create_access_token
from app.main import app
from app.models.file import FileStatus
from app.models.index import Index, IndexType
from app.models.plan import Plan
from app.models.subscription import Subscription, SubscriptionStatus
from app.models.tenant import Tenant
from app.models.token_usage import TokenUsage
from app.models.user import User, UserRole


@pytest.fixture
async def files_tenant(session):
    """テスト用テナント"""
    t = Tenant(
        id="tenant-files-test",
        name="Files Test Tenant",
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
    session.add(t)
    await session.commit()
    await session.refresh(t)
    return t


@pytest.fixture
async def files_admin_user(session, files_tenant):
    """テナント管理者"""
    u = User(
        id=uuid4(),
        tenant_id=files_tenant.id,
        login_id="files-admin",
        name="Files Admin",
        role=UserRole.ADMIN,
        is_required_password_reset=False,
    )
    session.add(u)
    await session.commit()
    await session.refresh(u)
    return u


@pytest.fixture
def files_admin_headers(files_admin_user, files_tenant):
    token = create_access_token(files_admin_user.login_id, files_tenant.id)
    return {"Authorization": f"Bearer {token}", "X-Tenant-ID": files_tenant.id}


@pytest.fixture
async def files_index(session, files_tenant):
    """アップロード可能なSAAS_GLOBALインデックス"""
    index = Index(
        tenant_id=files_tenant.id,
        type=IndexType.SAAS_GLOBAL,
        name="Files Test Index",
    )
    session.add(index)
    await session.commit()
    await session.refresh(index)
    return index


@pytest.fixture
async def files_local_index(session, files_tenant):
    """LOCALタイプのインデックス（400系テスト用）"""
    index = Index(
        tenant_id=files_tenant.id,
        type=IndexType.LOCAL,
        name="Files Local Index",
        add="waha-add",
        delete="waha-delete",
        get="waha-get",
    )
    session.add(index)
    await session.commit()
    await session.refresh(index)
    return index


@pytest.fixture
def file_storage_root(tmp_path) -> Path:
    return tmp_path / "file-storage"


@pytest.fixture
def override_file_storage(file_storage_root):
    """ファイルストレージをテスト用一時ディレクトリに差し替える（実ストレージへは接続しない）"""

    def _get_storage() -> FileStorage:
        return LocalFileStorage(root=file_storage_root)

    app.dependency_overrides[get_file_storage] = _get_storage
    yield
    del app.dependency_overrides[get_file_storage]


@pytest.fixture
async def files_plan(session):
    plan = Plan(
        id="plan-files-test",
        name="Standard",
        max_users=10,
        max_credits_per_month=100,
    )
    session.add(plan)
    await session.commit()
    await session.refresh(plan)
    return plan


async def _create_active_subscription(session, tenant_id: str, plan_id: str) -> None:
    """本日を契約開始日とする有効なサブスクリプションを作成する。"""
    subscription = Subscription(
        tenant_id=tenant_id,
        plan_id=plan_id,
        status=SubscriptionStatus.ACTIVE,
        start_date=date.today(),
        end_date=None,
    )
    session.add(subscription)
    await session.commit()


async def _exceed_quota(session, tenant_id: str, plan: Plan) -> None:
    """当月クレジット上限を超過させる（`enforce_within_quota`が429を返す状態を作る）。"""
    await _create_active_subscription(session, tenant_id, plan.id)
    session.add(
        TokenUsage(
            tenant_id=tenant_id,
            model="gpt-4",
            input_tokens=100,
            output_tokens=100,
            input_credits=plan.max_credits_per_month,
            created_at=datetime.now(timezone.utc),
        )
    )
    await session.commit()


def _upload_payload(
    name: str = "sample.txt",
    display_name: str = "サンプル",
    reference: str | None = None,
    content: bytes = b"hello world",
):
    files = {"file": ("sample.txt", content, "text/plain")}
    data = {"name": name, "displayName": display_name}
    if reference is not None:
        data["reference"] = reference
    return files, data


class TestFilesRouter:
    class TestUpload:
        async def test_upload_file(
            self,
            client,
            files_tenant,
            files_index,
            files_admin_headers,
            override_file_storage,
        ):
            """ファイルをアップロードできること"""
            files, data = _upload_payload()
            async with client as ac:
                response = await ac.post(
                    f"/api/admin/indexes/{files_index.id}/files",
                    files=files,
                    data=data,
                    headers=files_admin_headers,
                )

            assert response.status_code == 200
            body = response.json()
            assert body["fileName"] == "sample.txt"
            assert body["displayName"] == "サンプル"
            assert body["status"] == FileStatus.ENABLE.value
            assert body["indexId"] == files_index.id
            assert body["storageUrl"] is not None

        async def test_index_not_found_returns_404(
            self, client, files_admin_headers, override_file_storage
        ):
            """存在しないインデックスへのアップロードは404になること"""
            files, data = _upload_payload()
            async with client as ac:
                response = await ac.post(
                    "/api/admin/indexes/no-such-index/files",
                    files=files,
                    data=data,
                    headers=files_admin_headers,
                )

            assert response.status_code == 404

        async def test_local_index_returns_400(
            self,
            client,
            files_local_index,
            files_admin_headers,
            override_file_storage,
        ):
            """LOCALインデックスへのアップロードは400になること"""
            files, data = _upload_payload()
            async with client as ac:
                response = await ac.post(
                    f"/api/admin/indexes/{files_local_index.id}/files",
                    files=files,
                    data=data,
                    headers=files_admin_headers,
                )

            assert response.status_code == 400

        async def test_quota_exceeded_returns_429(
            self,
            client,
            session,
            files_tenant,
            files_index,
            files_plan,
            files_admin_headers,
            override_file_storage,
        ):
            """当月クレジット上限超過時は429になること"""
            await _exceed_quota(session, files_tenant.id, files_plan)
            files, data = _upload_payload()
            async with client as ac:
                response = await ac.post(
                    f"/api/admin/indexes/{files_index.id}/files",
                    files=files,
                    data=data,
                    headers=files_admin_headers,
                )

            assert response.status_code == 429

    class TestDownload:
        async def test_download_file(
            self,
            client,
            files_index,
            files_admin_headers,
            override_file_storage,
        ):
            """アップロード済みファイルをダウンロードできること"""
            files, data = _upload_payload(content=b"download me")
            async with client as ac:
                upload_response = await ac.post(
                    f"/api/admin/indexes/{files_index.id}/files",
                    files=files,
                    data=data,
                    headers=files_admin_headers,
                )
                file_id = upload_response.json()["id"]

                response = await ac.get(
                    f"/api/admin/indexes/{files_index.id}/files/{file_id}",
                    headers=files_admin_headers,
                )

            assert response.status_code == 200
            assert response.content == b"download me"
            # 表示名は日本語のためRFC 5987形式（filename*=UTF-8''...）でエンコードされる
            assert (
                "filename*=UTF-8''%E3%82%B5%E3%83%B3%E3%83%97%E3%83%AB"
                in (response.headers["content-disposition"])
            )

        async def test_file_not_found_returns_404(
            self, client, files_index, files_admin_headers, override_file_storage
        ):
            """存在しないファイルのダウンロードは404になること"""
            async with client as ac:
                response = await ac.get(
                    f"/api/admin/indexes/{files_index.id}/files/no-such-file",
                    headers=files_admin_headers,
                )

            assert response.status_code == 404

    class TestUpdate:
        async def test_update_metadata_only(
            self, client, files_index, files_admin_headers, override_file_storage
        ):
            """file未添付時はメタデータのみ更新されること"""
            files, data = _upload_payload()
            async with client as ac:
                upload_response = await ac.post(
                    f"/api/admin/indexes/{files_index.id}/files",
                    files=files,
                    data=data,
                    headers=files_admin_headers,
                )
                file_id = upload_response.json()["id"]

                response = await ac.patch(
                    f"/api/admin/indexes/{files_index.id}/files/{file_id}",
                    data={"displayName": "更新後の表示名"},
                    headers=files_admin_headers,
                )

            assert response.status_code == 200
            body = response.json()
            assert body["displayName"] == "更新後の表示名"
            assert body["fileName"] == "sample.txt"

        async def test_update_status_deleted_returns_400(
            self, client, files_index, files_admin_headers, override_file_storage
        ):
            """status=DELETEDの指定は400になること"""
            files, data = _upload_payload()
            async with client as ac:
                upload_response = await ac.post(
                    f"/api/admin/indexes/{files_index.id}/files",
                    files=files,
                    data=data,
                    headers=files_admin_headers,
                )
                file_id = upload_response.json()["id"]

                response = await ac.patch(
                    f"/api/admin/indexes/{files_index.id}/files/{file_id}",
                    data={"status": "DELETED"},
                    headers=files_admin_headers,
                )

            assert response.status_code == 400

        async def test_update_with_file_replaces_content(
            self, client, files_index, files_admin_headers, override_file_storage
        ):
            """file添付時は既存ファイルが置き換わること"""
            files, data = _upload_payload(content=b"original")
            async with client as ac:
                upload_response = await ac.post(
                    f"/api/admin/indexes/{files_index.id}/files",
                    files=files,
                    data=data,
                    headers=files_admin_headers,
                )
                old_body = upload_response.json()
                old_file_id = old_body["id"]

                new_files = {
                    "file": ("replaced.txt", b"replaced content", "text/plain")
                }
                new_data = {"name": "replaced.txt", "displayName": "置換後"}
                response = await ac.patch(
                    f"/api/admin/indexes/{files_index.id}/files/{old_file_id}",
                    files=new_files,
                    data=new_data,
                    headers=files_admin_headers,
                )
                new_body = response.json()

                download_response = await ac.get(
                    f"/api/admin/indexes/{files_index.id}/files/{new_body['id']}",
                    headers=files_admin_headers,
                )

            assert response.status_code == 200
            assert new_body["id"] != old_file_id
            assert new_body["fileName"] == "replaced.txt"
            assert download_response.content == b"replaced content"

        async def test_update_with_file_quota_exceeded_returns_429(
            self,
            client,
            session,
            files_tenant,
            files_index,
            files_plan,
            files_admin_headers,
            override_file_storage,
        ):
            """file添付更新時も上限超過なら429になること"""
            files, data = _upload_payload()
            async with client as ac:
                upload_response = await ac.post(
                    f"/api/admin/indexes/{files_index.id}/files",
                    files=files,
                    data=data,
                    headers=files_admin_headers,
                )
                file_id = upload_response.json()["id"]

                await _exceed_quota(session, files_tenant.id, files_plan)

                new_files = {"file": ("new.txt", b"new content", "text/plain")}
                new_data = {"name": "new.txt", "displayName": "new"}
                response = await ac.patch(
                    f"/api/admin/indexes/{files_index.id}/files/{file_id}",
                    files=new_files,
                    data=new_data,
                    headers=files_admin_headers,
                )

            assert response.status_code == 429

    class TestDelete:
        async def test_soft_delete_marks_status_deleted(
            self, client, files_index, files_admin_headers, override_file_storage
        ):
            """論理削除でstatusがDELETEDになること"""
            files, data = _upload_payload()
            async with client as ac:
                upload_response = await ac.post(
                    f"/api/admin/indexes/{files_index.id}/files",
                    files=files,
                    data=data,
                    headers=files_admin_headers,
                )
                file_id = upload_response.json()["id"]

                response = await ac.delete(
                    f"/api/admin/indexes/{files_index.id}/files/{file_id}",
                    headers=files_admin_headers,
                )
                assert response.status_code == 204

                list_response = await ac.get(
                    f"/api/admin/indexes/{files_index.id}/files",
                    params={"status": "DELETED"},
                    headers=files_admin_headers,
                )

            body = list_response.json()
            assert any(item["id"] == file_id for item in body["content"])

        async def test_physical_delete_removes_record(
            self, client, files_index, files_admin_headers, override_file_storage
        ):
            """物理削除でレコードが消えること"""
            files, data = _upload_payload()
            async with client as ac:
                upload_response = await ac.post(
                    f"/api/admin/indexes/{files_index.id}/files",
                    files=files,
                    data=data,
                    headers=files_admin_headers,
                )
                file_id = upload_response.json()["id"]

                response = await ac.delete(
                    f"/api/admin/indexes/{files_index.id}/files/{file_id}",
                    params={"physicalDelete": "true"},
                    headers=files_admin_headers,
                )
                assert response.status_code == 204

                download_response = await ac.get(
                    f"/api/admin/indexes/{files_index.id}/files/{file_id}",
                    headers=files_admin_headers,
                )
            assert download_response.status_code == 404

    class TestList:
        async def test_list_files(
            self, client, files_index, files_admin_headers, override_file_storage
        ):
            """ファイル一覧を取得できること"""
            files, data = _upload_payload(name="a.txt", display_name="Aファイル")
            async with client as ac:
                await ac.post(
                    f"/api/admin/indexes/{files_index.id}/files",
                    files=files,
                    data=data,
                    headers=files_admin_headers,
                )
                response = await ac.get(
                    f"/api/admin/indexes/{files_index.id}/files",
                    headers=files_admin_headers,
                )

            assert response.status_code == 200
            body = response.json()
            assert body["totalElements"] == 1
            assert body["content"][0]["displayName"] == "Aファイル"
            assert body["content"][0]["updatedBy"] == "Files Admin"

        async def test_filter_by_display_name(
            self, client, files_index, files_admin_headers, override_file_storage
        ):
            """displayNameで絞り込めること"""
            files_a, data_a = _upload_payload(name="a.txt", display_name="Alpha")
            files_b, data_b = _upload_payload(name="b.txt", display_name="Beta")
            async with client as ac:
                await ac.post(
                    f"/api/admin/indexes/{files_index.id}/files",
                    files=files_a,
                    data=data_a,
                    headers=files_admin_headers,
                )
                await ac.post(
                    f"/api/admin/indexes/{files_index.id}/files",
                    files=files_b,
                    data=data_b,
                    headers=files_admin_headers,
                )
                response = await ac.get(
                    f"/api/admin/indexes/{files_index.id}/files",
                    params={"displayName": "Alpha"},
                    headers=files_admin_headers,
                )

            body = response.json()
            assert body["totalElements"] == 1
            assert body["content"][0]["displayName"] == "Alpha"
