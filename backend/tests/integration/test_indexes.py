from pathlib import Path
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.core.file_storage import FileStorage, LocalFileStorage, get_file_storage
from app.core.security import create_access_token
from app.main import app
from app.models.assistant import Assistant, AssistantType, GroupAssistant
from app.models.file import File
from app.models.group import Group, GroupUser
from app.models.index import Index, IndexEndpoint, IndexGroup, IndexType
from app.models.message import Message, MessageFeedback, MessageRating
from app.models.room import Room
from app.models.tenant import Tenant
from app.models.tenant_endpoint import EndpointType, TenantEndpoint
from app.models.user import User, UserRole


@pytest.fixture
async def tenant(session):
    """テスト用テナント"""
    t = Tenant(
        id="tenant-indexes-test",
        name="Indexes Test Tenant",
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
async def admin_user(session, tenant):
    """テナント管理者"""
    u = User(
        id=uuid4(),
        tenant_id=tenant.id,
        login_id="index-admin",
        name="Admin",
        role=UserRole.ADMIN,
        is_required_password_reset=False,
    )
    session.add(u)
    await session.commit()
    await session.refresh(u)
    return u


@pytest.fixture
async def group_admin_user(session, tenant):
    """テナント管理者ロールではないグループ管理者"""
    u = User(
        id=uuid4(),
        tenant_id=tenant.id,
        login_id="index-group-admin",
        name="GroupAdmin",
        role=UserRole.USER,
        is_required_password_reset=False,
    )
    session.add(u)
    await session.commit()
    await session.refresh(u)
    return u


@pytest.fixture
async def member_user(session, tenant):
    """管理者権限もグループ管理者権限も持たない一般ユーザー"""
    u = User(
        id=uuid4(),
        tenant_id=tenant.id,
        login_id="index-member",
        name="Member",
        role=UserRole.USER,
        is_required_password_reset=False,
    )
    session.add(u)
    await session.commit()
    await session.refresh(u)
    return u


@pytest.fixture
async def managed_group(session, tenant, group_admin_user):
    """group_admin_userがグループ内管理者として所属するグループ"""
    g = Group(tenant_id=tenant.id, name="ManagedGroup")
    session.add(g)
    await session.commit()
    await session.refresh(g)

    session.add(
        GroupUser(
            group_id=g.id,
            tenant_id=tenant.id,
            user_id=group_admin_user.id,
            is_admin=True,
        )
    )
    await session.commit()
    return g


@pytest.fixture
async def unmanaged_group(session, tenant):
    """group_admin_userが管理しない別グループ"""
    g = Group(tenant_id=tenant.id, name="UnmanagedGroup")
    session.add(g)
    await session.commit()
    await session.refresh(g)
    return g


@pytest.fixture
async def tenant_endpoint_1(session, tenant):
    e = TenantEndpoint(
        tenant_id=tenant.id,
        type=EndpointType.AZURE_OPENAI_EMBEDDING,
        endpoint_name="Embedding1",
        endpoint="https://example1.openai.azure.com",
        api_key="secret-key-1",
    )
    session.add(e)
    await session.commit()
    await session.refresh(e)
    return e


@pytest.fixture
async def tenant_endpoint_2(session, tenant):
    e = TenantEndpoint(
        tenant_id=tenant.id,
        type=EndpointType.VDB,
        endpoint_name="Vdb1",
        endpoint="https://example2.vdb",
        api_key="secret-key-2",
    )
    session.add(e)
    await session.commit()
    await session.refresh(e)
    return e


@pytest.fixture
async def tenant_endpoint_local(session, tenant):
    e = TenantEndpoint(
        tenant_id=tenant.id,
        type=EndpointType.LOCAL_SERVER,
        endpoint_name="Local1",
        endpoint="https://example.local",
        api_key="secret-key-local",
    )
    session.add(e)
    await session.commit()
    await session.refresh(e)
    return e


@pytest.fixture
async def saas_index(session, tenant, tenant_endpoint_1, tenant_endpoint_2):
    """SAAS_GLOBALインデックス（グループ・アシスタント未紐付け）"""
    idx = Index(
        tenant_id=tenant.id,
        type=IndexType.SAAS_GLOBAL,
        name="SaaS Index",
        description="説明文",
    )
    session.add(idx)
    await session.commit()
    await session.refresh(idx)

    session.add(
        IndexEndpoint(
            index_id=idx.id, tenant_id=tenant.id, endpoint_id=tenant_endpoint_1.id
        )
    )
    session.add(
        IndexEndpoint(
            index_id=idx.id, tenant_id=tenant.id, endpoint_id=tenant_endpoint_2.id
        )
    )
    await session.commit()
    return idx


@pytest.fixture
async def group_linked_index(
    session, tenant, managed_group, tenant_endpoint_1, tenant_endpoint_2
):
    """managed_groupに直接紐づくインデックス"""
    idx = Index(
        tenant_id=tenant.id,
        type=IndexType.SAAS_GLOBAL,
        name="Group Linked Index",
    )
    session.add(idx)
    await session.commit()
    await session.refresh(idx)

    session.add(
        IndexGroup(index_id=idx.id, tenant_id=tenant.id, group_id=managed_group.id)
    )
    await session.commit()
    return idx


@pytest.fixture
async def assistant_linked_index(
    session, tenant, managed_group, tenant_endpoint_1, tenant_endpoint_2
):
    """managed_groupのアシスタントが使用するインデックス（グループへの直接紐付けなし）"""
    idx = Index(
        tenant_id=tenant.id,
        type=IndexType.SAAS_GLOBAL,
        name="Assistant Linked Index",
    )
    session.add(idx)
    await session.commit()
    await session.refresh(idx)

    a = Assistant(
        tenant_id=tenant.id,
        type=AssistantType.SAAS_RAG,
        name="RAG Assistant",
        index_id=idx.id,
        include_history=False,
    )
    session.add(a)
    await session.commit()
    await session.refresh(a)

    session.add(
        GroupAssistant(
            group_id=managed_group.id, tenant_id=tenant.id, assistant_id=a.id
        )
    )
    await session.commit()
    return idx


@pytest.fixture
async def unrelated_index(session, tenant, unmanaged_group):
    """group_admin_userの管理範囲外のインデックス"""
    idx = Index(
        tenant_id=tenant.id,
        type=IndexType.SAAS_GLOBAL,
        name="Unrelated Index",
    )
    session.add(idx)
    await session.commit()
    await session.refresh(idx)

    session.add(
        IndexGroup(index_id=idx.id, tenant_id=tenant.id, group_id=unmanaged_group.id)
    )
    await session.commit()
    return idx


@pytest.fixture
async def local_index(session, tenant, tenant_endpoint_local):
    """LOCALタイプのインデックス（追加学習400系テスト用）"""
    idx = Index(
        tenant_id=tenant.id,
        type=IndexType.LOCAL,
        name="Local Index",
        add="waha-add",
        delete="waha-delete",
        get="waha-get",
    )
    session.add(idx)
    await session.commit()
    await session.refresh(idx)

    session.add(
        IndexEndpoint(
            index_id=idx.id, tenant_id=tenant.id, endpoint_id=tenant_endpoint_local.id
        )
    )
    await session.commit()
    return idx


@pytest.fixture
def index_storage_root(tmp_path) -> Path:
    return tmp_path / "index-file-storage"


@pytest.fixture
def override_index_file_storage(index_storage_root):
    """追加学習テストでファイルストレージを一時ディレクトリへ差し替える（実ストレージへは接続しない）"""

    def _get_storage() -> FileStorage:
        return LocalFileStorage(root=index_storage_root)

    app.dependency_overrides[get_file_storage] = _get_storage
    yield
    del app.dependency_overrides[get_file_storage]


@pytest.fixture
async def feedback_assistant(session, tenant):
    """フィードバック紐付け用の最小限のアシスタント"""
    a = Assistant(
        tenant_id=tenant.id,
        type=AssistantType.SAAS_RAG,
        name="Feedback Assistant",
        include_history=False,
    )
    session.add(a)
    await session.commit()
    await session.refresh(a)
    return a


@pytest.fixture
async def feedback_room(session, tenant, feedback_assistant, admin_user):
    """フィードバック紐付け用の最小限のルーム"""
    room = Room(
        tenant_id=tenant.id,
        name="Feedback Room",
        default_assistant_id=feedback_assistant.id,
        user_id=admin_user.id,
    )
    session.add(room)
    await session.commit()
    await session.refresh(room)
    return room


@pytest.fixture
async def feedback_message(session, tenant, feedback_room, feedback_assistant):
    """フィードバック紐付け用の最小限のメッセージ"""
    m = Message(
        tenant_id=tenant.id,
        room_id=feedback_room.id,
        assistant_id=feedback_assistant.id,
    )
    session.add(m)
    await session.commit()
    await session.refresh(m)
    return m


@pytest.fixture
async def message_feedback(session, tenant, feedback_message, admin_user):
    """追加学習のデータソースとするフィードバック"""
    fb = MessageFeedback(
        tenant_id=tenant.id,
        user_id=admin_user.id,
        message_id=feedback_message.id,
        rating=MessageRating.GOOD,
    )
    session.add(fb)
    await session.commit()
    await session.refresh(fb)
    return fb


def _headers(login_id: str, tenant_id: str) -> dict[str, str]:
    token = create_access_token(login_id, tenant_id)
    return {"Authorization": f"Bearer {token}", "X-Tenant-ID": tenant_id}


@pytest.fixture
def admin_headers(admin_user, tenant):
    return _headers(admin_user.login_id, tenant.id)


@pytest.fixture
def group_admin_headers(group_admin_user, tenant):
    return _headers(group_admin_user.login_id, tenant.id)


@pytest.fixture
def member_headers(member_user, tenant):
    return _headers(member_user.login_id, tenant.id)


@pytest.fixture
def client(override_get_session):
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
class TestIndexRouter:
    class TestList:
        """GET /api/admin/indexes"""

        async def test_list_all_indexes_for_tenant_admin(
            self, client, admin_headers, saas_index, unrelated_index
        ):
            """テナント管理者は全インデックスを取得できること"""
            async with client as c:
                response = await c.get("/api/admin/indexes", headers=admin_headers)

            assert response.status_code == 200
            body = response.json()
            assert body["totalElements"] == 2

        async def test_list_filters_by_search_text(
            self, client, admin_headers, saas_index, unrelated_index
        ):
            """検索文字列でname/descriptionの部分一致絞り込みができること"""
            async with client as c:
                response = await c.get(
                    "/api/admin/indexes",
                    params={"searchText": "SaaS"},
                    headers=admin_headers,
                )

            assert response.status_code == 200
            body = response.json()
            assert body["totalElements"] == 1
            assert body["content"][0]["id"] == saas_index.id

        async def test_list_filters_by_group_id_as_tenant_admin(
            self,
            client,
            admin_headers,
            group_linked_index,
            unrelated_index,
            managed_group,
        ):
            """テナント管理者はgroupId指定で該当グループ紐付けのインデックスのみ取得できること"""
            async with client as c:
                response = await c.get(
                    "/api/admin/indexes",
                    params={"groupId": managed_group.id},
                    headers=admin_headers,
                )

            assert response.status_code == 200
            body = response.json()
            assert body["totalElements"] == 1
            assert body["content"][0]["id"] == group_linked_index.id

        async def test_list_filters_by_group_id_as_group_admin(
            self, client, group_admin_headers, group_linked_index, managed_group
        ):
            """グループ管理者は自分が管理するグループIDで絞り込めること"""
            async with client as c:
                response = await c.get(
                    "/api/admin/indexes",
                    params={"groupId": managed_group.id},
                    headers=group_admin_headers,
                )

            assert response.status_code == 200
            body = response.json()
            assert body["totalElements"] == 1
            assert body["content"][0]["id"] == group_linked_index.id

        async def test_list_returns_empty_when_group_admin_has_no_access_to_group(
            self,
            client,
            group_admin_headers,
            unrelated_index,
            unmanaged_group,
            managed_group,
        ):
            """グループ管理者が自分の管理外のgroupIdを指定すると空ページが返ること

            `managed_group`は`require_admin_or_group_admin`（いずれかのグループの管理者であればアクセス可）を
            通過させるために必要（group_admin_userがどのグループの管理者でもないと403で弾かれ、
            本来テストしたい「管理外グループのgroupId指定」の分岐まで到達できないため）。
            """
            async with client as c:
                response = await c.get(
                    "/api/admin/indexes",
                    params={"groupId": unmanaged_group.id},
                    headers=group_admin_headers,
                )

            assert response.status_code == 200
            body = response.json()
            assert body["totalElements"] == 0
            assert body["content"] == []

        async def test_group_admin_scoped_to_managed_group_and_assistant_indexes(
            self,
            client,
            group_admin_headers,
            group_linked_index,
            assistant_linked_index,
            unrelated_index,
        ):
            """groupId未指定時、グループ管理者は管理グループ直接紐付け∪アシスタント経由のインデックスのみ見えること"""
            async with client as c:
                response = await c.get(
                    "/api/admin/indexes", headers=group_admin_headers
                )

            assert response.status_code == 200
            body = response.json()
            ids = {item["id"] for item in body["content"]}
            assert ids == {group_linked_index.id, assistant_linked_index.id}
            assert body["totalElements"] == 2

        async def test_normal_user_returns_403(self, client, member_headers):
            """管理者権限もグループ管理者権限もない一般ユーザーは403になること"""
            async with client as c:
                response = await c.get("/api/admin/indexes", headers=member_headers)

            assert response.status_code == 403

    class TestGet:
        """GET /api/admin/indexes/{id}"""

        async def test_get_index_by_id(self, client, admin_headers, saas_index):
            """存在するインデックスの詳細を取得できること"""
            async with client as c:
                response = await c.get(
                    f"/api/admin/indexes/{saas_index.id}", headers=admin_headers
                )

            assert response.status_code == 200
            body = response.json()
            assert body["id"] == saas_index.id
            assert body["name"] == "SaaS Index"
            assert len(body["tenantEndpoints"]) == 2

        async def test_get_index_not_found_returns_404(self, client, admin_headers):
            """存在しないインデックスIDを指定すると404になること"""
            async with client as c:
                response = await c.get(
                    "/api/admin/indexes/nonexistent-id", headers=admin_headers
                )

            assert response.status_code == 404

        async def test_get_index_out_of_scope_returns_404_for_group_admin(
            self, client, group_admin_headers, unrelated_index, managed_group
        ):
            """グループ管理者が可視範囲外のインデックスIDを指定すると404になること

            `managed_group`は`require_admin_or_group_admin`を通過させるために必要
            （どのグループの管理者でもないと403で弾かれるため）。
            """
            async with client as c:
                response = await c.get(
                    f"/api/admin/indexes/{unrelated_index.id}",
                    headers=group_admin_headers,
                )

            assert response.status_code == 404

    class TestCreate:
        """POST /api/admin/indexes"""

        async def test_create_saas_index(
            self, client, admin_headers, tenant_endpoint_1, tenant_endpoint_2
        ):
            """SAAS_GLOBALインデックスをエンドポイント2件で作成できること"""
            payload = {
                "name": "New SaaS Index",
                "description": "desc",
                "type": "SAAS_GLOBAL",
                "endpointIds": [tenant_endpoint_1.id, tenant_endpoint_2.id],
            }
            async with client as c:
                response = await c.post(
                    "/api/admin/indexes", json=payload, headers=admin_headers
                )

            assert response.status_code == 200
            body = response.json()
            assert body["name"] == "New SaaS Index"
            assert len(body["tenantEndpoints"]) == 2

        async def test_create_saas_index_invalid_endpoint_count_raises_error(
            self, client, admin_headers, tenant_endpoint_1
        ):
            """SAAS_GLOBALでエンドポイントが2件でない場合422になること"""
            payload = {
                "name": "Bad Index",
                "type": "SAAS_GLOBAL",
                "endpointIds": [tenant_endpoint_1.id],
            }
            async with client as c:
                response = await c.post(
                    "/api/admin/indexes", json=payload, headers=admin_headers
                )

            assert response.status_code == 422

        async def test_create_saas_index_over_limit_raises_error(
            self,
            client,
            session,
            tenant,
            admin_headers,
            tenant_endpoint_1,
            tenant_endpoint_2,
        ):
            """既存SAAS_GLOBALインデックスが15件あるテナントでは新規作成が400になること"""
            for i in range(15):
                idx = Index(
                    tenant_id=tenant.id, type=IndexType.SAAS_GLOBAL, name=f"Index{i}"
                )
                session.add(idx)
            await session.commit()

            payload = {
                "name": "Over Limit Index",
                "type": "SAAS_GLOBAL",
                "endpointIds": [tenant_endpoint_1.id, tenant_endpoint_2.id],
            }
            async with client as c:
                response = await c.post(
                    "/api/admin/indexes", json=payload, headers=admin_headers
                )

            assert response.status_code == 400
            assert "15個" in response.json()["detail"]

        async def test_create_local_index(
            self, client, admin_headers, tenant_endpoint_local
        ):
            """LOCALインデックスをエンドポイント1件・Waha!サービスID指定ありで作成できること"""
            payload = {
                "name": "New Local Index",
                "type": "LOCAL",
                "endpointIds": [tenant_endpoint_local.id],
                "add": "add-service",
                "delete": "delete-service",
                "get": "get-service",
            }
            async with client as c:
                response = await c.post(
                    "/api/admin/indexes", json=payload, headers=admin_headers
                )

            assert response.status_code == 200
            body = response.json()
            assert body["type"] == "LOCAL"
            assert body["add"] == "add-service"

        async def test_create_local_index_invalid_endpoint_count_raises_error(
            self, client, admin_headers, tenant_endpoint_local, tenant_endpoint_1
        ):
            """LOCALでエンドポイントが1件でない場合422になること"""
            payload = {
                "name": "Bad Local Index",
                "type": "LOCAL",
                "endpointIds": [tenant_endpoint_local.id, tenant_endpoint_1.id],
                "add": "a",
                "delete": "d",
                "get": "g",
            }
            async with client as c:
                response = await c.post(
                    "/api/admin/indexes", json=payload, headers=admin_headers
                )

            assert response.status_code == 422

        async def test_create_local_index_missing_waha_service_id_raises_error(
            self, client, admin_headers, tenant_endpoint_local
        ):
            """LOCALでget/add/deleteのいずれかが空の場合422になること"""
            payload = {
                "name": "Bad Local Index",
                "type": "LOCAL",
                "endpointIds": [tenant_endpoint_local.id],
                "add": "a",
                "delete": "d",
                "get": "",
            }
            async with client as c:
                response = await c.post(
                    "/api/admin/indexes", json=payload, headers=admin_headers
                )

            assert response.status_code == 422

        async def test_create_description_too_long_raises_error(
            self, client, admin_headers, tenant_endpoint_1, tenant_endpoint_2
        ):
            """descriptionが256文字以上の場合422になること"""
            payload = {
                "name": "Long Desc Index",
                "description": "a" * 256,
                "type": "SAAS_GLOBAL",
                "endpointIds": [tenant_endpoint_1.id, tenant_endpoint_2.id],
            }
            async with client as c:
                response = await c.post(
                    "/api/admin/indexes", json=payload, headers=admin_headers
                )

            assert response.status_code == 422

        async def test_create_unknown_endpoint_id_raises_error(
            self, client, admin_headers, tenant_endpoint_1
        ):
            """存在しないテナントエンドポイントIDを指定すると404になること"""
            payload = {
                "name": "Bad Endpoint Index",
                "type": "SAAS_GLOBAL",
                "endpointIds": [tenant_endpoint_1.id, "nonexistent-endpoint"],
            }
            async with client as c:
                response = await c.post(
                    "/api/admin/indexes", json=payload, headers=admin_headers
                )

            assert response.status_code == 404
            assert "テナントエンドポイント" in response.json()["detail"]

        async def test_create_unknown_group_id_raises_error(
            self, client, admin_headers, tenant_endpoint_1, tenant_endpoint_2
        ):
            """存在しないグループIDを指定すると404になること"""
            payload = {
                "name": "Bad Group Index",
                "type": "SAAS_GLOBAL",
                "endpointIds": [tenant_endpoint_1.id, tenant_endpoint_2.id],
                "groupIds": ["nonexistent-group"],
            }
            async with client as c:
                response = await c.post(
                    "/api/admin/indexes", json=payload, headers=admin_headers
                )

            assert response.status_code == 404
            assert "グループ" in response.json()["detail"]

    class TestUpdate:
        """PATCH /api/admin/indexes/{id}"""

        async def test_update_index_replaces_all_fields(
            self,
            client,
            session,
            admin_headers,
            saas_index,
            tenant_endpoint_1,
            managed_group,
        ):
            """更新リクエストで全フィールドが置換されること（groupIds/endpointIdsの完全置換を含む）"""
            payload = {
                "name": "Updated Name",
                "description": "updated desc",
                "type": "SAAS_GLOBAL",
                "endpointIds": [tenant_endpoint_1.id],
                "groupIds": [managed_group.id],
            }
            # SAAS_GLOBALはエンドポイント2件必須のため、更新用に2件目のエンドポイントを用意
            second_endpoint = TenantEndpoint(
                tenant_id=saas_index.tenant_id,
                type=EndpointType.VDB,
                endpoint_name="Second",
                endpoint="https://second.example",
                api_key="key",
            )
            session.add(second_endpoint)
            await session.commit()
            await session.refresh(second_endpoint)
            payload["endpointIds"].append(second_endpoint.id)

            async with client as c:
                response = await c.patch(
                    f"/api/admin/indexes/{saas_index.id}",
                    json=payload,
                    headers=admin_headers,
                )

            assert response.status_code == 200
            body = response.json()
            assert body["name"] == "Updated Name"
            assert body["description"] == "updated desc"
            assert body["groupIds"] == [managed_group.id]
            assert {e["id"] for e in body["tenantEndpoints"]} == {
                tenant_endpoint_1.id,
                second_endpoint.id,
            }

        async def test_update_skips_saas_limit_check(
            self,
            client,
            session,
            tenant,
            admin_headers,
            saas_index,
            tenant_endpoint_1,
            tenant_endpoint_2,
        ):
            """既存15件のテナントでも既存インデックスの更新は上限チェックの対象外であること"""
            for i in range(15):
                idx = Index(
                    tenant_id=tenant.id, type=IndexType.SAAS_GLOBAL, name=f"Index{i}"
                )
                session.add(idx)
            await session.commit()

            payload = {
                "name": "Updated Under Limit Check",
                "type": "SAAS_GLOBAL",
                "endpointIds": [tenant_endpoint_1.id, tenant_endpoint_2.id],
            }
            async with client as c:
                response = await c.patch(
                    f"/api/admin/indexes/{saas_index.id}",
                    json=payload,
                    headers=admin_headers,
                )

            assert response.status_code == 200

        async def test_update_by_group_admin_within_scope_succeeds(
            self,
            client,
            group_admin_headers,
            group_linked_index,
            managed_group,
            tenant_endpoint_1,
            tenant_endpoint_2,
        ):
            """グループ管理者は自分の管理範囲内のインデックスを更新できること"""
            payload = {
                "name": "Updated By Group Admin",
                "type": "SAAS_GLOBAL",
                "endpointIds": [tenant_endpoint_1.id, tenant_endpoint_2.id],
                "groupIds": [managed_group.id],
            }
            async with client as c:
                response = await c.patch(
                    f"/api/admin/indexes/{group_linked_index.id}",
                    json=payload,
                    headers=group_admin_headers,
                )

            assert response.status_code == 200
            assert response.json()["name"] == "Updated By Group Admin"

        async def test_update_by_group_admin_out_of_scope_returns_404(
            self,
            client,
            group_admin_headers,
            unrelated_index,
            managed_group,
            tenant_endpoint_1,
            tenant_endpoint_2,
        ):
            """グループ管理者は自分の管理範囲外のインデックスを更新できず404になること

            `managed_group`は`require_admin_or_group_admin`を通過させるために必要。
            """
            payload = {
                "name": "Should Not Update",
                "type": "SAAS_GLOBAL",
                "endpointIds": [tenant_endpoint_1.id, tenant_endpoint_2.id],
            }
            async with client as c:
                response = await c.patch(
                    f"/api/admin/indexes/{unrelated_index.id}",
                    json=payload,
                    headers=group_admin_headers,
                )

            assert response.status_code == 404

    class TestDelete:
        """DELETE /api/admin/indexes/{id}"""

        async def test_delete_index_cascades_junction_tables(
            self, client, session, admin_headers, saas_index
        ):
            """インデックス削除時にindexes_endpoints・indexes_groupsの関連行もCASCADE削除されること"""
            async with client as c:
                response = await c.delete(
                    f"/api/admin/indexes/{saas_index.id}", headers=admin_headers
                )

            assert response.status_code == 204

            remaining = (
                (
                    await session.execute(
                        select(IndexEndpoint).where(
                            IndexEndpoint.index_id == saas_index.id
                        )
                    )
                )
                .scalars()
                .all()
            )
            assert remaining == []

        async def test_delete_nonexistent_index_is_idempotent(
            self, client, admin_headers
        ):
            """存在しないインデックスIDを削除しても204が返ること（冪等）"""
            async with client as c:
                response = await c.delete(
                    "/api/admin/indexes/nonexistent-id", headers=admin_headers
                )

            assert response.status_code == 204

        async def test_delete_by_group_admin_within_scope_succeeds(
            self, client, group_admin_headers, group_linked_index
        ):
            """グループ管理者は自分の管理範囲内のインデックスを削除できること"""
            async with client as c:
                response = await c.delete(
                    f"/api/admin/indexes/{group_linked_index.id}",
                    headers=group_admin_headers,
                )

            assert response.status_code == 204

        async def test_delete_by_group_admin_out_of_scope_returns_404(
            self, client, group_admin_headers, unrelated_index, managed_group
        ):
            """グループ管理者は自分の管理範囲外のインデックスを削除できず404になること

            `managed_group`は`require_admin_or_group_admin`を通過させるために必要。
            削除されず残っていること自体は本テストでは検証しないが、404であることから
            `IndexRepository.delete`が呼ばれていないことが分かる。
            """
            async with client as c:
                response = await c.delete(
                    f"/api/admin/indexes/{unrelated_index.id}",
                    headers=group_admin_headers,
                )

            assert response.status_code == 404

    class TestSync:
        """POST /api/admin/indexes/{id}/sync"""

        async def test_sync_always_returns_bad_request(
            self, client, admin_headers, saas_index
        ):
            """同期APIは常に400（ローカルAPIサーバ限定機能）を返すこと"""
            async with client as c:
                response = await c.post(
                    f"/api/admin/indexes/{saas_index.id}/sync", headers=admin_headers
                )

            assert response.status_code == 400
            assert (
                response.json()["detail"]
                == "ファイル一括同期機能はローカルAPIサーバしか対応していません。"
            )

    class TestAdditionalLearning:
        """POST /api/admin/indexes/{id}/additionalLearning"""

        async def test_neither_feedback_id_nor_room_id_raises_error(
            self, client, admin_headers, saas_index, override_index_file_storage
        ):
            """feedbackId・roomIdどちらも未指定だと400になること"""
            files = {"content": ("learn.md", b"content", "text/markdown")}
            async with client as c:
                response = await c.post(
                    f"/api/admin/indexes/{saas_index.id}/additionalLearning",
                    files=files,
                    data={},
                    headers=admin_headers,
                )

            assert response.status_code == 400
            assert (
                response.json()["detail"]
                == "追加学習のデータソースが正しく指定されていません。"
            )

        async def test_both_feedback_id_and_room_id_raises_error(
            self, client, admin_headers, saas_index, override_index_file_storage
        ):
            """feedbackId・roomIdを両方指定すると400になること"""
            files = {"content": ("learn.md", b"content", "text/markdown")}
            data = {"feedbackId": "some-feedback-id", "roomId": "some-room-id"}
            async with client as c:
                response = await c.post(
                    f"/api/admin/indexes/{saas_index.id}/additionalLearning",
                    files=files,
                    data=data,
                    headers=admin_headers,
                )

            assert response.status_code == 400
            assert (
                response.json()["detail"]
                == "追加学習のデータソースが正しく指定されていません。"
            )

        async def test_create_file_with_feedback_id(
            self,
            client,
            session,
            admin_headers,
            saas_index,
            message_feedback,
            override_index_file_storage,
        ):
            """feedbackId指定で追加学習ファイルが作成されること"""
            files = {"content": ("learn.md", b"content", "text/markdown")}
            data = {"feedbackId": message_feedback.id}
            async with client as c:
                response = await c.post(
                    f"/api/admin/indexes/{saas_index.id}/additionalLearning",
                    files=files,
                    data=data,
                    headers=admin_headers,
                )

            assert response.status_code == 204

            created = (
                (
                    await session.execute(
                        select(File).where(File.feedback_id == message_feedback.id)
                    )
                )
                .scalars()
                .first()
            )
            assert created is not None
            assert created.name == f"追加学習_{message_feedback.id}.md"
            assert created.reference == f"フィードバック_{message_feedback.id}"
            assert created.display_name == "フィードバック学習"
            assert created.index_id == saas_index.id

        async def test_update_message_feedback_index_id(
            self,
            client,
            session,
            admin_headers,
            saas_index,
            message_feedback,
            override_index_file_storage,
        ):
            """feedbackId指定後に対象MessageFeedbackのindex_idが更新されること"""
            files = {"content": ("learn.md", b"content", "text/markdown")}
            data = {"feedbackId": message_feedback.id}
            async with client as c:
                response = await c.post(
                    f"/api/admin/indexes/{saas_index.id}/additionalLearning",
                    files=files,
                    data=data,
                    headers=admin_headers,
                )

            assert response.status_code == 204

            await session.refresh(message_feedback)
            assert message_feedback.index_id == saas_index.id

        async def test_create_file_with_room_id(
            self,
            client,
            session,
            admin_headers,
            saas_index,
            feedback_room,
            override_index_file_storage,
        ):
            """roomId指定で追加学習ファイルが作成されること"""
            room_id = feedback_room.id
            files = {"content": ("learn.md", b"content", "text/markdown")}
            data = {"roomId": room_id}
            async with client as c:
                response = await c.post(
                    f"/api/admin/indexes/{saas_index.id}/additionalLearning",
                    files=files,
                    data=data,
                    headers=admin_headers,
                )

            assert response.status_code == 204

            created = (
                (await session.execute(select(File).where(File.room_id == room_id)))
                .scalars()
                .first()
            )
            assert created is not None
            assert created.name == f"追加学習_ルーム_{room_id}.md"
            # 移植元同様、roomId指定時もreferenceの接頭辞は「フィードバック_」のまま
            assert created.reference == f"フィードバック_{room_id}"

        async def test_nonexistent_feedback_id_raises_404(
            self, client, admin_headers, saas_index, override_index_file_storage
        ):
            """存在しないfeedbackIdを指定すると404になること（ファイルは作成されない）"""
            files = {"content": ("learn.md", b"content", "text/markdown")}
            data = {"feedbackId": "nonexistent-feedback-id"}
            async with client as c:
                response = await c.post(
                    f"/api/admin/indexes/{saas_index.id}/additionalLearning",
                    files=files,
                    data=data,
                    headers=admin_headers,
                )

            assert response.status_code == 404

        async def test_nonexistent_room_id_raises_404(
            self, client, admin_headers, saas_index, override_index_file_storage
        ):
            """存在しないroomIdを指定すると404になること（ファイルは作成されない）"""
            files = {"content": ("learn.md", b"content", "text/markdown")}
            data = {"roomId": "nonexistent-room-id"}
            async with client as c:
                response = await c.post(
                    f"/api/admin/indexes/{saas_index.id}/additionalLearning",
                    files=files,
                    data=data,
                    headers=admin_headers,
                )

            assert response.status_code == 404

        async def test_other_tenant_feedback_id_raises_404(
            self,
            client,
            session,
            admin_headers,
            saas_index,
            unrelated_index,
        ):
            """他テナントのfeedbackIdを指定すると404になり、テナントをまたいで紐付かないこと

            `files.feedback_id`は`message_feedbacks.id`への単一列FK（テナント条件を含まない）
            のため、テナントスコープでの事前存在確認を行わないと他テナントのフィードバックへ
            黙って紐付いてしまう懸念がある（回帰確認）。
            """
            other_tenant = Tenant(
                id="tenant-indexes-test-other",
                name="Other Tenant",
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
            session.add(other_tenant)
            await session.commit()
            await session.refresh(other_tenant)

            other_user = User(
                id=uuid4(),
                tenant_id=other_tenant.id,
                login_id="other-tenant-admin",
                name="OtherAdmin",
                role=UserRole.ADMIN,
                is_required_password_reset=False,
            )
            other_assistant = Assistant(
                tenant_id=other_tenant.id,
                type=AssistantType.SAAS_RAG,
                name="Other Assistant",
                include_history=False,
            )
            session.add_all([other_user, other_assistant])
            await session.commit()
            await session.refresh(other_user)
            await session.refresh(other_assistant)

            other_room = Room(
                tenant_id=other_tenant.id,
                name="Other Room",
                default_assistant_id=other_assistant.id,
                user_id=other_user.id,
            )
            session.add(other_room)
            await session.commit()
            await session.refresh(other_room)

            other_message = Message(
                tenant_id=other_tenant.id,
                room_id=other_room.id,
                assistant_id=other_assistant.id,
            )
            session.add(other_message)
            await session.commit()
            await session.refresh(other_message)

            other_feedback = MessageFeedback(
                tenant_id=other_tenant.id,
                user_id=other_user.id,
                message_id=other_message.id,
                rating=MessageRating.GOOD,
            )
            session.add(other_feedback)
            await session.commit()
            await session.refresh(other_feedback)

            files = {"content": ("learn.md", b"content", "text/markdown")}
            data = {"feedbackId": other_feedback.id}
            async with client as c:
                response = await c.post(
                    f"/api/admin/indexes/{saas_index.id}/additionalLearning",
                    files=files,
                    data=data,
                    headers=admin_headers,
                )

            assert response.status_code == 404

            created = (
                (
                    await session.execute(
                        select(File).where(File.feedback_id == other_feedback.id)
                    )
                )
                .scalars()
                .first()
            )
            assert created is None

            await session.refresh(other_feedback)
            assert other_feedback.index_id is None

        async def test_index_not_found_raises_404(
            self, client, admin_headers, override_index_file_storage
        ):
            """存在しないindex_idを指定すると404になること"""
            files = {"content": ("learn.md", b"content", "text/markdown")}
            data = {"feedbackId": "some-feedback-id"}
            async with client as c:
                response = await c.post(
                    "/api/admin/indexes/nonexistent-index/additionalLearning",
                    files=files,
                    data=data,
                    headers=admin_headers,
                )

            assert response.status_code == 404

        async def test_local_index_raises_bad_request(
            self, client, admin_headers, local_index, override_index_file_storage
        ):
            """LOCALタイプのインデックスを指定すると400になること"""
            files = {"content": ("learn.md", b"content", "text/markdown")}
            data = {"feedbackId": "some-feedback-id"}
            async with client as c:
                response = await c.post(
                    f"/api/admin/indexes/{local_index.id}/additionalLearning",
                    files=files,
                    data=data,
                    headers=admin_headers,
                )

            assert response.status_code == 400
            assert (
                response.json()["detail"]
                == "ローカルAPIサーバへのリクエストを処理できません。"
            )

        async def test_member_user_forbidden(
            self, client, member_headers, saas_index, override_index_file_storage
        ):
            """一般ユーザーは追加学習APIを呼べないこと"""
            files = {"content": ("learn.md", b"content", "text/markdown")}
            data = {"feedbackId": "some-feedback-id"}
            async with client as c:
                response = await c.post(
                    f"/api/admin/indexes/{saas_index.id}/additionalLearning",
                    files=files,
                    data=data,
                    headers=member_headers,
                )

            assert response.status_code == 403
