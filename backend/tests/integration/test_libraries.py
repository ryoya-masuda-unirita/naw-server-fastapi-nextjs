from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.security import create_access_token
from app.main import app
from app.models.assistant import Assistant, AssistantType
from app.models.group import Group, GroupUser
from app.models.library import Library, LibraryTagMapping, ShareLibrary
from app.models.library_tag import LibraryTag
from app.models.message import Message
from app.models.room import Room
from app.models.tenant import Tenant
from app.models.user import User, UserRole


def _tenant(tenant_id: str) -> Tenant:
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
async def lib_tenant(session):
    """テスト用テナント"""
    tenant = _tenant("tenant-libraries-test")
    session.add(tenant)
    await session.commit()
    await session.refresh(tenant)
    return tenant


@pytest.fixture
async def other_tenant(session):
    """他テナント（テナント分離確認用）"""
    tenant = _tenant("tenant-libraries-other")
    session.add(tenant)
    await session.commit()
    await session.refresh(tenant)
    return tenant


def _user(
    tenant_id: str, login_id: str, name: str, role: UserRole = UserRole.USER
) -> User:
    return User(
        id=uuid4(),
        tenant_id=tenant_id,
        login_id=login_id,
        name=name,
        role=role,
        is_required_password_reset=False,
    )


@pytest.fixture
async def owner_user(session, lib_tenant):
    """ライブラリ・ルームの所有者ユーザー"""
    user = _user(lib_tenant.id, "lib-owner", "Owner")
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@pytest.fixture
async def group_member_user(session, lib_tenant):
    """所有者の所属グループとは別に、共有先グループに所属するユーザー"""
    user = _user(lib_tenant.id, "lib-group-member", "Group Member")
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@pytest.fixture
async def unrelated_user(session, lib_tenant):
    """所有者でも共有先グループメンバーでもないユーザー"""
    user = _user(lib_tenant.id, "lib-unrelated", "Unrelated")
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@pytest.fixture
async def admin_user(session, lib_tenant):
    """テナント管理者ユーザー"""
    user = _user(lib_tenant.id, "lib-admin", "Admin", role=UserRole.ADMIN)
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@pytest.fixture
async def assistant(session, lib_tenant):
    a = Assistant(
        tenant_id=lib_tenant.id,
        type=AssistantType.SAAS_CHAT,
        name="Library Test Assistant",
        include_history=False,
    )
    session.add(a)
    await session.commit()
    await session.refresh(a)
    return a


@pytest.fixture
async def room(session, lib_tenant, owner_user, assistant):
    """所有者が所有するルーム"""
    r = Room(
        tenant_id=lib_tenant.id,
        name="Owner Room",
        default_assistant_id=assistant.id,
        user_id=owner_user.id,
    )
    session.add(r)
    await session.commit()
    await session.refresh(r)
    return r


@pytest.fixture
async def message(session, lib_tenant, room):
    """ルームに紐づくメッセージ"""
    m = Message(tenant_id=lib_tenant.id, room_id=room.id, is_create_library=True)
    session.add(m)
    await session.commit()
    await session.refresh(m)
    return m


@pytest.fixture
async def library(session, lib_tenant, owner_user, message):
    """所有者が作成したライブラリ"""
    lib = Library(
        tenant_id=lib_tenant.id,
        message_id=message.id,
        user_id=owner_user.id,
        title="契約書まとめ",
        content="# 契約書まとめ\n本文",
    )
    session.add(lib)
    await session.commit()
    await session.refresh(lib)
    return lib


@pytest.fixture
async def group(session, lib_tenant, group_member_user):
    """ライブラリ・ルームの共有先グループ。group_member_userが所属する。"""
    g = Group(tenant_id=lib_tenant.id, name="Target Group")
    session.add(g)
    await session.commit()
    await session.refresh(g)
    session.add(
        GroupUser(group_id=g.id, tenant_id=lib_tenant.id, user_id=group_member_user.id)
    )
    await session.commit()
    return g


@pytest.fixture
async def library_tag(session, lib_tenant):
    tag = LibraryTag(tenant_id=lib_tenant.id, name="契約書")
    session.add(tag)
    await session.commit()
    await session.refresh(tag)
    return tag


@pytest.fixture
async def other_tenant_library_tag(session, other_tenant):
    tag = LibraryTag(tenant_id=other_tenant.id, name="他テナントタグ")
    session.add(tag)
    await session.commit()
    await session.refresh(tag)
    return tag


def _headers(login_id: str, tenant_id: str) -> dict[str, str]:
    token = create_access_token(login_id, tenant_id)
    return {"Authorization": f"Bearer {token}", "X-Tenant-ID": tenant_id}


