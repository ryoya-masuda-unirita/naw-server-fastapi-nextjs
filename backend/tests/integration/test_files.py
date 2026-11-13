from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID, uuid4

import pytest

from app.core.file_storage import FileStorage, LocalFileStorage, get_file_storage
from app.core.security import create_access_token
from app.main import app
from app.models.file import File, FileStatus
from app.models.index import Index, IndexType
from app.models.plan import Plan
from app.models.subscription import Subscription, SubscriptionStatus
from app.models.tenant import Tenant
from app.models.token_usage import TokenUsage
from app.models.user import User, UserRole
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from collections.abc import Iterator
from typing import Any


@pytest.fixture
async def files_tenant(session: AsyncSession) -> Tenant:
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
async def files_admin_user(session: AsyncSession, files_tenant: Tenant) -> User:
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
def files_admin_headers(files_admin_user: User, files_tenant: Tenant) -> dict[str, str]:
    """ファイル管理者の認証ヘッダー"""
    token = create_access_token(files_admin_user.login_id, files_tenant.id)
    return {"Authorization": f"Bearer {token}", "X-Tenant-ID": files_tenant.id}


@pytest.fixture
async def files_index(session: AsyncSession, files_tenant: Tenant) -> Index:
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
async def files_local_index(session: AsyncSession, files_tenant: Tenant) -> Index:
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
def file_storage_root(tmp_path: Path) -> Path:
    """テスト用ファイルストレージのルートディレクトリ"""
    return tmp_path / "file-storage"


@pytest.fixture
def override_file_storage(file_storage_root: Path) -> Iterator[None]:
    """ファイルストレージをテスト用一時ディレクトリに差し替える（実ストレージへは接続しない）"""

    def _get_storage() -> FileStorage:
        """テスト用ストレージを返す依存関数"""
        return LocalFileStorage(root=file_storage_root)

    app.dependency_overrides[get_file_storage] = _get_storage
    yield
    del app.dependency_overrides[get_file_storage]


@pytest.fixture
async def files_plan(session: AsyncSession) -> Plan:
    """ファイルテスト用のプラン"""
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


async def _create_active_subscription(
    session: AsyncSession, tenant_id: str, plan_id: str
) -> None:
    """本日（UTC）を契約開始日とする有効なサブスクリプションを作成する。"""
    subscription = Subscription(
        tenant_id=tenant_id,
        plan_id=plan_id,
        status=SubscriptionStatus.ACTIVE,
        start_date=datetime.now(timezone.utc).date(),
        end_date=None,
    )
    session.add(subscription)
    await session.commit()


async def _exceed_quota(session: AsyncSession, tenant_id: str, plan: Plan) -> None:
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
) -> tuple[dict[str, Any], dict[str, str]]:
    """ファイルアップロード用の multipart 送信内容を作る

    Parameters
    ----------
    name : str
        ファイル名（name フィールド）
    display_name : str
        表示名（displayName フィールド）
    reference : str | None
        参照情報。None の場合は送信しない
    content : bytes
        アップロードするファイルの中身

    Returns
    -------
    tuple[dict, dict]
        files と data（httpx の files・data 引数に渡す）
    """
    files = {"file": ("sample.txt", content, "text/plain")}
    data = {"name": name, "displayName": display_name}
    if reference is not None:
        data["reference"] = reference
    return files, data


async def _upload_and_soft_delete(
    ac: AsyncClient, index_id: str, headers: dict[str, str]
) -> str:
    """ファイルをアップロードして論理削除し、そのファイルIDを返す。"""
    files, data = _upload_payload(reference="old-ref")
    upload_response = await ac.post(
        f"/api/admin/indexes/{index_id}/files",
        files=files,
        data=data,
        headers=headers,
    )
    file_id = upload_response.json()["id"]
    delete_response = await ac.delete(
        f"/api/admin/indexes/{index_id}/files/{file_id}", headers=headers
    )
    assert delete_response.status_code == 204
    return file_id


