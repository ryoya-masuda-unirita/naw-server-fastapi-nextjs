from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col

from app.core.security import create_access_token
from app.main import app
from app.models.assistant import Assistant, AssistantEndpoint, AssistantType
from app.models.group import Group, GroupUser
from app.models.library import (
    Library,
    LibraryContent,
    LibraryTagMapping,
    ShareLibrary,
)
from app.models.library_tag import LibraryTag
from app.models.message import Message
from app.models.room import Room
from app.models.tenant import Tenant
from app.models.tenant_endpoint import EndpointType, TenantEndpoint
from app.models.user import User, UserRole
from app.repositories.library_repository import LibraryRepository

LIBRARY_CONTENT = "# 契約書まとめ\n本文"


def _tenant(tenant_id: str) -> Tenant:
    """テスト用のテナントを作る。

    Parameters
    ----------
    tenant_id : str
        テナントID。

    Returns
    -------
    Tenant
        パスワードポリシー等を埋めたテナント。
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
    """テスト用のユーザーを作る。"""
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
async def system_user(session, lib_tenant):
    """SYSTEMロールユーザー（ADMIN同様のルーム閲覧バイパス対象）"""
    user = _user(lib_tenant.id, "lib-system", "System", role=UserRole.SYSTEM)
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@pytest.fixture
async def assistant(session, lib_tenant):
    """テスト用のアシスタント"""
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
    )
    session.add(lib)
    await session.commit()
    await session.refresh(lib)
    session.add(
        LibraryContent(
            library_id=lib.id, tenant_id=lib_tenant.id, content=LIBRARY_CONTENT
        )
    )
    await session.commit()
    return lib


@pytest.fixture
async def stub_library(session, lib_tenant, owner_user, message):
    """タイトル・本文の無いライブラリ（スタブ）"""
    lib = Library(
        tenant_id=lib_tenant.id,
        message_id=message.id,
        user_id=owner_user.id,
        title=None,
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
    """テスト用のライブラリタグ"""
    tag = LibraryTag(tenant_id=lib_tenant.id, name="契約書")
    session.add(tag)
    await session.commit()
    await session.refresh(tag)
    return tag


@pytest.fixture
async def other_tenant_library_tag(session, other_tenant):
    """他テナントのライブラリタグ"""
    tag = LibraryTag(tenant_id=other_tenant.id, name="他テナントタグ")
    session.add(tag)
    await session.commit()
    await session.refresh(tag)
    return tag


def _headers(login_id: str, tenant_id: str) -> dict[str, str]:
    """認証ヘッダーとテナントIDヘッダーを作る。

    Parameters
    ----------
    login_id : str
        ログインID。
    tenant_id : str
        テナントID。

    Returns
    -------
    dict[str, str]
        `Authorization` と `X-Tenant-ID` のヘッダー。
    """
    token = create_access_token(login_id, tenant_id)
    return {"Authorization": f"Bearer {token}", "X-Tenant-ID": tenant_id}


@pytest.fixture
def owner_headers(owner_user, lib_tenant):
    """ライブラリ所有者のリクエストヘッダー"""
    return _headers(owner_user.login_id, lib_tenant.id)


@pytest.fixture
def group_member_headers(group_member_user, lib_tenant):
    """共有先グループのメンバーのリクエストヘッダー"""
    return _headers(group_member_user.login_id, lib_tenant.id)


@pytest.fixture
def unrelated_headers(unrelated_user, lib_tenant):
    """無関係なユーザーのリクエストヘッダー"""
    return _headers(unrelated_user.login_id, lib_tenant.id)


@pytest.fixture
def admin_headers(admin_user, lib_tenant):
    """テナント管理者のリクエストヘッダー"""
    return _headers(admin_user.login_id, lib_tenant.id)


@pytest.fixture
def client(override_get_session):
    """ASGITransport を利用したテストクライアント"""
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def _mapped_tag_ids(session: AsyncSession, library_id: UUID) -> list[str]:
    """ライブラリに付与されているタグIDを取得する。

    テストとアプリが同じセッションを使うため、エンティティではなく列だけを取得する。

    Parameters
    ----------
    session : AsyncSession
        テストとアプリで共有する非同期DBセッション。
    library_id : UUID
        対象のライブラリID。

    Returns
    -------
    list[str]
        付与されているタグID一覧。
    """
    result = await session.execute(
        select(col(LibraryTagMapping.library_tag_id)).where(
            col(LibraryTagMapping.library_id) == library_id
        )
    )
    return list(result.scalars().all())


@pytest.mark.asyncio
class TestListLibraries:
    """GET /api/libraries"""

    async def test_list_excludes_stub_libraries(
        self, client, owner_headers, library, stub_library
    ):
        """タイトルが未確定のスタブは一覧に含まれないこと"""
        async with client as c:
            response = await c.get("/api/libraries", headers=owner_headers)

        assert response.status_code == 200
        body = response.json()["data"]
        assert body["totalElements"] == 1
        assert [item["id"] for item in body["content"]] == [str(library.id)]

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

    async def test_list_filters_by_tag_ids_in_hyphenated_uuid_format(
        self, session, client, owner_headers, library, library_tag, lib_tenant
    ):
        """ハイフン付きUUID形式のtagIdsでも絞り込めること"""
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
                params={"tagIds": [str(UUID(library_tag.id))]},
                headers=owner_headers,
            )

        assert response.status_code == 200
        body = response.json()["data"]
        assert [item["id"] for item in body["content"]] == [str(library.id)]

    async def test_list_filters_by_tag_ids_excludes_libraries_with_other_tags(
        self,
        session,
        client,
        owner_headers,
        library,
        library_tag,
        lib_tenant,
        owner_user,
        message,
    ):
        """指定外のタグのみが付与されたライブラリは返らないこと"""
        other_tag = LibraryTag(tenant_id=lib_tenant.id, name="議事録")
        other_library = Library(
            tenant_id=lib_tenant.id,
            message_id=message.id,
            user_id=owner_user.id,
            title="議事録まとめ",
        )
        session.add_all([other_tag, other_library])
        await session.commit()
        session.add_all(
            [
                LibraryTagMapping(
                    tenant_id=lib_tenant.id,
                    library_id=library.id,
                    library_tag_id=library_tag.id,
                ),
                LibraryTagMapping(
                    tenant_id=lib_tenant.id,
                    library_id=other_library.id,
                    library_tag_id=other_tag.id,
                ),
            ]
        )
        await session.commit()

        async with client as c:
            response = await c.get(
                "/api/libraries",
                params={"tagIds": [library_tag.id]},
                headers=owner_headers,
            )

        assert response.status_code == 200
        body = response.json()["data"]
        assert body["totalElements"] == 1
        assert [item["id"] for item in body["content"]] == [str(library.id)]

    @pytest.mark.parametrize(
        ("params", "expected"),
        [
            ({"page": -1}, "ページ番号は0以上である必要があります"),
            ({"size": 0}, "ページサイズは1以上である必要があります"),
            ({"size": 101}, "ページサイズは100以下である必要があります"),
        ],
    )
    async def test_list_with_invalid_page_returns_400(
        self, client, owner_headers, params, expected
    ):
        """ページ番号・件数が範囲外だと400になり、移植元と同じ文言が返ること"""
        async with client as c:
            response = await c.get(
                "/api/libraries", params=params, headers=owner_headers
            )

        assert response.status_code == 400
        assert response.json()["message"] == expected

    async def test_list_with_invalid_tag_id_returns_400(self, client, owner_headers):
        """UUIDとして不正なtagIdsは400になること"""
        async with client as c:
            response = await c.get(
                "/api/libraries",
                params={"tagIds": ["not-a-uuid"]},
                headers=owner_headers,
            )

        assert response.status_code == 400

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

    async def test_list_by_room_excludes_stub_libraries(
        self, client, owner_headers, room, library, stub_library
    ):
        """タイトルが未確定のスタブはルームの一覧に含まれないこと"""
        async with client as c:
            response = await c.get(
                f"/api/libraries/{room.id}/list", headers=owner_headers
            )

        assert response.status_code == 200
        assert [item["id"] for item in response.json()["data"]] == [str(library.id)]

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

    async def test_list_by_room_as_tenant_admin(
        self, client, admin_headers, room, library
    ):
        """テナント管理者(ADMIN)は所有者でなくても一覧を取得できること"""
        async with client as c:
            response = await c.get(
                f"/api/libraries/{room.id}/list", headers=admin_headers
            )

        assert response.status_code == 200
        assert len(response.json()["data"]) == 1

    async def test_list_by_room_as_system_role(
        self, client, system_user, lib_tenant, room, library
    ):
        """SYSTEMロールも所有者でなくても一覧を取得できること（ADMIN同様のバイパス対象）"""
        system_headers = _headers(system_user.login_id, lib_tenant.id)
        async with client as c:
            response = await c.get(
                f"/api/libraries/{room.id}/list", headers=system_headers
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
        assert set(body) == {
            "id",
            "title",
            "messageId",
            "userId",
            "createdAt",
            "updatedAt",
            "assistant",
            "hasNawContent",
        }
        assert body["id"] == str(library.id)
        assert body["title"] == library.title
        assert body["messageId"] == library.message_id
        assert body["userId"] == str(library.user_id)
        assert body["hasNawContent"] is True
        # フィクスチャのメッセージにはアシスタントが紐づいていない
        assert body["assistant"] is None

    async def test_get_library_returns_assistant_with_secure_api_key(
        self, session, client, owner_headers, library, message, lib_tenant
    ):
        """SECUREアシスタントではLOCAL_SERVERのAPIキーだけを返し、modelは先頭のエンドポイントのものになること"""
        secure = Assistant(
            tenant_id=lib_tenant.id,
            type=AssistantType.SECURE,
            name="Secure Assistant",
            include_history=True,
        )
        local = TenantEndpoint(
            tenant_id=lib_tenant.id,
            type=EndpointType.LOCAL_SERVER,
            endpoint_name="local",
            endpoint="http://local",
            api_key="local-key",
        )
        azure = TenantEndpoint(
            tenant_id=lib_tenant.id,
            type=EndpointType.AZURE_OPENAI_CHAT,
            endpoint_name="azure",
            endpoint="https://azure",
            api_key="azure-key",
        )
        session.add_all([secure, local, azure])
        await session.commit()
        first, second = sorted([local.id, azure.id])
        models = {local.id: "local-model", azure.id: "azure-model"}
        session.add_all(
            [
                AssistantEndpoint(
                    assistant_id=secure.id,
                    endpoint_id=endpoint_id,
                    tenant_id=lib_tenant.id,
                    model=models[endpoint_id],
                )
                for endpoint_id in (first, second)
            ]
        )
        message.assistant_id = secure.id
        session.add(message)
        await session.commit()

        async with client as c:
            response = await c.get(
                f"/api/libraries/{library.id}", headers=owner_headers
            )

        assert response.status_code == 200
        assistant = response.json()["assistant"]
        assert assistant["id"] == secure.id
        assert assistant["type"] == "SECURE"
        assert assistant["includeHistory"] is True
        assert assistant["model"] == models[first]
        assert {
            e["type"]: (e["destination"], e["apiKey"]) for e in assistant["endpoints"]
        } == {
            "LOCAL_SERVER": ("http://local", "local-key"),
            "AZURE_OPENAI_CHAT": ("https://azure", ""),
        }

    async def test_get_stub_library_returns_null_title_without_naw_content(
        self, client, owner_headers, stub_library
    ):
        """スタブはタイトルがnull・本文なし（hasNawContent=false）で取得できること"""
        async with client as c:
            response = await c.get(
                f"/api/libraries/{stub_library.id}", headers=owner_headers
            )

        assert response.status_code == 200
        body = response.json()
        assert body["title"] is None
        assert body["hasNawContent"] is False

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
class TestGetLibraryContent:
    """GET /api/libraries/{libraryId}/content"""

    async def test_get_content_as_room_owner(self, client, owner_headers, library):
        """ルーム所有者が本文を{"data": 本文}で取得できること"""
        async with client as c:
            response = await c.get(
                f"/api/libraries/{library.id}/content", headers=owner_headers
            )

        assert response.status_code == 200
        assert response.json() == {"data": LIBRARY_CONTENT}

    async def test_get_content_shared_via_library_group(
        self, session, client, group_member_headers, library, group, lib_tenant
    ):
        """ルームへのアクセス権はないが、ライブラリの共有先グループに所属していれば取得できること"""
        session.add(
            ShareLibrary(
                tenant_id=lib_tenant.id, library_id=library.id, group_id=group.id
            )
        )
        await session.commit()

        async with client as c:
            response = await c.get(
                f"/api/libraries/{library.id}/content", headers=group_member_headers
            )

        assert response.status_code == 200
        assert response.json() == {"data": LIBRARY_CONTENT}

    async def test_get_content_without_access_returns_404(
        self, client, unrelated_headers, library
    ):
        """閲覧できないユーザーは404 Library not foundになること"""
        async with client as c:
            response = await c.get(
                f"/api/libraries/{library.id}/content", headers=unrelated_headers
            )

        assert response.status_code == 404
        assert response.json()["message"] == "Library not found"

    async def test_get_content_not_found_returns_404(self, client, owner_headers):
        """存在しないlibraryIdは404 Library not foundになること"""
        async with client as c:
            response = await c.get(
                f"/api/libraries/{uuid4()}/content", headers=owner_headers
            )

        assert response.status_code == 404
        assert response.json()["message"] == "Library not found"

    async def test_get_content_invalid_id_returns_404(self, client, owner_headers):
        """UUID形式でないlibraryIdは404 Library not foundになること"""
        async with client as c:
            response = await c.get(
                "/api/libraries/not-a-uuid/content", headers=owner_headers
            )

        assert response.status_code == 404
        assert response.json()["message"] == "Library not found"

    async def test_get_content_without_content_returns_404(
        self, client, owner_headers, stub_library
    ):
        """本文の行が無いライブラリは404 Library content not foundになること"""
        async with client as c:
            response = await c.get(
                f"/api/libraries/{stub_library.id}/content", headers=owner_headers
            )

        assert response.status_code == 404
        assert response.json()["message"] == "Library content not found"

    async def test_get_content_with_empty_content_returns_empty_string(
        self, session, client, owner_headers, library
    ):
        """本文が空文字のライブラリは200で空文字を返すこと"""
        content_row = await session.get(LibraryContent, library.id)
        assert content_row is not None
        content_row.content = ""
        session.add(content_row)
        await session.commit()

        async with client as c:
            response = await c.get(
                f"/api/libraries/{library.id}/content", headers=owner_headers
            )

        assert response.status_code == 200
        assert response.json() == {"data": ""}

    async def test_get_content_without_auth_returns_401(self, client, library):
        """未ログインでは取得できないこと"""
        async with client as c:
            response = await c.get(f"/api/libraries/{library.id}/content")

        assert response.status_code == 401


@pytest.mark.asyncio
class TestCreateLibraryStub:
    """POST /api/libraries"""

    async def test_create_stub_as_room_owner(
        self, session, client, owner_headers, message, owner_user
    ):
        """ルーム所有者がタイトル・本文なしのスタブを作成できること"""
        async with client as c:
            response = await c.post(
                "/api/libraries",
                json={"messageId": message.id},
                headers=owner_headers,
            )

        assert response.status_code == 200
        library_id = UUID(response.json()["data"]["id"])
        created = await LibraryRepository.find_by_id_and_tenant_id(
            library_id, message.tenant_id, session
        )
        assert created is not None
        assert created.title is None
        assert created.message_id == message.id
        assert created.user_id == owner_user.id
        assert await session.get(LibraryContent, library_id) is None

    async def test_create_stub_with_unknown_message_returns_404(
        self, client, owner_headers
    ):
        """存在しないメッセージIDは404 Message not foundになること"""
        async with client as c:
            response = await c.post(
                "/api/libraries",
                json={"messageId": "nonexistent"},
                headers=owner_headers,
            )

        assert response.status_code == 404
        assert response.json()["message"] == "Message not found"

    async def test_create_stub_as_non_owner_returns_403(
        self, client, group_member_headers, message
    ):
        """ルームの所有者以外は作成できないこと"""
        async with client as c:
            response = await c.post(
                "/api/libraries",
                json={"messageId": message.id},
                headers=group_member_headers,
            )

        assert response.status_code == 403

    @pytest.mark.parametrize("body", [{"messageId": ""}, {"messageId": "  "}, {}])
    async def test_create_stub_without_message_id_returns_400(
        self, client, owner_headers, body
    ):
        """メッセージIDが空・空白・欠落なら400になること"""
        async with client as c:
            response = await c.post("/api/libraries", json=body, headers=owner_headers)

        assert response.status_code == 400
        assert response.json()["message"] == "メッセージIDは必須です"

    async def test_create_stub_without_auth_returns_401(self, client, message):
        """未ログインでは作成できないこと"""
        async with client as c:
            response = await c.post("/api/libraries", json={"messageId": message.id})

        assert response.status_code == 401


@pytest.mark.asyncio
class TestUpdateLibraryTitle:
    """PATCH /api/libraries/{libraryId}/title"""

    async def test_update_title_makes_stub_visible_in_list(
        self, client, owner_headers, stub_library
    ):
        """スタブのタイトルを更新でき、一覧に出るようになること"""
        async with client as c:
            response = await c.patch(
                f"/api/libraries/{stub_library.id}/title",
                json={"title": "確定タイトル"},
                headers=owner_headers,
            )
            listed = await c.get("/api/libraries", headers=owner_headers)

        assert response.status_code == 200
        assert response.json() == {"data": {"id": str(stub_library.id)}}
        titles = [item["title"] for item in listed.json()["data"]["content"]]
        assert titles == ["確定タイトル"]

    async def test_update_title_not_found_returns_404(self, client, owner_headers):
        """存在しないlibraryIdは404 Library not foundになること"""
        async with client as c:
            response = await c.patch(
                f"/api/libraries/{uuid4()}/title",
                json={"title": "タイトル"},
                headers=owner_headers,
            )

        assert response.status_code == 404
        assert response.json()["message"] == "Library not found"

    async def test_update_title_with_invalid_id_returns_404(
        self, client, owner_headers
    ):
        """UUID形式でないlibraryIdは404 Library not foundになること"""
        async with client as c:
            response = await c.patch(
                "/api/libraries/not-a-uuid/title",
                json={"title": "タイトル"},
                headers=owner_headers,
            )

        assert response.status_code == 404
        assert response.json()["message"] == "Library not found"

    async def test_update_title_as_non_owner_returns_403(
        self, client, group_member_headers, library
    ):
        """ルームの所有者以外はタイトルを更新できないこと"""
        async with client as c:
            response = await c.patch(
                f"/api/libraries/{library.id}/title",
                json={"title": "タイトル"},
                headers=group_member_headers,
            )

        assert response.status_code == 403

    async def test_update_title_with_blank_title_returns_400(
        self, client, owner_headers, library
    ):
        """タイトルが空白のみなら400になること"""
        async with client as c:
            response = await c.patch(
                f"/api/libraries/{library.id}/title",
                json={"title": "   "},
                headers=owner_headers,
            )

        assert response.status_code == 400
        assert response.json()["message"] == "ライブラリ名は必須です"

    async def test_update_title_with_256_chars_returns_400(
        self, client, owner_headers, library
    ):
        """タイトルが256文字なら400になること"""
        async with client as c:
            response = await c.patch(
                f"/api/libraries/{library.id}/title",
                json={"title": "あ" * 256},
                headers=owner_headers,
            )

        assert response.status_code == 400
        assert (
            response.json()["message"] == "ライブラリ名は255文字以内で入力してください"
        )


@pytest.mark.asyncio
class TestCreateWithContent:
    """LibraryRepository.create_with_content"""

    async def test_saves_library_and_content_together(
        self, session, lib_tenant, owner_user, message
    ):
        """ライブラリと本文が同時に保存されること"""
        saved = await LibraryRepository.create_with_content(
            Library(
                tenant_id=lib_tenant.id,
                message_id=message.id,
                user_id=owner_user.id,
                title="生成タイトル",
            ),
            "# 生成本文",
            session,
        )

        content_row = await session.get(LibraryContent, saved.id)
        assert content_row is not None
        assert content_row.content == "# 生成本文"
        assert content_row.tenant_id == lib_tenant.id


@pytest.mark.asyncio
class TestUpdateLibrary:
    """PUT /api/libraries/{libraryId}"""

    async def test_update_keeps_content(self, session, client, owner_headers, library):
        """名前を更新しても本文はそのまま残ること"""
        async with client as c:
            response = await c.put(
                f"/api/libraries/{library.id}",
                json={"name": "更新後タイトル"},
                headers=owner_headers,
            )

        assert response.status_code == 200
        content_row = await session.get(LibraryContent, library.id)
        assert content_row is not None
        assert content_row.content == LIBRARY_CONTENT

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
                json={"name": "更新後", "groups": None, "tags": [uuid4().hex]},
                headers=owner_headers,
            )

        assert response.status_code == 400
        assert response.json()["message"] == "指定されたタグが存在しません"

    async def test_update_with_hyphenated_tag_id(
        self, session, client, owner_headers, library, library_tag
    ):
        """ハイフン付き（UUID標準形式）のタグIDでも付与でき、保存形式で保存されること"""
        async with client as c:
            response = await c.put(
                f"/api/libraries/{library.id}",
                json={"name": "更新後", "tags": [str(UUID(library_tag.id))]},
                headers=owner_headers,
            )

        assert response.status_code == 200
        assert await _mapped_tag_ids(session, library.id) == [library_tag.id]

    async def test_update_with_same_tag_in_different_formats(
        self, session, client, owner_headers, library, library_tag
    ):
        """同じタグを表記違いで重複指定しても1件として付与されること"""
        async with client as c:
            response = await c.put(
                f"/api/libraries/{library.id}",
                json={
                    "name": "更新後",
                    "tags": [library_tag.id, str(UUID(library_tag.id)).upper()],
                },
                headers=owner_headers,
            )

        assert response.status_code == 200
        assert await _mapped_tag_ids(session, library.id) == [library_tag.id]

    async def test_update_with_other_tenant_tag_returns_400(
        self, client, owner_headers, library, other_tenant_library_tag
    ):
        """他テナントのタグIDはハイフン付きで指定しても400になること"""
        async with client as c:
            response = await c.put(
                f"/api/libraries/{library.id}",
                json={
                    "name": "更新後",
                    "tags": [str(UUID(other_tenant_library_tag.id))],
                },
                headers=owner_headers,
            )

        assert response.status_code == 400
        assert response.json()["message"] == "指定されたタグが存在しません"

    async def test_update_with_invalid_tag_id_format_returns_400(
        self, session, client, owner_headers, library, library_tag, lib_tenant
    ):
        """不正な形式のタグIDを指定すると400になり、何も更新されないこと"""
        session.add(
            LibraryTagMapping(
                tenant_id=lib_tenant.id,
                library_id=library.id,
                library_tag_id=library_tag.id,
            )
        )
        await session.commit()
        # ロールバック後に属性へ触れると遅延ロードが走るため、IDを先に退避する。
        library_id = library.id
        library_tag_id = library_tag.id

        async with client as c:
            response = await c.put(
                f"/api/libraries/{library_id}",
                json={"name": "更新後", "tags": ["nonexistent"]},
                headers=owner_headers,
            )

        assert response.status_code == 400
        assert response.json()["message"] == "Invalid UUID string: nonexistent"
        # 本番はリクエストごとのセッションをコミットせずに閉じる（ロールバックされる）。
        # テストはアプリと同じセッションを使うため、閉じたときと同じ状態に戻してから確かめる。
        await session.rollback()
        title = await session.execute(
            select(Library.title).where(Library.id == library_id)
        )
        assert title.scalar_one() == "契約書まとめ"
        assert await _mapped_tag_ids(session, library_id) == [library_tag_id]

    async def test_update_with_invalid_tag_id_as_non_owner_returns_403(
        self, client, group_member_headers, library
    ):
        """所有者以外が不正な形式のタグIDを指定した場合、形式より先に権限で403になること"""
        async with client as c:
            response = await c.put(
                f"/api/libraries/{library.id}",
                json={"name": "更新後", "tags": ["nonexistent"]},
                headers=group_member_headers,
            )

        assert response.status_code == 403

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

    async def test_update_with_blank_name_returns_400(
        self, client, owner_headers, library
    ):
        """名前が空白のみだと400になること"""
        async with client as c:
            response = await c.put(
                f"/api/libraries/{library.id}",
                json={"name": "   "},
                headers=owner_headers,
            )

        assert response.status_code == 400


@pytest.mark.asyncio
class TestDeleteLibrary:
    """DELETE /api/libraries/{libraryId}"""

    async def test_delete_as_owner(self, session, client, owner_headers, library):
        """所有者が削除でき、本文も一緒に消えること"""
        library_id = library.id
        async with client as c:
            response = await c.delete(
                f"/api/libraries/{library_id}", headers=owner_headers
            )

        assert response.status_code == 204
        await session.rollback()
        assert await session.get(LibraryContent, library_id) is None

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