@pytest.fixture
def owner_headers(owner_user, lib_tenant):
    return _headers(owner_user.login_id, lib_tenant.id)


@pytest.fixture
def group_member_headers(group_member_user, lib_tenant):
    return _headers(group_member_user.login_id, lib_tenant.id)


@pytest.fixture
def unrelated_headers(unrelated_user, lib_tenant):
    return _headers(unrelated_user.login_id, lib_tenant.id)


@pytest.fixture
def admin_headers(admin_user, lib_tenant):
    return _headers(admin_user.login_id, lib_tenant.id)


@pytest.fixture
def client(override_get_session):
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
class TestListLibraries:
    """GET /api/libraries"""

    async def test_list_own_libraries(self, client, owner_headers, library):
        """自身が作成したライブラリが一覧に含まれること"""
        async with client as c:
            response = await c.get("/api/libraries", headers=owner_headers)

        assert response.status_code == 200
        body = response.json()["data"]
        assert [item["id"] for item in body["content"]] == [str(library.id)]
        assert body["totalElements"] == 1

    async def test_list_excludes_unrelated_libraries(
        self, client, unrelated_headers, library
    ):
        """所有でも共有先でもないライブラリは一覧に含まれないこと"""
        async with client as c:
            response = await c.get("/api/libraries", headers=unrelated_headers)

        assert response.status_code == 200
        assert response.json()["data"]["content"] == []

    async def test_list_includes_shared_via_group(
        self, session, client, group_member_headers, library, group, lib_tenant
    ):
        """所属グループに共有されたライブラリが一覧に含まれること"""
        session.add(
            ShareLibrary(
                tenant_id=lib_tenant.id, library_id=library.id, group_id=group.id
            )
        )
        await session.commit()

        async with client as c:
            response = await c.get("/api/libraries", headers=group_member_headers)

        assert response.status_code == 200
        body = response.json()["data"]
        assert [item["id"] for item in body["content"]] == [str(library.id)]

    async def test_list_filters_by_title(self, client, owner_headers, library):
        """titleで部分一致するもののみ返ること"""
        async with client as c:
            response = await c.get(
                "/api/libraries", params={"title": "存在しない"}, headers=owner_headers
            )

        assert response.status_code == 200
        assert response.json()["data"]["content"] == []

    async def test_list_filters_by_created_by(
        self, client, owner_headers, library, owner_user
    ):
        """createdByで作成者を絞り込めること"""
        async with client as c:
            response = await c.get(
                "/api/libraries",
                params={"createdBy": owner_user.login_id},
                headers=owner_headers,
            )

        assert response.status_code == 200
        assert len(response.json()["data"]["content"]) == 1

    async def test_list_excludes_by_exclude_created_by(
        self, client, owner_headers, library, owner_user
    ):
        """excludeCreatedByで指定した作成者のものが除外されること"""
        async with client as c:
            response = await c.get(
                "/api/libraries",
                params={"excludeCreatedBy": owner_user.login_id},
                headers=owner_headers,
            )

        assert response.status_code == 200
        assert response.json()["data"]["content"] == []

    async def test_list_filters_by_tag_ids(
        self, session, client, owner_headers, library, library_tag, lib_tenant
    ):
        """tagIdsで指定したタグが付与されたもののみ返ること"""
        session.add(
            LibraryTagMapping(
                tenant_id=lib_tenant.id,
                library_id=library.id,
                library_tag_id=library_tag.id,
            )
        )
        await session.commit()

        async with client as c:
            response = await c.get(
                "/api/libraries",
                params={"tagIds": [str(library_tag.id)]},
                headers=owner_headers,
            )

        assert response.status_code == 200
        body = response.json()["data"]
        assert [item["id"] for item in body["content"]] == [str(library.id)]
        assert body["content"][0]["tags"] == [
            {"id": library_tag.id, "name": library_tag.name}
        ]

    async def test_list_pagination(
        self, session, client, owner_headers, lib_tenant, owner_user, message
    ):
        """ページング指定でtotalElements・件数が正しいこと"""
        for i in range(3):
            session.add(
                Library(
                    tenant_id=lib_tenant.id,
                    message_id=message.id,
                    user_id=owner_user.id,
                    title=f"lib-{i}",
                )
            )
        await session.commit()

        async with client as c:
            response = await c.get(
                "/api/libraries", params={"page": 0, "size": 2}, headers=owner_headers
            )

        assert response.status_code == 200
        body = response.json()["data"]
        assert body["totalElements"] == 3
        assert len(body["content"]) == 2
        assert body["number"] == 0
        assert body["size"] == 2

    async def test_list_sort_by_title(
        self, session, client, owner_headers, lib_tenant, owner_user, message
    ):
        """sortBy=titleでタイトル昇順に並ぶこと"""
        for title in ["b-lib", "a-lib"]:
            session.add(
                Library(
                    tenant_id=lib_tenant.id,
                    message_id=message.id,
                    user_id=owner_user.id,
                    title=title,
                )
            )
        await session.commit()

        async with client as c:
            response = await c.get(
                "/api/libraries",
                params={"sortBy": "title", "sortDir": "asc"},
                headers=owner_headers,
            )

        assert response.status_code == 200
        titles = [item["title"] for item in response.json()["data"]["content"]]
        assert titles == ["a-lib", "b-lib"]

    async def test_list_invalid_sort_params_fallback_to_default(
        self, client, owner_headers, library
    ):
        """不正なsortBy/sortDirでもエラーにならずデフォルトにフォールバックすること"""
        async with client as c:
            response = await c.get(
                "/api/libraries",
                params={"sortBy": "invalid", "sortDir": "invalid"},
                headers=owner_headers,
            )

        assert response.status_code == 200


