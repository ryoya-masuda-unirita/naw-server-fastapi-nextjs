from datetime import UTC, datetime
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select

from app.core.security import create_access_token
from app.main import app
from app.models.group import Group, GroupUser
from app.models.prompt_template import (
    NAME_MAX_LENGTH,
    GroupPromptTemplate,
    PromptTemplate,
)
from app.models.tenant import Tenant
from app.models.user import User, UserRole


@pytest.fixture
async def tenant(session):
    """テスト用テナント"""
    t = Tenant(
        id="tenant-prompt-templates-test",
        name="Prompt Templates Test Tenant",
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
        id="tenant-prompt-templates-other",
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
    """テスト用一般ユーザー（グループ所属想定）"""
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
async def other_user(session, tenant):
    """テスト用一般ユーザー（未所属想定）"""
    u = User(
        id=uuid4(),
        tenant_id=tenant.id,
        login_id="other-test",
        name="Other",
        role=UserRole.USER,
        is_required_password_reset=False,
    )
    session.add(u)
    await session.commit()
    await session.refresh(u)
    return u


@pytest.fixture
async def group(session, tenant):
    """テスト用グループ"""
    g = Group(tenant_id=tenant.id, name="Test Group")
    session.add(g)
    await session.commit()
    await session.refresh(g)
    return g


@pytest.fixture
async def other_group(session, tenant):
    """テスト用グループ（member_userは未所属）"""
    g = Group(tenant_id=tenant.id, name="Other Group")
    session.add(g)
    await session.commit()
    await session.refresh(g)
    return g


@pytest.fixture
async def group_with_admin_member(session, tenant, group, member_user):
    """member_userをグループ内管理者として所属させたグループ"""
    gu = GroupUser(
        group_id=group.id, tenant_id=tenant.id, user_id=member_user.id, is_admin=True
    )
    session.add(gu)
    await session.commit()
    return group


@pytest.fixture
async def member_of_group(session, tenant, group, member_user):
    """member_userを一般所属（管理者ではない）としてグループに追加"""
    gu = GroupUser(
        group_id=group.id, tenant_id=tenant.id, user_id=member_user.id, is_admin=False
    )
    session.add(gu)
    await session.commit()
    return group


@pytest.fixture
async def template(session, tenant):
    """グループ未紐付けのテンプレート"""
    t = PromptTemplate(
        tenant_id=tenant.id,
        name="Template A",
        description="desc A",
        system_prompt="prompt A",
    )
    session.add(t)
    await session.commit()
    await session.refresh(t)
    return t


@pytest.fixture
async def template_in_group(session, tenant, group, template):
    """groupに紐付けられたテンプレート"""
    link = GroupPromptTemplate(
        group_id=group.id, prompt_template_id=template.id, tenant_id=tenant.id
    )
    session.add(link)
    await session.commit()
    return template


@pytest.fixture
async def ungrouped_template(session, tenant):
    """グループ未紐付けの別テンプレート（グループ紐付けありのテンプレートと区別するため）"""
    t = PromptTemplate(
        tenant_id=tenant.id,
        name="Ungrouped",
        description=None,
        system_prompt="prompt",
    )
    session.add(t)
    await session.commit()
    await session.refresh(t)
    return t


@pytest.fixture
async def other_tenant_template(session, other_tenant):
    """他テナントのテンプレート"""
    t = PromptTemplate(
        tenant_id=other_tenant.id,
        name="Other Tenant Template",
        description=None,
        system_prompt="prompt",
    )
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


@pytest.fixture
def other_headers(other_user, tenant):
    return _headers(other_user.login_id, tenant.id)


@pytest.fixture
def client(override_get_session):
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
class TestGetPromptTemplates:
    """GET /api/prompt-templates"""

    async def test_returns_templates_for_belonging_groups(
        self, client, member_headers, member_of_group, template_in_group
    ):
        """所属グループに紐づくテンプレートのみ返ること"""
        async with client as c:
            response = await c.get("/api/prompt-templates", headers=member_headers)

        assert response.status_code == 200
        ids = [t["id"] for t in response.json()["content"]]
        assert template_in_group.id in ids

    async def test_returns_empty_page_when_no_group(
        self, client, other_headers, template_in_group
    ):
        """所属グループがない場合は空ページになること"""
        async with client as c:
            response = await c.get("/api/prompt-templates", headers=other_headers)

        assert response.status_code == 200
        assert response.json()["content"] == []

    async def test_deduplicates_when_multiple_groups_share_template(
        self,
        client,
        session,
        tenant,
        member_user,
        member_of_group,
        other_group,
        template_in_group,
    ):
        """複数グループ経由で紐づいていても重複せず1件で返ること"""
        session.add(
            GroupUser(
                group_id=other_group.id,
                tenant_id=tenant.id,
                user_id=member_user.id,
                is_admin=False,
            )
        )
        session.add(
            GroupPromptTemplate(
                group_id=other_group.id,
                prompt_template_id=template_in_group.id,
                tenant_id=tenant.id,
            )
        )
        await session.commit()

        async with client as c:
            response = await c.get(
                "/api/prompt-templates",
                headers=_headers(member_user.login_id, tenant.id),
            )

        assert response.status_code == 200
        ids = [t["id"] for t in response.json()["content"]]
        assert ids.count(template_in_group.id) == 1

    async def test_filters_by_search_text(
        self, client, member_headers, member_of_group, tenant, session, group
    ):
        """検索文字列で名前・説明が絞り込まれること"""
        matching = PromptTemplate(
            tenant_id=tenant.id, name="Matching", description=None, system_prompt="p"
        )
        non_matching = PromptTemplate(
            tenant_id=tenant.id,
            name="NoHit",
            description=None,
            system_prompt="p",
        )
        session.add_all([matching, non_matching])
        await session.commit()
        await session.refresh(matching)
        await session.refresh(non_matching)
        session.add_all(
            [
                GroupPromptTemplate(
                    group_id=group.id,
                    prompt_template_id=matching.id,
                    tenant_id=tenant.id,
                ),
                GroupPromptTemplate(
                    group_id=group.id,
                    prompt_template_id=non_matching.id,
                    tenant_id=tenant.id,
                ),
            ]
        )
        await session.commit()

        async with client as c:
            response = await c.get(
                "/api/prompt-templates",
                params={"search": "Match"},
                headers=member_headers,
            )

        assert response.status_code == 200
        ids = [t["id"] for t in response.json()["content"]]
        assert matching.id in ids
        assert non_matching.id not in ids

    async def test_excludes_other_tenant_templates(
        self, client, member_headers, member_of_group, other_tenant_template
    ):
        """他テナントのテンプレートが結果に含まれないこと"""
        async with client as c:
            response = await c.get("/api/prompt-templates", headers=member_headers)

        assert response.status_code == 200
        ids = [t["id"] for t in response.json()["content"]]
        assert other_tenant_template.id not in ids

    async def test_size_zero_falls_back_to_default_page_size(
        self, client, member_headers, member_of_group, template_in_group
    ):
        """size=0（チャット画面のテンプレート選択が送信する）は422にせずデフォルトページサイズになること"""
        async with client as c:
            response = await c.get(
                "/api/prompt-templates",
                params={"size": 0},
                headers=member_headers,
            )

        assert response.status_code == 200
        assert response.json()["size"] == 20


@pytest.mark.asyncio
class TestGetAdminPromptTemplates:
    """GET /api/admin/prompt-templates"""

    async def test_tenant_admin_gets_all_templates(
        self, client, admin_headers, template
    ):
        """全体管理者は全テンプレートを取得できること"""
        async with client as c:
            response = await c.get("/api/admin/prompt-templates", headers=admin_headers)

        assert response.status_code == 200
        ids = [t["id"] for t in response.json()["content"]]
        assert template.id in ids

    async def test_group_admin_gets_only_managed_group_templates(
        self,
        client,
        member_headers,
        group_with_admin_member,
        template_in_group,
        ungrouped_template,
    ):
        """グループ管理者は自分が管理するグループに紐づくテンプレートのみ取得できること"""
        async with client as c:
            response = await c.get(
                "/api/admin/prompt-templates", headers=member_headers
            )

        assert response.status_code == 200
        ids = [t["id"] for t in response.json()["content"]]
        assert template_in_group.id in ids
        assert ungrouped_template.id not in ids

    async def test_non_admin_user_gets_empty_page(
        self, client, other_headers, template
    ):
        """管理グループを持たない一般ユーザーは空ページになること（403にはならない）"""
        async with client as c:
            response = await c.get("/api/admin/prompt-templates", headers=other_headers)

        assert response.status_code == 200
        assert response.json()["content"] == []

    async def test_filters_by_team(
        self, client, admin_headers, group, other_group, tenant, session
    ):
        """チームフィルタで指定グループに紐づくテンプレートのみに絞り込まれること"""
        in_group = PromptTemplate(
            tenant_id=tenant.id, name="InGroup", description=None, system_prompt="p"
        )
        in_other_group = PromptTemplate(
            tenant_id=tenant.id,
            name="InOtherGroup",
            description=None,
            system_prompt="p",
        )
        session.add_all([in_group, in_other_group])
        await session.commit()
        await session.refresh(in_group)
        await session.refresh(in_other_group)
        session.add_all(
            [
                GroupPromptTemplate(
                    group_id=group.id,
                    prompt_template_id=in_group.id,
                    tenant_id=tenant.id,
                ),
                GroupPromptTemplate(
                    group_id=other_group.id,
                    prompt_template_id=in_other_group.id,
                    tenant_id=tenant.id,
                ),
            ]
        )
        await session.commit()

        async with client as c:
            response = await c.get(
                "/api/admin/prompt-templates",
                params={"team": group.id},
                headers=admin_headers,
            )

        assert response.status_code == 200
        ids = [t["id"] for t in response.json()["content"]]
        assert in_group.id in ids
        assert in_other_group.id not in ids

    async def test_filters_by_exclude_group_id(
        self, client, admin_headers, template_in_group, ungrouped_template, group
    ):
        """除外グループフィルタで指定グループに紐づいていないテンプレートのみ返ること"""
        async with client as c:
            response = await c.get(
                "/api/admin/prompt-templates",
                params={"excludeGroupId": group.id},
                headers=admin_headers,
            )

        assert response.status_code == 200
        ids = [t["id"] for t in response.json()["content"]]
        assert ungrouped_template.id in ids
        assert template_in_group.id not in ids

    async def test_filters_templates_with_no_group(
        self, client, admin_headers, ungrouped_template, template_in_group
    ):
        """未紐付けフィルタ（__none__）で、いずれのグループにも紐付いていないテンプレートのみ返ること"""
        async with client as c:
            response = await c.get(
                "/api/admin/prompt-templates",
                params={"team": "__none__"},
                headers=admin_headers,
            )

        assert response.status_code == 200
        ids = [t["id"] for t in response.json()["content"]]
        assert ungrouped_template.id in ids
        assert template_in_group.id not in ids


# 名前順と更新日時順が異なる並びになるよう、名前と更新日時を組み合わせる
FIXTURE_SORTABLE_TEMPLATES = [
    ("Bravo", datetime(2026, 1, 3, tzinfo=UTC)),
    ("Delta", datetime(2026, 1, 1, tzinfo=UTC)),
    ("Alpha", datetime(2026, 1, 2, tzinfo=UTC)),
    ("Charlie", datetime(2026, 1, 4, tzinfo=UTC)),
]


@pytest.fixture
async def sortable_templates(session, tenant):
    """並べ替え確認用のテンプレート4件（更新日時を明示）"""
    templates = [
        PromptTemplate(
            tenant_id=tenant.id,
            name=name,
            description=None,
            system_prompt="p",
            updated_at=updated_at,
        )
        for name, updated_at in FIXTURE_SORTABLE_TEMPLATES
    ]
    session.add_all(templates)
    await session.commit()
    return templates


async def _get_admin_template_names(client, headers, params):
    async with client as c:
        response = await c.get(
            "/api/admin/prompt-templates", params=params, headers=headers
        )
    assert response.status_code == 200
    return [t["name"] for t in response.json()["content"]]


@pytest.mark.asyncio
class TestGetAdminPromptTemplatesSort:
    """GET /api/admin/prompt-templates の sort パラメータ"""

    async def test_sorts_by_name_asc(self, client, admin_headers, sortable_templates):
        """sort=name,asc でテンプレート名の昇順に並ぶこと"""
        names = await _get_admin_template_names(
            client, admin_headers, {"sort": "name,asc"}
        )

        assert names == ["Alpha", "Bravo", "Charlie", "Delta"]

    async def test_sorts_by_name_desc(self, client, admin_headers, sortable_templates):
        """sort=name,desc でテンプレート名の降順に並ぶこと"""
        names = await _get_admin_template_names(
            client, admin_headers, {"sort": "name,desc"}
        )

        assert names == ["Delta", "Charlie", "Bravo", "Alpha"]

    async def test_sorts_by_updated_at_asc(
        self, client, admin_headers, sortable_templates
    ):
        """sort=updatedAt,asc で更新日時の昇順に並ぶこと"""
        names = await _get_admin_template_names(
            client, admin_headers, {"sort": "updatedAt,asc"}
        )

        assert names == ["Delta", "Alpha", "Bravo", "Charlie"]

    async def test_default_sort_is_updated_at_desc(
        self, client, admin_headers, sortable_templates
    ):
        """sort 未指定の場合は従来どおり更新日時の降順に並ぶこと"""
        names = await _get_admin_template_names(client, admin_headers, {})

        assert names == ["Charlie", "Bravo", "Alpha", "Delta"]

    async def test_sort_is_applied_before_paging(
        self, client, admin_headers, sortable_templates
    ):
        """並べ替えはページングより前に適用され、2ページ目に名前順の3〜4件目が返ること"""
        names = await _get_admin_template_names(
            client, admin_headers, {"sort": "name,asc", "page": 1, "size": 2}
        )

        assert names == ["Charlie", "Delta"]

    async def test_sort_direction_defaults_to_asc(
        self, client, admin_headers, sortable_templates
    ):
        """向きを省略した場合は昇順になること（Spring Data と同じ）"""
        names = await _get_admin_template_names(client, admin_headers, {"sort": "name"})

        assert names == ["Alpha", "Bravo", "Charlie", "Delta"]

    async def test_unknown_sort_property_falls_back_to_updated_at(
        self, client, admin_headers, sortable_templates
    ):
        """対応外の項目を指定してもエラーにならず更新日時順になること"""
        names = await _get_admin_template_names(
            client, admin_headers, {"sort": "unknown,asc"}
        )

        assert names == ["Delta", "Alpha", "Bravo", "Charlie"]

    async def test_empty_sort_falls_back_to_default(
        self, client, admin_headers, sortable_templates
    ):
        """sort= （空文字）の場合は未指定と同じく更新日時の降順になること"""
        names = await _get_admin_template_names(client, admin_headers, {"sort": ""})

        assert names == ["Charlie", "Bravo", "Alpha", "Delta"]

    async def test_sort_ignores_surrounding_spaces(
        self, client, admin_headers, sortable_templates
    ):
        """項目・向きの前後に空白があっても指定どおりに並ぶこと"""
        names = await _get_admin_template_names(
            client, admin_headers, {"sort": "name, desc"}
        )

        assert names == ["Delta", "Charlie", "Bravo", "Alpha"]

    async def test_ties_are_ordered_by_id(self, client, admin_headers, session, tenant):
        """同名のテンプレートはIDの昇順で並ぶこと（ページ境界で順序が揺れないように）"""
        later_id = "b" * 32
        earlier_id = "a" * 32
        session.add_all(
            [
                PromptTemplate(
                    id=later_id,
                    tenant_id=tenant.id,
                    name="Same",
                    description=None,
                    system_prompt="p",
                ),
                PromptTemplate(
                    id=earlier_id,
                    tenant_id=tenant.id,
                    name="Same",
                    description=None,
                    system_prompt="p",
                ),
            ]
        )
        await session.commit()

        async with client as c:
            response = await c.get(
                "/api/admin/prompt-templates",
                params={"sort": "name,desc"},
                headers=admin_headers,
            )

        assert response.status_code == 200
        ids = [t["id"] for t in response.json()["content"]]
        assert ids == [earlier_id, later_id]


@pytest.mark.asyncio
class TestCreatePromptTemplate:
    """POST /api/admin/prompt-templates"""

    async def test_create_with_groups(self, client, admin_headers, group):
        """グループを指定してテンプレートを作成できること"""
        async with client as c:
            response = await c.post(
                "/api/admin/prompt-templates",
                json={
                    "name": "New Template",
                    "description": "desc",
                    "systemPrompt": "prompt",
                    "groups": [group.id],
                },
                headers=admin_headers,
            )

        assert response.status_code == 200
        body = response.json()
        assert body["name"] == "New Template"
        assert body["groups"] == [group.id]

    async def test_create_ignores_nonexistent_group_id(self, client, admin_headers):
        """存在しないグループIDは無視されること"""
        async with client as c:
            response = await c.post(
                "/api/admin/prompt-templates",
                json={
                    "name": "New Template",
                    "description": None,
                    "systemPrompt": "prompt",
                    "groups": ["nonexistent-group"],
                },
                headers=admin_headers,
            )

        assert response.status_code == 200
        assert response.json()["groups"] == []

    async def test_create_without_groups(self, client, admin_headers):
        """グループ未指定で作成できること"""
        async with client as c:
            response = await c.post(
                "/api/admin/prompt-templates",
                json={
                    "name": "New Template",
                    "description": None,
                    "systemPrompt": "prompt",
                },
                headers=admin_headers,
            )

        assert response.status_code == 200
        assert response.json()["groups"] == []

    async def test_non_admin_cannot_create(self, client, member_headers):
        """テナント管理者以外（グループ管理者含む）はテンプレートを作成できないこと"""
        async with client as c:
            response = await c.post(
                "/api/admin/prompt-templates",
                json={
                    "name": "New Template",
                    "description": None,
                    "systemPrompt": "prompt",
                },
                headers=member_headers,
            )

        assert response.status_code == 403


@pytest.mark.asyncio
class TestUpdatePromptTemplate:
    """PATCH /api/admin/prompt-templates/{templateId}"""

    async def test_update_without_groups_keeps_existing_groups(
        self, client, admin_headers, template_in_group, group
    ):
        """グループ未指定で更新すると既存の紐付けが維持されること"""
        async with client as c:
            response = await c.patch(
                f"/api/admin/prompt-templates/{template_in_group.id}",
                json={
                    "name": "Renamed",
                    "description": "desc",
                    "systemPrompt": "prompt",
                },
                headers=admin_headers,
            )

        assert response.status_code == 200
        body = response.json()
        assert body["name"] == "Renamed"
        assert body["groups"] == [group.id]

    async def test_update_replaces_groups(
        self, client, admin_headers, template_in_group, other_group
    ):
        """グループ集合を指定すると既存の紐付けが置き換わること"""
        async with client as c:
            response = await c.patch(
                f"/api/admin/prompt-templates/{template_in_group.id}",
                json={
                    "name": "Renamed",
                    "description": "desc",
                    "systemPrompt": "prompt",
                    "groups": [other_group.id],
                },
                headers=admin_headers,
            )

        assert response.status_code == 200
        assert response.json()["groups"] == [other_group.id]

    async def test_update_nonexistent_template_returns_404(self, client, admin_headers):
        """存在しないテンプレートIDの更新は404になること"""
        async with client as c:
            response = await c.patch(
                "/api/admin/prompt-templates/nonexistent",
                json={
                    "name": "Renamed",
                    "description": None,
                    "systemPrompt": "prompt",
                },
                headers=admin_headers,
            )

        assert response.status_code == 404

    async def test_non_admin_cannot_update(
        self, client, member_headers, template_in_group
    ):
        """テナント管理者以外（グループ管理者含む）はテンプレートを更新できないこと"""
        async with client as c:
            response = await c.patch(
                f"/api/admin/prompt-templates/{template_in_group.id}",
                json={
                    "name": "Renamed",
                    "description": "desc",
                    "systemPrompt": "prompt",
                },
                headers=member_headers,
            )

        assert response.status_code == 403


def _template_body(name):
    return {"name": name, "description": None, "systemPrompt": "prompt"}


@pytest.mark.asyncio
class TestPromptTemplateNameMaxLength:
    """テンプレート名の上限（DBカラムと同じ32文字）の検証（Issue #171）"""

    async def test_create_accepts_name_at_max_length(self, client, admin_headers):
        """上限ちょうどの名前でテンプレートを作成できること"""
        name = "a" * NAME_MAX_LENGTH
        async with client as c:
            response = await c.post(
                "/api/admin/prompt-templates",
                json=_template_body(name),
                headers=admin_headers,
            )

        assert response.status_code == 200
        assert response.json()["name"] == name

    async def test_create_rejects_name_over_max_length(
        self, client, admin_headers, session, tenant
    ):
        """上限を超える名前は保存前に422で拒否され、テンプレートが作成されないこと"""
        async with client as c:
            response = await c.post(
                "/api/admin/prompt-templates",
                json=_template_body("a" * (NAME_MAX_LENGTH + 1)),
                headers=admin_headers,
            )

        assert response.status_code == 422
        assert response.json()["detail"][0]["loc"] == ["body", "name"]
        count = (
            await session.execute(
                select(func.count())
                .select_from(PromptTemplate)
                .where(PromptTemplate.tenant_id == tenant.id)
            )
        ).scalar()
        assert count == 0

    async def test_create_counts_multibyte_characters_as_one(
        self, client, admin_headers
    ):
        """日本語などのマルチバイト文字も1文字として数え、上限ちょうどなら作成できること"""
        name = "あ" * NAME_MAX_LENGTH
        async with client as c:
            response = await c.post(
                "/api/admin/prompt-templates",
                json=_template_body(name),
                headers=admin_headers,
            )

        assert response.status_code == 200
        assert response.json()["name"] == name

    async def test_create_rejects_multibyte_name_over_max_length(
        self, client, admin_headers
    ):
        """マルチバイト文字でも上限を超えると422で拒否されること"""
        async with client as c:
            response = await c.post(
                "/api/admin/prompt-templates",
                json=_template_body("あ" * (NAME_MAX_LENGTH + 1)),
                headers=admin_headers,
            )

        assert response.status_code == 422

    async def test_update_accepts_name_at_max_length(
        self, client, admin_headers, template
    ):
        """上限ちょうどの名前でテンプレートを更新できること"""
        name = "a" * NAME_MAX_LENGTH
        async with client as c:
            response = await c.patch(
                f"/api/admin/prompt-templates/{template.id}",
                json=_template_body(name),
                headers=admin_headers,
            )

        assert response.status_code == 200
        assert response.json()["name"] == name

    async def test_update_rejects_name_over_max_length(
        self, client, admin_headers, session, template
    ):
        """上限を超える名前での更新は422で拒否され、既存の名前が変わらないこと"""
        async with client as c:
            response = await c.patch(
                f"/api/admin/prompt-templates/{template.id}",
                json=_template_body("a" * (NAME_MAX_LENGTH + 1)),
                headers=admin_headers,
            )

        assert response.status_code == 422
        await session.refresh(template)
        assert template.name == "Template A"


@pytest.mark.asyncio
class TestDeletePromptTemplate:
    """DELETE /api/admin/prompt-templates/{id}"""

    async def test_delete_removes_template_and_associations(
        self, client, admin_headers, template_in_group, session
    ):
        """テンプレートと紐付けがともに削除されること"""
        async with client as c:
            response = await c.delete(
                f"/api/admin/prompt-templates/{template_in_group.id}",
                headers=admin_headers,
            )
            assert response.status_code == 204

            list_response = await c.get(
                "/api/admin/prompt-templates", headers=admin_headers
            )
        ids = [t["id"] for t in list_response.json()["content"]]
        assert template_in_group.id not in ids

    async def test_delete_other_tenant_template_is_noop(
        self, client, admin_headers, other_tenant_template
    ):
        """他テナントのテンプレートは削除されないこと"""
        async with client as c:
            response = await c.delete(
                f"/api/admin/prompt-templates/{other_tenant_template.id}",
                headers=admin_headers,
            )

        assert response.status_code == 204

    async def test_non_admin_cannot_delete(
        self, client, member_headers, template_in_group
    ):
        """テナント管理者以外（グループ管理者含む）はテンプレートを削除できないこと"""
        async with client as c:
            response = await c.delete(
                f"/api/admin/prompt-templates/{template_in_group.id}",
                headers=member_headers,
            )

        assert response.status_code == 403
