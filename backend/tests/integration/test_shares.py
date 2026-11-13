from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.security import create_access_token
from app.main import app
from app.models.assistant import Assistant, AssistantType
from app.models.group import Group, GroupUser
from app.models.room import Room
from app.models.share import Share, ShareRoom
from app.models.tenant import Tenant
from app.models.user import User, UserRole


def _tenant(tenant_id: str) -> Tenant:
    """テスト用のテナントを作る

    Parameters
    ----------
    tenant_id : str
        テナントID（名前にも同じ値を使う）

    Returns
    -------
    Tenant
        パスワードポリシーを設定した未保存のテナント
    """
    return Tenant(
        id=tenant_id,
        name=tenant_id,
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


@pytest.fixture
async def shares_tenant(session):
    """テスト用テナント"""
    tenant = _tenant("tenant-shares-test")
    session.add(tenant)
    await session.commit()
    await session.refresh(tenant)
    return tenant


@pytest.fixture
async def other_tenant(session):
    """別テナント（テナント分離の確認用）"""
    tenant = _tenant("tenant-shares-other")
    session.add(tenant)
    await session.commit()
    await session.refresh(tenant)
    return tenant


@pytest.fixture
async def room_owner_user(session, shares_tenant):
    """ルームの所有者ユーザー"""
    user = User(
        id=uuid4(),
        tenant_id=shares_tenant.id,
        login_id="share-owner",
        name="Room Owner",
        role=UserRole.USER,
        is_required_password_reset=False,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@pytest.fixture
async def group_member_user(session, shares_tenant):
    """グループに所属するユーザー"""
    user = User(
        id=uuid4(),
        tenant_id=shares_tenant.id,
        login_id="share-group-member",
        name="Group Member",
        role=UserRole.USER,
        is_required_password_reset=False,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@pytest.fixture
async def unrelated_user(session, shares_tenant):
    """共有に無関係なユーザー"""
    user = User(
        id=uuid4(),
        tenant_id=shares_tenant.id,
        login_id="share-unrelated",
        name="Unrelated User",
        role=UserRole.USER,
        is_required_password_reset=False,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@pytest.fixture
async def share_assistant(session, shares_tenant):
    """共有対象ルームのアシスタント"""
    assistant = Assistant(
        tenant_id=shares_tenant.id,
        type=AssistantType.SAAS_CHAT,
        name="Share Assistant",
        include_history=False,
    )
    session.add(assistant)
    await session.commit()
    await session.refresh(assistant)
    return assistant


@pytest.fixture
async def owned_room(session, shares_tenant, room_owner_user, share_assistant):
    """ユーザー自身のルーム"""
    room = Room(
        tenant_id=shares_tenant.id,
        name="Owner Room",
        default_assistant_id=share_assistant.id,
        user_id=room_owner_user.id,
    )
    session.add(room)
    await session.commit()
    await session.refresh(room)
    return room


@pytest.fixture
async def target_group(session, shares_tenant, group_member_user):
    """共有先のグループ"""
    group = Group(tenant_id=shares_tenant.id, name="Target Group")
    session.add(group)
    await session.commit()
    await session.refresh(group)
    session.add(
        GroupUser(
            group_id=group.id,
            tenant_id=shares_tenant.id,
            user_id=group_member_user.id,
            is_admin=False,
        )
    )
    await session.commit()
    return group


@pytest.fixture
async def owned_share(session, shares_tenant, owned_room, target_group):
    """共有済みのルームと共有先グループ"""
    share = Share(tenant_id=shares_tenant.id, room_id=owned_room.id)
    session.add(share)
    await session.commit()
    await session.refresh(share)
    session.add(
        ShareRoom(
            tenant_id=shares_tenant.id,
            share_id=share.id,
            room_id=owned_room.id,
            group_id=target_group.id,
        )
    )
    await session.commit()
    return share


def _headers(login_id: str, tenant_id: str) -> dict[str, str]:
    """認証済みリクエスト用のヘッダーを作る

    Parameters
    ----------
    login_id : str
        アクセストークンの対象ユーザーのログインID
    tenant_id : str
        テナントID（トークンと X-Tenant-ID ヘッダーに使う）

    Returns
    -------
    dict[str, str]
        Authorization と X-Tenant-ID を含むヘッダー
    """
    token = create_access_token(login_id, tenant_id)
    return {"Authorization": f"Bearer {token}", "X-Tenant-ID": tenant_id}


@pytest.fixture
def owner_headers(room_owner_user, shares_tenant):
    """ルーム所有者の認証ヘッダー"""
    return _headers(room_owner_user.login_id, shares_tenant.id)


@pytest.fixture
def group_member_headers(group_member_user, shares_tenant):
    """グループ所属ユーザーの認証ヘッダー"""
    return _headers(group_member_user.login_id, shares_tenant.id)


@pytest.fixture
def unrelated_user_headers(unrelated_user, shares_tenant):
    """無関係なユーザーの認証ヘッダー"""
    return _headers(unrelated_user.login_id, shares_tenant.id)


@pytest.fixture
def client(override_get_session):
    """テスト用の非同期 HTTP クライアント"""
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
class TestShareRouter:
    """共有 API のテスト"""

    class TestUpsertShare:
        """共有の作成・更新のテスト"""

        async def test_create_share_with_owned_room_and_valid_group(
            self, client, owner_headers, owned_room, target_group
        ):
            """自分が所有するルームに実在するグループを指定して共有リンクを作成できること"""
            async with client as c:
                response = await c.post(
                    "/api/shares",
                    json={"roomId": owned_room.id, "teamIds": [target_group.id]},
                    headers=owner_headers,
                )

            assert response.status_code == 200
            body = response.json()["data"]
            assert body["roomId"] == owned_room.id
            assert body["teamIds"] == [target_group.id]

        async def test_create_share_with_invalid_group_id_returns_400(
            self, client, owner_headers, owned_room
        ):
            """存在しないグループIDを指定すると400エラーになること"""
            async with client as c:
                response = await c.post(
                    "/api/shares",
                    json={"roomId": owned_room.id, "teamIds": ["nonexistent-group"]},
                    headers=owner_headers,
                )

            assert response.status_code == 400

        async def test_create_share_with_empty_team_ids_returns_400(
            self, client, owner_headers, owned_room
        ):
            """teamIdsが空だとバリデーションエラーになること"""
            async with client as c:
                response = await c.post(
                    "/api/shares",
                    json={"roomId": owned_room.id, "teamIds": []},
                    headers=owner_headers,
                )

            assert response.status_code == 400

        async def test_upsert_share_replaces_groups_without_creating_new_share(
            self,
            client,
            session,
            shares_tenant,
            owner_headers,
            owned_room,
            target_group,
        ):
            """既存の共有リンクに再度POSTすると同一IDのまま共有先グループが入れ替わること"""
            other_group = Group(tenant_id=shares_tenant.id, name="Other Group")
            session.add(other_group)
            await session.commit()
            await session.refresh(other_group)

            async with client as c:
                first = await c.post(
                    "/api/shares",
                    json={"roomId": owned_room.id, "teamIds": [target_group.id]},
                    headers=owner_headers,
                )
                second = await c.post(
                    "/api/shares",
                    json={"roomId": owned_room.id, "teamIds": [other_group.id]},
                    headers=owner_headers,
                )

            assert first.json()["data"]["id"] == second.json()["data"]["id"]
            assert second.json()["data"]["teamIds"] == [other_group.id]

        async def test_create_share_with_other_users_room_returns_403(
            self,
            client,
            owner_headers,
            target_group,
            session,
            shares_tenant,
            unrelated_user,
            share_assistant,
        ):
            """他人が所有するルームを指定するとエラーになること"""
            other_room = Room(
                tenant_id=shares_tenant.id,
                name="Unrelated Room",
                default_assistant_id=share_assistant.id,
                user_id=unrelated_user.id,
            )
            session.add(other_room)
            await session.commit()
            await session.refresh(other_room)

            async with client as c:
                response = await c.post(
                    "/api/shares",
                    json={"roomId": other_room.id, "teamIds": [target_group.id]},
                    headers=owner_headers,
                )

            assert response.status_code == 403

    class TestResolveShareAccess:
        """共有アクセス解決のテスト"""

        async def test_resolve_access_as_owner_returns_not_read_only(
            self, client, owner_headers, owned_share, owned_room
        ):
            """所有者本人はisReadOnly=falseで解決できること"""
            async with client as c:
                response = await c.get(
                    f"/api/shares/{owned_share.id}/access", headers=owner_headers
                )

            assert response.status_code == 200
            body = response.json()["data"]
            assert body["roomId"] == owned_room.id
            assert body["isReadOnly"] is False

        async def test_resolve_access_as_shared_group_member_returns_read_only(
            self, client, group_member_headers, owned_share
        ):
            """共有先グループのメンバーはisReadOnly=trueで解決できること"""
            async with client as c:
                response = await c.get(
                    f"/api/shares/{owned_share.id}/access", headers=group_member_headers
                )

            assert response.status_code == 200
            assert response.json()["data"]["isReadOnly"] is True

        async def test_resolve_access_as_unrelated_user_returns_403(
            self, client, unrelated_user_headers, owned_share
        ):
            """共有先グループに属さないユーザーはエラーになること"""
            async with client as c:
                response = await c.get(
                    f"/api/shares/{owned_share.id}/access",
                    headers=unrelated_user_headers,
                )

            assert response.status_code == 403

        async def test_resolve_access_with_nonexistent_share_id_returns_404(
            self, client, owner_headers
        ):
            """存在しない共有リンクIDを指定すると404になること"""
            async with client as c:
                response = await c.get(
                    "/api/shares/nonexistent/access", headers=owner_headers
                )

            assert response.status_code == 404

    class TestDeleteShare:
        """共有削除のテスト"""

        async def test_delete_share_as_owner_succeeds(
            self, client, owner_headers, owned_share
        ):
            """所有者本人が削除でき、以後のアクセス解決が404になること"""
            async with client as c:
                delete_response = await c.delete(
                    f"/api/shares/{owned_share.id}", headers=owner_headers
                )
                access_response = await c.get(
                    f"/api/shares/{owned_share.id}/access", headers=owner_headers
                )

            assert delete_response.status_code == 200
            assert delete_response.json() == {"data": {"id": owned_share.id}}
            assert access_response.status_code == 404

        async def test_delete_share_as_non_owner_returns_403(
            self, client, group_member_headers, owned_share
        ):
            """所有者でないユーザーが削除しようとするとエラーになること"""
            async with client as c:
                response = await c.delete(
                    f"/api/shares/{owned_share.id}", headers=group_member_headers
                )

            assert response.status_code == 403

        async def test_delete_nonexistent_share_returns_404(
            self, client, owner_headers
        ):
            """存在しない共有リンクIDを指定すると404になること"""
            async with client as c:
                response = await c.delete(
                    "/api/shares/nonexistent", headers=owner_headers
                )

            assert response.status_code == 404

    class TestTenantIsolation:
        """テナント分離のテスト"""

        async def test_resolve_access_on_other_tenant_share_returns_404(
            self,
            client,
            session,
            other_tenant,
            owner_headers,
        ):
            """別テナントの共有リンクIDを指定した操作が404になること"""
            other_tenant_user = User(
                id=uuid4(),
                tenant_id=other_tenant.id,
                login_id="other-tenant-owner",
                name="Other Tenant Owner",
                role=UserRole.USER,
                is_required_password_reset=False,
            )
            session.add(other_tenant_user)
            await session.commit()
            await session.refresh(other_tenant_user)

            other_tenant_assistant = Assistant(
                tenant_id=other_tenant.id,
                type=AssistantType.SAAS_CHAT,
                name="Other Tenant Assistant",
                include_history=False,
            )
            session.add(other_tenant_assistant)
            await session.commit()
            await session.refresh(other_tenant_assistant)

            other_tenant_room = Room(
                tenant_id=other_tenant.id,
                name="Other Tenant Room",
                default_assistant_id=other_tenant_assistant.id,
                user_id=other_tenant_user.id,
            )
            session.add(other_tenant_room)
            await session.commit()
            await session.refresh(other_tenant_room)

            other_tenant_share = Share(
                tenant_id=other_tenant.id, room_id=other_tenant_room.id
            )
            session.add(other_tenant_share)
            await session.commit()
            await session.refresh(other_tenant_share)

            async with client as c:
                response = await c.get(
                    f"/api/shares/{other_tenant_share.id}/access", headers=owner_headers
                )

            assert response.status_code == 404