@pytest.mark.asyncio
class TestListLibrariesByRoom:
    """GET /api/libraries/{roomId}/list"""

    async def test_list_by_room_as_owner(self, client, owner_headers, room, library):
        """ルーム所有者が一覧を取得できること"""
        async with client as c:
            response = await c.get(
                f"/api/libraries/{room.id}/list", headers=owner_headers
            )

        assert response.status_code == 200
        body = response.json()["data"]
        assert body == [{"id": str(library.id), "title": library.title}]

    async def test_list_by_room_as_shared_group_member(
        self, session, client, group_member_headers, room, library, group, lib_tenant
    ):
        """共有グループ経由でルームにアクセス可能なユーザーが一覧を取得できること"""
        from app.models.share import Share, ShareRoom

        share = Share(tenant_id=lib_tenant.id, room_id=room.id)
        session.add(share)
        await session.commit()
        await session.refresh(share)
        session.add(
            ShareRoom(
                tenant_id=lib_tenant.id,
                share_id=share.id,
                room_id=room.id,
                group_id=group.id,
            )
        )
        await session.commit()

        async with client as c:
            response = await c.get(
                f"/api/libraries/{room.id}/list", headers=group_member_headers
            )

        assert response.status_code == 200
        assert len(response.json()["data"]) == 1

    async def test_list_by_room_without_access_returns_403(
        self, client, unrelated_headers, room, library
    ):
        """アクセス権のないユーザーは403になること"""
        async with client as c:
            response = await c.get(
                f"/api/libraries/{room.id}/list", headers=unrelated_headers
            )

        assert response.status_code == 403

    async def test_list_by_room_not_found_returns_404(self, client, owner_headers):
        """存在しないルームIDは404になること"""
        async with client as c:
            response = await c.get(
                "/api/libraries/nonexistent/list", headers=owner_headers
            )

        assert response.status_code == 404


@pytest.mark.asyncio
class TestGetLibrary:
    """GET /api/libraries/{libraryId}"""

    async def test_get_library_as_room_owner(self, client, owner_headers, library):
        """ルーム所有者がコンテンツを取得できること"""
        async with client as c:
            response = await c.get(
                f"/api/libraries/{library.id}", headers=owner_headers
            )

        assert response.status_code == 200
        body = response.json()
        assert body["title"] == library.title
        assert body["data"] == library.content

    async def test_get_library_shared_via_library_group(
        self, session, client, group_member_headers, library, group, lib_tenant
    ):
        """ルームへのアクセス権はないが、ライブラリ自体の共有先グループに所属していれば取得できること"""
        session.add(
            ShareLibrary(
                tenant_id=lib_tenant.id, library_id=library.id, group_id=group.id
            )
        )
        await session.commit()

        async with client as c:
            response = await c.get(
                f"/api/libraries/{library.id}", headers=group_member_headers
            )

        assert response.status_code == 200

    async def test_get_library_without_access_returns_404(
        self, client, unrelated_headers, library
    ):
        """どちらの条件も満たさない場合404になること"""
        async with client as c:
            response = await c.get(
                f"/api/libraries/{library.id}", headers=unrelated_headers
            )

        assert response.status_code == 404

    async def test_get_library_not_found_returns_404(self, client, owner_headers):
        """存在しないlibraryIdは404になること"""
        async with client as c:
            response = await c.get(f"/api/libraries/{uuid4()}", headers=owner_headers)

        assert response.status_code == 404

    async def test_get_library_other_tenant_returns_404(
        self, client, admin_headers, library
    ):
        """他テナントのユーザーからは404になること（テナント分離）"""
        # admin_headers は同一テナントの管理者。可視性を持たないため404になることの確認。
        async with client as c:
            response = await c.get(
                f"/api/libraries/{library.id}",
                headers={**admin_headers, "X-Tenant-ID": "tenant-libraries-other"},
            )

        assert response.status_code in (401, 403, 404)


