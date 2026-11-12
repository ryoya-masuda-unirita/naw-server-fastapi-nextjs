from uuid import UUID, uuid4

import pytest
from sqlalchemy import select
from sqlmodel import col

from app.core.security import create_access_token
from app.models.library_tag import LibraryTag
from app.models.tenant import Tenant
from app.models.user import User, UserRole


@pytest.fixture
async def tenant(session):
    """テスト用テナント"""
    t = Tenant(
        id="tenant-library-tags-test",
        name="Library Tags Test Tenant",
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
async def other_tenant(session):
    """他テナント（テナント分離確認用）"""
    t = Tenant(
        id="tenant-library-tags-other",
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
    session.add(t)
    await session.commit()
    await session.refresh(t)
    return t


@pytest.fixture
async def admin_user(session, tenant):
    """テスト用テナント管理者"""
    u = User(
        id=uuid4(),
        tenant_id=tenant.id,
        login_id="admin-test",
        name="Admin",
        role=UserRole.ADMIN,
        is_required_password_reset=False,
    )
    session.add(u)
    await session.commit()
    await session.refresh(u)
    return u


@pytest.fixture
async def member_user(session, tenant):
    """テスト用一般ユーザー"""
    u = User(
        id=uuid4(),
        tenant_id=tenant.id,
        login_id="member-test",
        name="Member",
        role=UserRole.USER,
        is_required_password_reset=False,
    )
    session.add(u)
    await session.commit()
    await session.refresh(u)
    return u


@pytest.fixture
async def tag(session, tenant):
    """テスト用ライブラリタグ"""
    t = LibraryTag(
        tenant_id=tenant.id, name="契約書", description="契約書関連のライブラリ"
    )
    session.add(t)
    await session.commit()
    await session.refresh(t)
    return t


@pytest.fixture
async def second_tag(session, tenant):
    """同一テナント内の別名ライブラリタグ（重複名チェックの確認用）"""
    t = LibraryTag(tenant_id=tenant.id, name="規程", description="規程関連のライブラリ")
    session.add(t)
    await session.commit()
    await session.refresh(t)
    return t


@pytest.fixture
async def other_tenant_tag(session, other_tenant):
    """他テナントのライブラリタグ"""
    t = LibraryTag(tenant_id=other_tenant.id, name="他テナントタグ")
    session.add(t)
    await session.commit()
    await session.refresh(t)
    return t


def _headers(login_id, tenant_id):
    token = create_access_token(login_id, tenant_id)
    return {"Authorization": f"Bearer {token}", "X-Tenant-ID": tenant_id}


@pytest.fixture
def admin_headers(admin_user, tenant):
    return _headers(admin_user.login_id, tenant.id)


@pytest.fixture
def member_headers(member_user, tenant):
    return _headers(member_user.login_id, tenant.id)


class TestListLibraryTags:
    """GET /api/libraries/tags"""

    async def test_list_library_tags(
        self, client, member_headers, tag, other_tenant_tag
    ):
        """自テナント分のみ名前順で返ること"""
        async with client as c:
            response = await c.get("/api/libraries/tags", headers=member_headers)

        assert response.status_code == 200
        body = response.json()
        assert [item["id"] for item in body["tags"]] == [tag.id]

    async def test_list_library_tags_empty(self, client, member_headers):
        """タグが0件の場合空リストが返ること"""
        async with client as c:
            response = await c.get("/api/libraries/tags", headers=member_headers)

        assert response.status_code == 200
        assert response.json() == {"tags": []}


class TestListLibraryTagsAdmin:
    """GET /api/admin/library-tags"""

    async def test_list_library_tags_admin(
        self, client, admin_headers, tag, second_tag
    ):
        """ページング付きで取得できること"""
        async with client as c:
            response = await c.get(
                "/api/admin/library-tags",
                params={"page": 0, "size": 20},
                headers=admin_headers,
            )

        assert response.status_code == 200
        body = response.json()
        assert body["totalElements"] == 2
        assert body["number"] == 0
        assert body["size"] == 20
        assert len(body["content"]) == 2

    async def test_list_library_tags_search(
        self, client, admin_headers, tag, second_tag
    ):
        """searchで部分一致するタグのみ返ること"""
        async with client as c:
            response = await c.get(
                "/api/admin/library-tags",
                params={"search": "契約"},
                headers=admin_headers,
            )

        assert response.status_code == 200
        body = response.json()
        assert [item["id"] for item in body["content"]] == [tag.id]

    async def test_list_library_tags_search_wildcard_literal(
        self, session, client, admin_headers, tenant
    ):
        """searchに%や_を含む場合、ワイルドカードとして扱われず文字通り検索されること"""
        wildcard_tag = LibraryTag(tenant_id=tenant.id, name="100%達成タグ")
        underscore_tag = LibraryTag(tenant_id=tenant.id, name="under_score_tag")
        session.add(wildcard_tag)
        session.add(underscore_tag)
        await session.commit()

        async with client as c:
            response = await c.get(
                "/api/admin/library-tags",
                params={"search": "100%"},
                headers=admin_headers,
            )

        assert response.status_code == 200
        body = response.json()
        assert [item["id"] for item in body["content"]] == [wildcard_tag.id]

    async def test_list_library_tags_admin_as_non_admin_returns_403(
        self, client, member_headers
    ):
        """非管理者は403になること"""
        async with client as c:
            response = await c.get("/api/admin/library-tags", headers=member_headers)

        assert response.status_code == 403


class TestCreateLibraryTag:
    """POST /api/admin/library-tags"""

    async def test_create_library_tag(self, client, admin_headers):
        """正しいリクエストで作成できること"""
        async with client as c:
            response = await c.post(
                "/api/admin/library-tags",
                json={"name": "新規タグ", "description": "desc"},
                headers=admin_headers,
            )

        assert response.status_code == 200
        body = response.json()
        assert body["name"] == "新規タグ"
        assert body["description"] == "desc"
        assert "id" in body

    async def test_create_with_blank_name_returns_400(self, client, admin_headers):
        """名前が空白のみだと400になり、独自チェックのメッセージがそのまま返ること"""
        async with client as c:
            response = await c.post(
                "/api/admin/library-tags",
                json={"name": "   ", "description": "desc"},
                headers=admin_headers,
            )

        assert response.status_code == 400
        assert response.json()["message"] == "タグ名は必須です"

    async def test_create_with_duplicate_name_returns_400(
        self, client, admin_headers, tag
    ):
        """同一テナント内に同名のタグが既に存在する場合400になること"""
        async with client as c:
            response = await c.post(
                "/api/admin/library-tags",
                json={"name": tag.name, "description": "別の説明"},
                headers=admin_headers,
            )

        assert response.status_code == 400

    async def test_create_as_non_admin_returns_403(self, client, member_headers):
        """非管理者は作成できないこと"""
        async with client as c:
            response = await c.post(
                "/api/admin/library-tags",
                json={"name": "新規タグ", "description": None},
                headers=member_headers,
            )

        assert response.status_code == 403


class TestUpdateLibraryTag:
    """PATCH /api/admin/library-tags/{id}"""

    async def test_update_library_tag(self, client, admin_headers, tag):
        """name・descriptionを更新できること"""
        async with client as c:
            response = await c.patch(
                f"/api/admin/library-tags/{tag.id}",
                json={"name": "updated", "description": "updated desc"},
                headers=admin_headers,
            )

        assert response.status_code == 200
        body = response.json()
        assert body["name"] == "updated"
        assert body["description"] == "updated desc"

    async def test_update_partial_keeps_other_field(self, client, admin_headers, tag):
        """descriptionのみ指定した場合、nameは変更されないこと"""
        async with client as c:
            response = await c.patch(
                f"/api/admin/library-tags/{tag.id}",
                json={"description": "changed"},
                headers=admin_headers,
            )

        assert response.status_code == 200
        body = response.json()
        assert body["name"] == tag.name
        assert body["description"] == "changed"

    async def test_update_with_duplicate_name_returns_400(
        self, client, admin_headers, tag, second_tag
    ):
        """更新後の名前が同一テナント内の別タグと重複する場合400になること"""
        async with client as c:
            response = await c.patch(
                f"/api/admin/library-tags/{tag.id}",
                json={"name": second_tag.name},
                headers=admin_headers,
            )

        assert response.status_code == 400

    async def test_update_not_found_returns_404(self, client, admin_headers):
        """存在しないIDだと404になること"""
        async with client as c:
            response = await c.patch(
                "/api/admin/library-tags/nonexistent",
                json={"name": "updated"},
                headers=admin_headers,
            )

        assert response.status_code == 404

    async def test_update_other_tenant_tag_returns_404(
        self, client, admin_headers, other_tenant_tag
    ):
        """他テナントのIDだと404になること"""
        async with client as c:
            response = await c.patch(
                f"/api/admin/library-tags/{other_tenant_tag.id}",
                json={"name": "updated"},
                headers=admin_headers,
            )

        assert response.status_code == 404

    async def test_update_as_non_admin_returns_403(self, client, member_headers, tag):
        """非管理者は更新できないこと"""
        async with client as c:
            response = await c.patch(
                f"/api/admin/library-tags/{tag.id}",
                json={"name": "updated"},
                headers=member_headers,
            )

        assert response.status_code == 403

    async def test_update_with_hyphenated_id(self, client, admin_headers, tag):
        """ハイフン付き（UUID標準形式）のIDでも更新できること"""
        async with client as c:
            response = await c.patch(
                f"/api/admin/library-tags/{UUID(tag.id)}",
                json={"name": "updated", "description": "updated desc"},
                headers=admin_headers,
            )

        assert response.status_code == 200
        body = response.json()
        assert body["id"] == tag.id
        assert body["name"] == "updated"
        assert body["description"] == "updated desc"

    async def test_update_with_uppercase_hyphenated_id(
        self, client, admin_headers, tag
    ):
        """大文字のハイフン付きIDでも同じタグを更新できること"""
        async with client as c:
            response = await c.patch(
                f"/api/admin/library-tags/{str(UUID(tag.id)).upper()}",
                json={"description": "changed"},
                headers=admin_headers,
            )

        assert response.status_code == 200
        assert response.json()["id"] == tag.id

    async def test_update_with_hyphenated_id_keeping_same_name(
        self, client, admin_headers, tag
    ):
        """ハイフン付きIDで今と同じ名前を指定しても、自分自身と重複扱いにならないこと"""
        async with client as c:
            response = await c.patch(
                f"/api/admin/library-tags/{UUID(tag.id)}",
                json={"name": tag.name, "description": "changed"},
                headers=admin_headers,
            )

        assert response.status_code == 200
        assert response.json()["name"] == tag.name

    async def test_update_with_hyphenated_id_and_duplicate_name_returns_400(
        self, client, admin_headers, tag, second_tag
    ):
        """ハイフン付きIDでも、別タグと同じ名前への更新は400になること"""
        async with client as c:
            response = await c.patch(
                f"/api/admin/library-tags/{UUID(tag.id)}",
                json={"name": second_tag.name},
                headers=admin_headers,
            )

        assert response.status_code == 400

    @pytest.mark.parametrize("id_format", ["urn:uuid:{uuid}", "{{{uuid}}}"])
    async def test_update_with_non_standard_id_format_returns_404(
        self, client, admin_headers, tag, id_format
    ):
        """ハイフン付き・32桁以外の表記（urn・波括弧）は同じタグを指していても404になること"""
        tag_id = id_format.format(uuid=UUID(tag.id))
        async with client as c:
            response = await c.patch(
                f"/api/admin/library-tags/{tag_id}",
                json={"name": "updated"},
                headers=admin_headers,
            )

        assert response.status_code == 404

    async def test_update_other_tenant_tag_with_hyphenated_id_returns_404(
        self, client, admin_headers, other_tenant_tag
    ):
        """他テナントのタグはハイフン付きIDで指定しても404になること"""
        async with client as c:
            response = await c.patch(
                f"/api/admin/library-tags/{UUID(other_tenant_tag.id)}",
                json={"name": "updated"},
                headers=admin_headers,
            )

        assert response.status_code == 404


async def _remaining_tag_ids(session) -> set[str]:
    """DBに残っているライブラリタグIDを取得する。

    テストとアプリが同じセッションを使うため、エンティティではなく列だけを取得し、
    セッションに残った削除前のオブジェクトを読まないようにする。
    """
    result = await session.execute(select(col(LibraryTag.id)))
    return set(result.scalars().all())


class TestDeleteLibraryTags:
    """DELETE /api/admin/library-tags"""

    async def test_delete_library_tags(
        self, session, client, admin_headers, tag, second_tag
    ):
        """指定したIDが削除され204が返ること"""
        async with client as c:
            response = await c.request(
                "DELETE",
                "/api/admin/library-tags",
                json={"ids": [tag.id, second_tag.id]},
                headers=admin_headers,
            )

        assert response.status_code == 204
        assert await _remaining_tag_ids(session) == set()

    async def test_delete_with_hyphenated_ids(
        self, session, client, admin_headers, tag, second_tag
    ):
        """ハイフン付き（UUID標準形式）のIDでも削除できること"""
        async with client as c:
            response = await c.request(
                "DELETE",
                "/api/admin/library-tags",
                json={"ids": [str(UUID(tag.id))]},
                headers=admin_headers,
            )

        assert response.status_code == 204
        assert await _remaining_tag_ids(session) == {second_tag.id}

    async def test_delete_with_uppercase_hyphenated_id(
        self, session, client, admin_headers, tag
    ):
        """大文字のハイフン付きIDでも削除できること"""
        async with client as c:
            response = await c.request(
                "DELETE",
                "/api/admin/library-tags",
                json={"ids": [str(UUID(tag.id)).upper()]},
                headers=admin_headers,
            )

        assert response.status_code == 204
        assert await _remaining_tag_ids(session) == set()

    async def test_delete_ignores_nonexistent_ids(
        self, session, client, admin_headers, tag
    ):
        """存在しないIDを含んでも204が返り、存在するものだけ削除されること"""
        async with client as c:
            response = await c.request(
                "DELETE",
                "/api/admin/library-tags",
                json={"ids": [tag.id, uuid4().hex]},
                headers=admin_headers,
            )

        assert response.status_code == 204
        assert await _remaining_tag_ids(session) == set()

    async def test_delete_ignores_other_tenant_tag(
        self, session, client, admin_headers, tag, other_tenant_tag
    ):
        """他テナントのタグはハイフン付きで指定しても削除されないこと"""
        async with client as c:
            response = await c.request(
                "DELETE",
                "/api/admin/library-tags",
                json={"ids": [str(UUID(other_tenant_tag.id))]},
                headers=admin_headers,
            )

        assert response.status_code == 204
        assert await _remaining_tag_ids(session) == {tag.id, other_tenant_tag.id}

    async def test_delete_with_invalid_id_format_returns_400(
        self, session, client, admin_headers, tag
    ):
        """不正な形式のIDを含むと400になり、1件も削除されないこと"""
        async with client as c:
            response = await c.request(
                "DELETE",
                "/api/admin/library-tags",
                json={"ids": [tag.id, "nonexistent"]},
                headers=admin_headers,
            )

        assert response.status_code == 400
        assert response.json()["message"] == "Invalid UUID string: nonexistent"
        assert await _remaining_tag_ids(session) == {tag.id}

    async def test_delete_as_non_admin_returns_403(self, client, member_headers, tag):
        """非管理者は削除できないこと"""
        async with client as c:
            response = await c.request(
                "DELETE",
                "/api/admin/library-tags",
                json={"ids": [tag.id]},
                headers=member_headers,
            )

        assert response.status_code == 403