async def _list_files(
    ac: AsyncClient, index_id: str, headers: dict[str, str], status: str | None = None
) -> list[dict]:
    """ファイル一覧の`content`を返す（`status`指定時はそのステータスで絞り込む）。"""
    params = {"status": status} if status is not None else {}
    response = await ac.get(
        f"/api/admin/indexes/{index_id}/files", params=params, headers=headers
    )
    assert response.status_code == 200
    return response.json()["content"]


class TestFilesRouter:
    """ファイル API のテスト"""

    class TestUpload:
        """ファイルアップロードのテスト"""

        async def test_upload_file(
            self,
            client: AsyncClient,
            files_tenant: Tenant,
            files_index: Index,
            files_admin_headers: dict[str, str],
            override_file_storage: None,
        ) -> None:
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
            assert body["status"] == FileStatus.ENABLE.name
            assert body["indexId"] == files_index.id
            assert body["storageUrl"] is not None

        async def test_index_not_found_returns_404(
            self,
            client: AsyncClient,
            files_admin_headers: dict[str, str],
            override_file_storage: None,
        ) -> None:
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
            client: AsyncClient,
            files_local_index: Index,
            files_admin_headers: dict[str, str],
            override_file_storage: None,
        ) -> None:
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
            client: AsyncClient,
            session: AsyncSession,
            files_tenant: Tenant,
            files_index: Index,
            files_plan: Plan,
            files_admin_headers: dict[str, str],
            override_file_storage: None,
        ) -> None:
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

        async def test_upload_file_with_query_params(
            self,
            client: AsyncClient,
            files_index: Index,
            files_admin_headers: dict[str, str],
            override_file_storage: None,
        ) -> None:
            """file以外の項目をクエリパラメータで送ってもアップロードできること"""
            # 画面（training-api.service.ts）と同じく、fileのみボディ・他はクエリで送る
            async with client as ac:
                response = await ac.post(
                    f"/api/admin/indexes/{files_index.id}/files",
                    files={"file": ("q.txt", b"query", "text/plain")},
                    params={
                        "name": "q.txt",
                        "displayName": "クエリ表示名",
                        "reference": "ref",
                    },
                    headers=files_admin_headers,
                )

            assert response.status_code == 200
            body = response.json()
            assert body["fileName"] == "q.txt"
            assert body["displayName"] == "クエリ表示名"
            assert body["reference"] == "ref"

        async def test_upload_without_name_returns_400(
            self,
            client: AsyncClient,
            files_index: Index,
            files_admin_headers: dict[str, str],
            override_file_storage: None,
        ) -> None:
            """nameがボディ・クエリのどちらにも無い場合は400になること"""
            async with client as ac:
                response = await ac.post(
                    f"/api/admin/indexes/{files_index.id}/files",
                    files={"file": ("q.txt", b"query", "text/plain")},
                    headers=files_admin_headers,
                )

            assert response.status_code == 400

        async def test_upload_with_empty_name_returns_400(
            self,
            client: AsyncClient,
            files_index: Index,
            files_admin_headers: dict[str, str],
            override_file_storage: None,
        ) -> None:
            """nameが空文字の場合は400になること"""
            files, data = _upload_payload(name="")
            async with client as ac:
                response = await ac.post(
                    f"/api/admin/indexes/{files_index.id}/files",
                    files=files,
                    data=data,
                    headers=files_admin_headers,
                )

            assert response.status_code == 400

        async def test_upload_without_name_and_auth_returns_401(
            self, client: AsyncClient, files_index: Index, override_file_storage: None
        ) -> None:
            """未認証ならnameが無くても入力エラーより先に401になること"""
            async with client as ac:
                response = await ac.post(
                    f"/api/admin/indexes/{files_index.id}/files",
                    files={"file": ("q.txt", b"query", "text/plain")},
                )

            assert response.status_code == 401

        async def test_form_value_takes_precedence_over_query(
            self,
            client: AsyncClient,
            files_index: Index,
            files_admin_headers: dict[str, str],
            override_file_storage: None,
        ) -> None:
            """同じ項目がボディとクエリの両方にある場合はボディの値が採用されること"""
            files, data = _upload_payload(display_name="form")
            async with client as ac:
                response = await ac.post(
                    f"/api/admin/indexes/{files_index.id}/files",
                    files=files,
                    data=data,
                    params={"displayName": "query"},
                    headers=files_admin_headers,
                )

            assert response.status_code == 200
            assert response.json()["displayName"] == "form"

    class TestDownload:
        """ファイルダウンロードのテスト"""

        async def test_download_file(
            self,
            client: AsyncClient,
            files_index: Index,
            files_admin_headers: dict[str, str],
            override_file_storage: None,
        ) -> None:
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
            self,
            client: AsyncClient,
            files_index: Index,
            files_admin_headers: dict[str, str],
            override_file_storage: None,
        ) -> None:
            """存在しないファイルのダウンロードは404になること"""
            async with client as ac:
                response = await ac.get(
                    f"/api/admin/indexes/{files_index.id}/files/no-such-file",
                    headers=files_admin_headers,
                )

            assert response.status_code == 404

        async def test_download_deleted_file_returns_400(
            self,
            client: AsyncClient,
            files_index: Index,
            files_admin_headers: dict[str, str],
            override_file_storage: None,
        ) -> None:
            """削除済みのファイルのダウンロードは500ではなく400になること"""
            async with client as ac:
                file_id = await _upload_and_soft_delete(
                    ac, files_index.id, files_admin_headers
                )
                response = await ac.get(
                    f"/api/admin/indexes/{files_index.id}/files/{file_id}",
                    headers=files_admin_headers,
                )

            assert response.status_code == 400
            assert response.json()["message"] == (
                "削除済みのファイルはダウンロードできません。"
            )

        async def test_download_file_without_stored_content_returns_404(
            self,
            client: AsyncClient,
            files_index: Index,
            files_admin_headers: dict[str, str],
            override_file_storage: None,
            file_storage_root: Path,
        ) -> None:
            """保存先の実体が無いファイルのダウンロードは500ではなく404になること"""
            files, data = _upload_payload()
            async with client as ac:
                upload_response = await ac.post(
                    f"/api/admin/indexes/{files_index.id}/files",
                    files=files,
                    data=data,
                    headers=files_admin_headers,
                )
                file_id = upload_response.json()["id"]
                for stored in file_storage_root.rglob(f"{file_id}_*"):
                    stored.unlink()

                response = await ac.get(
                    f"/api/admin/indexes/{files_index.id}/files/{file_id}",
                    headers=files_admin_headers,
                )

            assert response.status_code == 404
            assert response.json()["message"] == "ファイルが存在しません。"

    class TestUpdate:
        """ファイル更新のテスト"""

        async def test_update_deleted_file_status_to_enable_returns_400(
            self,
            client: AsyncClient,
            files_index: Index,
            files_admin_headers: dict[str, str],
            override_file_storage: None,
        ) -> None:
            """削除済みのファイルを学習中に戻そうとすると400になり、削除済みのままであること"""
            async with client as ac:
                file_id = await _upload_and_soft_delete(
                    ac, files_index.id, files_admin_headers
                )
                response = await ac.patch(
                    f"/api/admin/indexes/{files_index.id}/files/{file_id}",
                    data={"status": "ENABLE"},
                    headers=files_admin_headers,
                )
                deleted = await _list_files(
                    ac, files_index.id, files_admin_headers, "DELETED"
                )

            assert response.status_code == 400
            assert response.json()["message"] == "削除済みのファイルは更新できません。"
            assert [f["id"] for f in deleted] == [file_id]

        async def test_update_deleted_file_status_to_disable_returns_400(
            self,
            client: AsyncClient,
            files_index: Index,
            files_admin_headers: dict[str, str],
            override_file_storage: None,
        ) -> None:
            """削除済みのファイルを停止中に変えようとすると400になり、削除済みのままであること"""
            async with client as ac:
                file_id = await _upload_and_soft_delete(
                    ac, files_index.id, files_admin_headers
                )
                response = await ac.patch(
                    f"/api/admin/indexes/{files_index.id}/files/{file_id}",
                    params={"status": "DISABLE"},
                    headers=files_admin_headers,
                )
                deleted = await _list_files(
                    ac, files_index.id, files_admin_headers, "DELETED"
                )

            assert response.status_code == 400
            assert response.json()["message"] == "削除済みのファイルは更新できません。"
            assert [f["id"] for f in deleted] == [file_id]

        async def test_update_deleted_file_metadata_returns_400(
            self,
            client: AsyncClient,
            files_index: Index,
            files_admin_headers: dict[str, str],
            override_file_storage: None,
        ) -> None:
            """削除済みのファイルの表示名・参照先の変更は400になり、保存されないこと"""
            async with client as ac:
                file_id = await _upload_and_soft_delete(
                    ac, files_index.id, files_admin_headers
                )
                response = await ac.patch(
                    f"/api/admin/indexes/{files_index.id}/files/{file_id}",
                    data={"displayName": "新しい表示名", "reference": "new-ref"},
                    headers=files_admin_headers,
                )
                deleted = await _list_files(
                    ac, files_index.id, files_admin_headers, "DELETED"
                )

            assert response.status_code == 400
            assert response.json()["message"] == "削除済みのファイルは更新できません。"
            assert len(deleted) == 1
            assert deleted[0]["displayName"] == "サンプル"
            assert deleted[0]["reference"] == "old-ref"

        async def test_replace_deleted_file_returns_400(
            self,
            client: AsyncClient,
            files_index: Index,
            files_admin_headers: dict[str, str],
            override_file_storage: None,
        ) -> None:
            """削除済みのファイルの差し替えは400になり、作り直されないこと"""
            async with client as ac:
                file_id = await _upload_and_soft_delete(
                    ac, files_index.id, files_admin_headers
                )
                response = await ac.patch(
                    f"/api/admin/indexes/{files_index.id}/files/{file_id}",
                    files={"file": ("new.txt", b"new content", "text/plain")},
                    data={"name": "new.txt"},
                    headers=files_admin_headers,
                )
                deleted = await _list_files(
                    ac, files_index.id, files_admin_headers, "DELETED"
                )
                active = await _list_files(ac, files_index.id, files_admin_headers)

            assert response.status_code == 400
            assert response.json()["message"] == "削除済みのファイルは更新できません。"
            assert [f["id"] for f in deleted] == [file_id]
            assert active == []

        async def test_replace_deleted_file_without_name_returns_deleted_error(
            self,
            client: AsyncClient,
            files_index: Index,
            files_admin_headers: dict[str, str],
            override_file_storage: None,
        ) -> None:
            """削除済みの判定はnameの必須チェックより先に行われること"""
            async with client as ac:
                file_id = await _upload_and_soft_delete(
                    ac, files_index.id, files_admin_headers
                )
                response = await ac.patch(
                    f"/api/admin/indexes/{files_index.id}/files/{file_id}",
                    files={"file": ("new.txt", b"new content", "text/plain")},
                    data={},
                    headers=files_admin_headers,
                )

            assert response.status_code == 400
            assert response.json()["message"] == "削除済みのファイルは更新できません。"

        async def test_replace_missing_file_without_name_returns_404(
            self,
            client: AsyncClient,
            files_index: Index,
            files_admin_headers: dict[str, str],
            override_file_storage: None,
        ) -> None:
            """存在しないファイルの差し替えは、nameの必須チェックより先に404になること"""
            async with client as ac:
                response = await ac.patch(
                    f"/api/admin/indexes/{files_index.id}/files/no-such-file",
                    files={"file": ("new.txt", b"new content", "text/plain")},
                    data={},
                    headers=files_admin_headers,
                )

            assert response.status_code == 404
            assert response.json()["message"] == "ファイルが存在しません。"

        async def test_update_metadata_only(
            self,
            client: AsyncClient,
            files_index: Index,
            files_admin_headers: dict[str, str],
            override_file_storage: None,
        ) -> None:
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

        async def test_update_with_file_without_name_returns_400(
            self,
            client: AsyncClient,
            files_index: Index,
            files_admin_headers: dict[str, str],
            override_file_storage: None,
        ) -> None:
            """file添付時にnameを省略すると400になり、旧ファイルが削除されないこと"""
            files, data = _upload_payload()
            async with client as ac:
                upload_response = await ac.post(
                    f"/api/admin/indexes/{files_index.id}/files",
                    files=files,
                    data=data,
                    headers=files_admin_headers,
                )
                file_id = upload_response.json()["id"]

                new_files = {"file": ("new.txt", b"new content", "text/plain")}
                response = await ac.patch(
                    f"/api/admin/indexes/{files_index.id}/files/{file_id}",
                    files=new_files,
                    data={},
                    headers=files_admin_headers,
                )
                assert response.status_code == 400

                # nameが未指定で拒否された場合、旧ファイルが削除されず残っていること
                download_response = await ac.get(
                    f"/api/admin/indexes/{files_index.id}/files/{file_id}",
                    headers=files_admin_headers,
                )
            assert download_response.status_code == 200
            assert download_response.content == b"hello world"

        async def test_update_status_deleted_returns_400(
            self,
            client: AsyncClient,
            files_index: Index,
            files_admin_headers: dict[str, str],
            override_file_storage: None,
        ) -> None:
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
            self,
            client: AsyncClient,
            files_index: Index,
            files_admin_headers: dict[str, str],
            override_file_storage: None,
        ) -> None:
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
            client: AsyncClient,
            session: AsyncSession,
            files_tenant: Tenant,
            files_index: Index,
            files_plan: Plan,
            files_admin_headers: dict[str, str],
            override_file_storage: None,
        ) -> None:
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

        async def test_update_metadata_with_query_params(
            self,
            client: AsyncClient,
            files_index: Index,
            files_admin_headers: dict[str, str],
            override_file_storage: None,
        ) -> None:
            """file未添付時にクエリパラメータで送った項目が更新されること"""
            files, data = _upload_payload()
            async with client as ac:
                upload_response = await ac.post(
                    f"/api/admin/indexes/{files_index.id}/files",
                    files=files,
                    data=data,
                    headers=files_admin_headers,
                )
                file_id = upload_response.json()["id"]

                # 画面はファイル未添付の更新時、ボディ無しで項目をクエリに載せて送る
                response = await ac.patch(
                    f"/api/admin/indexes/{files_index.id}/files/{file_id}",
                    params={
                        "displayName": "クエリで更新",
                        "reference": "new-ref",
                        "status": "DISABLE",
                    },
                    headers=files_admin_headers,
                )

            assert response.status_code == 200
            body = response.json()
            assert body["displayName"] == "クエリで更新"
            assert body["reference"] == "new-ref"
            assert body["status"] == FileStatus.DISABLE.name

    class TestDelete:
        """ファイル削除のテスト"""

        async def test_soft_delete_marks_status_deleted(
            self,
            client: AsyncClient,
            files_index: Index,
            files_admin_headers: dict[str, str],
            override_file_storage: None,
        ) -> None:
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

        async def test_soft_deleted_file_is_excluded_from_list(
            self,
            client: AsyncClient,
            files_index: Index,
            files_admin_headers: dict[str, str],
            override_file_storage: None,
        ) -> None:
            """status未指定の一覧から論理削除済みのファイルが除かれること"""
            files_a, data_a = _upload_payload(name="a.txt", display_name="A")
            files_b, data_b = _upload_payload(name="b.txt", display_name="B")
            async with client as ac:
                deleted = await ac.post(
                    f"/api/admin/indexes/{files_index.id}/files",
                    files=files_a,
                    data=data_a,
                    headers=files_admin_headers,
                )
                remaining = await ac.post(
                    f"/api/admin/indexes/{files_index.id}/files",
                    files=files_b,
                    data=data_b,
                    headers=files_admin_headers,
                )
                delete_response = await ac.delete(
                    f"/api/admin/indexes/{files_index.id}/files/{deleted.json()['id']}",
                    headers=files_admin_headers,
                )
                assert delete_response.status_code == 204

                list_response = await ac.get(
                    f"/api/admin/indexes/{files_index.id}/files",
                    headers=files_admin_headers,
                )

            body = list_response.json()
            assert body["totalElements"] == 1
            assert [item["id"] for item in body["content"]] == [remaining.json()["id"]]

        async def test_physical_delete_removes_record(
            self,
            client: AsyncClient,
            files_index: Index,
            files_admin_headers: dict[str, str],
            override_file_storage: None,
        ) -> None:
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
        """ファイル一覧取得のテスト"""

        async def test_list_files(
            self,
            client: AsyncClient,
            files_index: Index,
            files_admin_headers: dict[str, str],
            override_file_storage: None,
        ) -> None:
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
            self,
            client: AsyncClient,
            files_index: Index,
            files_admin_headers: dict[str, str],
            override_file_storage: None,
        ) -> None:
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

        async def test_filter_by_updated_at_range_excludes_end(
            self,
            client: AsyncClient,
            session: AsyncSession,
            files_index: Index,
            files_admin_user: User,
            files_admin_headers: dict[str, str],
        ) -> None:
            """更新日時は開始の時刻以上・終了の時刻より前のファイルだけが返ること"""
            # 日本時間の 2026-10-09 を選んだときに画面が送る範囲の前後に置く
            # （移植元 FileIT の期間絞り込みと同じ境界）
            created = {}
            for label, updated_at in [
                ("before_day_starts", "2026-10-08T14:59:59.999000+00:00"),
                ("at_day_start", "2026-10-08T15:00:00+00:00"),
                ("before_day_ends", "2026-10-09T14:59:59.999000+00:00"),
                ("at_next_day_start", "2026-10-09T15:00:00+00:00"),
            ]:
                created[label] = await _create_file(
                    session,
                    files_index,
                    files_admin_user.id,
                    FileStatus.ENABLE,
                    datetime.fromisoformat(updated_at),
                )

            async with client as ac:
                response = await ac.get(
                    f"/api/admin/indexes/{files_index.id}/files",
                    params={
                        "updatedAtFrom": "2026-10-08T15:00:00.000Z",
                        "updatedAtTo": "2026-10-09T15:00:00.000Z",
                    },
                    headers=files_admin_headers,
                )

            assert response.status_code == 200
            body = response.json()
            assert body["totalElements"] == 2
            assert {item["id"] for item in body["content"]} == {
                created["at_day_start"].id,
                created["before_day_ends"].id,
            }

        async def test_date_only_updated_at_from_returns_400(
            self,
            client: AsyncClient,
            files_index: Index,
            files_admin_headers: dict[str, str],
        ) -> None:
            """updatedAtFromが時刻を持たない日付の場合、移植元と同じメッセージで400になること"""
            async with client as ac:
                response = await ac.get(
                    f"/api/admin/indexes/{files_index.id}/files",
                    params={"updatedAtFrom": "2026-10-09"},
                    headers=files_admin_headers,
                )

            assert response.status_code == 400
            assert response.json()["message"] == (
                "updatedAtFrom は 2026-10-08T15:00:00Z のような"
                " ISO 8601 の日時で指定してください"
            )

        async def test_invalid_updated_at_to_returns_400(
            self,
            client: AsyncClient,
            files_index: Index,
            files_admin_headers: dict[str, str],
        ) -> None:
            """updatedAtToが日時でない場合400になること"""
            async with client as ac:
                response = await ac.get(
                    f"/api/admin/indexes/{files_index.id}/files",
                    params={"updatedAtTo": "abc"},
                    headers=files_admin_headers,
                )

            assert response.status_code == 400
            assert "updatedAtTo" in response.json()["message"]

        async def test_sort_by_user_id(
            self,
            client: AsyncClient,
            session: AsyncSession,
            files_tenant: Tenant,
            files_index: Index,
            files_admin_headers: dict[str, str],
        ) -> None:
            """sort=userIdで登録ユーザーID順に並べ替えられること"""
            user_low = await _create_user(session, files_tenant.id, _USER_ID_LOW, "z")
            user_high = await _create_user(session, files_tenant.id, _USER_ID_HIGH, "a")
            # 更新日時順（未知キー時のフォールバック）では逆の結果になるよう、
            # ID の小さいユーザーのファイルを新しくする
            await _create_file(
                session, files_index, user_low.id, FileStatus.ENABLE, _NEWER
            )
            await _create_file(
                session, files_index, user_high.id, FileStatus.ENABLE, _OLDER
            )

            async with client as ac:
                asc_response = await ac.get(
                    f"/api/admin/indexes/{files_index.id}/files",
                    params={"sort": "userId,asc"},
                    headers=files_admin_headers,
                )
                desc_response = await ac.get(
                    f"/api/admin/indexes/{files_index.id}/files",
                    params={"sort": "userId,desc"},
                    headers=files_admin_headers,
                )

            asc_user_ids = [item["userId"] for item in asc_response.json()["content"]]
            desc_user_ids = [item["userId"] for item in desc_response.json()["content"]]
            assert asc_user_ids == [str(_USER_ID_LOW), str(_USER_ID_HIGH)]
            assert desc_user_ids == [str(_USER_ID_HIGH), str(_USER_ID_LOW)]

        async def test_sort_by_status(
            self,
            client: AsyncClient,
            session: AsyncSession,
            files_index: Index,
            files_admin_user: User,
            files_admin_headers: dict[str, str],
        ) -> None:
            """sort=statusで学習設定（ENABLE→DISABLE）順に並べ替えられること"""
            # 更新日時順（未知キー時のフォールバック）では逆の結果になるよう、
            # ENABLE のファイルを新しくする
            await _create_file(
                session, files_index, files_admin_user.id, FileStatus.ENABLE, _NEWER
            )
            await _create_file(
                session, files_index, files_admin_user.id, FileStatus.DISABLE, _OLDER
            )

            async with client as ac:
                asc_response = await ac.get(
                    f"/api/admin/indexes/{files_index.id}/files",
                    params={"sort": "status,asc"},
                    headers=files_admin_headers,
                )
                desc_response = await ac.get(
                    f"/api/admin/indexes/{files_index.id}/files",
                    # 移植元同様、方向の大文字指定も受け付けること
                    params={"sort": "status,DESC"},
                    headers=files_admin_headers,
                )

            asc_statuses = [item["status"] for item in asc_response.json()["content"]]
            desc_statuses = [item["status"] for item in desc_response.json()["content"]]
            assert asc_statuses == [FileStatus.ENABLE.name, FileStatus.DISABLE.name]
            assert desc_statuses == [FileStatus.DISABLE.name, FileStatus.ENABLE.name]


