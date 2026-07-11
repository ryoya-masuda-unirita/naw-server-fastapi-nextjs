from datetime import timedelta
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.core.security import create_access_token
from app.main import app
from app.models.assistant import Assistant, AssistantType, GroupAssistant
from app.models.group import Group, GroupUser
from app.models.room import Room, RoomPin, RoomRating
from app.models.share import Share, ShareRoom
from app.models.tenant import Tenant
from app.models.user import User, UserRole


@pytest.fixture
async def rooms_tenant(session):
    tenant = Tenant(
        id="tenant-rooms-test",
        name="Rooms Test Tenant",
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
async def room_owner_user(session, rooms_tenant):
    user = User(
        id=uuid4(),
        tenant_id=rooms_tenant.id,
        login_id="room-owner",
        name="Room Owner",
        role=UserRole.USER,
        is_required_password_reset=False,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@pytest.fixture
async def another_user_same_tenant(session, rooms_tenant):
    user = User(
        id=uuid4(),
        tenant_id=rooms_tenant.id,
        login_id="room-other",
        name="Other User",
        role=UserRole.USER,
        is_required_password_reset=False,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@pytest.fixture
async def admin_user(session, rooms_tenant):
    user = User(
        id=uuid4(),
        tenant_id=rooms_tenant.id,
        login_id="room-admin",
        name="Room Admin",
        role=UserRole.ADMIN,
        is_required_password_reset=False,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@pytest.fixture
async def group_admin_user(session, rooms_tenant):
    user = User(
        id=uuid4(),
        tenant_id=rooms_tenant.id,
        login_id="room-group-admin",
        name="Room Group Admin",
        role=UserRole.USER,
        is_required_password_reset=False,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@pytest.fixture
async def room_assistant(session, rooms_tenant):
    assistant = Assistant(
        tenant_id=rooms_tenant.id,
        type=AssistantType.SAAS_CHAT,
        name="Room Assistant",
        include_history=False,
    )
    session.add(assistant)
    await session.commit()
    await session.refresh(assistant)
    return assistant


@pytest.fixture
async def secondary_room_assistant(session, rooms_tenant):
    assistant = Assistant(
        tenant_id=rooms_tenant.id,
        type=AssistantType.SECURE,
        name="Secondary Room Assistant",
        include_history=False,
    )
    session.add(assistant)
    await session.commit()
    await session.refresh(assistant)
    return assistant


@pytest.fixture
async def other_tenant_assistant(session):
    tenant = Tenant(
        id="tenant-rooms-other",
        name="Other Rooms Tenant",
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

    assistant = Assistant(
        tenant_id=tenant.id,
        type=AssistantType.SAAS_CHAT,
        name="Other Tenant Assistant",
        include_history=False,
    )
    session.add(assistant)
    await session.commit()
    await session.refresh(assistant)
    return assistant


@pytest.fixture
async def owned_room(session, rooms_tenant, room_owner_user, room_assistant):
    room = Room(
        tenant_id=rooms_tenant.id,
        name="Owner Room",
        default_assistant_id=room_assistant.id,
        user_id=room_owner_user.id,
    )
    session.add(room)
    await session.commit()
    await session.refresh(room)
    return room


@pytest.fixture
async def other_users_room(
    session, rooms_tenant, another_user_same_tenant, room_assistant
):
    room = Room(
        tenant_id=rooms_tenant.id,
        name="Other User Room",
        default_assistant_id=room_assistant.id,
        user_id=another_user_same_tenant.id,
    )
    session.add(room)
    await session.commit()
    await session.refresh(room)
    return room


@pytest.fixture
async def shared_room(session, rooms_tenant, room_owner_user, room_assistant):
    """共有リンクで他ユーザーに共有されるルーム（room_owner_userが所有）"""
    room = Room(
        tenant_id=rooms_tenant.id,
        name="Shared Room",
        default_assistant_id=room_assistant.id,
        user_id=room_owner_user.id,
    )
    session.add(room)
    await session.commit()
    await session.refresh(room)
    return room


@pytest.fixture
async def share_target_group(session, rooms_tenant, another_user_same_tenant):
    """another_user_same_tenantが所属する共有先グループ"""
    group = Group(tenant_id=rooms_tenant.id, name="Share Target Group")
    session.add(group)
    await session.commit()
    await session.refresh(group)
    session.add(
        GroupUser(
            group_id=group.id,
            tenant_id=rooms_tenant.id,
            user_id=another_user_same_tenant.id,
            is_admin=False,
        )
    )
    await session.commit()
    return group


@pytest.fixture
async def shared_room_share(session, rooms_tenant, shared_room, share_target_group):
    """shared_roomをshare_target_groupに共有する共有リンク"""
    share = Share(tenant_id=rooms_tenant.id, room_id=shared_room.id)
    session.add(share)
    await session.commit()
    await session.refresh(share)
    session.add(
        ShareRoom(
            tenant_id=rooms_tenant.id,
            share_id=share.id,
            room_id=shared_room.id,
            group_id=share_target_group.id,
        )
    )
    await session.commit()
    return share


def _headers(login_id: str, tenant_id: str) -> dict[str, str]:
    token = create_access_token(login_id, tenant_id)
    return {"Authorization": f"Bearer {token}", "X-Tenant-ID": tenant_id}


@pytest.fixture
def room_owner_headers(room_owner_user, rooms_tenant):
    return _headers(room_owner_user.login_id, rooms_tenant.id)


@pytest.fixture
def other_user_headers(another_user_same_tenant, rooms_tenant):
    return _headers(another_user_same_tenant.login_id, rooms_tenant.id)


@pytest.fixture
def admin_headers(admin_user, rooms_tenant):
    return _headers(admin_user.login_id, rooms_tenant.id)


@pytest.fixture
def group_admin_headers(group_admin_user, rooms_tenant):
    return _headers(group_admin_user.login_id, rooms_tenant.id)


@pytest.fixture
def client(override_get_session):
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
class TestGetRooms:
    async def test_get_rooms_returns_only_owned_rooms(
        self, client, room_owner_headers, owned_room, other_users_room
    ):
        """自ユーザー所有のルームだけが返ること"""
        async with client as c:
            response = await c.get("/api/rooms", headers=room_owner_headers)

        assert response.status_code == 200
        body = response.json()
        assert body["totalElements"] == 1
        assert [room["id"] for room in body["content"]] == [owned_room.id]

    async def test_get_rooms_includes_shared_room_for_group_member(
        self,
        client,
        other_user_headers,
        other_users_room,
        shared_room,
        shared_room_share,
    ):
        """共有先グループのメンバーの一覧には自分のルームと共有ルームの両方が含まれ、
        共有されていない他人のルームは含まれないこと"""
        async with client as c:
            response = await c.get("/api/rooms", headers=other_user_headers)

        assert response.status_code == 200
        body = response.json()
        room_ids = {room["id"] for room in body["content"]}
        assert other_users_room.id in room_ids
        assert shared_room.id in room_ids
        assert body["totalElements"] == 2

    async def test_get_rooms_orders_pinned_first_then_updated_at_desc(
        self,
        client,
        session,
        rooms_tenant,
        room_owner_user,
        room_assistant,
        room_owner_headers,
    ):
        """固定済みを先頭にし、その中で更新日時降順になること"""
        older_pinned = Room(
            tenant_id=rooms_tenant.id,
            name="Older Pinned",
            default_assistant_id=room_assistant.id,
            user_id=room_owner_user.id,
        )
        newer_unpinned = Room(
            tenant_id=rooms_tenant.id,
            name="Newer Unpinned",
            default_assistant_id=room_assistant.id,
            user_id=room_owner_user.id,
        )
        newer_pinned = Room(
            tenant_id=rooms_tenant.id,
            name="Newer Pinned",
            default_assistant_id=room_assistant.id,
            user_id=room_owner_user.id,
        )
        session.add_all([older_pinned, newer_unpinned, newer_pinned])
        await session.commit()
        await session.refresh(older_pinned)
        await session.refresh(newer_unpinned)
        await session.refresh(newer_pinned)

        older_pinned.updated_at = older_pinned.updated_at - timedelta(days=1)
        newer_pinned.updated_at = newer_pinned.updated_at + timedelta(days=1)
        session.add_all([older_pinned, newer_pinned])
        session.add(
            RoomPin(
                user_id=room_owner_user.id,
                tenant_id=rooms_tenant.id,
                room_id=older_pinned.id,
            )
        )
        session.add(
            RoomPin(
                user_id=room_owner_user.id,
                tenant_id=rooms_tenant.id,
                room_id=newer_pinned.id,
            )
        )
        await session.commit()

        async with client as c:
            response = await c.get("/api/rooms", headers=room_owner_headers)

        body = response.json()
        assert [room["name"] for room in body["content"]] == [
            "Newer Pinned",
            "Older Pinned",
            "Newer Unpinned",
        ]
        assert [room["pinned"] for room in body["content"]] == [True, True, False]


@pytest.mark.asyncio
class TestAdminRoomHistories:
    """GET /api/admin/histories"""

    async def test_admin_histories_returns_page_shape(
        self, client, admin_headers, owned_room, room_owner_user
    ):
        """テナント管理者はルーム履歴一覧をPage形式で取得できること"""
        async with client as c:
            response = await c.get("/api/admin/histories", headers=admin_headers)

        assert response.status_code == 200
        body = response.json()
        assert {"content", "totalElements", "number", "size"}.issubset(body.keys())
        assert body["totalElements"] >= 1
        room = next(item for item in body["content"] if item["id"] == owned_room.id)
        assert room["userId"] == str(room_owner_user.id)
        assert room["userName"] == room_owner_user.name
        assert room["indexIds"] == []

    async def test_admin_history_detail_returns_room(
        self, client, admin_headers, owned_room
    ):
        """テナント管理者はルーム履歴1件を取得できること"""
        async with client as c:
            response = await c.get(
                f"/api/admin/histories/{owned_room.id}", headers=admin_headers
            )

        assert response.status_code == 200
        assert response.json()["id"] == owned_room.id

    async def test_admin_histories_filters_by_user_id(
        self, client, admin_headers, owned_room, other_users_room, room_owner_user
    ):
        """userId指定時、指定ユーザーのルームのみ返ること"""
        async with client as c:
            response = await c.get(
                "/api/admin/histories",
                params={"userId": str(room_owner_user.id)},
                headers=admin_headers,
            )

        assert response.status_code == 200
        ids = [room["id"] for room in response.json()["content"]]
        assert owned_room.id in ids
        assert other_users_room.id not in ids

    async def test_admin_histories_filters_unrated_rooms(
        self, client, admin_headers, owned_room, other_users_room, session
    ):
        """roomRate=unRated指定時、未評価ルームのみ返ること"""
        owned_room.rating = RoomRating.GOOD
        session.add(owned_room)
        await session.commit()

        async with client as c:
            response = await c.get(
                "/api/admin/histories",
                params={"roomRate": "unRated"},
                headers=admin_headers,
            )

        assert response.status_code == 200
        ids = [room["id"] for room in response.json()["content"]]
        assert owned_room.id not in ids
        assert other_users_room.id in ids

    async def test_admin_histories_filters_by_name(
        self, client, admin_headers, owned_room, other_users_room
    ):
        """name指定時、ルーム名の部分一致で絞り込まれること"""
        async with client as c:
            response = await c.get(
                "/api/admin/histories",
                params={"name": "Owner"},
                headers=admin_headers,
            )

        assert response.status_code == 200
        ids = [room["id"] for room in response.json()["content"]]
        assert owned_room.id in ids
        assert other_users_room.id not in ids

    async def test_admin_histories_orders_by_name_desc(
        self, client, admin_headers, owned_room, other_users_room
    ):
        """orderBy=name&reverse=true指定時、名前降順で返ること"""
        async with client as c:
            response = await c.get(
                "/api/admin/histories",
                params={"orderBy": "name", "reverse": "true"},
                headers=admin_headers,
            )

        assert response.status_code == 200
        names = [room["name"] for room in response.json()["content"]]
        assert names == sorted(names, reverse=True)

    async def test_group_admin_sees_managed_assistant_rooms_only(
        self,
        client,
        group_admin_headers,
        session,
        rooms_tenant,
        group_admin_user,
        room_owner_user,
        room_assistant,
        secondary_room_assistant,
    ):
        """グループ管理者は管理グループに紐づくアシスタントのルームのみ取得できること"""
        group = Group(tenant_id=rooms_tenant.id, name="Managed Group")
        session.add(group)
        await session.commit()
        await session.refresh(group)
        session.add(
            GroupUser(
                group_id=group.id,
                tenant_id=rooms_tenant.id,
                user_id=group_admin_user.id,
                is_admin=True,
            )
        )
        session.add(
            GroupAssistant(
                group_id=group.id,
                tenant_id=rooms_tenant.id,
                assistant_id=room_assistant.id,
            )
        )
        visible_room = Room(
            tenant_id=rooms_tenant.id,
            name="Visible Room",
            default_assistant_id=room_assistant.id,
            user_id=room_owner_user.id,
        )
        hidden_room = Room(
            tenant_id=rooms_tenant.id,
            name="Hidden Room",
            default_assistant_id=secondary_room_assistant.id,
            user_id=room_owner_user.id,
        )
        session.add_all([visible_room, hidden_room])
        await session.commit()

        async with client as c:
            response = await c.get("/api/admin/histories", headers=group_admin_headers)

        assert response.status_code == 200
        ids = [room["id"] for room in response.json()["content"]]
        assert visible_room.id in ids
        assert hidden_room.id not in ids

    async def test_general_user_cannot_access_admin_histories(
        self, client, other_user_headers
    ):
        """管理者でもグループ管理者でもないユーザーは403になること"""
        async with client as c:
            response = await c.get("/api/admin/histories", headers=other_user_headers)

        assert response.status_code == 403

    async def test_invalid_created_at_returns_400(self, client, admin_headers):
        """createdAtFromがyyyy-MM-dd形式でない場合400になること"""
        async with client as c:
            response = await c.get(
                "/api/admin/histories",
                params={"createdAtFrom": "invalid-date"},
                headers=admin_headers,
            )

        assert response.status_code == 400

    async def test_get_rooms_filters_by_name_case_insensitive(
        self,
        client,
        session,
        rooms_tenant,
        room_owner_user,
        room_assistant,
        room_owner_headers,
    ):
        """ルーム名の部分一致検索が大文字小文字を区別しないこと"""
        session.add_all(
            [
                Room(
                    tenant_id=rooms_tenant.id,
                    name="Alpha room",
                    default_assistant_id=room_assistant.id,
                    user_id=room_owner_user.id,
                ),
                Room(
                    tenant_id=rooms_tenant.id,
                    name="Beta room",
                    default_assistant_id=room_assistant.id,
                    user_id=room_owner_user.id,
                ),
            ]
        )
        await session.commit()

        async with client as c:
            response = await c.get(
                "/api/rooms", params={"name": "ALPHA"}, headers=room_owner_headers
            )

        assert response.status_code == 200
        assert [room["name"] for room in response.json()["content"]] == ["Alpha room"]

    async def test_get_rooms_returns_422_when_page_is_negative(
        self, client, room_owner_headers
    ):
        """pageが負数の場合422になること"""
        async with client as c:
            response = await c.get(
                "/api/rooms", params={"page": -1}, headers=room_owner_headers
            )

        assert response.status_code == 422

    async def test_get_rooms_returns_422_when_size_is_out_of_range(
        self, client, room_owner_headers
    ):
        """sizeが上限超過の場合422になること"""
        async with client as c:
            response = await c.get(
                "/api/rooms", params={"size": 101}, headers=room_owner_headers
            )

        assert response.status_code == 422

    async def test_get_rooms_returns_403_when_tenant_header_mismatches_token(
        self, client, rooms_tenant, room_owner_user
    ):
        """JWTと異なるX-Tenant-IDは403になること"""
        headers = _headers(room_owner_user.login_id, rooms_tenant.id)
        headers["X-Tenant-ID"] = "another-tenant"

        async with client as c:
            response = await c.get("/api/rooms", headers=headers)

        assert response.status_code == 403


@pytest.mark.asyncio
class TestGetRoom:
    async def test_get_room_returns_owned_room(
        self, client, room_owner_headers, owned_room
    ):
        """所有ルームの詳細を取得できること"""
        async with client as c:
            response = await c.get(
                f"/api/rooms/{owned_room.id}", headers=room_owner_headers
            )

        assert response.status_code == 200
        assert response.json()["id"] == owned_room.id

    async def test_get_room_returns_403_for_other_users_room(
        self, client, room_owner_headers, other_users_room
    ):
        """共有されていない他ユーザー所有ルームは403になること"""
        async with client as c:
            response = await c.get(
                f"/api/rooms/{other_users_room.id}", headers=room_owner_headers
            )

        assert response.status_code == 403

    async def test_get_room_returns_404_for_unknown_room(
        self, client, room_owner_headers
    ):
        """存在しないルームは404になること"""
        async with client as c:
            response = await c.get("/api/rooms/unknown", headers=room_owner_headers)

        assert response.status_code == 404

    async def test_get_room_with_shared_group_member_returns_200(
        self, client, other_user_headers, shared_room, shared_room_share
    ):
        """共有リンクを持つ共有先グループのメンバーはルームを取得できること"""
        async with client as c:
            response = await c.get(
                f"/api/rooms/{shared_room.id}", headers=other_user_headers
            )

        assert response.status_code == 200
        assert response.json()["id"] == shared_room.id


@pytest.mark.asyncio
class TestCreateRoom:
    async def test_create_room_succeeds(
        self, client, room_owner_headers, rooms_tenant, room_owner_user, room_assistant
    ):
        """ルームを作成できること"""
        async with client as c:
            response = await c.post(
                "/api/rooms",
                json={"name": "Created Room", "assistantId": room_assistant.id},
                headers=room_owner_headers,
            )

        assert response.status_code == 200
        body = response.json()
        assert body["tenantId"] == rooms_tenant.id
        assert body["userId"] == str(room_owner_user.id)
        assert body["defaultAssistantId"] == room_assistant.id

    async def test_create_room_truncates_name_over_255_chars(
        self, client, room_owner_headers, room_assistant
    ):
        """255文字超の名前は切り詰めて保存されること"""
        long_name = "a" * 300
        async with client as c:
            response = await c.post(
                "/api/rooms",
                json={"name": long_name, "assistantId": room_assistant.id},
                headers=room_owner_headers,
            )

        assert response.status_code == 200
        assert len(response.json()["name"]) == 255

    async def test_create_room_returns_400_for_invalid_assistant_id(
        self, client, room_owner_headers
    ):
        """不存在アシスタントIDは400になること"""
        async with client as c:
            response = await c.post(
                "/api/rooms",
                json={"name": "Created Room", "assistantId": "invalid"},
                headers=room_owner_headers,
            )

        assert response.status_code == 400

    async def test_create_room_returns_400_for_other_tenant_assistant(
        self, client, room_owner_headers, other_tenant_assistant
    ):
        """他テナントのアシスタントIDは400になること"""
        async with client as c:
            response = await c.post(
                "/api/rooms",
                json={"name": "Created Room", "assistantId": other_tenant_assistant.id},
                headers=room_owner_headers,
            )

        assert response.status_code == 400

    async def test_create_room_returns_401_without_authentication(
        self, client, rooms_tenant, room_assistant
    ):
        """未認証は401になること"""
        async with client as c:
            response = await c.post(
                "/api/rooms",
                json={"name": "Created Room", "assistantId": room_assistant.id},
                headers={"X-Tenant-ID": rooms_tenant.id},
            )

        assert response.status_code == 401


@pytest.mark.asyncio
class TestUpdateRoom:
    async def test_update_room_succeeds(self, client, room_owner_headers, owned_room):
        """所有ルームの名前を更新できること"""
        async with client as c:
            response = await c.patch(
                f"/api/rooms/{owned_room.id}",
                json={"name": "Updated Room"},
                headers=room_owner_headers,
            )

        assert response.status_code == 200
        assert response.json()["name"] == "Updated Room"

    async def test_update_room_truncates_name_over_255_chars(
        self, client, room_owner_headers, owned_room
    ):
        """更新時も255文字超は切り詰められること"""
        async with client as c:
            response = await c.patch(
                f"/api/rooms/{owned_room.id}",
                json={"name": "b" * 300},
                headers=room_owner_headers,
            )

        assert response.status_code == 200
        assert len(response.json()["name"]) == 255

    async def test_update_room_returns_404_for_other_users_room(
        self, client, room_owner_headers, other_users_room
    ):
        """他ユーザー所有ルームは更新できないこと"""
        async with client as c:
            response = await c.patch(
                f"/api/rooms/{other_users_room.id}",
                json={"name": "Denied"},
                headers=room_owner_headers,
            )

        assert response.status_code == 404

    async def test_update_room_with_shared_group_member_returns_404(
        self, client, other_user_headers, shared_room, shared_room_share
    ):
        """共有先グループのメンバーは書き込み系（更新）を行えず404になること
        （書き込み系は引き続き所有者限定のため、_get_owned_room_or_404の挙動どおり）"""
        async with client as c:
            response = await c.patch(
                f"/api/rooms/{shared_room.id}",
                json={"name": "Denied"},
                headers=other_user_headers,
            )

        assert response.status_code == 404


@pytest.mark.asyncio
class TestDeleteRoom:
    async def test_delete_room_succeeds(self, client, room_owner_headers, owned_room):
        """所有ルームを削除できること"""
        async with client as c:
            response = await c.delete(
                f"/api/rooms/{owned_room.id}", headers=room_owner_headers
            )

        assert response.status_code == 204

    async def test_delete_room_deletes_related_room_pin_by_cascade(
        self,
        client,
        session,
        room_owner_headers,
        rooms_tenant,
        room_owner_user,
        owned_room,
    ):
        """ルーム削除時に関連する固定レコードも削除されること"""
        session.add(
            RoomPin(
                user_id=room_owner_user.id,
                tenant_id=rooms_tenant.id,
                room_id=owned_room.id,
            )
        )
        await session.commit()

        async with client as c:
            response = await c.delete(
                f"/api/rooms/{owned_room.id}", headers=room_owner_headers
            )

        assert response.status_code == 204
        room_pin = (
            (
                await session.execute(
                    select(RoomPin).where(
                        RoomPin.user_id == room_owner_user.id,
                        RoomPin.tenant_id == rooms_tenant.id,
                        RoomPin.room_id == owned_room.id,
                    )
                )
            )
            .scalars()
            .first()
        )
        assert room_pin is None

    async def test_delete_room_returns_404_for_other_users_room(
        self, client, room_owner_headers, other_users_room
    ):
        """他ユーザー所有ルームは削除できないこと"""
        async with client as c:
            response = await c.delete(
                f"/api/rooms/{other_users_room.id}", headers=room_owner_headers
            )

        assert response.status_code == 404


@pytest.mark.asyncio
class TestPinRoom:
    async def test_pin_room_succeeds(
        self,
        client,
        session,
        room_owner_headers,
        rooms_tenant,
        room_owner_user,
        owned_room,
    ):
        """ルームを固定できること"""
        async with client as c:
            response = await c.post(
                f"/api/rooms/{owned_room.id}/pin", headers=room_owner_headers
            )

        assert response.status_code == 204
        room_pin = (
            (
                await session.execute(
                    select(RoomPin).where(
                        RoomPin.user_id == room_owner_user.id,
                        RoomPin.tenant_id == rooms_tenant.id,
                        RoomPin.room_id == owned_room.id,
                    )
                )
            )
            .scalars()
            .first()
        )
        assert room_pin is not None

    async def test_pin_room_is_idempotent(
        self,
        client,
        session,
        room_owner_headers,
        rooms_tenant,
        room_owner_user,
        owned_room,
    ):
        """同じルームを複数回固定しても1件のまま成功すること"""
        async with client as c:
            first_response = await c.post(
                f"/api/rooms/{owned_room.id}/pin", headers=room_owner_headers
            )
            second_response = await c.post(
                f"/api/rooms/{owned_room.id}/pin", headers=room_owner_headers
            )

        assert first_response.status_code == 204
        assert second_response.status_code == 204
        room_pins = (
            (
                await session.execute(
                    select(RoomPin).where(
                        RoomPin.user_id == room_owner_user.id,
                        RoomPin.tenant_id == rooms_tenant.id,
                        RoomPin.room_id == owned_room.id,
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(room_pins) == 1

    async def test_pin_room_returns_404_for_other_users_room(
        self, client, room_owner_headers, other_users_room
    ):
        """他ユーザー所有ルームは固定できないこと"""
        async with client as c:
            response = await c.post(
                f"/api/rooms/{other_users_room.id}/pin", headers=room_owner_headers
            )

        assert response.status_code == 404

    async def test_pin_room_returns_404_for_unknown_room(
        self, client, room_owner_headers
    ):
        """存在しないルームは固定できないこと"""
        async with client as c:
            response = await c.post(
                "/api/rooms/unknown/pin", headers=room_owner_headers
            )

        assert response.status_code == 404


@pytest.mark.asyncio
class TestUnpinRoom:
    async def test_unpin_room_succeeds(
        self,
        client,
        session,
        room_owner_headers,
        rooms_tenant,
        room_owner_user,
        owned_room,
    ):
        """固定済みルームを解除できること"""
        session.add(
            RoomPin(
                user_id=room_owner_user.id,
                tenant_id=rooms_tenant.id,
                room_id=owned_room.id,
            )
        )
        await session.commit()

        async with client as c:
            response = await c.delete(
                f"/api/rooms/{owned_room.id}/pin", headers=room_owner_headers
            )

        assert response.status_code == 204
        room_pin = (
            (
                await session.execute(
                    select(RoomPin).where(
                        RoomPin.user_id == room_owner_user.id,
                        RoomPin.tenant_id == rooms_tenant.id,
                        RoomPin.room_id == owned_room.id,
                    )
                )
            )
            .scalars()
            .first()
        )
        assert room_pin is None

    async def test_unpin_room_returns_404_when_room_is_not_pinned(
        self, client, room_owner_headers, owned_room
    ):
        """未固定ルームの解除は404になること"""
        async with client as c:
            response = await c.delete(
                f"/api/rooms/{owned_room.id}/pin", headers=room_owner_headers
            )

        assert response.status_code == 404

    async def test_unpin_room_returns_404_for_unknown_room(
        self, client, room_owner_headers
    ):
        """存在しないルームの解除は404になること"""
        async with client as c:
            response = await c.delete(
                "/api/rooms/unknown/pin", headers=room_owner_headers
            )

        assert response.status_code == 404


@pytest.mark.asyncio
class TestFeedbackRoom:
    async def test_feedback_room_updates_rating(
        self, client, session, room_owner_headers, owned_room
    ):
        """ルーム所有者が満足度評価を登録できること"""
        async with client as c:
            response = await c.post(
                f"/api/rooms/{owned_room.id}/feedback",
                json={"rating": "EXCELLENT"},
                headers=room_owner_headers,
            )

        assert response.status_code == 204
        await session.refresh(owned_room)
        assert owned_room.rating == RoomRating.EXCELLENT

    async def test_feedback_room_returns_401_without_token(self, client, owned_room):
        """未ログインでは満足度評価を登録できないこと"""
        async with client as c:
            response = await c.post(
                f"/api/rooms/{owned_room.id}/feedback",
                json={"rating": "EXCELLENT"},
            )

        assert response.status_code == 401

    async def test_feedback_room_returns_404_for_unknown_room(
        self, client, room_owner_headers
    ):
        """存在しないルームには満足度評価を登録できないこと"""
        async with client as c:
            response = await c.post(
                "/api/rooms/unknown/feedback",
                json={"rating": "EXCELLENT"},
                headers=room_owner_headers,
            )

        assert response.status_code == 404

    async def test_feedback_room_returns_404_for_other_users_room(
        self, client, room_owner_headers, other_users_room
    ):
        """他ユーザー所有ルームには満足度評価を登録できないこと"""
        async with client as c:
            response = await c.post(
                f"/api/rooms/{other_users_room.id}/feedback",
                json={"rating": "EXCELLENT"},
                headers=room_owner_headers,
            )

        assert response.status_code == 404

    async def test_feedback_room_returns_422_for_invalid_rating(
        self, client, room_owner_headers, owned_room
    ):
        """不正なratingでは満足度評価を登録できないこと"""
        async with client as c:
            response = await c.post(
                f"/api/rooms/{owned_room.id}/feedback",
                json={"rating": "INVALID"},
                headers=room_owner_headers,
            )

        assert response.status_code == 422