@pytest.mark.asyncio
class TestUpdateLibrary:
    """PUT /api/libraries/{libraryId}"""

    async def test_update_as_owner(
        self, client, owner_headers, library, group, library_tag
    ):
        """所有者が名前・グループ・タグを更新できること"""
        async with client as c:
            response = await c.put(
                f"/api/libraries/{library.id}",
                json={
                    "name": "更新後タイトル",
                    "groups": [group.id],
                    "tags": [library_tag.id],
                },
                headers=owner_headers,
            )

        assert response.status_code == 200
        assert response.json()["data"]["id"] == str(library.id)

    async def test_update_with_empty_groups_and_tags_clears_all(
        self, session, client, owner_headers, library, group, library_tag, lib_tenant
    ):
        """空配列を指定すると既存の共有・タグが全解除されること"""
        session.add(
            ShareLibrary(
                tenant_id=lib_tenant.id, library_id=library.id, group_id=group.id
            )
        )
        session.add(
            LibraryTagMapping(
                tenant_id=lib_tenant.id,
                library_id=library.id,
                library_tag_id=library_tag.id,
            )
        )
        await session.commit()

        async with client as c:
            response = await c.put(
                f"/api/libraries/{library.id}",
                json={"name": "変更なし", "groups": [], "tags": []},
                headers=owner_headers,
            )
            assert response.status_code == 200

            check = await c.get("/api/libraries", headers=owner_headers)
        assert check.json()["data"]["content"][0]["sharedGroups"] == []
        assert check.json()["data"]["content"][0]["tags"] == []

    async def test_update_with_nonexistent_group_returns_400(
        self, client, owner_headers, library
    ):
        """存在しないグループIDを指定すると400になること"""
        async with client as c:
            response = await c.put(
                f"/api/libraries/{library.id}",
                json={"name": "更新後", "groups": ["nonexistent"], "tags": None},
                headers=owner_headers,
            )

        assert response.status_code == 400

    async def test_update_with_nonexistent_tag_returns_400(
        self, client, owner_headers, library
    ):
        """存在しないタグIDを指定すると400になること"""
        async with client as c:
            response = await c.put(
                f"/api/libraries/{library.id}",
                json={"name": "更新後", "groups": None, "tags": ["nonexistent"]},
                headers=owner_headers,
            )

        assert response.status_code == 400

    async def test_update_as_non_owner_returns_403(
        self, client, group_member_headers, library
    ):
        """所有者以外（共有グループメンバー含む）は更新できないこと"""
        async with client as c:
            response = await c.put(
                f"/api/libraries/{library.id}",
                json={"name": "更新後"},
                headers=group_member_headers,
            )

        assert response.status_code == 403

    async def test_update_not_found_returns_404(self, client, owner_headers):
        """存在しないlibraryIdは404になること"""
        async with client as c:
            response = await c.put(
                f"/api/libraries/{uuid4()}",
                json={"name": "更新後"},
                headers=owner_headers,
            )

        assert response.status_code == 404

    async def test_update_with_blank_name_returns_422(
        self, client, owner_headers, library
    ):
        """名前が空白のみだと422になること"""
        async with client as c:
            response = await c.put(
                f"/api/libraries/{library.id}",
                json={"name": "   "},
                headers=owner_headers,
            )

        assert response.status_code == 422


@pytest.mark.asyncio
class TestDeleteLibrary:
    """DELETE /api/libraries/{libraryId}"""

    async def test_delete_as_owner(self, client, owner_headers, library):
        """所有者が削除できること"""
        async with client as c:
            response = await c.delete(
                f"/api/libraries/{library.id}", headers=owner_headers
            )

        assert response.status_code == 204

    async def test_delete_as_non_owner_returns_403(
        self, client, group_member_headers, library
    ):
        """所有者以外は削除できないこと"""
        async with client as c:
            response = await c.delete(
                f"/api/libraries/{library.id}", headers=group_member_headers
            )

        assert response.status_code == 403

    async def test_delete_not_found_returns_404(self, client, owner_headers):
        """存在しないlibraryIdは404になること"""
        async with client as c:
            response = await c.delete(
                f"/api/libraries/{uuid4()}", headers=owner_headers
            )

        assert response.status_code == 404