# SQLiteでは型名`UUID`の列がNUMERIC親和性になり、数字のみのUUIDは整数に変換されて
# 読み戻せないため、英字を含む値にする。
_USER_ID_LOW = UUID("0000000a-0000-0000-0000-000000000000")
_USER_ID_HIGH = UUID("ffffffff-ffff-ffff-ffff-ffffffffffff")
_OLDER = datetime(2026, 1, 1, tzinfo=timezone.utc)
_NEWER = datetime(2026, 1, 2, tzinfo=timezone.utc)


async def _create_user(
    session: AsyncSession, tenant_id: str, user_id: UUID, name: str
) -> User:
    """並べ替え検証用に、IDを固定したユーザーを作成する。"""
    user = User(
        id=user_id,
        tenant_id=tenant_id,
        login_id=f"sort-user-{user_id}",
        name=name,
        role=UserRole.USER,
        is_required_password_reset=False,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


async def _create_file(
    session: AsyncSession,
    index: Index,
    user_id: UUID,
    status: FileStatus,
    updated_at: datetime,
) -> File:
    """並べ替え検証用に、状態・更新日時を指定したファイルをDBへ直接登録する。"""
    file = File(
        tenant_id=index.tenant_id,
        name=f"{status.name}-{updated_at.isoformat()}.txt",
        status=status,
        user_id=user_id,
        index_id=index.id,
        created_at=updated_at,
        updated_at=updated_at,
    )
    session.add(file)
    await session.commit()
    await session.refresh(file)
    return file
